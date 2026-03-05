---
title: Virtual Scrolling
description: Technical design for the chat message list virtual scrolling system
---

# Virtual Scrolling

The Claude session chat uses a custom flow-based virtual list to render potentially thousands of messages without overwhelming the DOM. The system spans three hooks:

- **`useVirtualList`** — controls which items are in the DOM via spacer divs
- **`useScrollController`** — manages stick-to-bottom, hide-on-scroll, history paging, and scroll phase tracking
- **`MessageList`** — wires them together and renders the visible items

## Core Constraint: iOS Safari

Safari (including iOS) does **not** support `overflow-anchor` CSS. This is the browser feature that keeps visible content stable when DOM changes happen above the viewport. Chrome and Firefox have it; Safari doesn't.

This means any DOM mutation during scroll that changes content height above the viewport causes **visible jitter** — the content shifts and the user sees it.

Additionally, setting `el.scrollTop` programmatically during iOS momentum scroll **kills the momentum instantly**. There is no way to adjust scroll position during inertial scrolling without stopping the scroll.

These two constraints together mean:

> During momentum scroll on iOS, you cannot change the DOM above the viewport AND you cannot compensate by adjusting scrollTop.

## Strategy: Freeze + Edge Expand

The solution is a **freeze-first** approach:

1. **During scroll/momentum** (`userScrollIntent` is true): freeze the virtual list range — no items are added or removed from the DOM. The pre-rendered overscan buffer provides runway.

2. **Near buffer edges**: if the viewport approaches within `edgePx` of the rendered range boundary, break the freeze and expand (add items, never remove). This causes a small jitter but prevents blank space.

3. **On idle** (`scrollend` fires, `userScrollIntent` clears): update the range normally — expand to cover the viewport, shrink lazily to reclaim memory.

```
                    overscanPx (5400px, ~5 screens)
              ┌─────────────────────────────────────────┐
              │                                         │
              │  ┌─── edgePx (1080px, ~1 screen) ───┐  │
              │  │                                   │  │
              │  │  ┌─── viewport (visible) ───┐     │  │
              │  │  │                          │     │  │
              │  │  │   What the user sees     │     │  │
              │  │  │                          │     │  │
              │  │  └──────────────────────────┘     │  │
              │  │                                   │  │
              │  │  Edge expand triggers here        │  │
              │  └───────────────────────────────────┘  │
              │                                         │
              │  Frozen zone — no DOM changes           │
              └─────────────────────────────────────────┘
```

## Thresholds

All thresholds are in **pixels** for consistency:

| Threshold | Value | Where | Purpose |
|-----------|-------|-------|---------|
| `overscanPx` | 5400px (~5 screens) | `useVirtualList` | Items rendered beyond viewport on each side |
| `edgePx` | 1080px (~1 screen) | `useVirtualList` | Emergency expand trigger during momentum |
| `topLoadThreshold` | 5400px | `useScrollController` | API fetch for older messages (should match `overscanPx`) |
| `stickyThreshold` | 50px | `useScrollController` | Distance from bottom to consider "at bottom" |

`overscanPx` and `topLoadThreshold` are intentionally the same value. When `startIndex` reaches 0 (all loaded items rendered), the top spacer disappears and `scrollTop` reflects the actual distance from content top. At that point, `scrollTop < topLoadThreshold` triggers the API fetch for the next page.

## Scroll Phases

The scroll controller tracks interaction state to gate behavior:

```
idle ──scroll event──► user ──scrollend──► idle
idle ──scrollToBottom()──► programmatic ──scrollend──► idle
```

- **`userScrollIntent`**: true from `touchstart`/`pointerdown`/`wheel` through `scrollend`. Covers finger contact + momentum. Virtual list uses this to freeze.
- **`fingerDown`**: true only while finger is physically touching. Blocks all programmatic scroll adjustments (absolute lock).
- **`phase`**: `idle` | `user` | `programmatic`. Gates `stickIfNeeded()` — ResizeObserver can only auto-scroll during `idle`.

## History Page Loading

When the user scrolls up far enough:

1. Virtual list edge-expands, rendering items from memory
2. Eventually `startIndex` hits 0 — all loaded items are in the DOM
3. `scrollTop` drops below `topLoadThreshold` → scroll controller fires `onNearTop`
4. Parent component calls API to fetch older messages
5. Messages arrive as a prepend (new items at index 0)
6. Virtual list detects prepend in render phase, shifts range indices
7. Layout effect restores scroll position (skipped during momentum to preserve inertia)

## Prepend Handling

When older messages are loaded, they appear at the start of the array. The virtual list:

1. **Render-phase detection**: Compares `getKey(0)` against the previous first key. If different, finds how many items were prepended.
2. **Range shift**: Adjusts `startIndex` and `endIndex` by the prepend count so the same items stay visible.
3. **Scroll restoration**: In a `useLayoutEffect`, adjusts `scrollTop` by the height delta. **Skipped during momentum** to avoid killing inertia — the content jumps but momentum continues.

## Flow-Based Layout

Items are rendered in normal document flow (no absolute positioning). Two spacer divs approximate off-screen item height:

```
<div style={{ height: topHeight }} />    <!-- startIndex * estimateSize -->
<!-- rendered items in normal flow -->
<div style={{ height: bottomHeight }} /> <!-- (count - endIndex) * estimateSize -->
```

The `estimateSize` (120px) is an approximation. Actual items range from ~56px to ~688px. This mismatch is why DOM changes during scroll cause jitter on Safari — the spacer height change doesn't match the actual content height change.

## Why Not Use an Existing Library?

Libraries like `@tanstack/virtual` use absolute positioning and measured heights. Our approach uses flow-based layout because:

- Browser scroll anchoring (on Chrome/Firefox) works automatically with flow layout
- No measurement pass needed — items render naturally
- Simpler integration with the stick-to-bottom and hide-on-scroll behaviors
- The freeze strategy handles Safari's limitations without needing per-item height tracking
