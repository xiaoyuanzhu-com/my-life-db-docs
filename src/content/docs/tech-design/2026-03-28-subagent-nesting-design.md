---
title: "Subagent Nesting Design"
description: "Recursive rendering of subagent messages grouped by parentToolUseId in the Claude page"
---

## Problem

When Claude Code dispatches subagents (via the Agent tool), the subagent's messages arrive with `parentToolUseId` in `_meta.claudeCode`, linking them to the parent Agent tool call. Currently these messages render flat in the main thread — indistinguishable from parent-level messages. The user cannot see which messages belong to which subagent.

## Solution

Group messages by `parentToolUseId` at render time and display them as collapsible sub-sessions nested inside their parent Agent tool call. The rendering is recursive — a subagent can spawn its own subagents, creating arbitrarily deep nesting.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual treatment | Recursive sub-session (B) + collapsible summary (C) | Full message rendering inside the agent container, collapsed when done, expanded when in-progress |
| Data grouping | Render-time grouping from flat array (A) | Less disruptive to existing runtime hook; flat array stays source of truth |

## Data Model Changes

### `InternalMessage` (in `use-agent-runtime.ts`)

Add an optional field:

```typescript
interface InternalMessage {
  // ... existing fields ...
  parentToolUseId?: string  // links this message to a parent Agent tool call
}
```

### Frame Handler Changes (in `use-agent-runtime.ts`)

For every frame type (`agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`), extract `parentToolUseId` from `_meta.claudeCode`:

```typescript
const meta = frame._meta as Record<string, unknown> | undefined
const claudeMeta = meta?.claudeCode as Record<string, unknown> | undefined
const parentToolUseId = typeof claudeMeta?.parentToolUseId === "string"
  ? claudeMeta.parentToolUseId
  : undefined
```

**Scoped message lookup**: The existing `findLastAssistant()` helper currently finds the global last assistant message. It must be extended to accept an optional `parentToolUseId` filter so that subagent frames append to the correct assistant message:

```typescript
function findLastAssistant(
  messages: InternalMessage[],
  parentToolUseId?: string
): InternalMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === "assistant" && m.parentToolUseId === parentToolUseId) {
      return m
    }
  }
  return undefined
}
```

- Root-level frames (no `parentToolUseId`) call `findLastAssistant(updated)` — matching `undefined === undefined`
- Subagent frames call `findLastAssistant(updated, parentToolUseId)` — scoped to that subagent

Similarly, `replaceLastAssistant()` needs the same scoping.

New messages created for subagent frames carry `parentToolUseId` on the `InternalMessage`:

```typescript
updated.push({
  id: nextId(),
  role: "assistant",
  content: [{ type: "text", text: chunk }],
  createdAt: new Date(),
  status: isActiveRef.current ? { type: "running" } : { type: "incomplete", reason: "other" },
  parentToolUseId,  // set when frame has parentToolUseId
})
```

**`tool_call_update` scoping**: The current handler calls `findLastAssistant(updated)` then searches only that message's `content` array for the matching `toolCallId`. This breaks for subagent tool calls because the subagent's tool call lives in a *different* assistant message (one tagged with `parentToolUseId`). Fix: scan all assistant messages in reverse order for the matching `toolCallId`:

```typescript
// In tool_call_update handler, replace:
//   const last = findLastAssistant(updated)
//   const idx = last.content.findIndex(p => p.toolCallId === toolCallId)
// With:
for (let i = updated.length - 1; i >= 0; i--) {
  const msg = updated[i]
  if (msg.role !== "assistant") continue
  const idx = msg.content.findIndex(
    (p) => p.type === "tool-call" && p.toolCallId === toolCallId
  )
  if (idx !== -1) {
    // patch parts[idx] and replace msg in updated
    break
  }
}
```

### ThreadMessage Conversion

The `threadMessages` memo (which converts `InternalMessage[]` to `ThreadMessageLike[]`) must propagate `parentToolUseId` through metadata so the rendering layer can access it:

```typescript
metadata: {
  custom: {
    ...(msg.isOptimistic && { isOptimistic: true }),
    ...(msg.parentToolUseId && { parentToolUseId: msg.parentToolUseId }),
  },
},
```

## Render-Time Grouping

### Utility Function

New file: `frontend/app/lib/subagent-grouping.ts`

```typescript
interface SubagentGroup {
  rootMessages: ThreadMessageLike[]
  childrenMap: Map<string, ThreadMessageLike[]>  // parentToolUseId → child messages
}

function groupMessagesByParent(messages: ThreadMessageLike[]): SubagentGroup {
  const rootMessages: ThreadMessageLike[] = []
  const childrenMap = new Map<string, ThreadMessageLike[]>()

  for (const msg of messages) {
    const parentId = msg.metadata?.custom?.parentToolUseId as string | undefined
    if (parentId) {
      const existing = childrenMap.get(parentId) ?? []
      existing.push(msg)
      childrenMap.set(parentId, existing)
    } else {
      rootMessages.push(msg)
    }
  }

  return { rootMessages, childrenMap }
}
```

This runs on every render. The flat array is the source of truth; grouping is a derived view.

## Component Architecture

### New Component: `SubagentSession`

File: `frontend/app/components/agent/subagent-session.tsx`

Renders a collapsible container for an Agent tool call's child messages.

**Props:**
```typescript
interface SubagentSessionProps {
  toolCallId: string           // The Agent tool call's ID
  toolName: string             // Display title (e.g., "Agent: Find session list logic")
  status: ToolCallMessagePartStatus
  childMessages: ThreadMessageLike[]
  childrenMap: Map<string, ThreadMessageLike[]>  // For recursive nesting
}
```

**Behavior:**
- **Header**: Agent title + status icon + child tool call count badge
- **Collapsed** (default for `status.type === "complete"`): just the header row
- **Expanded** (default for `status.type === "running"`): renders child messages using the same message components (`AssistantMessage`, `UserMessage`, tool renderers)
- **Recursive**: child tool calls that are themselves Agent calls with entries in `childrenMap` render another `SubagentSession`

**Visual treatment:**
- Left border accent (`border-l-2 border-primary/40`) to indicate nesting
- Left padding (`pl-3 ml-2`) for indentation
- Slightly reduced text size for nested content (`text-xs` inside subagent vs `text-sm` at root)
- Uses existing `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` from shadcn/ui (same pattern as `ToolFallback`)

### `ToolDispatch` Changes

In `tool-dispatch.tsx`, detect Agent tool calls and route to `SubagentSession` when children exist:

```typescript
// In AcpToolRenderer:
if (isAgentToolCall(props.toolName, props.args)) {
  return <AgentToolRenderer {...props} />
}
```

The `AgentToolRenderer` component:
- Receives `childrenMap` from React context (see below)
- If the tool call has children in the map → render `SubagentSession`
- If no children (yet) → render `ToolFallback` as before (spinner if pending)

### Context: `SubagentContext`

Pass the `childrenMap` down via React context so nested components can look up their children:

```typescript
const SubagentContext = createContext<Map<string, ThreadMessageLike[]>>(new Map())
```

Set at the top level where `groupMessagesByParent()` is called (the Thread component in `claude.tsx`), consumed by `AgentToolRenderer`.

## Agent Tool Call Detection

Add to `tool-dispatch.tsx`:

```typescript
function isAgentToolCall(toolName: string, args: Record<string, unknown>): boolean {
  const meta = args.metaToolName as string | undefined
  if (meta === "Agent") return true
  const lower = toolName.toLowerCase()
  return lower.startsWith("task") || lower.startsWith("agent")
}
```

## Rendering Child Messages

Inside `SubagentSession`, the child messages are rendered using the same component tree as root messages but without the `@assistant-ui/react` runtime. Since `childMessages` are plain `ThreadMessageLike` objects, we render them directly:

- Iterate `childMessages` in order
- For `role: "user"` → render `UserMessage` equivalent
- For `role: "assistant"` → render text parts with `MarkdownText`, reasoning parts with `Reasoning`, tool call parts with `AcpToolRenderer`
- Tool call parts check `childrenMap` for their own children (recursive nesting)

This means `SubagentSession` contains a simplified message renderer that doesn't use `MessagePrimitive` from assistant-ui (since those require runtime context). Instead, it renders content parts directly using the same visual components.

## Edge Cases

| Case | Handling |
|------|----------|
| Streaming subagent | Messages appear incrementally; grouping re-runs each render. Expanded by default while running. |
| Orphaned messages | `parentToolUseId` doesn't match any known tool call → render at root level (fallback) |
| Empty subagent | Agent tool call with no children yet → `ToolFallback` with spinner if pending, or collapsed "0 tools" if complete |
| Deep nesting | Truly recursive — no artificial limit. Visual indentation compounds naturally. |
| `tool_call_update` for subagent tool | Already searches by `toolCallId` — works across all messages after the scan fix. |
| History replay | Same behavior — frames arrive with `parentToolUseId` during replay, grouping works identically. |
| `turn.complete` | Marks all incomplete tool calls as done (existing behavior). Subagent tool calls are in the flat array, so they get marked too. |

## Files Changed

| File | Change |
|------|--------|
| `frontend/app/hooks/use-agent-runtime.ts` | Add `parentToolUseId` to `InternalMessage`, scope `findLastAssistant`/`replaceLastAssistant`, propagate in metadata, fix `tool_call_update` to scan all messages |
| `frontend/app/components/agent/tool-dispatch.tsx` | Add `isAgentToolCall()`, `AgentToolRenderer` that delegates to `SubagentSession` |
| `frontend/app/components/agent/subagent-session.tsx` | **New** — collapsible sub-session renderer |
| `frontend/app/lib/subagent-grouping.ts` | **New** — `groupMessagesByParent()` utility + `SubagentContext` |
| `frontend/app/routes/claude.tsx` | Call `groupMessagesByParent()`, provide `SubagentContext` |
