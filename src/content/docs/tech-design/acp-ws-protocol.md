---
title: "ACP WebSocket Protocol"
description: "Design spec for ACP-native WebSocket protocol between MyLifeDB backend and frontend"
---

> Last edit: 2026-03-20

## Overview

Replace the current Anthropic-shaped WebSocket protocol with an ACP-native protocol. The current `WSBridge` translates ACP events into Anthropic API message format (content block arrays, `tool_use`/`tool_result` blocks, nested `stream_event.event.delta` structures). This loses ACP data (tool kind, locations, structured diffs, plan entries) and couples the frontend to Claude-specific rendering.

The new protocol passes ACP `SessionUpdate` types through with a minimal envelope. The frontend adopts [assistant-ui](https://www.assistant-ui.com/) and renders by ACP `ToolKind`, not by agent-specific tool names.

### Design Principles

- **ACP passthrough** — don't reshape what ACP already defines well
- **2-way WebSocket** — agentic sessions are interactive (prompts, permissions, interrupts on same connection)
- **Flat messages** — each WS frame is a self-contained JSON object with a `type` discriminator, no nesting
- **Agent-agnostic rendering** — frontend renders by `ToolKind` (read/edit/execute/search), not tool name (Bash/Read/Write)

### Why 2-Way WebSocket

| Alternative | Why not |
|---|---|
| SSE + POST | Interactive agent sessions need bidirectional flow. Separate POST endpoints create routing problems (must hit same backend holding the ACP session), correlation problems (match POST to in-flight stream), and race conditions (permission POST arrives before stream delivers request). |
| 1-way WebSocket | Coder's pattern — solves SSE's browser connection-pool limit (max 6 per domain on HTTP/1.1) but still needs separate POST endpoints. Same routing/correlation issues as SSE + POST. Their use case was broadcasting workspace events, not interactive agent sessions. |
| gRPC | Overkill for our scale. Cursor uses it for 1M+ QPS autocomplete. |

**Industry precedent:** OpenAI added WebSocket mode (Feb 2026) specifically for agentic workflows with many tool calls — 40% faster for 20+ tool call round-trips. Same rationale: persistent connection + server-side state caching + incremental-only payloads.

**References:**
- [Coder SSE→WS migration](https://github.com/coder/coder/issues/16518) — 700 WS connections worked; 7 SSE connections locked up the browser
- [OpenAI WebSocket mode](https://developers.openai.com/api/docs/guides/websocket-mode) — "most useful when a workflow involves many model-tool round trips"

## WebSocket Endpoint

```
GET /api/agent/sessions/:id/subscribe → WebSocket upgrade
```

Authentication via token (query param or header), same as current.

## Message Envelope

Every WS frame is a JSON object:

```json
{
  "type": "<message_type>",
  "sessionId": "<session_id>",
  "ts": 1710000000000,
  ...payload
}
```

- `type` — discriminator, dotted namespace (e.g., `agent.messageChunk`)
- `sessionId` — always present (supports future multi-session on one WS)
- `ts` — Unix milliseconds (server→client only; client→server messages do not include `ts`)
- Remaining fields are the payload, flat (not nested under a `data` or `payload` key)

## Server → Client Messages

### Lifecycle

#### `session.info`

Sent immediately after WS upgrade. Metadata for the session.

```json
{
  "type": "session.info",
  "sessionId": "...",
  "ts": 0,
  "totalMessages": 42,
  "isProcessing": false
}
```

`modes`, `models`, `currentModeId`, and `currentModelId` are **not** included here. ACP sessions are created lazily on first prompt, so this data is not yet available at connection time. It arrives later via `session.modeUpdate`, `session.modelsUpdate`, and `session.commandsUpdate` messages during the first agent turn. The backend caches these from the ACP `NewSessionResponse` and emits them as WS messages.

#### `turn.start`

A new agent turn has begun (after receiving `session.prompt`).

```json
{"type": "turn.start", "sessionId": "...", "ts": 0}
```

#### `turn.complete`

Agent turn finished.

```json
{
  "type": "turn.complete",
  "sessionId": "...",
  "ts": 0,
  "stopReason": "end_turn"
}
```

`stopReason` values (from ACP): `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`.

Note: ACP `PromptResponse` does not include token usage. If usage data becomes available (e.g., from the LLM proxy), an optional `usage` field may be added later.

#### `error`

```json
{
  "type": "error",
  "sessionId": "...",
  "ts": 0,
  "message": "Agent process crashed",
  "code": "AGENT_CRASH"
}
```

Error `code` values are free-form strings. Known codes:

| Code | When |
|---|---|
| `AGENT_CRASH` | Agent process exited unexpectedly |
| `SESSION_CREATE_FAILED` | Failed to create ACP session |
| `PROMPT_FAILED` | Failed to send prompt to agent |
| `QUOTA_EXCEEDED` | LLM quota exhausted |
| `NO_CREDENTIALS` | No API key or CLI auth available |
| `TOO_MANY_SESSIONS` | Max concurrent sessions reached |
| `TIMEOUT` | Agent timed out |

The frontend should fall back to displaying `message` for unrecognized codes.

### Content Messages

#### `user.echo`

Echo of the user's prompt, broadcast to all connected clients.

```json
{
  "type": "user.echo",
  "sessionId": "...",
  "ts": 0,
  "content": [{"type": "text", "text": "What files are in this directory?"}]
}
```

`content` uses ACP `ContentBlock[]`: `text`, `image`, `audio`, `resource_link`, `resource`. This is the one message type that uses an array — it mirrors the `PromptRequest.Prompt` field which is `[]ContentBlock`.

### Agent Output (ACP SessionUpdate passthrough)

#### `agent.messageChunk`

Streaming text from the agent. Maps directly from ACP `AgentMessageChunk`.

```json
{
  "type": "agent.messageChunk",
  "sessionId": "...",
  "ts": 0,
  "content": {"type": "text", "text": "hello"}
}
```

`content` is a **singular** ACP `ContentBlock` (not an array) — matching the ACP `AgentMessageChunk` structure. Can be text, image, or resource link.

#### `agent.thoughtChunk`

Streaming thinking/reasoning. Maps from ACP `AgentThoughtChunk`.

```json
{
  "type": "agent.thoughtChunk",
  "sessionId": "...",
  "ts": 0,
  "content": {"type": "text", "text": "Let me think about this..."}
}
```

`content` is a **singular** ACP `ContentBlock` (not an array) — matching the ACP `AgentThoughtChunk` structure.

#### `agent.toolCall`

Agent initiates a tool call. Maps from ACP `SessionUpdateToolCall`.

```json
{
  "type": "agent.toolCall",
  "sessionId": "...",
  "ts": 0,
  "toolCallId": "tc_001",
  "title": "Read /src/main.go",
  "kind": "read",
  "status": "in_progress",
  "content": [{"type": "content", "content": {"type": "text", "text": ""}}],
  "locations": [{"path": "/src/main.go", "line": 1}],
  "rawInput": {"file_path": "/src/main.go"}
}
```

- `kind` — ACP `ToolKind`: `read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, `switch_mode`, `other`
- `status` — ACP `ToolCallStatus`: `pending`, `in_progress`, `completed`, `failed`
- `content` — ACP `ToolCallContent[]` (array of tagged unions):
  - `{"type": "content", "content": <ContentBlock>}` — generic content (singular ContentBlock)
  - `{"type": "diff", "path": "...", "oldText": "...", "newText": "..."}` — structured diff (`oldText` is optional, null for new files)
  - `{"type": "terminal", "terminalId": "..."}` — terminal reference
- `locations` — ACP `ToolCallLocation[]`: files affected, each with `path` and optional `line`
- `rawInput` — agent-defined JSON, opaque to protocol

#### `agent.toolCallUpdate`

Tool call completed or updated. Maps from ACP `SessionToolCallUpdate`.

All fields except `toolCallId` are **optional patches**. The frontend must merge updates into the existing tool call state (keep previous value if a field is absent), not replace wholesale.

```json
{
  "type": "agent.toolCallUpdate",
  "sessionId": "...",
  "ts": 0,
  "toolCallId": "tc_001",
  "status": "completed",
  "content": [{"type": "content", "content": {"type": "text", "text": "package main\n..."}}],
  "rawOutput": {"content": "package main\nimport..."}
}
```

Fields that may be present: `title`, `kind`, `status`, `content`, `locations`, `rawInput`, `rawOutput`. Any field not present means "no change."

#### `agent.plan`

Agent's execution plan. Maps from ACP `SessionUpdatePlan`.

```json
{
  "type": "agent.plan",
  "sessionId": "...",
  "ts": 0,
  "entries": [
    {"content": "Read the configuration file", "status": "completed", "priority": "high"},
    {"content": "Update the database schema", "status": "in_progress", "priority": "high"},
    {"content": "Run tests", "status": "pending", "priority": "medium"}
  ]
}
```

`status`: `pending`, `in_progress`, `completed`. `priority`: `high`, `medium`, `low`.

### Session State

#### `session.modeUpdate`

Session mode changed. Maps from ACP `CurrentModeUpdate` (which carries only `currentModeId`).

```json
{
  "type": "session.modeUpdate",
  "sessionId": "...",
  "ts": 0,
  "modeId": "plan",
  "availableModes": [
    {"id": "default", "name": "Default", "description": "..."},
    {"id": "plan", "name": "Plan Mode", "description": "..."}
  ]
}
```

**Enriched envelope:** `availableModes` is not part of the ACP `SessionCurrentModeUpdate` type — the backend sources it from the cached `SessionModeState` returned by ACP `NewSession`/`LoadSession`. It is included on the first update after session creation so the frontend knows the available modes. Subsequent updates may include only `modeId`.

#### `session.modelsUpdate`

Available models for the session. Not an ACP `SessionUpdate` variant — the backend emits this from the cached `SessionModelState` returned by ACP `NewSession`/`LoadSession`.

```json
{
  "type": "session.modelsUpdate",
  "sessionId": "...",
  "ts": 0,
  "modelId": "default",
  "availableModels": [
    {"modelId": "default", "name": "Default (recommended)"},
    {"modelId": "sonnet", "name": "Sonnet"},
    {"modelId": "haiku", "name": "Haiku"}
  ]
}
```

Sent once after ACP session creation. Updated if `session.setModel` changes the selection. Note: ACP marks model selection as UNSTABLE.

#### `session.commandsUpdate`

Available slash commands changed. Maps from ACP `AvailableCommandsUpdate`.

```json
{
  "type": "session.commandsUpdate",
  "sessionId": "...",
  "ts": 0,
  "commands": [
    {"name": "/help", "description": "Show help", "input": {"hint": "topic"}},
    {"name": "/clear", "description": "Clear context"}
  ]
}
```

Each command has `name`, `description`, and optional `input`. The `input` field is simplified from ACP's `AvailableCommandInput` tagged union (currently only has `UnstructuredCommandInput` with a `hint`). If ACP adds structured input types, this may need revisiting.

### Permissions

#### `permission.request`

Agent needs user approval for a tool call. Maps from ACP `RequestPermission`.

```json
{
  "type": "permission.request",
  "sessionId": "...",
  "ts": 0,
  "toolCall": {
    "toolCallId": "tc_002",
    "title": "Write /src/config.go",
    "kind": "edit",
    "rawInput": {"file_path": "/src/config.go", "content": "..."},
    "content": null,
    "status": null
  },
  "options": [
    {"optionId": "opt_1", "name": "Allow once", "kind": "allow_once"},
    {"optionId": "opt_2", "name": "Allow always", "kind": "allow_always"},
    {"optionId": "opt_3", "name": "Reject", "kind": "reject_once"},
    {"optionId": "opt_4", "name": "Reject always", "kind": "reject_always"}
  ]
}
```

`kind` values: `allow_once`, `allow_always`, `reject_once`, `reject_always`.

Note: In the `toolCall` object, `title`, `kind`, `content`, and `status` are all optional (nullable) per ACP's `RequestPermissionToolCall` type. The frontend should handle missing values gracefully (e.g., fall back to showing `toolCallId` if `title` is absent).

## Client → Server Messages

Client→server messages do not include `ts`. The server timestamps events on emit.

#### `session.prompt`

Send a user message. Creates ACP session lazily on first prompt.

```json
{
  "type": "session.prompt",
  "sessionId": "...",
  "content": [{"type": "text", "text": "List all Go files"}]
}
```

`content` is ACP `ContentBlock[]` — supports text, images, audio, resources.

#### `session.cancel`

Interrupt the current agent turn. The backend must also cancel any pending `permission.request` by responding to ACP with a `Cancelled` outcome. The frontend should clear any displayed permission UI.

```json
{"type": "session.cancel", "sessionId": "..."}
```

#### `session.setMode`

Change session mode (e.g., plan mode, bypass permissions).

```json
{"type": "session.setMode", "sessionId": "...", "modeId": "plan"}
```

#### `session.setModel`

Change the model used by the agent session.

```json
{"type": "session.setModel", "sessionId": "...", "modelId": "sonnet"}
```

Note: ACP marks `SetSessionModel` as UNSTABLE. This message type may change as the ACP spec stabilizes.

#### `permission.respond`

Respond to a permission request.

```json
{
  "type": "permission.respond",
  "sessionId": "...",
  "toolCallId": "tc_002",
  "optionId": "opt_1"
}
```

`toolCallId` identifies which permission request is being answered (matches `permission.request.toolCall.toolCallId`). `optionId` identifies the selected option (matches one of `permission.request.options[].optionId`).

## History & Reconnect

- All server→client frames are persisted as raw JSON (the envelope)
- Lifecycle messages (`turn.start`, `turn.complete`) are persisted and replayed — the frontend uses these to reconstruct turn boundaries
- On WS connect, server sends `session.info` (with `isProcessing` indicating if a turn is in progress) followed by a burst of stored frames (last ~100)
- Clients joining mid-session see complete history
- No format translation on read or write — store and replay as-is

## Frontend: assistant-ui Integration

### Runtime

Use `ExternalStoreRuntime` — MyLifeDB owns message state and WS connection, assistant-ui renders from it.

### Message Mapping

| WS Frame Type | assistant-ui Content Part |
|---|---|
| `user.echo` | `ThreadUserMessage` with text/image parts |
| `agent.messageChunk` | Accumulate into `ThreadAssistantMessage` → `TextMessagePart` |
| `agent.thoughtChunk` | Accumulate into same message → `ReasoningMessagePart` |
| `agent.toolCall` | `ToolCallMessagePart` (`toolName=title`, `args=rawInput`) |
| `agent.toolCallUpdate` | Merge into same part (`result=rawOutput`, `isError=(status==="failed")`) |
| `permission.request` | `ToolCallMessagePart` with `interrupt: {type: "human", payload: options}` |
| `agent.plan` | `DataMessagePart` (`name: "plan"`) with custom renderer |
| `turn.complete` | Set message `status: {type: "complete", reason: "stop"}` |
| `error` | Set message `status: {type: "incomplete", reason: "error", error}` |

### Tool Rendering by ACP ToolKind

Agent-agnostic renderers registered via `makeAssistantToolUI`:

| ToolKind | Renderer | Shows |
|---|---|---|
| `execute` | `ExecuteToolUI` | Command + terminal output |
| `read` | `ReadToolUI` | File path + content |
| `edit` | `EditToolUI` | Structured diff (path, oldText, newText) |
| `search` | `SearchToolUI` | Query + result list |
| `fetch` | `FetchToolUI` | URL + response |
| `think` | `ThinkToolUI` | Reasoning (collapsed) |
| `delete`, `move` | `FileOpToolUI` | File operation summary |
| `other` | `GenericToolUI` | Title + raw input/output |

New agents work automatically — any ACP-compliant agent's tool calls render correctly without frontend changes.

### Permission UI

Uses assistant-ui's interrupt/resume pattern:

1. `permission.request` → set tool-call part's `interrupt` field with ACP options
2. assistant-ui shows message as `status: {type: "requires-action"}`
3. Custom UI renders ACP `PermissionOption[]` (allow_once, allow_always, reject_once, reject_always)
4. User selects → send `permission.respond` with `toolCallId` and `optionId`
5. Clear interrupt, resume rendering

## Backend Changes

### agentsdk Package

- `Event` types expanded to carry full ACP data (tool kind, locations, content, plan entries)
- `acpclient.go` emits `AvailableCommandsUpdate` and `CurrentModeUpdate` (currently dropped)
- `WSBridge` replaced with thin envelope serializer — no format translation
- `Session` interface updated: `RespondToPermission` accepts `optionId string` instead of `allowed bool`

### agent_ws.go

- Inbound dispatch simplified: 5 flat message types (`session.prompt`, `session.cancel`, `session.setMode`, `session.setModel`, `permission.respond`)
- Outbound: serialize envelope + ACP payload, broadcast to clients
- Session creation remains lazy (on first `session.prompt`)
- On `session.cancel`: respond to all pending ACP permission requests with `Cancelled` outcome before calling `Stop()`

### No Changes

- `agentsdk.Client` / `acpsession.go` — session lifecycle unchanged
- LLM proxy — unchanged
- Session CRUD REST endpoints — unchanged
- Agent registration / config — unchanged

## Migration Strategy

### Phase 1: Backend

- Rework `agentsdk` Event types to expose full ACP data
- Replace `WSBridge` with envelope serializer
- Update `agent_ws.go` message dispatch
- Update `Session` interface for `optionId`-based permission response
- Update history persistence format

### Phase 2: Frontend

- Add `@assistant-ui/react` dependency
- Build WS transport hook
- Build ExternalStoreRuntime adapter (ACP → ThreadMessage)
- Build ToolKind renderers
- Build permission and plan UIs
- Wire into existing session list / navigation

### Phase 3: Cleanup

- Remove old `claude/` package (after E2E validation sign-off)
- Remove old frontend Claude-specific components
- Remove legacy `WSBridge` and Anthropic-shaped types

No dual-protocol period — WS endpoint is the only frontend↔backend contract. Both sides change together.
