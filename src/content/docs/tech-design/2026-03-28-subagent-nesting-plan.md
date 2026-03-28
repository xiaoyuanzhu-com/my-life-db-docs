---
title: "Subagent Nesting Implementation Plan"
description: "Step-by-step implementation plan for recursive subagent rendering"
---

# Subagent Nesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group messages with `parentToolUseId` under their parent Agent tool call and render them as collapsible recursive sub-sessions.

**Architecture:** Messages stay in a flat array (source of truth). The frame handler tags messages with `parentToolUseId` and scopes message creation to the correct subagent. At render time, messages are split into root messages (sent to assistant-ui) and a children map (provided via React context). The `SubagentSession` component renders children recursively using the same tool renderers.

**Tech Stack:** React 19, TypeScript, @assistant-ui/react, Tailwind CSS 4, shadcn/ui Collapsible

---

### Task 1: Extend InternalMessage with parentToolUseId

**Files:**
- Modify: `my-life-db/frontend/app/hooks/use-agent-runtime.ts:49-56`

- [ ] **Step 1: Add parentToolUseId to InternalMessage**

In `use-agent-runtime.ts`, add the field to the `InternalMessage` interface (line 49-56):

```typescript
interface InternalMessage {
  id: string
  role: "user" | "assistant"
  content: ContentPart[]
  createdAt: Date
  status?: MessageStatus
  isOptimistic?: boolean
  parentToolUseId?: string
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd my-life-db/frontend && npm run typecheck`
Expected: PASS (new optional field doesn't break existing code)

- [ ] **Step 3: Commit**

```bash
git add my-life-db/frontend/app/hooks/use-agent-runtime.ts
git commit -m "feat(claude): add parentToolUseId to InternalMessage"
```

---

### Task 2: Scope findLastAssistant and replaceLastAssistant

**Files:**
- Modify: `my-life-db/frontend/app/hooks/use-agent-runtime.ts:829-848`

- [ ] **Step 1: Update findLastAssistant to accept parentToolUseId scope**

Replace the `findLastAssistant` function (line 829-836):

```typescript
function findLastAssistant(
  messages: InternalMessage[],
  parentToolUseId?: string
): InternalMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].role === "assistant" &&
      messages[i].parentToolUseId === parentToolUseId
    ) {
      return messages[i]
    }
  }
  return undefined
}
```

- [ ] **Step 2: Update replaceLastAssistant to accept parentToolUseId scope**

Replace the `replaceLastAssistant` function (line 838-848):

```typescript
function replaceLastAssistant(
  messages: InternalMessage[],
  replacement: InternalMessage,
  parentToolUseId?: string
): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].role === "assistant" &&
      messages[i].parentToolUseId === parentToolUseId
    ) {
      messages[i] = replacement
      return
    }
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd my-life-db/frontend && npm run typecheck`
Expected: PASS (new optional parameter is backwards-compatible — existing calls with no parentToolUseId match `undefined === undefined`)

- [ ] **Step 4: Commit**

```bash
git add my-life-db/frontend/app/hooks/use-agent-runtime.ts
git commit -m "feat(claude): scope findLastAssistant/replaceLastAssistant by parentToolUseId"
```

---

### Task 3: Extract parentToolUseId in frame handlers

**Files:**
- Modify: `my-life-db/frontend/app/hooks/use-agent-runtime.ts:160-684` (the `onFrame` callback)

This task modifies 4 frame handlers to extract `parentToolUseId` from `_meta.claudeCode` and pass it through to scoped message creation.

- [ ] **Step 1: Add helper to extract parentToolUseId from frame meta**

Add this helper function above the `onFrame` callback (before line 160):

```typescript
/** Extract parentToolUseId from ACP frame _meta.claudeCode */
function getFrameParentToolUseId(frame: AcpFrame): string | undefined {
  const meta = frame._meta as Record<string, unknown> | undefined
  const claudeMeta = meta?.claudeCode as Record<string, unknown> | undefined
  return typeof claudeMeta?.parentToolUseId === "string"
    ? claudeMeta.parentToolUseId
    : undefined
}
```

- [ ] **Step 2: Update agent_message_chunk handler (line 247-296)**

In the `agent_message_chunk` case, extract `parentToolUseId` and pass it to `findLastAssistant`, `replaceLastAssistant`, and new message creation:

```typescript
case "agent_message_chunk": {
  setSessionError(null)
  const f = frame as AgentMessageChunkFrame
  if (f.content?.type !== "text") break
  const chunk = f.content.text
  const parentToolUseId = getFrameParentToolUseId(frame)

  if (isActiveRef.current) setIsRunning(true)
  setMessages((prev) => {
    const updated = [...prev]
    const last = findLastAssistant(updated, parentToolUseId)

    // If no open assistant message exists for this scope, create one.
    // Also create a new message if the last message in the scope's
    // conversation is a user message (turn boundary).
    const lastInScope = parentToolUseId
      ? [...updated].reverse().find(m => m.parentToolUseId === parentToolUseId)
      : updated[updated.length - 1]
    const lastIsUser = lastInScope?.role === "user"
    if (!last || last.status?.type === "complete" || lastIsUser) {
      if (!chunk) return prev
      updated.push({
        id: nextId(),
        role: "assistant",
        content: [{ type: "text", text: chunk }],
        createdAt: new Date(),
        status: isActiveRef.current
          ? { type: "running" }
          : { type: "incomplete", reason: "other" },
        parentToolUseId,
      })
      return updated
    }

    const parts = [...last.content]
    const lastPart = parts[parts.length - 1]
    if (lastPart && lastPart.type === "text") {
      parts[parts.length - 1] = {
        ...lastPart,
        text: lastPart.text + chunk,
      }
    } else {
      if (!chunk) return prev
      parts.push({ type: "text", text: chunk })
    }

    replaceLastAssistant(updated, { ...last, content: parts }, parentToolUseId)
    return updated
  })
  break
}
```

- [ ] **Step 3: Update agent_thought_chunk handler (line 298-342)**

Same pattern as agent_message_chunk — extract `parentToolUseId`, scope the lookup, tag new messages:

```typescript
case "agent_thought_chunk": {
  setSessionError(null)
  const f = frame as AgentThoughtChunkFrame
  if (f.content?.type !== "text") break
  const chunk = f.content.text
  const parentToolUseId = getFrameParentToolUseId(frame)

  if (isActiveRef.current) setIsRunning(true)
  setMessages((prev) => {
    const updated = [...prev]
    const last = findLastAssistant(updated, parentToolUseId)

    const lastInScope = parentToolUseId
      ? [...updated].reverse().find(m => m.parentToolUseId === parentToolUseId)
      : updated[updated.length - 1]
    const lastIsUser = lastInScope?.role === "user"
    if (!last || last.status?.type === "complete" || lastIsUser) {
      if (!chunk) return prev
      updated.push({
        id: nextId(),
        role: "assistant",
        content: [{ type: "reasoning", text: chunk }],
        createdAt: new Date(),
        status: isActiveRef.current
          ? { type: "running" }
          : { type: "incomplete", reason: "other" },
        parentToolUseId,
      })
      return updated
    }

    const parts = [...last.content]
    const lastPart = parts[parts.length - 1]
    if (lastPart && lastPart.type === "reasoning") {
      parts[parts.length - 1] = {
        ...lastPart,
        text: lastPart.text + chunk,
      }
    } else {
      if (!chunk) return prev
      parts.push({ type: "reasoning", text: chunk })
    }

    replaceLastAssistant(updated, { ...last, content: parts }, parentToolUseId)
    return updated
  })
  break
}
```

- [ ] **Step 4: Update tool_call handler (line 344-395)**

Extract `parentToolUseId`, scope lookup, tag new messages:

```typescript
case "tool_call": {
  setSessionError(null)
  const f = frame as AgentToolCallFrame
  const rawInput = (f.rawInput ?? {}) as Record<string, unknown>
  const meta = f._meta as Record<string, unknown> | undefined
  const claudeMeta = meta?.claudeCode as Record<string, unknown> | undefined
  const metaToolName = typeof claudeMeta?.toolName === "string" ? claudeMeta.toolName : undefined
  const args = { ...rawInput, kind: f.kind, ...(metaToolName && { metaToolName }) } as ReadonlyJSONObject
  const parentToolUseId = getFrameParentToolUseId(frame)

  if (isActiveRef.current) setIsRunning(true)
  setMessages((prev) => {
    const updated = [...prev]
    const last = findLastAssistant(updated, parentToolUseId)

    const lastInScope = parentToolUseId
      ? [...updated].reverse().find(m => m.parentToolUseId === parentToolUseId)
      : updated[updated.length - 1]
    const lastIsUser = lastInScope?.role === "user"
    if (!last || last.status?.type === "complete" || lastIsUser) {
      updated.push({
        id: nextId(),
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: f.toolCallId,
            toolName: f.title ?? "unknown",
            args,
            argsText: typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput ?? {}),
          },
        ],
        createdAt: new Date(),
        status: isActiveRef.current
          ? { type: "running" }
          : { type: "incomplete", reason: "other" },
        parentToolUseId,
      })
      return updated
    }

    const parts = [...last.content]
    parts.push({
      type: "tool-call",
      toolCallId: f.toolCallId,
      toolName: f.title ?? "unknown",
      args,
      argsText: typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput ?? {}),
    })

    replaceLastAssistant(updated, { ...last, content: parts }, parentToolUseId)
    return updated
  })
  break
}
```

- [ ] **Step 5: Update tool_call_update handler to scan all assistant messages (line 397-449)**

The current handler only searches the last assistant message. Subagent tool calls live in different assistant messages. Replace with a full reverse scan:

```typescript
case "tool_call_update": {
  const f = frame as AgentToolCallUpdateFrame
  const toolCallId = f.toolCallId

  // Clear pending permission for this tool call
  setPendingPermissions((prev) => {
    if (!prev.has(toolCallId)) return prev
    const next = new Map(prev)
    next.delete(toolCallId)
    return next
  })

  setMessages((prev) => {
    const updated = [...prev]

    // Scan all assistant messages in reverse for the matching toolCallId.
    // Subagent tool calls may be in a different message than the last one.
    for (let i = updated.length - 1; i >= 0; i--) {
      const msg = updated[i]
      if (msg.role !== "assistant") continue

      const parts = [...msg.content]
      const idx = parts.findIndex(
        (p) => p.type === "tool-call" && p.toolCallId === toolCallId
      )
      if (idx === -1) continue

      const existing = parts[idx] as ToolCallPart
      const patch: Partial<ToolCallPart> = {}

      if ("rawOutput" in f) {
        patch.result = f.rawOutput
      } else {
        const meta = f._meta as Record<string, unknown> | undefined
        const claudeMeta = meta?.claudeCode as Record<string, unknown> | undefined
        if (claudeMeta?.toolResponse != null) {
          patch.result = claudeMeta.toolResponse
        } else if (f.status === "completed") {
          patch.result = existing.result || " "
        }
      }
      if ("title" in f && typeof f.title === "string") {
        patch.toolName = f.title
      }

      parts[idx] = { ...existing, ...patch }
      updated[i] = { ...msg, content: parts }
      return updated
    }

    return prev
  })
  break
}
```

- [ ] **Step 6: Verify typecheck passes**

Run: `cd my-life-db/frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add my-life-db/frontend/app/hooks/use-agent-runtime.ts
git commit -m "feat(claude): extract parentToolUseId from frames, scope message handlers"
```

---

### Task 4: Split messages into root and children, expose childrenMap

**Files:**
- Modify: `my-life-db/frontend/app/hooks/use-agent-runtime.ts:700-731` (threadMessages memo)
- Modify: `my-life-db/frontend/app/hooks/use-agent-runtime.ts:733-795` (adapter)
- Modify: `my-life-db/frontend/app/hooks/use-agent-runtime.ts:814-825` (return statement)

- [ ] **Step 1: Split threadMessages into root and childrenMap**

Replace the `threadMessages` memo (line 700-731) with a split that separates root messages from subagent children:

```typescript
// ── Build ThreadMessageLike Array ─────────────────────────────────

const convertMessage = useCallback(
  (msg: InternalMessage): ThreadMessageLike => ({
    id: msg.id,
    role: msg.role,
    createdAt: msg.createdAt,
    content:
      msg.content.length === 0
        ? [{ type: "text" as const, text: "" }]
        : msg.content.map((part) => {
            if (part.type === "text") {
              return { type: "text" as const, text: part.text }
            }
            if (part.type === "reasoning") {
              return { type: "reasoning" as const, text: part.text }
            }
            return {
              type: "tool-call" as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
              result: part.result,
              isError: part.isError,
            }
          }),
    status: msg.status,
    metadata: msg.isOptimistic || msg.parentToolUseId
      ? {
          custom: {
            ...(msg.isOptimistic && { isOptimistic: true }),
            ...(msg.parentToolUseId && { parentToolUseId: msg.parentToolUseId }),
          },
        }
      : undefined,
  }),
  []
)

const { rootMessages, subagentChildrenMap } = useMemo(() => {
  const root: ThreadMessageLike[] = []
  const children = new Map<string, ThreadMessageLike[]>()

  for (const msg of messages) {
    const tmsg = convertMessage(msg)
    if (msg.parentToolUseId) {
      const list = children.get(msg.parentToolUseId) ?? []
      list.push(tmsg)
      children.set(msg.parentToolUseId, list)
    } else {
      root.push(tmsg)
    }
  }

  return { rootMessages: root, subagentChildrenMap: children }
}, [messages, convertMessage])
```

- [ ] **Step 2: Update adapter to use rootMessages instead of threadMessages**

In the adapter memo (line 733-795), replace `threadMessages` with `rootMessages`:

Change:
```typescript
messages: threadMessages,
```
To:
```typescript
messages: rootMessages,
```

And update the dependency array to replace `threadMessages` with `rootMessages`.

- [ ] **Step 3: Add subagentChildrenMap to the return value**

In the return statement (line 814-825), add `subagentChildrenMap`:

```typescript
return {
  runtime,
  connected,
  sessionMeta,
  pendingPermissions,
  planEntries,
  sendPermissionResponse: handlePermissionResponse,
  sendSetMode,
  historyLoadError,
  sessionError,
  subagentChildrenMap,
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd my-life-db/frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add my-life-db/frontend/app/hooks/use-agent-runtime.ts
git commit -m "feat(claude): split messages into root/children, expose subagentChildrenMap"
```

---

### Task 5: Create SubagentContext

**Files:**
- Create: `my-life-db/frontend/app/components/agent/subagent-context.tsx`
- Modify: `my-life-db/frontend/app/components/agent/agent-context.tsx` (add subagentChildrenMap)

- [ ] **Step 1: Read agent-context.tsx to understand existing pattern**

Read `my-life-db/frontend/app/components/agent/agent-context.tsx` to see the context shape and provider pattern.

- [ ] **Step 2: Add subagentChildrenMap to agent context**

Add `subagentChildrenMap` to the existing `AgentContextValue` interface and `useAgentContext` hook in `agent-context.tsx`. This keeps all agent-related context in one place rather than adding a new provider.

Add to the interface:
```typescript
subagentChildrenMap?: Map<string, ThreadMessageLike[]>
```

Import `ThreadMessageLike` from `@assistant-ui/react`.

- [ ] **Step 3: Pass subagentChildrenMap from claude.tsx**

In `my-life-db/frontend/app/routes/claude.tsx`, the `agentContextValue` object (around line 770) already passes all agent context. Add `subagentChildrenMap`:

```typescript
const agentContextValue = {
  // ... existing fields ...
  subagentChildrenMap,
}
```

And destructure it from `useAgentRuntime`:

```typescript
const { runtime, connected, sessionMeta, pendingPermissions, planEntries, sendPermissionResponse, sendSetMode, historyLoadError, sessionError, subagentChildrenMap } =
  useAgentRuntime({ ... })
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd my-life-db/frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add my-life-db/frontend/app/components/agent/agent-context.tsx my-life-db/frontend/app/routes/claude.tsx
git commit -m "feat(claude): pass subagentChildrenMap through agent context"
```

---

### Task 6: Create SubagentSession component

**Files:**
- Create: `my-life-db/frontend/app/components/agent/subagent-session.tsx`

- [ ] **Step 1: Create the SubagentSession component**

Create `my-life-db/frontend/app/components/agent/subagent-session.tsx`:

```typescript
/**
 * SubagentSession — renders a collapsible sub-session for an Agent tool call.
 *
 * Displays child messages (those with matching parentToolUseId) in a nested
 * container. Recursive: if a child tool call has its own children in the map,
 * it renders another SubagentSession inside.
 */
import { useState } from "react"
import type { ThreadMessageLike } from "@assistant-ui/react"
import type { ToolCallMessagePartStatus } from "@assistant-ui/react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  CheckIcon,
  ChevronDownIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react"
import { cn } from "~/lib/utils"
import { MarkdownContent } from "~/components/agent/markdown-content"
import { AcpToolRenderer } from "~/components/agent/tool-dispatch"
import { MessageDot } from "./message-dot"

interface SubagentSessionProps {
  toolCallId: string
  toolName: string
  status?: ToolCallMessagePartStatus
  childMessages: ThreadMessageLike[]
  childrenMap: Map<string, ThreadMessageLike[]>
}

export function SubagentSession({
  toolCallId,
  toolName,
  status,
  childMessages,
  childrenMap,
}: SubagentSessionProps) {
  const isRunning = status?.type === "running"
  const isComplete = status?.type === "complete"
  const [open, setOpen] = useState(!isComplete)

  // Count tool calls across all child messages
  const toolCallCount = childMessages.reduce((count, msg) => {
    if (msg.role !== "assistant") return count
    return count + (msg.content?.filter(p => p.type === "tool-call").length ?? 0)
  }, 0)

  // Display title: strip "Task" prefix if present, use description from args
  const displayTitle = toolName

  const StatusIcon = isRunning ? LoaderIcon
    : isComplete ? CheckIcon
    : XCircleIcon

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="w-full rounded-lg border border-border/60 overflow-hidden"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
        <StatusIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            isRunning && "animate-spin text-primary",
            isComplete && "text-primary",
          )}
        />
        <span className="flex-1 text-left font-medium truncate text-foreground/90">
          {displayTitle}
        </span>
        {toolCallCount > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {toolCallCount} tool{toolCallCount !== 1 ? "s" : ""}
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border/40 pl-3 ml-2 border-l-2 border-l-primary/30">
          <div className="space-y-2 py-2 pr-3">
            {childMessages.map((msg) => (
              <SubagentMessage
                key={msg.id}
                message={msg}
                childrenMap={childrenMap}
              />
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Renders a single message inside a subagent session */
function SubagentMessage({
  message,
  childrenMap,
}: {
  message: ThreadMessageLike
  childrenMap: Map<string, ThreadMessageLike[]>
}) {
  if (message.role === "user") {
    // User messages inside subagents are typically system-injected
    // (task descriptions), render simply
    const text = message.content
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
    if (!text?.trim()) return null
    return (
      <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
        <MarkdownContent text={text} />
      </div>
    )
  }

  // Assistant message — render parts
  return (
    <div className="space-y-1.5">
      {message.content?.map((part, i) => {
        if (part.type === "text") {
          const text = (part as { type: "text"; text: string }).text
          if (!text.trim()) return null
          return (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              <MessageDot type="assistant" />
              <div className="flex-1 min-w-0">
                <MarkdownContent text={text} />
              </div>
            </div>
          )
        }

        if (part.type === "reasoning") {
          return null // Skip reasoning in subagent view for cleanliness
        }

        if (part.type === "tool-call") {
          const toolPart = part as {
            type: "tool-call"
            toolCallId: string
            toolName: string
            args: Record<string, unknown>
            argsText?: string
            result?: unknown
            isError?: boolean
          }

          // Check if this tool call has children (is itself an Agent call)
          const children = childrenMap.get(toolPart.toolCallId)
          if (children && children.length > 0) {
            return (
              <SubagentSession
                key={toolPart.toolCallId}
                toolCallId={toolPart.toolCallId}
                toolName={toolPart.toolName}
                status={
                  toolPart.result !== undefined
                    ? { type: "complete", reason: "stop" }
                    : { type: "running" }
                }
                childMessages={children}
                childrenMap={childrenMap}
              />
            )
          }

          // Regular tool call — use AcpToolRenderer
          return (
            <div key={toolPart.toolCallId} className="text-xs">
              <AcpToolRenderer
                toolCallId={toolPart.toolCallId}
                toolName={toolPart.toolName}
                args={(toolPart.args ?? {}) as import("assistant-stream/utils").ReadonlyJSONObject}
                argsText={toolPart.argsText ?? JSON.stringify(toolPart.args ?? {})}
                result={toolPart.result}
                isError={toolPart.isError}
                status={
                  toolPart.result !== undefined
                    ? { type: "complete", reason: "stop" }
                    : { type: "running" }
                }
                addResult={() => {}}
              />
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd my-life-db/frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add my-life-db/frontend/app/components/agent/subagent-session.tsx
git commit -m "feat(claude): add SubagentSession component for nested agent rendering"
```

---

### Task 7: Wire SubagentSession into tool dispatch

**Files:**
- Modify: `my-life-db/frontend/app/components/agent/tool-dispatch.tsx`

- [ ] **Step 1: Add Agent tool call detection**

Add at the top of `tool-dispatch.tsx`, after the existing imports:

```typescript
import { SubagentSession } from "./subagent-session"
import { useAgentContext } from "./agent-context"
```

Add a detection function after `inferToolKind`:

```typescript
/** Check if a tool call is an Agent/Task dispatch */
function isAgentToolCall(toolName: string, args: Record<string, unknown>): boolean {
  const metaToolName = args.metaToolName as string | undefined
  if (metaToolName === "Agent") return true
  const lower = toolName.toLowerCase()
  return lower.startsWith("task") && lower.includes(":")
}
```

- [ ] **Step 2: Update AcpToolRenderer to route Agent calls to SubagentSession**

Modify `AcpToolRenderer` to check for Agent tool calls and render `SubagentSession` when children exist:

```typescript
export function AcpToolRenderer(props: ToolCallMessagePartProps) {
  const { subagentChildrenMap } = useAgentContext()

  // Check if this is an Agent tool call with children
  if (isAgentToolCall(props.toolName, (props.args ?? {}) as Record<string, unknown>)) {
    const children = subagentChildrenMap?.get(props.toolCallId)
    if (children && children.length > 0) {
      return (
        <SubagentSession
          toolCallId={props.toolCallId}
          toolName={props.toolName}
          status={props.status}
          childMessages={children}
          childrenMap={subagentChildrenMap!}
        />
      )
    }
  }

  const kind = inferToolKind(
    props.toolName,
    (props.args ?? {}) as Record<string, unknown>
  )

  switch (kind) {
    case "execute":
      return <ExecuteToolRenderer {...props} />
    case "read":
      return <ReadToolRenderer {...props} />
    case "edit":
      return <EditToolRenderer {...props} />
    case "search":
      return <SearchToolRenderer {...props} />
    case "fetch":
      return <FetchToolRenderer {...props} />
    default:
      return <ToolFallback {...props} />
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd my-life-db/frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add my-life-db/frontend/app/components/agent/tool-dispatch.tsx
git commit -m "feat(claude): route Agent tool calls to SubagentSession"
```

---

### Task 8: Build and manual test

**Files:** None (verification only)

- [ ] **Step 1: Build frontend**

Run: `cd my-life-db/frontend && npm run build`
Expected: PASS (no build errors)

- [ ] **Step 2: Manual test with a session that has subagent messages**

Start the dev server and open a Claude session that used the Agent tool. Verify:
- Subagent messages are grouped under the Agent tool call, not shown flat
- The Agent tool call shows as a collapsible container with title and tool count
- Completed agents are collapsed by default
- Clicking the header toggles expansion
- Child tool calls render correctly inside the sub-session
- Nested agents (agent-within-agent) render recursively
- The main thread no longer shows orphaned subagent messages

Run: `cd my-life-db/frontend && npm run dev`

- [ ] **Step 3: Verify no regressions in sessions without subagents**

Open a Claude session that does NOT use the Agent tool. Verify all messages render normally — no missing content, no layout changes.

- [ ] **Step 4: Commit any fixes found during testing**

If adjustments are needed, commit them:
```bash
git add -A
git commit -m "fix(claude): address subagent nesting issues found during testing"
```
