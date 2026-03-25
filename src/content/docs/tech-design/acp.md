---
title: Agent Client Protocol (ACP)
description: How MyLifeDB uses ACP for AI agent integration
---

> Last edit: 2026-03-25

## Overview

[ACP (Agent Client Protocol)](https://agentclientprotocol.com) is an open protocol for communication between applications and AI agents. It is analogous to LSP (Language Server Protocol) but for AI agents instead of language tooling: where LSP standardizes how editors talk to language servers, ACP standardizes how applications talk to AI agent processes.

**Why ACP matters:** Without a protocol, integrating N applications with M agents requires N x M custom adapters. ACP reduces this to N + M -- each application implements the client side of the protocol once, each agent implements the server side once, and any client can talk to any agent.

MyLifeDB uses the [coder/acp-go-sdk](https://github.com/coder/acp-go-sdk) Go SDK to connect to [claude-agent-acp](https://github.com/zed-industries/claude-agent-acp), a bridge that exposes the Claude CLI as an ACP-compatible agent.

## Architecture

ACP serves as the agent communication layer in MyLifeDB. The system has three layers between user-facing features and the underlying LLM:

```mermaid
graph TD
    subgraph "Frontend"
        UI["React UI\n(Chat, Permissions, Tools)"]
    end

    subgraph "Go Backend"
        Features["Features Layer\n(Chat, Inbox Agent, Summarize)"]
        SessionState["SessionState\n(Message buffer + fan-out)"]
        Client["agent.Client wrapper\n(ACP callbacks → Event structs → JSON frames)"]
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

    UI <-->|WebSocket| SessionState
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
5. Each callback is translated to an `Event` struct, then composed into a JSON frame and broadcast via SessionState
6. When `Prompt()` returns, a `turn.complete` frame is composed and sent to the frontend

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

### Frame Format

All WebSocket frames are flat JSON objects with a `type` field as the sole discriminator. There is no wrapper or envelope -- each frame is composed directly via `json.Marshal(map[string]any{...})`.

**Frames translated from ACP events** (via `marshalEventFrames`):

| `type` value | Source ACP Event | Frontend Rendering |
|-------------|-----------------|-------------------|
| `agent.messageChunk` | `AgentMessageChunk` | Streaming typewriter text |
| `agent.thoughtChunk` | `AgentThoughtChunk` | Thinking indicator |
| `agent.toolCall` | `ToolCall` | Tool call card (in-progress) |
| `agent.toolCallUpdate` | `ToolCallUpdate` | Tool result (completed) |
| `agent.plan` | `Plan` | Plan view entries |
| `user.echo` | `UserMessageChunk` / replay | User message bubble |
| `permission.request` | `RequestPermission` callback | Permission modal |
| `session.modeUpdate` | `CurrentModeUpdate` / session init | Mode state update |
| `session.modelsUpdate` | Session init | Models state update |
| `session.commandsUpdate` | `AvailableCommandsUpdate` | Commands state update |

**Frames composed by the backend** (not from ACP events):

| `type` value | Source | Purpose |
|-------------|--------|---------|
| `turn.start` | Before agent content | Opens a new assistant message in the frontend |
| `turn.complete` | `Prompt()` return | Signals end of agent turn; carries `stopReason` |
| `error` | Backend failures | Session creation errors, send failures |
| `session.info` | WebSocket connect | Initial `isProcessing` / `totalMessages` state |

Frames that create messages carry a `ts` field (Unix millis) used by the frontend for `createdAt` timestamps.

### Translation Pipeline

ACP callbacks flow through two stages before reaching the frontend:

1. **ACP → Event structs** (`acpclient.go`): Each `SessionUpdate` callback is translated into a typed `agentsdk.Event` struct (e.g., `EventDelta`, `EventMessage`, `EventComplete`). This normalizes ACP's discriminated union into Go types.

2. **Event → JSON frame** (`marshalEventFrames`): Each `Event` is composed into one or more flat JSON objects via `json.Marshal`. No intermediate abstraction -- each frame's shape is visible at the composition site.

### SessionState

SessionState is a lightweight message buffer with multi-client fan-out:

- One event channel per active session
- Multiple WebSocket connections can subscribe to the same session
- Unread tracking counts `turn.complete` frames against `last_read_count`

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
    WS-->>Modal: Permission modal rendered

    Modal->>WS: User clicks Allow/Reject
    WS->>Client: RespondToPermission(requestID, optionID)

    Client-->>Agent: RequestPermissionResponse(selected option)
    Note over Agent: Resumes execution
```

The `RequestPermission` callback blocks the agent until the user responds. The Go client composes a `permission.request` JSON frame and broadcasts it over WebSocket. The frontend renders a permission modal, and the user's choice flows back through `RespondToPermission` which unblocks the callback.

### LLM Proxy Integration

The agent process connects to our LLM proxy instead of the Anthropic API directly. This is configured via environment variables injected at spawn time:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key (or dummy value when using proxy auth) |
| `ANTHROPIC_BASE_URL` | Points to our LLM proxy endpoint |
| `MLD_PROXY_TOKEN` | Ephemeral token for proxy authentication |

## Adding a New Agent

Adding a new ACP-compatible agent requires no Go adapter code:

1. **Install the ACP binary.** For example: `npm install -g @zed-industries/claude-agent-acp`

2. **Register an `AgentConfig` in `server.go`.** Specify the binary path, arguments, and any environment variables:

```go
agentConfigs := map[string]AgentConfig{
    "claude": {
        Command: "claude-agent-acp",
        Args:    []string{},
        Env: []string{
            "ANTHROPIC_BASE_URL=" + proxyURL,
        },
    },
    // Add new agents here -- same structure, different binary
}
```

3. **No Go adapter code needed.** The ACP protocol handles all communication. Any agent that implements the ACP server side works automatically with our existing Client implementation, SessionState, and permission flow.

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
