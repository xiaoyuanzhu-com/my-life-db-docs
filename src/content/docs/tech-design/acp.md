---
title: Agent Client Protocol (ACP)
description: How MyLifeDB uses ACP for AI agent integration
---

> Last edit: 2026-04-18

## Overview

[ACP (Agent Client Protocol)](https://agentclientprotocol.com) is an open protocol for communication between applications and AI agents. It is analogous to LSP (Language Server Protocol) but for AI agents instead of language tooling: where LSP standardizes how editors talk to language servers, ACP standardizes how applications talk to AI agent processes.

**Why ACP matters:** Without a protocol, integrating N applications with M agents requires N x M custom adapters. ACP reduces this to N + M -- each application implements the client side of the protocol once, each agent implements the server side once, and any client can talk to any agent.

MyLifeDB uses the [coder/acp-go-sdk](https://github.com/coder/acp-go-sdk) Go SDK to connect to five ACP agents: Claude Code, Codex, Qwen Code, Gemini CLI, and opencode. All five are routed through the same LiteLLM gateway (`AGENT_BASE_URL` / `AGENT_API_KEY`), so adding a new model to the gateway makes it available to whichever agents support the matching protocol.

## Architecture

ACP serves as the agent communication layer in MyLifeDB. The system has three layers between user-facing features and the underlying LLM:

```mermaid
graph TD
    subgraph "Frontend"
        UI["React UI\n(Chat, Permissions, Tools)"]
    end

    subgraph "Go Backend"
        Features["Features Layer\n(Chat, Inbox Agent, Summarize)"]
        RawPipe["Raw Pipe\n(ACP JSON → WebSocket)"]
        SessionState["SessionState\n(Message buffer + fan-out)"]
        Client["agent.Client wrapper\n(implements ACP Client interface)"]
    end

    subgraph "ACP Layer"
        SDK["acp-go-sdk\n(JSON-RPC over stdio)"]
    end

    subgraph "Agent Process"
        AgentBin["claude-agent-acp\n(npm binary)"]
    end

    subgraph "LLM"
        Proxy["LLM Proxy\n(ANTHROPIC_BASE_URL)"]
    end

    UI <-->|WebSocket| RawPipe
    RawPipe --> SessionState
    SessionState --> Features
    Features --> Client
    Client <-->|"Client interface\ncallbacks"| SDK
    SDK <-->|"stdin/stdout\nJSON-RPC"| AgentBin
    AgentBin <-->|HTTP| Proxy
```

**Data flow for a prompt:**

1. User types a message in the frontend
2. WebSocket delivers it to the backend, which calls `session.Send(prompt)`
3. The Go backend calls `conn.Prompt()` on the ACP connection (blocking)
4. During the blocking call, the agent streams updates back via `SessionUpdate` callbacks
5. Each callback re-marshals the ACP notification to JSON and broadcasts the raw bytes via WebSocket (no translation)
6. When `Prompt()` returns, a `turn.complete` frame is sent to the frontend

## Protocol Summary

ACP uses **JSON-RPC 2.0 over stdio** (newline-delimited JSON). The client spawns the agent as a subprocess and communicates via stdin/stdout. Stderr is reserved for agent logs.

### Client-to-Agent Methods

| Method | Purpose |
|--------|---------|
| `initialize` | Handshake -- negotiate protocol version and capabilities |
| `authenticate` | Send credentials to the agent |
| `session/new` | Create a new session (with CWD, MCP servers) |
| `session/load` | Resume an existing session (replays history as notifications) |
| `session/prompt` | Send a user message (**blocks** until the full turn completes) |
| `session/cancel` | Interrupt the current turn (notification -- no response) |
| `session/set_mode` | Change agent mode (e.g., plan, bypassPermissions) |
| `session/set_config_option` | Change a config option at runtime |
| `session/set_model` | Change the model (unstable) |
| `session/list`, `session/resume`, `session/fork` | Session management (unstable) |

### Agent-to-Client Callbacks

| Method | Purpose |
|--------|---------|
| `session/update` | Streaming updates (notification -- no response expected) |
| `session/request_permission` | Ask user for tool approval (blocks agent until answered) |
| `fs/read_text_file` | Request file read access |
| `fs/write_text_file` | Request file write access |
| `terminal/create` | Request terminal for command execution |
| `terminal/output` | Deliver terminal stdout |
| `terminal/kill` | Kill a running terminal command |
| `terminal/release` | Release terminal resources |
| `terminal/wait_for_exit` | Block until a terminal command completes |

### Message Flow: Typical Prompt-Response Cycle

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant A as Agent (ACP)

    F->>B: WebSocket: user message
    B->>A: session/prompt (blocks)

    Note over A: Agent begins turn

    A-->>B: session/update (thinking delta)
    B-->>F: WS: thinking chunk
    A-->>B: session/update (thinking delta)
    B-->>F: WS: thinking chunk

    A->>B: terminal/create (bash command)
    B-->>A: terminal ID
    A-->>B: session/update (tool_call_start)
    B-->>F: WS: tool card
    B->>A: terminal/output (stdout)
    A->>B: terminal/wait_for_exit
    B-->>A: exit code
    A-->>B: session/update (tool_call_update, completed)
    B-->>F: WS: tool result

    A->>B: request_permission (file write)
    B-->>F: WS: permission request
    F->>B: WS: user allows
    B-->>A: permission response (allow_once)
    A-->>B: session/update (tool_call_update, completed)
    B-->>F: WS: tool result

    A-->>B: session/update (text delta)
    B-->>F: WS: streaming text
    A-->>B: session/update (text delta)
    B-->>F: WS: streaming text

    A-->>B: session/prompt response (StopReason: end_turn)
    B-->>F: WS: turn complete
```

## ACP Behavioral Findings

The following behaviors are verified ground truth from our test suite, tested against `@zed-industries/claude-agent-acp` with `coder/acp-go-sdk`.

### Initialization

| Property | Value |
|----------|-------|
| Protocol version | 1 |
| Agent identifier | `@zed-industries/claude-agent-acp` (current version) |
| Available modes | `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions` |
| Available models | `default` (recommended), `sonnet`, `haiku` |

### Prompt and Response

- **`Prompt()` blocks** until the agent finishes the entire turn. It does not return incrementally.
- **Streaming happens via `SessionUpdate` callbacks** on a separate goroutine during the blocking `Prompt()` call.
- **StopReason values:** `"end_turn"` (normal completion), `"cancelled"` (interrupted).
- **Event order:** `commands_update` -> thinking deltas -> tool calls -> text deltas -> completion. The first chunk is always an empty string `""` acting as a turn-start marker.

### Permissions

- **`RequestPermission` IS called** for file write/edit operations.
- **Permission options** (always 3, not 4):

| Index | Kind | Name | Option ID |
|-------|------|------|-----------|
| 0 | `allow_always` | Always Allow | `allow_always` |
| 1 | `allow_once` | Allow | `allow` |
| 2 | `reject_once` | Reject | `reject` |

- Options have both `kind` and `id` fields.
- **Permission IS NOT called for bash commands** in default mode (agent auto-approves safe commands).
- **Permission IS NOT called for file reads** -- the agent reads files internally via its own tools.

### File I/O

- **`ReadTextFile` callback is NOT called.** The agent reads files internally using its own tools. The callback exists in the Client interface but is dead code.
- **`WriteTextFile` callback is NOT called.** The agent writes files directly after receiving permission. Same as reads -- the callback is dead code.
- **File paths in tool calls are absolute.**
- **Diff content for file writes:** Completed write tool call updates include `ToolCallContent.Diff` with `path`, `newText`, and optionally `oldText`.

### Terminal

- **`CreateTerminal` IS called** for bash commands. This is the primary callback that gets exercised.
- **Terminal provides stdout output** via `TerminalOutput`.
- **`WaitForTerminalExit` blocks** until the command completes and returns the exit code.
- **Full lifecycle:** `CreateTerminal` -> `TerminalOutput` (results) -> `WaitForTerminalExit` -> `ReleaseTerminal`.

### Cancellation

- **`Cancel` is a notification** (no response from the agent).
- **`Prompt()` returns with `StopReason="cancelled"`** after cancellation.
- **In-progress operations are interrupted.**
- Cancel via context cancellation returns a JSON-RPC error (`code: -32603`, `"context canceled"`), not a clean `StopReason`. Error handling must check for context cancellation and treat it as "cancelled" rather than an agent crash.

### Multi-Turn

- **Sessions maintain conversation history** across `Prompt()` calls.
- Each `Prompt()` call builds on the previous context. The agent correctly recalls information from earlier turns in the same session.

### Session Resume

- **`LoadSession` works within the same agent process.** Switching away to a new session and loading the original back succeeds. History replays as `SessionUpdate` notifications (user messages + agent messages + tool calls).
- **Context is retained after `LoadSession`.** After loading a session, the agent can recall facts from prior turns — the replayed history restores conversational context.
- **Multi-turn history is fully replayed.** A 3-turn conversation replays all 3 turns (user messages + agent responses), not just the last.
- **`LoadSession` fails across process restarts.** Session IDs are scoped to the agent process lifetime. Spawning a new agent process and calling `LoadSession` with a previous session ID returns error code `-32002` ("Resource not found").
- **The ACP Go SDK v0.6.3 does NOT expose `session/resume`, `session/list`, or `session/fork`.** These "unstable" methods mentioned in the ACP protocol spec are not yet implemented in the SDK. Only `session/load` is available.

### AskUserQuestion

- **`AskUserQuestion` is NOT available through ACP.** The `claude-agent-acp` binary does not expose this tool. When prompted to use it, the agent searches for it via `ToolSearch`, confirms it doesn't exist, and falls back to asking questions as plain text in its response.
- **The ACP protocol has no dedicated "ask user" method.** The only user-interaction callback is `RequestPermission`, which is approve/deny only — no input collection.
- **Practical impact is low.** The agent naturally asks clarifying questions in its text response. The structured question-card UX from the old Claude Code SDK is lost, but the conversational flow still works.

## Our Integration

### Raw Pipe

ACP `session/update` notifications are piped directly to the frontend as raw JSON -- no field renaming, no format translation. The backend re-marshals the ACP SDK's `SessionUpdate` struct back to JSON (which produces the original ACP wire format with `sessionUpdate` discriminator) and broadcasts it over WebSocket.

**ACP native frames** (piped raw, discriminated by `sessionUpdate` field):

| `sessionUpdate` value | Frontend Rendering |
|-----------------------|-------------------|
| `agent_message_chunk` | Streaming typewriter text |
| `agent_thought_chunk` | Thinking indicator |
| `tool_call` | Tool call card (in-progress) |
| `tool_call_update` | Tool result (completed/failed) |
| `plan` | Plan view entries |
| `user_message_chunk` | User message bubble |
| `current_mode_update` | Mode state update |
| `available_commands_update` | Commands state update |

**Synthesized frames** (backend constructs these, discriminated by `type` field):

| `type` value | Source | Why synthesized |
|-------------|--------|-----------------|
| `turn.complete` | `Prompt()` return value | ACP signals turn completion via JSON-RPC response, not a notification. The SDK consumes it to unblock `Prompt()`. |
| `error` | Backend failures | Session creation errors, WebSocket errors -- not from ACP. |
| `permission.request` | `RequestPermission` callback | Separate ACP JSON-RPC method, not a `session/update` notification. |
| `session.modeUpdate` | `NewSession` response | Initial session modes from session creation. |
| `session.modelsUpdate` | `NewSession` response | Initial session models from session creation. |

**What the backend does NOT add:** no `ts`, no `sessionId`, no `status`, no field renames. The frontend reads ACP field names directly (`toolCallId`, `title`, `kind`, `rawInput`, `rawOutput`, `content`, etc.).

**Heavy content stripping** is the only transformation applied to raw frames -- large file reads and base64 images are stripped before broadcasting to avoid shipping unrenderable payloads to the browser.

### SessionState

SessionState is a lightweight message buffer with multi-client fan-out:

- One ACP event channel per active session
- Multiple WebSocket connections can subscribe to the same session
- Page model (500 msgs / 500KB seal thresholds) applies on top -- this is our concern, not ACP's
- Unread tracking counts `EventComplete` events against `last_read_count`

### Permission Flow

```mermaid
sequenceDiagram
    participant Agent as Agent (ACP)
    participant Client as Go Client
    participant WS as WebSocket
    participant Modal as Frontend Modal

    Agent->>Client: RequestPermission(tool, options)
    Note over Client: Blocks agent goroutine

    Client-->>WS: permission.request frame
    WS-->>Modal: Permission card rendered

    Modal->>WS: User clicks Allow/Reject
    WS->>Client: RespondToPermission(requestID, optionIndex)

    Client-->>Agent: RequestPermissionResponse(selected index)
    Note over Agent: Resumes execution
```

The `RequestPermission` callback blocks the agent until the user responds. The Go client constructs a `permission.request` JSON frame and broadcasts it over WebSocket. The frontend renders a permission card, and the user's choice flows back through `RespondToPermission` which unblocks the callback.

### LLM Gateway Integration

Each agent process connects to our LiteLLM gateway instead of its vendor API directly. The server injects agent-specific env vars (or config files) at spawn time — see the agents table in [Registered Agents](#registered-agents) for the per-agent mapping.

**Common operator-facing env vars:**

| Variable | Purpose |
|----------|---------|
| `AGENT_BASE_URL` | LiteLLM gateway endpoint — injected into each agent under its own name (`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, etc.) |
| `AGENT_API_KEY` | Gateway API key — same fan-out treatment |
| `AGENT_CUSTOMER_ID` | Optional per-user customer ID for usage attribution. Propagated as `x-litellm-customer-id` where the agent supports custom HTTP headers (currently Claude Code via `ANTHROPIC_CUSTOM_HEADERS` and Codex via `config.toml`; Qwen/Gemini pending) |
| `AGENT_MODELS` | JSON array of available models with per-agent filtering — drives both the UI model dropdown and the per-agent default model env var (`ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`) |

## Registered Agents

MyLifeDB registers five ACP agents in `backend/server/server.go`. All route through the LiteLLM gateway configured by `AGENT_BASE_URL` / `AGENT_API_KEY`, but each expresses that routing in its own conventions.

| Agent | Binary | Args | Gateway routing |
|-------|--------|------|-----------------|
| Claude Code | `claude-agent-acp` | — | `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `ANTHROPIC_CUSTOM_HEADERS` (for `x-litellm-customer-id`) |
| Codex | `codex-acp` | — | `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` + `~/.codex/{auth.json,config.toml}` on disk (customer-ID header lives in `config.toml` because codex has no env var for custom headers) |
| Qwen Code | `qwen` | `--acp` | `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Gemini CLI | `gemini` | `--acp` | `GOOGLE_GEMINI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| opencode | `opencode` | `acp` | File-based config at `~/.config/opencode/opencode.json` (no env vars) |

Only Claude Code participates in the pre-warmed agent pool. The others spawn a fresh process per session.

### Adding another ACP agent

Adding a new ACP-compatible agent requires no Go adapter code — just five inline touchpoints:

1. **Install the binary** on the deployment host.
2. **Add an `AgentType` constant** in `backend/agentsdk/types.go`.
3. **Add cases** to the enum↔string switches in `backend/api/agent_manager.go` (`agentTypeString` and the `CreateSession` resolver).
4. **Register an `AgentConfig`** in `backend/server/server.go` inside the `HasAgentLLM()` guard (declare the env map at the same scope as `ccEnv`/`codexEnv`; populate its keys inside the guard so empty strings never leak into the spawned process).
5. **Add a model env override** (if the binary accepts one) to the `switch agentType` block in `agent_manager.go`, and a `defaultConfigOptions` entry for the UI.
6. **Extend the frontend selector** in `frontend/app/components/agent/agent-type-selector.tsx` — icon + `AgentType` union + `DEFAULT_MODES` entry + `AGENT_TYPES` entry.

Any ACP-compatible binary works automatically with the existing Client implementation, raw pipe, SessionState, and permission flow. See `docs/plans/2026-04-18-acp-agents-gemini-qwen-opencode-design.md` in the main repo for the reasoning behind this inline pattern (vs. a config-driven registry).

## Known Limitations and Gotchas

### Protocol Limits

| Limit | Value | Consequence |
|-------|-------|-------------|
| Notification queue | 1024 max queued | Overflow kills the connection. Callbacks must process notifications promptly and never block. |
| Max message size | 10 MB | Scanner buffer limit. Large file contents or tool outputs that exceed this will fail. |

### Transport

- **stdio only.** ACP currently supports only stdin/stdout communication with a spawned subprocess. There is no HTTP or WebSocket transport. The agent must run as a local process.

### Unstable Methods

The ACP protocol spec mentions several unstable methods (`session/resume`, `session/list`, `session/fork`). As of **Go SDK v0.6.3, none of these are implemented**. The SDK only exposes: `session/new`, `session/load`, `session/cancel`, `session/prompt`, `session/set_mode`, `session/set_model`.

`SetSessionModel` is the only "unstable" method that exists in the SDK, accessible as a regular method on `ClientSideConnection`.

### Session Resume Across Restarts

`LoadSession` only works within the same agent process. If the process exits and a new one is spawned, session IDs from the old process are invalid. Options:

1. Keep agent processes alive between prompts (don't kill after idle)
2. Use `NewSession` and re-inject conversation context via the system prompt

### No Cost/Usage Data

ACP does not provide token usage or cost information in `PromptResponse`. Token cost tracking is not available through the protocol.

### No AskUserQuestion

The `claude-agent-acp` binary does not expose `AskUserQuestion` as a tool. The ACP protocol has no equivalent — `RequestPermission` is the only user-interaction callback, and it only supports approve/deny (no input collection). The agent asks clarifying questions as plain conversation text instead.

### Agent File I/O Callbacks Are Dead Code

The `ReadTextFile` and `WriteTextFile` callbacks in the Client interface are never called by `claude-agent-acp`. The agent handles all file I/O internally. These methods must still be implemented (the interface requires them) but will not be invoked.
