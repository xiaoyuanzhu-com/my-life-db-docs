---
title: "ACP WebSocket Protocol — Implementation Plan"
description: "Step-by-step implementation plan for the ACP-native WebSocket protocol migration"
---

> Last edit: 2026-03-20

# ACP WebSocket Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic-shaped WebSocket protocol with an ACP-native protocol, and migrate the frontend to assistant-ui.

**Architecture:** The backend `WSBridge` (format translator) is replaced with a thin envelope serializer that wraps ACP `SessionUpdate` types. The frontend switches from custom Claude-specific components to assistant-ui's `ExternalStoreRuntime`, rendering tool calls by ACP `ToolKind` instead of agent-specific tool names.

**Tech Stack:** Go 1.25 (backend), ACP Go SDK v0.6.3, React 19, TypeScript, @assistant-ui/react, Tailwind CSS 4

**Spec:** `my-life-db-docs/src/content/docs/tech-design/acp-ws-protocol.md`

---

## File Map

### Backend — Create

| File | Responsibility |
|---|---|
| `backend/agentsdk/envelope.go` | Serialize ACP events into WS envelope JSON (`{type, sessionId, ts, ...payload}`) |
| `backend/agentsdk/envelope_test.go` | Unit tests for envelope serialization |

### Backend — Modify

| File | What Changes |
|---|---|
| `backend/agentsdk/types.go` | Add new `EventType` constants for mode/commands/models updates. Add `StopReason` to `Event`. Expand `Session` interface: `optionId` for permissions, `SetMode`/`SetModel` methods. |
| `backend/agentsdk/acpclient.go:155-164` | Emit `AvailableCommandsUpdate` and `CurrentModeUpdate` as events (currently logged only) |
| `backend/agentsdk/acpsession.go:124-137` | Cache `NewSessionResponse` modes/models for later emission |
| `backend/api/agent_ws.go` | Rewrite inbound dispatch (5 types) and outbound translation (envelope instead of WSBridge) |

### Backend — Remove (Phase 3)

| File | Why |
|---|---|
| `backend/agentsdk/wsbridge.go` | Replaced by `envelope.go` |

### Frontend — Create

| File | Responsibility |
|---|---|
| `frontend/app/hooks/use-agent-websocket.ts` | WS connection to `/api/agent/sessions/:id/subscribe`, parses ACP envelope frames |
| `frontend/app/hooks/use-agent-runtime.ts` | ExternalStoreRuntime adapter: ACP events → assistant-ui ThreadMessage state |
| `frontend/app/components/agent/agent-chat.tsx` | Top-level chat component using assistant-ui Thread |
| `frontend/app/components/agent/tools/execute-tool.tsx` | ToolKind `execute` renderer |
| `frontend/app/components/agent/tools/read-tool.tsx` | ToolKind `read` renderer |
| `frontend/app/components/agent/tools/edit-tool.tsx` | ToolKind `edit` renderer (diff view) |
| `frontend/app/components/agent/tools/generic-tool.tsx` | Fallback renderer for all other ToolKinds |
| `frontend/app/components/agent/permission-card.tsx` | Permission request UI with ACP options |
| `frontend/app/components/agent/plan-view.tsx` | Plan entries renderer |

### Frontend — Modify

| File | What Changes |
|---|---|
| `frontend/package.json` | Add `@assistant-ui/react` dependency |
| `frontend/app/routes/claude.tsx` | Switch from old chat components to new `agent-chat.tsx` |

### Frontend — Remove (Phase 3)

| File | Why |
|---|---|
| `frontend/app/components/claude/chat/chat-interface.tsx` | Replaced by assistant-ui based agent-chat |
| `frontend/app/components/claude/chat/streaming-response.tsx` | assistant-ui handles streaming |
| `frontend/app/components/claude/chat/tool-block.tsx` | Replaced by ToolKind renderers |
| `frontend/app/components/claude/chat/message-block.tsx` | Replaced by assistant-ui Message primitives |
| `frontend/app/components/claude/chat/permission-card.tsx` | Replaced by new permission-card |
| `frontend/app/components/claude/chat/hooks/use-session-websocket.ts` | Replaced by use-agent-websocket |
| `frontend/app/types/claude.ts` | Replaced by ACP types |

---

## Phase 1: Backend

### Task 1: Envelope Serializer

Build the thin serializer that wraps ACP events into the WS envelope format.

**Files:**
- Create: `backend/agentsdk/envelope.go`
- Create: `backend/agentsdk/envelope_test.go`

- [ ] **Step 1: Write envelope type and serializer skeleton**

```go
// backend/agentsdk/envelope.go
package agentsdk

import (
	"encoding/json"
	"time"
)

// Envelope is the WS frame wrapper. Every server→client message has this shape.
type Envelope struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Ts        int64  `json:"ts"`
}

// MarshalEnvelope creates a JSON WS frame with the given type, sessionId, and payload fields merged in.
func MarshalEnvelope(msgType string, sessionID string, payload map[string]any) ([]byte, error) {
	msg := make(map[string]any, len(payload)+3)
	for k, v := range payload {
		msg[k] = v
	}
	msg["type"] = msgType
	msg["sessionId"] = sessionID
	msg["ts"] = time.Now().UnixMilli()
	return json.Marshal(msg)
}
```

- [ ] **Step 2: Write tests for MarshalEnvelope**

```go
// backend/agentsdk/envelope_test.go
package agentsdk

import (
	"encoding/json"
	"testing"
)

func TestMarshalEnvelope_BasicFields(t *testing.T) {
	data, err := MarshalEnvelope("agent.messageChunk", "sess-123", map[string]any{
		"content": map[string]any{"type": "text", "text": "hello"},
	})
	if err != nil {
		t.Fatal(err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}

	if parsed["type"] != "agent.messageChunk" {
		t.Errorf("type = %v, want agent.messageChunk", parsed["type"])
	}
	if parsed["sessionId"] != "sess-123" {
		t.Errorf("sessionId = %v, want sess-123", parsed["sessionId"])
	}
	if _, ok := parsed["ts"]; !ok {
		t.Error("missing ts field")
	}
	content, ok := parsed["content"].(map[string]any)
	if !ok {
		t.Fatal("missing or wrong content field")
	}
	if content["text"] != "hello" {
		t.Errorf("content.text = %v, want hello", content["text"])
	}
}

func TestMarshalEnvelope_EmptyPayload(t *testing.T) {
	data, err := MarshalEnvelope("turn.start", "sess-123", nil)
	if err != nil {
		t.Fatal(err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}

	if len(parsed) != 3 {
		t.Errorf("expected 3 fields (type, sessionId, ts), got %d", len(parsed))
	}
}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && go test -v -run TestMarshalEnvelope ./agentsdk/`
Expected: PASS

- [ ] **Step 4: Add ACP event → envelope translators**

Add these functions to `backend/agentsdk/envelope.go`:

```go
// SessionInfoEnvelope creates a session.info frame.
func SessionInfoEnvelope(sessionID string, totalMessages int, isProcessing bool) ([]byte, error) {
	return MarshalEnvelope("session.info", sessionID, map[string]any{
		"totalMessages": totalMessages,
		"isProcessing":  isProcessing,
	})
}

// TurnStartEnvelope creates a turn.start frame.
func TurnStartEnvelope(sessionID string) ([]byte, error) {
	return MarshalEnvelope("turn.start", sessionID, nil)
}

// TurnCompleteEnvelope creates a turn.complete frame.
func TurnCompleteEnvelope(sessionID string, stopReason string) ([]byte, error) {
	return MarshalEnvelope("turn.complete", sessionID, map[string]any{
		"stopReason": stopReason,
	})
}

// UserEchoEnvelope creates a user.echo frame.
func UserEchoEnvelope(sessionID string, content []map[string]any) ([]byte, error) {
	return MarshalEnvelope("user.echo", sessionID, map[string]any{
		"content": content,
	})
}

// ErrorEnvelope creates an error frame.
func ErrorEnvelope(sessionID string, message string, code string) ([]byte, error) {
	return MarshalEnvelope("error", sessionID, map[string]any{
		"message": message,
		"code":    code,
	})
}

// AgentMessageChunkEnvelope creates an agent.messageChunk frame from ACP AgentMessageChunk.
func AgentMessageChunkEnvelope(sessionID string, content any) ([]byte, error) {
	return MarshalEnvelope("agent.messageChunk", sessionID, map[string]any{
		"content": content,
	})
}

// AgentThoughtChunkEnvelope creates an agent.thoughtChunk frame.
func AgentThoughtChunkEnvelope(sessionID string, content any) ([]byte, error) {
	return MarshalEnvelope("agent.thoughtChunk", sessionID, map[string]any{
		"content": content,
	})
}

// AgentToolCallEnvelope creates an agent.toolCall frame from ACP ToolCall fields.
func AgentToolCallEnvelope(sessionID string, fields map[string]any) ([]byte, error) {
	return MarshalEnvelope("agent.toolCall", sessionID, fields)
}

// AgentToolCallUpdateEnvelope creates an agent.toolCallUpdate frame.
func AgentToolCallUpdateEnvelope(sessionID string, fields map[string]any) ([]byte, error) {
	return MarshalEnvelope("agent.toolCallUpdate", sessionID, fields)
}

// AgentPlanEnvelope creates an agent.plan frame from ACP Plan entries.
func AgentPlanEnvelope(sessionID string, entries any) ([]byte, error) {
	return MarshalEnvelope("agent.plan", sessionID, map[string]any{
		"entries": entries,
	})
}

// PermissionRequestEnvelope creates a permission.request frame.
func PermissionRequestEnvelope(sessionID string, toolCall map[string]any, options []map[string]any) ([]byte, error) {
	return MarshalEnvelope("permission.request", sessionID, map[string]any{
		"toolCall": toolCall,
		"options":  options,
	})
}

// SessionModeUpdateEnvelope creates a session.modeUpdate frame.
func SessionModeUpdateEnvelope(sessionID string, modeID string, availableModes any) ([]byte, error) {
	payload := map[string]any{"modeId": modeID}
	if availableModes != nil {
		payload["availableModes"] = availableModes
	}
	return MarshalEnvelope("session.modeUpdate", sessionID, payload)
}

// SessionModelsUpdateEnvelope creates a session.modelsUpdate frame.
func SessionModelsUpdateEnvelope(sessionID string, modelID string, availableModels any) ([]byte, error) {
	return MarshalEnvelope("session.modelsUpdate", sessionID, map[string]any{
		"modelId":         modelID,
		"availableModels": availableModels,
	})
}

// SessionCommandsUpdateEnvelope creates a session.commandsUpdate frame.
func SessionCommandsUpdateEnvelope(sessionID string, commands any) ([]byte, error) {
	return MarshalEnvelope("session.commandsUpdate", sessionID, map[string]any{
		"commands": commands,
	})
}
```

- [ ] **Step 5: Add tests for key envelope functions**

Add to `backend/agentsdk/envelope_test.go`:

```go
func TestSessionInfoEnvelope(t *testing.T) {
	data, err := SessionInfoEnvelope("s1", 42, true)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	json.Unmarshal(data, &parsed)
	if parsed["type"] != "session.info" {
		t.Errorf("type = %v", parsed["type"])
	}
	if parsed["totalMessages"] != float64(42) {
		t.Errorf("totalMessages = %v", parsed["totalMessages"])
	}
	if parsed["isProcessing"] != true {
		t.Errorf("isProcessing = %v", parsed["isProcessing"])
	}
}

func TestPermissionRequestEnvelope(t *testing.T) {
	data, err := PermissionRequestEnvelope("s1",
		map[string]any{"toolCallId": "tc1", "title": "Write foo", "kind": "edit"},
		[]map[string]any{
			{"optionId": "o1", "name": "Allow", "kind": "allow_once"},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	json.Unmarshal(data, &parsed)
	if parsed["type"] != "permission.request" {
		t.Errorf("type = %v", parsed["type"])
	}
	tc := parsed["toolCall"].(map[string]any)
	if tc["toolCallId"] != "tc1" {
		t.Errorf("toolCallId = %v", tc["toolCallId"])
	}
}
```

- [ ] **Step 6: Run all envelope tests**

Run: `cd backend && go test -v -run "TestMarshalEnvelope|TestSessionInfo|TestPermissionRequest" ./agentsdk/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add agentsdk/envelope.go agentsdk/envelope_test.go
git commit -m "feat(agentsdk): add ACP-native envelope serializer for WS protocol"
```

---

### Task 2: Expand Event Types and Session Interface

Update `types.go` to support new ACP event types and optionId-based permission responses.

**Files:**
- Modify: `backend/agentsdk/types.go`

- [ ] **Step 1: Add new EventType constants and StopReason to Event**

In `backend/agentsdk/types.go`, add after the existing `EventError` constant:

```go
const (
	// ... existing constants ...
	EventModeUpdate     EventType = "mode_update"      // session mode changed
	EventCommandsUpdate EventType = "commands_update"   // available commands changed
	EventModelsUpdate   EventType = "models_update"     // available models (after session creation)
)
```

Add `StopReason` and `SessionMeta` fields to `Event`:

```go
type Event struct {
	Type              EventType
	Delta             string
	Message           *Message
	PermissionRequest *PermissionRequest
	Usage             *Usage
	Error             error
	StopReason        string       // for EventComplete: "end_turn", "cancelled", etc.
	SessionMeta       *SessionMeta // for EventModeUpdate, EventModelsUpdate, EventCommandsUpdate
}

// SessionMeta carries session state data from ACP NewSession/LoadSession responses
// and from SessionUpdate notifications.
type SessionMeta struct {
	ModeID          string
	AvailableModes  json.RawMessage // JSON array of {id, name, description}
	ModelID         string
	AvailableModels json.RawMessage // JSON array of {modelId, name}
	Commands        json.RawMessage // JSON array of {name, description, input?}
}
```

- [ ] **Step 2: Update Session interface for optionId-based permission response**

Replace the existing `Session` interface:

```go
type Session interface {
	Send(ctx context.Context, prompt string) (<-chan Event, error)
	RespondToPermission(ctx context.Context, toolCallID string, optionID string) error
	CancelAllPermissions() // cancel all pending permission requests (for session.cancel)
	SetMode(ctx context.Context, modeID string) error
	SetModel(ctx context.Context, modelID string) error
	Stop() error
	Close() error
	ID() string
	AgentType() AgentType
}
```

- [ ] **Step 3: Run existing tests to catch breakage**

Run: `cd backend && go test -v ./agentsdk/`
Expected: Compile errors in `acpsession.go` (signature change). Fix next.

- [ ] **Step 4: Update acpsession.go to match new interface**

In `backend/agentsdk/acpsession.go`, update `RespondToPermission`:

```go
// RespondToPermission unblocks a pending permission request with the selected option.
func (s *acpSession) RespondToPermission(ctx context.Context, toolCallID string, optionID string) error {
	return s.client.respondToPermission(toolCallID, true, optionID)
}
```

Remove the old `RespondToPermissionWithOption` method (its functionality is now in `RespondToPermission`).

Add `SetMode`, `SetModel`, and `CancelAllPermissions` implementations to `acpSession`:

```go
func (s *acpSession) SetMode(ctx context.Context, modeID string) error {
	_, err := s.conn.SetSessionMode(ctx, acp.SetSessionModeRequest{
		SessionId: acp.SessionId(s.sessionID),
		ModeId:    acp.SessionModeId(modeID),
	})
	return err
}

func (s *acpSession) SetModel(ctx context.Context, modelID string) error {
	_, err := s.conn.SetSessionModel(ctx, acp.SetSessionModelRequest{
		SessionId: acp.SessionId(s.sessionID),
		ModelId:   acp.ModelId(modelID),
	})
	return err
}

func (s *acpSession) CancelAllPermissions() {
	s.client.cancelAllPermissions()
}
```

Add `cancelAllPermissions` to `acpClient`:

```go
func (c *acpClient) cancelAllPermissions() {
	c.permMu.Lock()
	defer c.permMu.Unlock()
	for id, ch := range c.permChannels {
		select {
		case ch <- permResponse{allowed: false}:
		default:
		}
		delete(c.permChannels, id)
	}
}
```

- [ ] **Step 5: Update acpsession.go Send() to include StopReason**

In `backend/agentsdk/acpsession.go`, update the `Send()` method's completion event:

```go
events <- Event{
	Type:       EventComplete,
	StopReason: string(resp.StopReason),
	Usage:      &Usage{},
}
```

And the cancellation path:

```go
events <- Event{
	Type:       EventComplete,
	StopReason: "cancelled",
	Usage:      &Usage{},
}
```

- [ ] **Step 6: Update agent_ws.go to compile with new interface**

In `backend/api/agent_ws.go`, update the `RespondToPermission` call (around line 351) to match the new signature. Use the old `allowed` bool to pick an optionID for now — this is fully rewritten in Task 4:

```go
optionID := ""
if allowed {
	optionID = "allow_once"  // placeholder — Task 4 reads optionId from client
} else {
	optionID = "reject_once"
}
if err := acpSession.RespondToPermission(ctx, permResp.RequestID, optionID); err != nil {
```

This keeps `agent_ws.go` compiling with the old frontend until Task 4 replaces the handler entirely.

- [ ] **Step 7: Run tests**

Run: `cd backend && go test -v ./agentsdk/ && go test -v ./api/`
Expected: PASS (or only unrelated failures)

- [ ] **Step 8: Commit**

```bash
git add agentsdk/types.go agentsdk/acpsession.go agentsdk/acpclient.go api/agent_ws.go
git commit -m "feat(agentsdk): expand Event types for ACP-native protocol, update Session interface"
```

---

### Task 3: Emit Mode/Commands/Models Events from ACP Client

Update `acpclient.go` to emit events for `CurrentModeUpdate` and `AvailableCommandsUpdate` (currently logged and dropped). Update `acpsession.go` to cache and emit session modes/models from `NewSessionResponse`.

**Files:**
- Modify: `backend/agentsdk/acpclient.go:155-164`
- Modify: `backend/agentsdk/acpsession.go:124-142`

- [ ] **Step 1: Update acpclient.go to emit mode and commands events**

In `backend/agentsdk/acpclient.go`, add `"encoding/json"` to imports, then replace the `CurrentModeUpdate` and `AvailableCommandsUpdate` cases (lines 155-164):

```go
	case update.CurrentModeUpdate != nil:
		modeID := string(update.CurrentModeUpdate.CurrentModeId)
		log.Info().Str("mode", modeID).Msg("ACP mode changed")
		c.emit(Event{
			Type: EventModeUpdate,
			SessionMeta: &SessionMeta{
				ModeID: modeID,
			},
		})

	case update.AvailableCommandsUpdate != nil:
		cmds := update.AvailableCommandsUpdate.AvailableCommands
		log.Debug().Int("commands", len(cmds)).Msg("ACP commands updated")

		// Serialize commands to JSON for passthrough
		cmdList := make([]map[string]any, len(cmds))
		for i, cmd := range cmds {
			entry := map[string]any{
				"name":        cmd.Name,
				"description": cmd.Description,
			}
			if cmd.Input != nil && cmd.Input.UnstructuredCommandInput != nil {
				entry["input"] = map[string]any{"hint": cmd.Input.UnstructuredCommandInput.Hint}
			}
			cmdList[i] = entry
		}
		cmdJSON, _ := json.Marshal(cmdList)

		c.emit(Event{
			Type: EventCommandsUpdate,
			SessionMeta: &SessionMeta{
				Commands: cmdJSON,
			},
		})
```

- [ ] **Step 2: Cache NewSessionResponse in acpSession and emit initial modes/models**

In `backend/agentsdk/acpsession.go`, after the `NewSession` call (line 137), add:

```go
	// Cache session modes and models for initial emission
	session := &acpSession{
		cmd:       cmd,
		conn:      conn,
		client:    acpCli,
		sessionID: string(sessResp.SessionId),
		agentType: agentCfg.Type,
	}

	// Emit initial modes
	if sessResp.Modes != nil {
		modes := make([]map[string]any, len(sessResp.Modes.AvailableModes))
		for i, m := range sessResp.Modes.AvailableModes {
			entry := map[string]any{"id": string(m.Id), "name": m.Name}
			if m.Description != nil {
				entry["description"] = *m.Description
			}
			modes[i] = entry
		}
		modesJSON, _ := json.Marshal(modes)
		session.initialModes = &SessionMeta{
			ModeID:         string(sessResp.Modes.CurrentModeId),
			AvailableModes: modesJSON,
		}
	}

	// Emit initial models
	if sessResp.Models != nil {
		models := make([]map[string]any, len(sessResp.Models.AvailableModels))
		for i, m := range sessResp.Models.AvailableModels {
			models[i] = map[string]any{
				"modelId": string(m.ModelId), "name": m.Name,
			}
		}
		modelsJSON, _ := json.Marshal(models)
		session.initialModels = &SessionMeta{
			ModelID:         string(sessResp.Models.CurrentModelId),
			AvailableModels: modelsJSON,
		}
	}
```

Add `initialModes` and `initialModels` fields to `acpSession`:

```go
type acpSession struct {
	cmd       *exec.Cmd
	conn      *acp.ClientSideConnection
	client    *acpClient
	sessionID string
	agentType AgentType

	mu     sync.Mutex
	closed bool

	// Cached from NewSessionResponse, emitted on first Send()
	initialModes  *SessionMeta
	initialModels *SessionMeta
}
```

In `Send()`, emit the cached modes/models before starting the prompt:

```go
func (s *acpSession) Send(ctx context.Context, prompt string) (<-chan Event, error) {
	// ... existing closed check ...

	events := make(chan Event, 256)
	s.client.setEvents(events)

	// Emit cached session metadata on first prompt
	s.mu.Lock()
	modes := s.initialModes
	models := s.initialModels
	s.initialModes = nil  // only emit once
	s.initialModels = nil
	s.mu.Unlock()

	if modes != nil {
		events <- Event{Type: EventModeUpdate, SessionMeta: modes}
	}
	if models != nil {
		events <- Event{Type: EventModelsUpdate, SessionMeta: models}
	}

	go func() {
		// ... existing prompt logic ...
	}()

	return events, nil
}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && go test -v ./agentsdk/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add agentsdk/acpclient.go agentsdk/acpsession.go
git commit -m "feat(agentsdk): emit mode, commands, and models events from ACP"
```

---

### Task 4: Rewrite agent_ws.go Message Dispatch

Replace the Anthropic-shaped WS handler with ACP-native message dispatch using the envelope serializer.

**Files:**
- Modify: `backend/api/agent_ws.go`

- [ ] **Step 1: Update inbound message parsing**

Replace the current inbound `struct` and `switch` (lines 226-398) with flat ACP message types:

```go
// Parse incoming message
var inMsg struct {
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId"`
	Content   json.RawMessage `json:"content,omitempty"`
	ModeID    string          `json:"modeId,omitempty"`
	ModelID   string          `json:"modelId,omitempty"`
	ToolCallID string         `json:"toolCallId,omitempty"`
	OptionID  string          `json:"optionId,omitempty"`
}

switch inMsg.Type {
case "session.prompt":
	// Extract text from content blocks
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	json.Unmarshal(inMsg.Content, &blocks)
	promptText := ""
	for _, b := range blocks {
		if b.Type == "text" {
			promptText += b.Text
		}
	}
	// ... create ACP session lazily, send prompt, forward events ...

case "session.cancel":
	acpSession.CancelAllPermissions()
	acpSession.Stop()

case "session.setMode":
	acpSession.SetMode(ctx, inMsg.ModeID)

case "session.setModel":
	acpSession.SetModel(ctx, inMsg.ModelID)

case "permission.respond":
	acpSession.RespondToPermission(ctx, inMsg.ToolCallID, inMsg.OptionID)
}
```

- [ ] **Step 2: Update outbound event translation**

Replace the WSBridge event forwarding (lines 296-308) with envelope serialization:

```go
for event := range events {
	frames := translateEventToEnvelopes(sessionID, event)
	for _, frame := range frames {
		sessionState.AppendAndBroadcast(frame)
	}
	if event.Type == agentsdk.EventComplete {
		sessionState.Mu.Lock()
		sessionState.ResultCount++
		sessionState.IsProcessing = false
		sessionState.Mu.Unlock()
		h.server.Notifications().NotifyClaudeSessionUpdated(sessionID, "result")
	}
}
```

Add the `translateEventToEnvelopes` function:

```go
func translateEventToEnvelopes(sessionID string, event agentsdk.Event) [][]byte {
	var frames [][]byte
	var data []byte
	var err error

	switch event.Type {
	case agentsdk.EventDelta:
		data, err = agentsdk.AgentMessageChunkEnvelope(sessionID,
			map[string]any{"type": "text", "text": event.Delta})

	case agentsdk.EventMessage:
		if event.Message == nil {
			return nil
		}
		for _, block := range event.Message.Content {
			switch block.Type {
			case agentsdk.BlockThinking:
				data, err = agentsdk.AgentThoughtChunkEnvelope(sessionID,
					map[string]any{"type": "text", "text": block.Text})
			case agentsdk.BlockToolUse:
				fields := map[string]any{
					"toolCallId": block.ToolUseID,
					"title":      block.ToolName,
					"kind":       block.ToolKind,
					"status":     "in_progress",
					"rawInput":   json.RawMessage(block.ToolInput),
				}
				data, err = agentsdk.AgentToolCallEnvelope(sessionID, fields)
			case agentsdk.BlockToolResult:
				fields := map[string]any{
					"toolCallId": block.ToolUseID,
					"status":     "completed",
					"rawOutput":  map[string]any{"content": block.Text},
				}
				data, err = agentsdk.AgentToolCallUpdateEnvelope(sessionID, fields)
			case agentsdk.BlockPlan:
				data, err = agentsdk.AgentPlanEnvelope(sessionID, block.Text)
			case agentsdk.BlockText:
				data, err = agentsdk.AgentMessageChunkEnvelope(sessionID,
					map[string]any{"type": "text", "text": block.Text})
			}
			if err == nil && data != nil {
				frames = append(frames, data)
				data = nil
			}
		}
		return frames

	case agentsdk.EventPermissionRequest:
		pr := event.PermissionRequest
		toolCall := map[string]any{
			"toolCallId": pr.ID,
			"title":      pr.Tool,
			"kind":       pr.ToolKind,
			"rawInput":   json.RawMessage(pr.Input),
		}
		options := make([]map[string]any, len(pr.Options))
		for i, opt := range pr.Options {
			options[i] = map[string]any{
				"optionId": opt.ID, "name": opt.Name, "kind": opt.Kind,
			}
		}
		data, err = agentsdk.PermissionRequestEnvelope(sessionID, toolCall, options)

	case agentsdk.EventComplete:
		stopReason := event.StopReason
		if stopReason == "" {
			stopReason = "end_turn"
		}
		data, err = agentsdk.TurnCompleteEnvelope(sessionID, stopReason)

	case agentsdk.EventError:
		msg := "unknown error"
		if event.Error != nil {
			msg = event.Error.Error()
		}
		data, err = agentsdk.ErrorEnvelope(sessionID, msg, "AGENT_ERROR")

	case agentsdk.EventModeUpdate:
		if event.SessionMeta != nil {
			data, err = agentsdk.SessionModeUpdateEnvelope(sessionID,
				event.SessionMeta.ModeID, json.RawMessage(event.SessionMeta.AvailableModes))
		}

	case agentsdk.EventCommandsUpdate:
		if event.SessionMeta != nil {
			data, err = agentsdk.SessionCommandsUpdateEnvelope(sessionID,
				json.RawMessage(event.SessionMeta.Commands))
		}

	case agentsdk.EventModelsUpdate:
		if event.SessionMeta != nil {
			data, err = agentsdk.SessionModelsUpdateEnvelope(sessionID,
				event.SessionMeta.ModelID, json.RawMessage(event.SessionMeta.AvailableModels))
		}
	}

	if err == nil && data != nil {
		frames = append(frames, data)
	}
	return frames
}
```

- [ ] **Step 3: Update session.info emission**

Replace the current `session_info` frame (lines 118-130) with the new format:

```go
infoBytes, err := agentsdk.SessionInfoEnvelope(sessionID, totalMessages, sessionState.IsProcessing)
if err == nil {
	conn.Write(ctx, websocket.MessageText, infoBytes)
}
```

- [ ] **Step 4: Update user message echo**

Replace the current `bridge.UserMessage()` call (line 243) with:

```go
// Unmarshal content blocks from the prompt for echo
var contentBlocks []map[string]any
json.Unmarshal(inMsg.Content, &contentBlocks)
userEcho, _ := agentsdk.UserEchoEnvelope(sessionID, contentBlocks)
sessionState.AppendAndBroadcast(userEcho)

turnStart, _ := agentsdk.TurnStartEnvelope(sessionID)
sessionState.AppendAndBroadcast(turnStart)
```

- [ ] **Step 5: Remove WSBridge usage**

Remove the line `bridge := &agentsdk.WSBridge{SessionID: sessionID}` and all `bridge.*` calls.

- [ ] **Step 6: Build and test**

Run: `cd backend && go build . && go test -v ./api/`
Expected: PASS (compile success, API tests pass)

- [ ] **Step 7: Commit**

```bash
git add api/agent_ws.go
git commit -m "feat(api): rewrite agent WS handler with ACP-native envelope protocol"
```

---

## Phase 2: Frontend

### Task 5: Add assistant-ui Dependency

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install assistant-ui**

Run: `cd frontend && npm install @assistant-ui/react`

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @assistant-ui/react for agent chat UI"
```

---

### Task 6: WebSocket Transport Hook

Build the WS connection hook that parses ACP envelope frames.

**Files:**
- Create: `frontend/app/hooks/use-agent-websocket.ts`

- [ ] **Step 1: Define ACP message types**

Create `frontend/app/hooks/use-agent-websocket.ts` with ACP type definitions and the WS hook:

```typescript
// ACP envelope frame — every WS message has this shape
export interface AcpFrame {
  type: string
  sessionId: string
  ts: number
  [key: string]: unknown
}

// ACP ContentBlock (tagged union)
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string; name?: string }

// Tool call fields
export interface ToolCallFields {
  toolCallId: string
  title?: string
  kind?: string
  status?: string
  content?: unknown[]
  locations?: Array<{ path: string; line?: number }>
  rawInput?: unknown
  rawOutput?: unknown
}

// Permission option
export interface PermissionOption {
  optionId: string
  name: string
  kind: string
}

// Specific frame types
export interface SessionInfoFrame extends AcpFrame {
  type: "session.info"
  totalMessages: number
  isProcessing: boolean
}

export interface AgentMessageChunkFrame extends AcpFrame {
  type: "agent.messageChunk"
  content: ContentBlock
}

export interface AgentThoughtChunkFrame extends AcpFrame {
  type: "agent.thoughtChunk"
  content: ContentBlock
}

export interface AgentToolCallFrame extends AcpFrame, ToolCallFields {
  type: "agent.toolCall"
}

export interface AgentToolCallUpdateFrame extends AcpFrame {
  type: "agent.toolCallUpdate"
  toolCallId: string
  [key: string]: unknown  // optional patch fields
}

export interface PermissionRequestFrame extends AcpFrame {
  type: "permission.request"
  toolCall: ToolCallFields
  options: PermissionOption[]
}

export interface TurnCompleteFrame extends AcpFrame {
  type: "turn.complete"
  stopReason: string
}

export interface ErrorFrame extends AcpFrame {
  type: "error"
  message: string
  code?: string
}

export type AgentFrame =
  | SessionInfoFrame
  | AgentMessageChunkFrame
  | AgentThoughtChunkFrame
  | AgentToolCallFrame
  | AgentToolCallUpdateFrame
  | PermissionRequestFrame
  | TurnCompleteFrame
  | ErrorFrame
  | AcpFrame  // catch-all for unknown types
```

- [ ] **Step 2: Add the WS hook**

Add to the same file:

```typescript
import { useCallback, useEffect, useRef, useState } from "react"

interface UseAgentWebSocketOptions {
  sessionId: string
  token: string
  onFrame: (frame: AcpFrame) => void
  enabled?: boolean
}

export function useAgentWebSocket({
  sessionId,
  token,
  onFrame,
  enabled = true,
}: UseAgentWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...msg, sessionId }))
    }
  }, [sessionId])

  const sendPrompt = useCallback((text: string) => {
    send({ type: "session.prompt", content: [{ type: "text", text }] })
  }, [send])

  const sendCancel = useCallback(() => {
    send({ type: "session.cancel" })
  }, [send])

  const sendPermissionResponse = useCallback((toolCallId: string, optionId: string) => {
    send({ type: "permission.respond", toolCallId, optionId })
  }, [send])

  const sendSetMode = useCallback((modeId: string) => {
    send({ type: "session.setMode", modeId })
  }, [send])

  useEffect(() => {
    if (!enabled || !sessionId) return

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const url = `${protocol}//${window.location.host}/api/agent/sessions/${sessionId}/subscribe?token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as AcpFrame
        onFrame(frame)
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
      setConnected(false)
    }
  }, [sessionId, token, enabled, onFrame])

  return { connected, sendPrompt, sendCancel, sendPermissionResponse, sendSetMode }
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/hooks/use-agent-websocket.ts
git commit -m "feat: add ACP WebSocket transport hook"
```

---

### Task 7: ExternalStoreRuntime Adapter

Build the adapter that converts ACP WS frames into assistant-ui ThreadMessage state.

**Files:**
- Create: `frontend/app/hooks/use-agent-runtime.ts`

- [ ] **Step 1: Create the runtime adapter**

This is the core mapping layer. It accumulates ACP frames into assistant-ui's ThreadMessage format. The implementation depends on assistant-ui's exact API — refer to [assistant-ui ExternalStoreRuntime docs](https://www.assistant-ui.com/docs/runtimes/custom/external-store) during implementation.

Key responsibilities:
- Maintain a `ThreadMessage[]` array as state
- On `agent.messageChunk` → accumulate text into current `ThreadAssistantMessage`
- On `agent.thoughtChunk` → accumulate into `ReasoningMessagePart`
- On `agent.toolCall` → add `ToolCallMessagePart`
- On `agent.toolCallUpdate` → merge into existing tool call part
- On `permission.request` → set `interrupt` on tool call part
- On `turn.complete` → set message status to `complete`
- On `user.echo` → add `ThreadUserMessage`
- On `turn.start` → create new `ThreadAssistantMessage`

Provide `onNew` (sends prompt), `onCancel` (sends cancel), `onAddToolResult` (sends permission response).

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/hooks/use-agent-runtime.ts
git commit -m "feat: add ExternalStoreRuntime adapter for ACP → assistant-ui"
```

---

### Task 8: Tool Renderers

Build agent-agnostic tool renderers by ACP ToolKind.

**Files:**
- Create: `frontend/app/components/agent/tools/execute-tool.tsx`
- Create: `frontend/app/components/agent/tools/read-tool.tsx`
- Create: `frontend/app/components/agent/tools/edit-tool.tsx`
- Create: `frontend/app/components/agent/tools/generic-tool.tsx`

- [ ] **Step 1: Create ExecuteToolUI** (for ToolKind `execute`)

Shows command title + terminal-style output. Collapsible. Uses `makeAssistantToolUI` from assistant-ui.

- [ ] **Step 2: Create ReadToolUI** (for ToolKind `read`)

Shows file path + content with syntax highlighting. Collapsible.

- [ ] **Step 3: Create EditToolUI** (for ToolKind `edit`)

Shows file path + diff view (old/new text). If `ToolCallContent` has type `diff`, render structured diff.

- [ ] **Step 4: Create GenericToolUI** (fallback for all other ToolKinds)

Shows title + kind badge + raw input/output as JSON. This handles `search`, `fetch`, `think`, `delete`, `move`, and `other` ToolKinds. Dedicated renderers for these can be added later as needed — the generic fallback is functional for all of them.

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/components/agent/tools/
git commit -m "feat: add ACP ToolKind-based renderers (execute, read, edit, generic)"
```

---

### Task 9: Permission Card and Plan View

**Files:**
- Create: `frontend/app/components/agent/permission-card.tsx`
- Create: `frontend/app/components/agent/plan-view.tsx`

- [ ] **Step 1: Create PermissionCard**

Renders ACP `PermissionOption[]` as buttons (Allow Once, Allow Always, Reject, Reject Always). Uses assistant-ui's interrupt/resume pattern. Receives `toolCall` info to show what's being requested.

- [ ] **Step 2: Create PlanView**

Renders ACP plan entries as a checklist: `[completed] Step 1`, `[in_progress] Step 2`, `[pending] Step 3` with priority badges. Registered as a custom `DataMessagePart` renderer.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/components/agent/permission-card.tsx app/components/agent/plan-view.tsx
git commit -m "feat: add permission card and plan view for ACP agent UI"
```

---

### Task 10: Top-Level Agent Chat Component

Wire everything together into the main chat view.

**Files:**
- Create: `frontend/app/components/agent/agent-chat.tsx`
- Modify: `frontend/app/routes/claude.tsx`

- [ ] **Step 1: Create AgentChat component**

Composes assistant-ui's `Thread` primitive with our custom runtime, tool renderers, and permission card. Includes the composer (text input + send), message list, and streaming response.

- [ ] **Step 2: Wire into the route**

In `frontend/app/routes/claude.tsx`, replace the old `ChatInterface` import with `AgentChat`. Keep the session list sidebar intact.

- [ ] **Step 3: Full build test**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/components/agent/agent-chat.tsx app/routes/claude.tsx
git commit -m "feat: wire AgentChat with assistant-ui into claude route"
```

---

## Phase 3: Cleanup (after E2E validation sign-off)

### Task 11: Remove Legacy Code

**Files:**
- Remove: `backend/agentsdk/wsbridge.go`
- Remove: old frontend Claude-specific components (per file map above)

- [ ] **Step 1: Remove wsbridge.go**

```bash
git rm backend/agentsdk/wsbridge.go
```

- [ ] **Step 2: Remove old frontend components**

Remove files listed in the "Frontend — Remove" section of the file map. Verify no remaining imports reference them.

- [ ] **Step 3: Build both**

Run: `cd backend && go build . && cd ../frontend && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove legacy Anthropic-shaped WS protocol and Claude-specific UI components"
```

---

## Migration Notes

**History format**: `SessionState.rawMessages` is an in-memory buffer (not persisted to DB). A server restart clears it. Existing sessions' message history is in the old Anthropic-shaped format and will not render correctly with the new frontend. This is acceptable — a deployment restart naturally clears the buffer. No migration step is needed.

**Existing sessions**: ACP sessions are also in-memory (tied to the agent subprocess). A server restart kills agent processes. Users start fresh sessions after deployment.

---

## Testing Checklist

After each phase, verify:

**Phase 1 (Backend):**
- [ ] `go test -v ./agentsdk/` passes
- [ ] `go build .` succeeds
- [ ] Backend starts and WS endpoint accepts connections
- [ ] WS frames match spec format (inspect with browser DevTools or wscat)

**Phase 2 (Frontend):**
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Send a message → see streaming text
- [ ] Tool calls render by ToolKind
- [ ] Permission card appears and responds
- [ ] Cancel interrupts the turn
- [ ] Refresh page → history replays correctly

**Phase 3 (Cleanup):**
- [ ] Full build passes with no references to removed files
- [ ] All E2E scenarios from Phase 2 still work
