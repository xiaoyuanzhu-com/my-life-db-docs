---
title: Virtual Scrolling
description: Technical design for the virtual scrolling system
---

> Last edit: 2026-03-06

## How virtual lists work

A virtual list only renders items that are visible (plus a buffer). Off-screen items are replaced by spacer divs that approximate their height. As the user scrolls, items swap in and out — spacers shrink, real items appear, and vice versa.

This works beautifully on desktop browsers. Scroll down, items appear. Scroll up, items reappear. The spacer heights don't need to be exact because browsers have a feature called `overflow-anchor` (CSS Scroll Anchoring) that automatically adjusts `scrollTop` whenever content above the viewport changes height. The user never notices.

## Then we tested on iOS Safari

Two things broke.

**Safari doesn't support `overflow-anchor`.** Every time a spacer swapped for a real item (or vice versa), the height mismatch shifted the visible content. A spacer estimated at 120px replaced by a 60px item means everything below jumps up 60px. On Chrome this is invisible. On Safari the user sees it — a constant, nauseating jitter during every scroll.

**iOS momentum scroll can't be adjusted.** After a touch-swipe, iOS continues scrolling with inertia. The natural fix for jitter is to set `el.scrollTop` to compensate for the height change. But on iOS, any programmatic `scrollTop` assignment during momentum kills the inertia instantly. The scroll just stops.

These two facts create an impossible constraint:

> During momentum scroll on iOS Safari, you cannot change the DOM (causes jitter) and you cannot compensate by adjusting scrollTop (kills momentum). You can do neither.

## What we tried

**Approach 1: Expand-only.** During scroll, add items to the DOM but never remove them. This avoided some jitter but not all — adding items still changed spacer heights, and Safari still shifted content.

**Approach 2: Expand-only + manual scroll anchoring.** Snapshot `scrollHeight` and `scrollTop` before a DOM change, then restore `scrollTop` after React commits. This fixed the jitter perfectly — but killed momentum on every restore. One adjustment and the scroll stops dead.

**Approach 3: Complete freeze.** Don't change the DOM at all during scroll. No mutations, no jitter, no momentum kill. This felt perfect — smooth, natural scrolling. Until the user scrolled far enough to reach the edge of the buffer. Then: blank space.

Each approach solved one problem and created another.

## The solution: freeze with an escape hatch

The insight: freezing works for 95% of scrolls. The buffer is large enough that a normal swipe never reaches the edge. The only time blank space appears is during unusually long continuous scrolling — and at that point, a small jitter is better than a blank screen.

**During scroll**: freeze the virtual list range completely. Pre-rendered items above and below the viewport (~5 screens worth) provide the runway. No DOM changes, no jitter, momentum preserved.

**Near the buffer edge**: if the viewport gets within ~1 screen of the boundary, break the freeze and expand (add items, never remove). There may be a brief jitter, but the user was about to see blank space — jitter is the lesser evil.

**On idle**: once `scrollend` fires and momentum stops, update the range normally. Expand to cover the new position, shrink lazily to reclaim DOM nodes.

```
              ┌─── buffer (~5 screens) ────────────────┐
              │                                         │
              │  ┌── edge zone (~1 screen) ─────────┐  │
              │  │                                   │  │
              │  │        ┌── viewport ──┐           │  │
              │  │        │  (visible)   │           │  │
              │  │        └──────────────┘           │  │
              │  │                                   │  │
              │  │  Emergency expand triggers here   │  │
              │  └───────────────────────────────────┘  │
              │                                         │
              │  Frozen — no DOM changes during scroll  │
              └─────────────────────────────────────────┘
```

## Thresholds

All values are in **pixels**. Item counts are meaningless when items range from 56px to 688px tall.

| Name | Value | What it does |
|------|-------|-------------|
| `overscanPx` | 5400px (~5 screens) | Buffer of pre-rendered items above/below viewport |
| `edgePx` | 1080px (~1 screen) | How close to the buffer edge before emergency expand |
| `topLoadThreshold` | 5400px | How close to the top of all content before fetching the next page |

`overscanPx` and `topLoadThreshold` are intentionally the same value. When the virtual list has rendered everything it has (no spacer above), `scrollTop` equals the distance from the top of content. Below this threshold, a fetch fires for the next page of data.

## Tracking who's scrolling

A scroll controller tracks whether the human or the code is driving the scroll. This matters because a `ResizeObserver` watching content growth should auto-scroll to the bottom — but only when the user isn't actively scrolling.

```
idle ──touch/wheel──► user ──scrollend──► idle
idle ──scrollToBottom()──► programmatic ──scrollend──► idle
```

Three signals:

- **`userScrollIntent`** — `true` from first touch through the end of momentum. The virtual list freezes while this is `true`.
- **`fingerDown`** — `true` only while the finger is physically on screen. An absolute lock: nothing programmatic can touch the scroll position.
- **`phase`** — `idle`, `user`, or `programmatic`. The `ResizeObserver` can only auto-scroll during `idle`.

## When new data arrives at the top

Paginated data loads as a prepend — new items appear at index 0, pushing existing items down. This needs special handling:

1. **Detect**: the first item's key changed → count how many new items were prepended.
2. **Shift**: adjust the virtual list's range indices by the prepend count so the same items stay visible.
3. **Restore scroll position**: adjust `scrollTop` by the `scrollHeight` delta so the viewport doesn't jump. **But during momentum, skip this** — setting `scrollTop` would kill the inertia. The content jumps, but the scroll keeps moving. A brief visual discontinuity beats a dead stop.

## Why flow-based layout

Items render in normal document flow with two spacers:

```html
<div style="height: topSpacer" />
<!-- rendered items -->
<div style="height: bottomSpacer" />
```

No absolute positioning, no per-item measurement. On Chrome and Firefox, browser scroll anchoring handles height mismatches automatically. On Safari, the freeze strategy sidesteps the problem entirely. The tradeoff: spacer heights are estimates, so the scrollbar thumb position isn't perfectly accurate — but for a chat interface, nobody notices.

## The estimate mismatch bug (2026-03)

### Symptom

Some Claude session pages "flash" non-stop — messages appear, disappear, reappear in a rapid loop. Affects both desktop and mobile, both dev and production. Only sessions with enough messages to trigger virtualization (50+ filtered messages).

### Root cause: `calcRange` overflow

`calcRange` computes the visible range from `scrollTop`:

```js
const rawStart = Math.floor(scrollTop / estimateSize)
```

This assumes total content height ≈ `count × estimateSize`. But chat messages vary wildly in height (code blocks, tool results, long responses). When actual total height exceeds the estimate — e.g., 72 messages at actual average 240px vs estimated 120px — `scrollTop` at the bottom is ~17,000px but `count × estimateSize` is only ~8,600px. So `rawStart = 143`, far exceeding `count = 72`.

This creates two failure modes:

**Oscillation loop (stick-to-bottom):** `stickIfNeeded` scrolls to the actual bottom → scroll event fires → `calcRange` computes out-of-bounds range → different items render → content height changes → ResizeObserver fires → `stickIfNeeded` → repeat. Visual result: messages flash in and out continuously.

**Empty page (scroll-up):** User scrolls up from bottom, `shouldStick` becomes false, `calcRange` runs with inflated `scrollTop`. `startIndex` exceeds `endIndex` → zero items rendered → blank page.

### Fix: clamp `rawStart`

```js
const rawStart = Math.min(Math.floor(scrollTop / estimateSize), count - 1)
```

This ensures `rawStart` never exceeds the item count. When at the actual bottom with inflated `scrollTop`, it maps to `count - 1`, producing a bottom-anchored range — the correct behavior. The oscillation loop breaks because the range stabilizes.

### What we tested and rejected

| Approach | Result |
|----------|--------|
| Skip `updateRange` when `shouldStick` is true | Fixed oscillation, but scroll-up produced empty pages — `calcRange` still overflowed when `shouldStick` flipped to false |
| Set `overscanPx` to 120,000 (render everything) | Worked but defeated the purpose of virtualization — a band-aid, not a fix |

### Contributing factor: dual ChatInterface mounting

The CSS-based responsive layout (`hidden md:flex` / `flex md:hidden`) rendered **both** desktop and mobile `ChatInterface` simultaneously. Each opened its own WebSocket, loaded messages independently, doubling backend connections and SSE notifications. Fixed by adding a `useIsMobile()` hook to conditionally render only the visible branch.

This was discovered first during debugging but was not the primary cause of the flashing — the virtualizer oscillation was.
