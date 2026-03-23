---
title: "ACP UI Components"
description: "Component inventory and feature spec for the ACP agent chat UI"
---

> Last edit: 2026-03-23

## Overview

This document lists every UI component needed for the ACP agent chat, their features, and parity status against the old Claude Code chat UI. Components live in `frontend/app/components/agent/`.

The UI is built on [assistant-ui](https://www.assistant-ui.com/) primitives with self-contained styling per component (no global theme CSS). Each component owns its own Tailwind classes. Style reference: Claude Code (warm tones, serif touches, minimal borders).

---

## Component Inventory

### Core Structure

| Component | File | Purpose | Status |
|---|---|---|---|
| `AgentChat` | `agent-chat.tsx` | Top-level orchestrator: runtime provider, thread, composer | **Done** |
| `AgentContext` | `agent-context.tsx` | React context for permission responses and pending permissions | **Done** |
| `UserMessage` | `user-message.tsx` | User message bubble with markdown | **Done** |
| `AssistantMessage` | `assistant-message.tsx` | Assistant message with markdown, thinking, tools, action bar | **Done** |

### Composer

| Component | File | Purpose | Status |
|---|---|---|---|
| `AgentComposer` | `agent-chat.tsx` (inline) | Text input + actions row | **Done** (draft persistence + keyboard shortcuts) |
| `FolderPicker` | `folder-picker.tsx` | Working dir selector | **Done** |
| `PermissionModeSelector` | `permission-mode-selector.tsx` | Permission mode dropdown | **Done** |
| `AgentTypeSelector` | `agent-type-selector.tsx` | Agent type dropdown | **Done** |
| `SlashCommandPopover` | `slash-command-popover.tsx` | Slash command autocomplete (`/` trigger) | **Done** |
| `FileTagPopover` | `file-tag-popover.tsx` | File tag autocomplete (`@` trigger) | **Done** |

### Tool Renderers (by ACP ToolKind)

| Component | File | ACP Kind | Status |
|---|---|---|---|
| `ExecuteToolRenderer` | `tools/execute-tool.tsx` | `execute` | **Done** (MessageDot, summaries, error display) |
| `ReadToolRenderer` | `tools/read-tool.tsx` | `read` | **Done** (MessageDot, summaries, error display) |
| `EditToolRenderer` | `tools/edit-tool.tsx` | `edit` | **Done** (MessageDot, summaries, error display) |
| `SearchToolRenderer` | `tools/search-tool.tsx` | `search` | **Done** |
| `FetchToolRenderer` | `tools/fetch-tool.tsx` | `fetch` | **Done** |
| `GenericToolRenderer` | `tools/generic-tool.tsx` | `other`, `think`, `delete`, `move` | **Done** (MessageDot, summaries) |

### Permissions & Interaction

| Component | File | Purpose | Status |
|---|---|---|---|
| `PermissionCard` | `permission-card.tsx` | Tool permission approval with ACP options — popup above input box (matching old UX) | **Done** (keyboard shortcuts, animation, popup positioning added) |

### Status & Info

| Component | File | Purpose | Status |
|---|---|---|---|
| `ConnectionStatusBanner` | `connection-status-banner.tsx` | Reconnecting/disconnected/reconnected banner | **Done** |
| `MessageDot` | `message-dot.tsx` | Universal status dot (12 types, color-coded, pulsing) | **Done** |
| `AgentWIP` | `agent-wip.tsx` | "Working..." indicator with typing animation | **Done** |
| `PlanView` | `plan-view.tsx` | Agent plan entries as checklist | **Done** |
| `RateLimitWarning` | N/A | Quota warning banner | **Skipped** — ACP protocol does not expose rate limit events |
| `ContextUsageIndicator` | N/A | Circular progress ring + popover | **Skipped** — ACP `PromptResponse` has no token counts |

### Content Rendering

| Component | File | Purpose | Status |
|---|---|---|---|
| `MarkdownContent` | `markdown-content.tsx` | Markdown → HTML with syntax highlighting, mermaid, linkified paths | **Done** |
| `FileRef` | **Deferred** | Clickable file path (filename shown, full path on hover, links to library) | Skipped for now |
| `PreviewFullscreen` | `preview-fullscreen.tsx` | Full-viewport overlay for HTML/SVG/chart preview | **Done** (component ready, not yet wired to markdown) |

### Hooks

| Hook | File | Purpose | Status |
|---|---|---|---|
| `useAgentWebSocket` | `hooks/use-agent-websocket.ts` | WS connection with reconnect | **Done** |
| `useAgentRuntime` | `hooks/use-agent-runtime.ts` | ACP frames → assistant-ui runtime | **Done** |
| `useDraftPersistence` | `hooks/use-draft-persistence.ts` | localStorage draft save/restore per session | **Done** |

---

## Feature Spec by Category

### F1: Markdown Rendering

The old UI renders assistant text as full markdown with:

- **Inline formatting**: bold, italic, code, strikethrough, links
- **Block elements**: headers, lists (ordered/unordered), blockquotes, horizontal rules, tables
- **Code blocks**: fenced with language tag, syntax highlighted via Shiki
- **Mermaid diagrams**: rendered as SVG, double-click for fullscreen
- **HTML blocks**: rendered in sandboxed iframes, expand button for fullscreen
- **File path linkification**: paths matching library structure become clickable `FileRef` links
- **Two-pass rendering**: sync parse (instant, no highlighting) → async parse (Shiki + mermaid). Prevents blank flash.

**ACP status**: Done. `MarkdownContent` component exists at `markdown-content.tsx` and is used in `AssistantMessage` and `UserMessage`.

**ACP approach**: Build `MarkdownContent` component using `@assistant-ui/react-markdown` (provides `MarkdownText` with syntax highlighting) or a custom renderer with `marked` + `shiki`. Each `AssistantMessage` text part uses this component.

**Gap callout**: ACP `agent.messageChunk` streams raw text. assistant-ui accumulates it into a `TextPart`. Markdown parsing must handle partial/streaming text gracefully (the old UI used `parseMarkdownSync` for instant display, upgraded to full highlighting when complete).

---

### F2: Streaming Text Animation

The old UI has:

- **Token batching**: buffers arriving tokens, flushes every 40ms for smooth rendering
- **Materialization animation**: new text fades in with blur effect (`animate-stream-word`)
- **Safe split detection**: doesn't split inside code fences when separating stable vs new content
- **Blinking cursor**: 2px inline block at end of streaming text
- **Stabilization timer**: 150ms after text stops, new content becomes "stable" (no longer animated)

**ACP status**: Done. Streaming cursor added. assistant-ui handles streaming accumulation internally via `ExternalStoreRuntime`.

**ACP approach**: assistant-ui's default streaming is functional. Custom animation can be added via CSS on the `AssistantMessage` component. The blinking cursor can be a CSS pseudo-element shown when message status is `running`.

---

### F3: Streaming Thinking

The old UI has:

- **Collapsible block**: collapsed by default with "Thinking" label and animated indicator
- **Same materialization animation** as text streaming
- **Blinking cursor** when expanded
- **Pulsing gray dot** (`thinking-wip`)
- **Smooth collapse animation** via CSS grid

**ACP status**: `agent.thoughtChunk` frames are accumulated into `ReasoningMessagePart`. Rendered as a `<details>` with "Reasoning" summary. Functional but plain.

**ACP approach**: Style the `<details>` to match — pulsing dot, smooth collapse animation, code-block background when expanded.

---

### F4: Tool Call Rendering (General)

The old UI has for all tool types:

- **MessageDot** status indicator (pending/wip/completed/failed/aborted)
- **Header**: dot + tool name (bold) + context info (file path, command, pattern)
- **Summary line**: "└" tree connector + status text (running time, result count, first line of output)
- **Collapsible body**: smooth CSS grid animation, default collapsed when complete, expanded when in-progress
- **Error display**: always visible, alert color, truncated to 100 chars with "..."
- **Lazy content rendering**: markdown only parsed when expanded

**ACP status**: Done. MessageDot, summaries, error display all implemented across tool renderers.

---

### F4.1: Execute Tool (`execute` kind)

Old `BashToolView` features:
- Header: "Bash" + truncated command text in secondary color
- Summary: running status (elapsed + line count), or first line of output (max 80 chars)
- Expanded: monospace output with linkified file paths, max-height 60vh
- Error output in alert color, separate from regular output
- Dot type varies: failed (error/non-zero exit), pending (in-progress), completed

**ACP status**: `ExecuteToolRenderer` exists at `tools/execute-tool.tsx`. Done with MessageDot, summary line, elapsed time, error handling.

---

### F4.2: Read Tool (`read` kind)

Old `ReadToolView` features:
- Header: "Read" + `FileRef` component (clickable file path)
- Summary: "Read N lines" or "Read line X-Y (Z total)"
- Line metadata extracted from result
- NOT expandable — just header + summary

**ACP status**: `ReadToolRenderer` exists at `tools/read-tool.tsx`. Done with MessageDot and summary line.

---

### F4.3: Edit Tool (`edit` kind)

Old `EditToolView` features:
- Header: "Edit" + `FileRef` + optional "(replace all)"
- Unified diff view: red lines (deleted) + green lines (added)
- Truncated to 5+5 lines with "Show more/less"
- Max-height 60vh when expanded

Old `WriteToolView` features:
- Header: "Write" + `FileRef`
- Syntax-highlighted content preview (Shiki, 30+ languages)
- Truncated to 10 lines with "Show more (N lines)"

**ACP status**: `EditToolRenderer` exists at `tools/edit-tool.tsx`. Done with MessageDot and summaries.

**Note**: ACP `ToolCallContent` has a `diff` type with `path`, `oldText`, `newText` — structured diff. The old UI extracted this from raw input params. ACP provides it natively.

---

### F4.4: Search Tool (`search` kind)

Old `GrepToolView` + `GlobToolView` features:
- Grep: "Grep" + `/{pattern}/` + path + "Found in N file(s)"
- Glob: "Glob" + pattern + path + "Found N file(s)"
- Neither expandable

**ACP status**: Done. `SearchToolRenderer` exists at `tools/search-tool.tsx` showing pattern + file count.

---

### F4.5: Fetch Tool (`fetch` kind)

Old `WebFetchToolView` + `WebSearchToolView` features:
- WebFetch: URL + "HTTP {status} ({size}, {duration})" + expandable markdown content
- WebSearch: query + "Found N results" + expandable link list (title + URL)

**ACP status**: Done. `FetchToolRenderer` exists at `tools/fetch-tool.tsx` showing URL + status + expandable content.

---

### F5: Permission Card

Old features:
- Action verb derived from tool name: Run (Bash), Read, Write, Edit, Fetch, Search, Use
- Content block: markdown for plan mode, code block for others
- Three buttons: Deny (Esc), Always allow (Cmd+Enter), Allow once (Enter)
- Keyboard shortcuts (first permission only)
- Slide-up/down animation
- Double-click prevention
- Max 3 visible, overflow counted

**ACP status**: Done. `PermissionCard` exists with ACP options (allow_once, allow_always, reject_once, reject_always), keyboard shortcuts, animation, and popup positioning above composer.

**ACP difference**: ACP provides explicit `options[]` with `optionId` + `name` + `kind`. No need to derive action verbs — just render the options. But keyboard shortcuts and animation should be added.

---

### F6: Connection & Reconnection

Old features:
- Exponential backoff reconnection (1s base, 60s max)
- 2-second grace period (hides banner for quick reconnects)
- Token refresh before reconnect
- Visibility change handling (reconnect after sleep/wake)
- Three-state banner: Connecting (spinner), Disconnected (wifi-off), Reconnected (check, auto-dismiss 1.5s)
- Draft preservation across disconnects
- UUID-based message dedup on reconnect (replayed messages merge cleanly)

**ACP status**: `ConnectionStatusBanner` component is done. WS reconnection with exponential backoff exists. Still missing: grace period, token refresh, visibility handling, draft persistence.

---

### F7: Draft Persistence

Old features:
- localStorage key: `claude-input:{sessionId}` or `claude-input:new-session`
- Auto-saves on every content change
- Restored on mount / session switch
- Cleared only when server confirms message receipt (echo matches draft)
- Restored on send failure
- Session-scoped tracking prevents cross-session saves
- Imperative API: `clearDraft()`, `restoreDraft()`, `getDraft()`, `markPendingSend()`

**ACP status**: Done. `useDraftPersistence` hook exists at `hooks/use-draft-persistence.ts`. Integrated with `ComposerPrimitive.Input`. Draft cleared when `user.echo` frame arrives matching the sent text.

---

### F8: Optimistic User Message

Old features:
- User message shown immediately at 70% opacity, right-aligned
- Cleared when server echoes the message back
- Prevents input feeling laggy

**ACP status**: Done. Optimistic message added to internal state on send, removed on `user.echo`.

---

### F9: Virtual Scrolling

Old features:
- Flow-based virtual scrolling via `useVirtualList`
- Browser-native `overflow-anchor` for scroll stability
- 5400px overscan
- Near-top detection triggers backward pagination
- Sticky-to-bottom behavior
- Mobile momentum scrolling

**ACP status**: Deferred. Using assistant-ui native scrolling (`ThreadPrimitive.Viewport`). Virtual scrolling will be added if performance becomes an issue with long conversations.

---

### F10: Message Deduplication

Old features:
- UUID-based dedup: every message has a unique `uuid`
- On reconnect/burst replay, duplicate messages are dropped by checking existing UUIDs
- Prevents double-rendering after WS reconnect

**ACP status**: Done. UUID tracking added to internal message state. On `session.info` burst, frames matching existing message IDs are skipped.

---

### F11: Fullscreen Preview

Old features:
- Full-viewport portal overlay
- iframe with sandboxed HTML/SVG content
- Close via button or Escape (both parent and iframe)
- Body scroll locked
- Native app: disables interactive pop gesture
- SVG wrapped in theme-aware HTML
- Triggered by expand button on HTML previews + double-click on mermaid diagrams

**ACP status**: Done. `PreviewFullscreen` component exists at `preview-fullscreen.tsx`. Component ready; not yet wired to markdown expand buttons.

---

### F12: File References

Old `FileRef` features:
- Shows filename only, full path on hover
- Clickable: links to `/library?open={path}`
- Native app: uses native bridge navigation
- Styled: monospace, code-block background, accent color, hover underline

**ACP status**: Deferred. Tool renderers show raw paths as text. `FileRef` component not built.

**ACP approach**: Build `FileRef` component. Use in tool headers wherever a file path appears. Parse `toolName` title (e.g., "Read /src/main.go" → extract path).

---

### F13: MessageDot

Old features:
- 12 dot types: claude-wip, assistant-wip, assistant, thinking-wip, thinking, tool-wip, tool-aborted, tool-completed, tool-failed, compacting, system, tool-pending
- Color-coded: green (success), red (error), gray (neutral), salmon (Claude active)
- Pulsing animation for active states (`-wip`)
- 20px height container matching mono line-height

**ACP status**: Done. `MessageDot` component exists at `message-dot.tsx`. Used in tool headers and assistant messages, maps ACP `ToolCallStatus` to dot types.

---

### F14: Working Indicator

Old `ClaudeWIP` features:
- Pulsing salmon dot + animated typing text
- 100+ random fun words ("Clauding", "Noodling", "Spelunking")
- 5 words per turn, stable within turn, cycling with typing animation
- 120ms per character, 240ms pause at end

**ACP status**: Done. `AgentWIP` component exists at `agent-wip.tsx`. Shows below the last message when running.

---

### F15: Plan/Todo Panel

Old `TodoPanel` features:
- Sidebar panel (288px wide)
- Items with checkbox icons: empty (pending), half-fill (in-progress), full (completed)
- Progress bar (completed/total percentage)
- Collapsible

Old `TodoToolView` features:
- Inline list in message with tree connectors
- Strikethrough for completed items

**ACP status**: Done. `PlanView` component exists at `plan-view.tsx`. Renders `agent.plan` entries inline as a checklist.

---

### F16: Keyboard Shortcuts

Old features:
- **Enter**: send message (desktop)
- **Shift+Enter**: newline (desktop)
- **Escape**: close popovers, or interrupt when working
- **Esc on permission**: deny (first permission only)
- **Cmd+Enter on permission**: always allow for session (first permission only)
- **Enter on permission**: allow once (first permission only)
- IME composition handling (prevents send during CJK input)

**ACP status**: Done. Slash command popovers, permission keyboard shortcuts, and Escape to interrupt all implemented.

---

### F17: Mobile UX

Old features:
- Hide input on scroll (reappears on scroll up or at bottom)
- Touch-based swipe back navigation
- Mobile-safe keyboard shortcuts (no Enter-to-send, button only)
- Permission card max-height adapts to mobile

**ACP status**: Done. Hide-on-scroll input implemented.

---

## Cannot be fulfilled via ACP

| Feature | Why |
|---|---|
| Context usage indicator | ACP `PromptResponse` has no token counts. Would need LLM proxy instrumentation. |
| Rate limit warning | ACP has no rate limit events. Would need LLM proxy reporting. |
| AskUserQuestion | ACP doesn't expose this tool — agent asks as plain text instead. |
| Slash commands from agent | ACP `AvailableCommandsUpdate` provides commands but no execution mechanism via ACP protocol (would need custom WS message type). |
| Session compaction | ACP has no compact/microcompact events. The agent handles context management internally. |
| Nested agent conversations | ACP doesn't stream subagent conversations separately. Task tool output arrives as a single tool result, not as nested messages. |

---

## Implementation Priority

### Done

All items implemented. Full component inventory is complete.

- `MarkdownContent` — `markdown-content.tsx`
- `MessageDot` — `message-dot.tsx`
- `ConnectionStatusBanner` — `connection-status-banner.tsx`
- `AgentWIP` — `agent-wip.tsx`
- `UserMessage` — `user-message.tsx` (with markdown)
- `AssistantMessage` — `assistant-message.tsx` (with markdown, copy button, tools)
- `FolderPicker` — `folder-picker.tsx`
- `PermissionModeSelector` — `permission-mode-selector.tsx`
- `AgentTypeSelector` — `agent-type-selector.tsx`
- `PermissionCard` — `permission-card.tsx` (keyboard shortcuts, animation, popup positioning)
- `AgentChat` — `agent-chat.tsx` (polished)
- `AgentComposer` — `agent-chat.tsx` (draft persistence + keyboard shortcuts)
- `SlashCommandPopover` — `slash-command-popover.tsx`
- `FileTagPopover` — `file-tag-popover.tsx`
- `ExecuteToolRenderer` — `tools/execute-tool.tsx` (MessageDot, summaries, error display)
- `ReadToolRenderer` — `tools/read-tool.tsx` (MessageDot, summaries, error display)
- `EditToolRenderer` — `tools/edit-tool.tsx` (MessageDot, summaries, error display)
- `SearchToolRenderer` — `tools/search-tool.tsx`
- `FetchToolRenderer` — `tools/fetch-tool.tsx`
- `GenericToolRenderer` — `tools/generic-tool.tsx` (MessageDot, summaries)
- `PlanView` — `plan-view.tsx`
- `PreviewFullscreen` — `preview-fullscreen.tsx` (component ready, not yet wired to markdown)
- `useDraftPersistence` — `hooks/use-draft-persistence.ts`
- Message deduplication on reconnect
- Optimistic user message
- Streaming cursor
- Hide-on-scroll input (mobile)

### Deferred

- `FileRef` — clickable file paths in tool headers (not yet built)
- Virtual scrolling — using assistant-ui native scrolling; add if needed for long conversations
