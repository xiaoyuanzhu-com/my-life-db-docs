---
title: ACP Migration — Zero-Regression Analysis
description: Comprehensive analysis of migrating from the custom Claude Code SDK to ACP (Agent Client Protocol), mapping every flow and identifying all gaps.
---

## Overview

This document analyzes migrating MyLifeDB's Claude Code integration from the current custom SDK (`backend/claude/sdk/`) to [ACP (Agent Client Protocol)](https://agentclientprotocol.com) via [coder/acp-go-sdk](https://github.com/coder/acp-go-sdk) and [claude-agent-acp](https://github.com/zed-industries/claude-agent-acp).

**Goal:** Zero regression. Every current flow must work identically after migration.

## Protocol Summary

ACP is JSON-RPC 2.0 over stdio (newline-delimited JSON). The client spawns the agent as a subprocess and communicates via stdin/stdout. Stderr is for agent logs only.

**Client → Agent methods (12):**
- `initialize` — handshake, negotiate capabilities
- `authenticate` — send credentials
- `session/new` — create session (with CWD, MCP servers)
- `session/load` — resume existing session (replays history as notifications)
- `session/prompt` — send user message (**blocks until turn completes**)
- `session/cancel` — interrupt (notification, no response)
- `session/set_mode` — change mode (ask/architect/code)
- `session/set_config_option` — change config options
- `session/set_model` — change model (unstable)
- `session/list`, `session/resume`, `session/fork` — session management (unstable)

**Agent → Client methods (9):**
- `session/update` — streaming updates (**notification**, no response expected)
- `session/request_permission` — ask user for tool approval
- `fs/read_text_file`, `fs/write_text_file` — file access
- `terminal/create`, `terminal/output`, `terminal/kill`, `terminal/release`, `terminal/wait_for_exit` — terminal operations

## ACP Go SDK Client Interface

We implement this interface. The agent calls these methods on us:

```go
type Client interface {
    // Streaming updates (notification — fire and forget)
    SessionUpdate(ctx context.Context, params SessionNotification) error

    // Permission request (blocks agent until we respond)
    RequestPermission(ctx context.Context, params RequestPermissionRequest) (RequestPermissionResponse, error)

    // File system access
    ReadTextFile(ctx context.Context, params ReadTextFileRequest) (ReadTextFileResponse, error)
    WriteTextFile(ctx context.Context, params WriteTextFileRequest) (WriteTextFileResponse, error)

    // Terminal management
    CreateTerminal(ctx context.Context, params CreateTerminalRequest) (CreateTerminalResponse, error)
    TerminalOutput(ctx context.Context, params TerminalOutputRequest) (TerminalOutputResponse, error)
    KillTerminalCommand(ctx context.Context, params KillTerminalCommandRequest) (KillTerminalCommandResponse, error)
    ReleaseTerminal(ctx context.Context, params ReleaseTerminalRequest) (ReleaseTerminalResponse, error)
    WaitForTerminalExit(ctx context.Context, params WaitForTerminalExitRequest) (WaitForTerminalExitResponse, error)
}
```

We call the agent via `ClientSideConnection`:

```go
conn := acp.NewClientSideConnection(client, agentStdin, agentStdout)
conn.Initialize(ctx, req) → InitializeResponse
conn.NewSession(ctx, req) → NewSessionResponse
conn.Prompt(ctx, req) → PromptResponse  // blocks, updates via SessionUpdate callback
conn.Cancel(ctx, notification)           // notification, no response
conn.SetSessionMode(ctx, req)
conn.SetSessionConfigOption(ctx, req)
conn.Done() → <-chan struct{}            // closed when agent exits
```

## Critical ACP Behaviors

1. **`Prompt()` blocks until the entire turn completes.** Streaming happens via `SessionUpdate` callbacks on a separate goroutine *during* the blocking call. This is fundamentally different from our current model where `forwardSDKMessages()` runs in a background goroutine reading from a channel.

2. **`SessionUpdate` is a notification (no response).** The return error is for logging only; the agent doesn't wait for it.

3. **After `Prompt()` returns, all notifications are guaranteed processed.** The SDK's internal `notificationWg.Wait()` ensures this.

4. **`session/cancel` is a notification.** No response. `Prompt()` eventually returns with `StopReason = "cancelled"`.

5. **`session/load` replays full history.** Loading a session triggers `SessionUpdate` notifications for the entire conversation before the load response arrives.

6. **Permission is index-based.** The agent sends `[]PermissionOption` with kinds (`allow_once`, `allow_always`, `reject_once`, `reject_always`). We respond with the selected option index.

7. **Max 10MB per message.** Scanner buffer limit.

8. **Notification queue overflow (>1024) kills the connection.** Must process notifications promptly.

## Flow-by-Flow Migration Analysis

### Flow 1: Interactive Chat Session

#### Current Flow
```
Frontend WS → handler → session.SendInputUIWithUUID()
  → sdkClient.SendMessageWithUUID() → transport.Write() → CLI stdin

CLI stdout → transport.readStdout() → transport.messages
  → query.readMessages() → forwardSDKMessages() → session.BroadcastUIMessage()
  → session.BroadcastToClients() → WS broadcast → Frontend
```

Key characteristics:
- **Non-blocking send**: `SendInputUIWithUUID()` writes to stdin and returns immediately
- **Background streaming**: `forwardSDKMessages()` goroutine continuously reads messages
- **Multiple message types**: user, assistant, system, result, stream_event, control_request, control_response
- **Page model**: Messages accumulated in `rawMessages[]`, sealed into pages at 500 msgs/500KB
- **Multi-client fan-out**: Multiple WebSocket connections to same session
- **UUID deduplication**: User messages get UUID at handler level, passed to CLI

#### ACP Equivalent
```
Frontend WS → handler → session.Send(prompt)
  → conn.Prompt(ctx, req)  [BLOCKS]
  → During block: SessionUpdate callbacks → event channel → WS broadcast → Frontend
  → Prompt() returns → EventComplete sent
```

#### Migration Mapping

| Current | ACP | Gap? |
|---------|-----|------|
| `session.SendInputUIWithUUID()` — non-blocking | `conn.Prompt()` — **blocking** | **YES: Major architectural difference** |
| `forwardSDKMessages()` goroutine reads from channel | `SessionUpdate` callback called by ACP SDK | Different threading model |
| `stream_event` type (progressive tokens) | `SessionNotification.MessageChunk` | Direct mapping |
| `assistant` type (complete message) | `SessionNotification.MessageChunk` (role=assistant) | Different granularity |
| `system` type (init subtype) | No direct equivalent | **Gap: Need synthetic system messages** |
| `result` type (turn complete, cost) | `PromptResponse.StopReason` + no cost data | **Gap: No cost/usage in ACP** |
| `control_request` (permission) | `RequestPermission` callback | Different mechanism (callback vs message) |
| `control_response` (permission answer) | Return value from `RequestPermission` | Simpler |
| `tool_use` content blocks | `SessionNotification.ToolCallStart/Update` | Different structure |
| `tool_result` content blocks | `ToolCallUpdate` with status=completed | Different structure |
| Thinking blocks | Not explicitly in ACP spec | **Gap: Check claude-agent-acp support** |
| UUID-based dedup | Not in ACP (IDs are per tool call) | **Need custom dedup** |

#### Architecture for Blocking Prompt

Since `conn.Prompt()` blocks, we need a goroutine-per-turn model:

```go
func (s *acpSession) Send(ctx context.Context, prompt string) (<-chan Event, error) {
    events := make(chan Event, 256)

    // Store events channel so SessionUpdate callback can use it
    s.mu.Lock()
    s.currentEvents = events
    s.mu.Unlock()

    go func() {
        defer close(events)
        defer func() {
            s.mu.Lock()
            s.currentEvents = nil
            s.mu.Unlock()
        }()

        resp, err := s.conn.Prompt(ctx, acp.PromptRequest{
            SessionId: s.sessionID,
            Content:   acp.Content{acp.TextBlock(prompt)},
        })
        if err != nil {
            events <- Event{Type: EventError, Error: err}
            return
        }

        events <- Event{
            Type:  EventComplete,
            Usage: &Usage{}, // ACP doesn't provide token counts
        }
    }()

    return events, nil
}

// Called by ACP SDK on the notification goroutine
func (c *acpClient) SessionUpdate(ctx context.Context, params acp.SessionNotification) error {
    s := c.session
    s.mu.RLock()
    ch := s.currentEvents
    s.mu.RUnlock()

    if ch == nil {
        return nil // no active prompt, discard
    }

    // Translate ACP notification → Event
    if params.MessageChunk != nil {
        // Progressive text → EventDelta
        // or complete message → EventMessage
    }
    if params.ToolCallStart != nil {
        // → EventMessage with BlockToolUse
    }
    if params.ToolCallUpdate != nil {
        // → EventMessage with BlockToolResult (when status=completed)
    }
    // etc.

    return nil
}
```

**Key concern:** The current system is non-blocking — `SendInputUIWithUUID()` returns immediately, and the handler can continue processing WebSocket messages (like interrupts, permission responses). With ACP, `Prompt()` blocks the goroutine. We need to ensure:
- Interrupts (`session/cancel`) can be sent from a different goroutine
- Permission responses flow through the `RequestPermission` callback (which runs on the notification goroutine, separate from the Prompt goroutine)

This is architecturally sound — `conn.Cancel()` and `RequestPermission` callback don't require the Prompt goroutine to be free.

### Flow 2: Permission Handling

#### Current Flow
```
CLI stdout → control_request → forward to WS → PermissionCard rendered
User clicks → WS sends control_response → session.SendControlResponse()
  → check alwaysAllowedTools → sdkClient.RespondToPermission() → CLI stdin
  → also: autoApprovePendingForTool() for batch approval
```

Key features:
- "Always allow" persisted per-session in DB
- Auto-approve pending requests for same tool
- Rich data: tool name, input preview, file path
- `PermissionResultAsk` vs `PermissionResultAllow` vs `PermissionResultDeny`

#### ACP Equivalent
```
Agent calls RequestPermission(ctx, params) → blocks agent
  → Our callback emits EventPermissionRequest → WS → PermissionCard
  → User clicks → RespondToPermission(requestID, allowed)
  → Callback returns RequestPermissionResponse → agent continues
```

#### Migration Mapping

| Current | ACP | Gap? |
|---------|-----|------|
| `alwaysAllowedTools` map (in-memory + DB) | `PermissionOption.Kind = "allow_always"` | ACP has the concept but agent manages it, not client |
| `autoApprovePendingForTool()` batch approval | Not needed — agent handles "always" semantics | **Behavior change: Agent-side vs client-side** |
| `control_request` broadcast to all WS clients | We emit `EventPermissionRequest` and broadcast | Same |
| `control_response` broadcast to all WS clients | We broadcast the decision ourselves | Same |
| Tool name + input preview in PermissionCard | `ToolCall.Title`, `ToolCall.Content`, `ToolCall.RawInput` | Similar data, different structure |
| `updated_input` (AskUserQuestion) | ACP `RequestPermission` doesn't support input modification | **Gap: AskUserQuestion flow differs** |

#### "Always Allow" Implementation

In the current system, "always allow" is **client-side**: we maintain a `alwaysAllowedTools` map and auto-approve before forwarding to the CLI. In ACP, the `allow_always` permission option tells the **agent** to remember the decision. This is actually better — the agent handles the semantics, and we don't need to persist `always_allowed_tools` in the DB (for ACP sessions).

However, we need to confirm that `claude-agent-acp` correctly handles `allow_always`. If it does, we can simplify significantly.

**For the transition period:** Keep `always_allowed_tools` in the `agent_sessions` DB for legacy sessions. New ACP sessions let the agent handle it.

#### AskUserQuestion Flow

Current `AskUserQuestion` tool sends a `control_request` with questions, the user fills in answers, and the response includes `updated_input` with the answers. In ACP, `RequestPermission` doesn't have an "updated input" concept — it's approve/deny only.

**Options:**
1. Check if `claude-agent-acp` handles `AskUserQuestion` as a special tool call (likely sends it as a `ToolCallStart` with question content, not a permission request)
2. If it comes as a permission request, we may need to use the `RawInput` field or an extension method
3. Frontend `QuestionCard` may need adaptation

**Risk: Medium.** Need to test with actual `claude-agent-acp` to see how `AskUserQuestion` flows through.

### Flow 3: Message Type Mapping

#### Current Message Types → ACP

| Current Type | When | ACP Equivalent | Notes |
|---|---|---|---|
| `user` (synthetic) | After SendInputUI | **We synthesize** — broadcast user message ourselves before calling `Prompt()` | Same as today |
| `assistant` | Complete assistant turn | `SessionNotification.MessageChunk` (role=assistant) | Different event structure |
| `stream_event` (text delta) | Token streaming | `SessionNotification.MessageChunk` (partial) | Direct mapping |
| `stream_event` (thinking) | Thinking block | `SessionNotification.MessageChunk`? | **Needs verification with claude-agent-acp** |
| `system` (init) | Turn start | **No equivalent** — emit synthetic event | Minor gap |
| `result` | Turn complete | `PromptResponse` return | Different delivery (return vs message) |
| `result.cost` | Token usage | **Not in ACP spec** | **Gap: No cost tracking in ACP** |
| `control_request` | Permission needed | `RequestPermission` callback | Different mechanism |
| `control_response` | Permission answered | Return from callback | Different mechanism |
| `tool_use` block | Tool invocation | `ToolCallStart` notification | Different structure |
| `tool_result` block | Tool output | `ToolCallUpdate` (status=completed) | Different structure |

#### ACP SessionNotification Types → Events

| ACP Notification Field | Our Event Type | Frontend Rendering |
|---|---|---|
| `MessageChunk` (partial) | `EventDelta` | Streaming typewriter text |
| `MessageChunk` (complete) | `EventMessage` | Full message block |
| `ToolCallStart` | `EventMessage` (BlockToolUse) | Tool call card |
| `ToolCallUpdate` | `EventMessage` (BlockToolResult or update) | Tool output |
| `Plan` | `EventMessage` (custom) | Todo panel |
| `SessionInfoUpdate` | Session metadata update | Title change, etc. |

### Flow 4: Session Lifecycle

#### Current Lifecycle
```
Created → Active (process running)
  → Process exits → Historical (JSONL available, can re-activate)
  → Archived (user action)
  → Deleted
```

Key: Lazy activation via `EnsureActivated()`. Historical sessions activate by spawning a new CLI process with `--resume`.

#### ACP Lifecycle
```
Created → Active (ACP connection, agent process)
  → Turn complete → Process alive, waiting for next Prompt
  → Process exits → conn.Done() closes
  → Re-activate → spawn new process, use session/load to replay history
  → Archived / Deleted (our concern, not ACP's)
```

#### Migration Mapping

| Current | ACP | Gap? |
|---------|-----|------|
| `session.EnsureActivated()` → spawn CLI with `--resume` | Spawn agent process → `session/load` | **Different: ACP replays history as notifications** |
| `forwardSDKMessages()` goroutine | Not needed — `SessionUpdate` callback | Simpler |
| Process exit detection via SDK | `conn.Done()` channel | Similar |
| GC: kill idle sessions after 1hr | Same — `Close()` after idle timeout | Same |
| `session.resetProcessState()` | Clean up `conn`, `cmd`, mark for re-activation | Similar |

#### Session History Replay

When using `session/load`, ACP replays the entire conversation as `SessionUpdate` notifications. This means:
- Historical messages arrive via the same callback as live messages
- We need to distinguish "replay" from "live" — the replay happens during the `LoadSession()` call, before it returns
- After `LoadSession()` returns, any subsequent `Prompt()` calls produce live updates

**This is actually useful:** We can populate our message list from the replay, eliminating the need for JSONL parsing.

### Flow 5: Page Model / Pagination

The current page model (500 msgs/500KB seal thresholds, stream_event stripping) is **entirely our concern**, not ACP's. ACP doesn't know about pages.

**Migration:** Keep the page model for WebSocket delivery. ACP events → our Event channel → page model as today. The page sealing logic stays in the WebSocket handler, not in the ACP layer.

### Flow 6: Multi-Client Fan-Out

Multiple WebSocket connections to the same session is **our concern**, not ACP's.

**Migration:** The `acpSession` has one event channel. The WebSocket handler broadcasts from this channel to all connected clients. Same pattern as today — `BroadcastToClients()` stays.

### Flow 7: Unread Indicators

Unread tracking (resultCount vs last_read_count) is **our concern**, not ACP's.

**Migration:** Count `EventComplete` events instead of `result` messages. Same DB upsert logic.

### Flow 8: Interruption

| Current | ACP |
|---------|-----|
| `session.Interrupt()` → `sdkClient.Interrupt()` → writes `control_request {subtype: interrupt}` to stdin | `conn.Cancel(ctx, CancelNotification{SessionId})` |
| Synchronous — waits for CLI to acknowledge | Asynchronous — notification, no response |
| `Prompt()` returns with `StopReason = "cancelled"` | Same |

Direct mapping. Simpler in ACP.

### Flow 9: Permission Mode / Model Changes

| Current | ACP |
|---------|-----|
| `set_permission_mode` via control_request | `conn.SetSessionMode()` or `conn.SetSessionConfigOption()` |
| `set_model` via control_request | `conn.UnstableSetSessionModel()` |

The ACP bridge (`claude-agent-acp`) exposes modes (ask/architect/code) and config options (model, thinking level). Need to map our `permissionMode` values:
- `default` → ACP mode "code" (ask for permissions)
- `acceptEdits` → ACP config option? (auto-accept edits)
- `plan` → ACP mode "architect"
- `bypassPermissions` → ACP config option? (auto-accept all)

**Risk: Medium.** Need to test which ACP modes/options `claude-agent-acp` exposes and how they map to our permission modes.

### Flow 10: Inbox Agent (One-off Tasks)

The inbox agent currently uses OpenAI API directly with its own agentic loop. For ACP migration:

```go
func (a *Agent) AnalyzeFile(ctx context.Context, filePath string) (*FileIntention, error) {
    result, err := a.agentClient.RunTask(ctx, agentsdk.TaskConfig{
        SessionConfig: agentsdk.SessionConfig{
            Agent:       agentsdk.AgentClaudeCode,
            SystemPrompt: a.buildSystemPrompt(),
            Permissions: agentsdk.PermissionAuto,
            WorkingDir:  a.dataDir,
        },
        Prompt:  fmt.Sprintf("Analyze %q...", filePath),
        Timeout: 60 * time.Second,
    })
    ...
}
```

`RunTask` internally: `CreateSession` → `Send(prompt)` → drain events → `Close()`.

**For PermissionAuto:** The `RequestPermission` callback should auto-approve all requests:
```go
func (c *acpClient) RequestPermission(ctx context.Context, params acp.RequestPermissionRequest) (acp.RequestPermissionResponse, error) {
    if c.autoApprove {
        // Find the "allow_once" or "allow_always" option
        for i, opt := range params.Options {
            if opt.Kind == "allow_once" || opt.Kind == "allow_always" {
                return acp.RequestPermissionResponse{
                    Outcome: acp.NewRequestPermissionOutcomeSelected(i),
                }, nil
            }
        }
    }
    // ... normal flow
}
```

### Flow 11: AI Summarize

Uses `agentClient.Complete()` — direct HTTP to LLM proxy, no ACP involvement. No migration needed.

## Gap Summary

### Critical Gaps (Must Solve)

| # | Gap | Impact | Solution |
|---|-----|--------|----------|
| 1 | **Prompt() blocks** — current system is non-blocking | Architecture change | Goroutine-per-turn model with event channel |
| 2 | **No cost/usage data in ACP** | Can't show token cost in result | Accept loss, or parse from agent logs on stderr |
| 3 | **AskUserQuestion flow** | May not work through ACP permission model | Test with claude-agent-acp; may need special handling |
| 4 | **Permission mode mapping** | Our modes may not map 1:1 to ACP modes | Test claude-agent-acp modes/options |

### Important Gaps (Should Solve)

| # | Gap | Impact | Solution |
|---|-----|--------|----------|
| 5 | **Thinking blocks** | May not stream through ACP | Test — likely comes as MessageChunk content |
| 6 | **System init message** | No "turn started" signal in ACP | Emit synthetic event when Prompt() is called |
| 7 | **Always-allow semantics** | Client-side vs agent-side | Let agent handle; verify claude-agent-acp support |
| 8 | **JSONL session files** | ACP uses session/load for history | May lose JSONL-based session browsing |
| 9 | **Session metadata** | Title from JSONL parsing | Use `SessionInfoUpdate` notification instead |

### No-Gap (Direct Mapping)

- Interruption: `Cancel()` notification
- File read/write: `ReadTextFile`/`WriteTextFile` callbacks
- Terminal: Full ACP terminal support
- Multi-client fan-out: Our concern, stays as-is
- Page model: Our concern, stays as-is
- Unread tracking: Our concern, stays as-is
- Session persistence: Our DB, stays as-is
- Graceful shutdown: Kill process on `Close()`

## Verification Plan

Before implementing, verify these with actual `claude-agent-acp`:

1. **Thinking blocks** — Do they come as `MessageChunk` with a specific role or content type?
2. **AskUserQuestion** — Does it come as `RequestPermission` or `ToolCallStart`?
3. **Permission modes** — What modes does `claude-agent-acp` expose in `NewSessionResponse.Modes`?
4. **Always-allow** — Does selecting `allow_always` option actually prevent future permission requests for that tool?
5. **Cost data** — Is there any way to get token usage (stderr logs, extension methods)?
6. **Session resume** — Does `session/load` with an existing session ID correctly replay history?
7. **Title** — Does `SessionInfoUpdate` include session title?
8. **Stream granularity** — How granular are `MessageChunk` updates? Per-token? Per-line? Per-block?

## Implementation Strategy

### Phase 1: Verify Gaps
Launch `claude-agent-acp` manually from Go, connect via ACP, and test each gap above. Write a test program that exercises all flows.

### Phase 2: Implement acpSession
Build the `acpSession` struct implementing `Session` interface:
- Spawn agent process → `NewClientSideConnection` → `Initialize` → `NewSession`
- `Send()` → goroutine calling `Prompt()`, events via `SessionUpdate` callback
- `RespondToPermission()` → unblock the `RequestPermission` callback
- `Stop()` → `conn.Cancel()`
- `Close()` → kill process

### Phase 3: Implement acpClient (ACP Client interface)
Implement the 9 callback methods:
- `SessionUpdate` → translate to Events, send to channel
- `RequestPermission` → emit EventPermissionRequest, block until response
- `ReadTextFile` / `WriteTextFile` → delegate to filesystem
- Terminal methods → spawn subprocesses

### Phase 4: Wire to WebSocket Handler
Replace the existing `forwardSDKMessages()` → `BroadcastUIMessage()` path with:
- ACP Events → page model → broadcast to WebSocket clients
- Keep existing page sealing, dedup, multi-client fan-out logic

### Phase 5: Frontend Adaptation
- Map ACP tool call structure to existing tool renderer components
- Handle any differences in permission card data
- Adapt streaming display for ACP MessageChunk granularity

## claude-agent-acp Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key (or dummy when using LLM proxy) |
| `ANTHROPIC_BASE_URL` | API base URL (point at LLM proxy) |
| `MLD_PROXY_TOKEN` | Our ephemeral proxy token |

The bridge reads Claude CLI settings from `~/.claude/settings.json` and `.claude/settings.json`. We should ensure our working directory and env vars take precedence.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ACP SDK breaking changes (pre-1.0) | Medium | High | Pin version, test thoroughly |
| claude-agent-acp gaps (AskUserQuestion, thinking) | Medium | Medium | Test before implementing; fall back to custom handling |
| Performance regression (Prompt blocking model) | Low | Medium | Event channel buffering, goroutine pool |
| Notification queue overflow (>1024) | Low | High | Process notifications immediately, never block callback |
| JSONL session format changes | Low | Low | session/load handles replay; keep JSONL for legacy |
