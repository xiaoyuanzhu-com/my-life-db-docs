---
title: Virtual Scrolling
description: Technical design for the virtual scrolling system
---

> Last edit: 2026-03-08 (updated platform behaviors reference)

## Scroll UX contract

Every scroll interaction must satisfy a set of UX guarantees. The labels (A–L) are defined inline below and referenced throughout this document and in bug reports.

**1. Scroll up** — drag finger up
- A, follows finger
- B, momentum after lift
- C, decelerates
- D, no jump while touching
- E, no jump during momentum
- F, no jump after momentum

**2. Scroll down** — drag finger down
- A, follows finger
- B, momentum after lift
- C, decelerates
- D, no jump while touching
- E, no jump during momentum
- F, no jump after momentum

**3. Quick flick** — fast swipe, lift early
- B, momentum after lift
- C, decelerates
- E, no jump during momentum
- F, no jump after momentum

**4. Reverse mid-gesture** — change direction without lifting
- A, follows finger
- D, no jump while touching
- L, instant reversal

**5. Tap to stop momentum**
- D, no jump while touching
- J, momentum stops immediately

**6. Scroll up near top** — load older messages
- A, follows finger
- B, momentum after lift
- C, decelerates
- D, no jump while touching
- E, no jump during momentum
- F, no jump after momentum
- K, older messages load seamlessly

**7. Long continuous scroll** — hits buffer edge
- A, follows finger
- D, no jump while touching (best-effort, minor jitter possible)

**8. At bottom + streaming** — new content arrives
- G, pinned to bottom
- H, auto-scrolls to new content

**9. Scrolled up + streaming** — new content arrives
- I, stays at current position

**10. Scroll back to bottom** — after scrolling up
- A, follows finger
- B, momentum after lift
- C, decelerates
- D, no jump while touching
- E, no jump during momentum
- F, no jump after momentum
- G, pinned once at bottom
- H, auto-scrolls once at bottom

**11. Scroll up during streaming** — drag up while content growing
- A, follows finger
- B, momentum after lift
- C, decelerates
- D, no jump while touching
- E, no jump during momentum
- F, no jump after momentum
- I, stays at current position

**12. Finger lift, no momentum** — release at zero velocity
- F, no jump after scroll ends

**13. Return to page** — navigate away and back
- G, pinned to bottom

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

**On idle**: once `scrollend` fires and momentum stops, update the range normally. Expand to cover the new position, shrink lazily to reclaim DOM nodes. A manual scroll anchor prevents visual jumps (see below).

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
idle ──touch/wheel──► user ──scrollend (finger up)──► idle
idle ──scrollToBottom()──► programmatic ──scrollend──► idle
```

Three signals:

- **`userScrollIntent`** — `true` from first touch through the end of momentum. The virtual list freezes while this is `true`.
- **`fingerDown`** — `true` only while the finger is physically on screen. An absolute lock: nothing programmatic can touch the scroll position.
- **`phase`** — `idle`, `user`, or `programmatic`. The `ResizeObserver` can only auto-scroll during `idle`.

### Mid-gesture scrollend

iOS Safari fires `scrollend` whenever scroll velocity reaches zero — including **during** a touch gesture when the user reverses direction. Without handling this, the scroll controller would reset to idle while the finger is still on screen, breaking the gesture.

**Fix**: if `fingerDown` is true when `scrollend` fires, ignore it. The real finalization happens later:

- **If momentum follows**: scroll events keep firing, eventually a real `scrollend` fires with `fingerDown === false`.
- **If no momentum**: a 150ms safety timer after `touchend` detects that no scroll events came, and finalizes to idle manually.

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

## Manual scroll anchoring (2026-03)

When the range unfreezes after momentum ends, `startIndex` may change — items are added or removed above the viewport, and the top spacer resizes. Because spacer heights are estimates and real item heights vary, a spacer-to-item swap almost always produces a height mismatch. On Chrome/Firefox, `overflow-anchor` silently compensates. On Safari, the content jumps.

### How it works

The key insight: when items change on only one side of the viewport, we can use a **positional invariant** — a distance that doesn't change — instead of measuring drift.

**Scroll up (items added above viewport):** The content below the viewport hasn't changed, so `scrollBottom` (distance from viewport bottom to content bottom) is invariant. Capture it before the DOM change, restore it after:

```js
// Before: capture invariant
const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight

// After (useLayoutEffect): restore
el.scrollTop = el.scrollHeight - el.clientHeight - scrollBottom
```

This is exact — no element lookup, no `getBoundingClientRect`, no drift measurement. Pure arithmetic.

**Scroll down (items added below viewport):** `scrollTop` is already correct — nothing above the viewport changed. No adjustment needed.

**Both ends never change simultaneously.** Range updates are split into two phases — expand first (one side), then shrink (the other side) on the next update cycle. This guarantees the positional invariant always holds.

```
Scroll up — adding items above:

Before:                         After:
┌─────────────┐                ┌─────────────┐
│ top spacer  │ 4440px         │ top spacer  │ 2520px
├─────────────┤                ├─────────────┤
│ item 37     │                │ item 21     │  ← new items
│ item 38     │                │ ...         │
│ ...         │                │ item 37     │
│ [viewport]  │                │ item 38     │
│ ...         │                │ ...         │
│ item 128    │                │ [viewport]  │  ← same position
├─────────────┤                │ ...         │
│ bot spacer  │ 800px          │ item 128    │
└─────────────┘                ├─────────────┤
                               │ bot spacer  │ 800px  ← unchanged
scrollBottom: 800              └─────────────┘

                               scrollBottom: 800  ← invariant
                               scrollTop = newScrollHeight - clientHeight - 800
```

### Why scrollBottom, not element-based

An earlier version captured a visible DOM element's viewport offset via `getBoundingClientRect`, then measured the drift after the DOM change and adjusted `scrollTop`. This works, but the drift exists because spacer estimates don't match real item heights — it's compensating for an error. The scrollBottom approach avoids the error entirely: it doesn't care what the spacer heights are, only that the content below the viewport didn't change.

### One side at a time

The idle range update never changes both `startIndex` and `endIndex` in the same render. Instead it processes one operation per cycle:

1. **Expand** (higher priority) — add items on whichever side needs them
2. **Shrink** (lower priority) — remove items from the far side on the next update

This eliminates the need for element-based anchoring entirely. Since only one side changes per render, either `scrollBottom` is invariant (items added above) or `scrollTop` is already correct (items added below, or items removed from either side).

### When anchoring is skipped

During momentum scroll (`userScrollIntent === true`), anchoring is skipped entirely. Setting `scrollTop` would kill iOS momentum — the same constraint that motivated the freeze strategy. The content may briefly show at the wrong position, but momentum continues naturally. This only happens during emergency edge-expand (rare), not during normal frozen scrolling.

### Use cases and expected behavior

| Scenario | What happens | Strategy | Expected result |
|----------|-------------|----------|-----------------|
| **Normal swipe + momentum** | Range frozen during scroll. No DOM changes. | None | Perfectly smooth, no jitter |
| **Momentum ends (scrollend)** | Range unfreezes. Expand one side, then shrink other side on next cycle. | scrollBottom (if top expands) | Exact restoration. No visible jump. |
| **Long swipe hits buffer edge** | Emergency expand adds items (never removes). `startIndex` decreases. | scrollBottom | Exact. Momentum not killed (skipped during momentum). |
| **Direction reversal mid-gesture** | Browser fires `scrollend` — ignored because `fingerDown` is true. Range stays frozen. | None | Scroll continues tracking finger without interruption |
| **Finger lift, no momentum** | 150ms deferred finalize resets to idle. Range updates (one side at a time). | scrollBottom (if top changes) | Exact restoration. Happens after finger lift so no momentum to kill. |
| **Finger lift, momentum follows** | Scroll events cancel deferred timer. Real `scrollend` fires after momentum. | scrollBottom (if top changes) | Same as "momentum ends". |
| **Prepend (new data at top)** | Count changes, items shift. Detected in render phase. | Height-delta | `scrollTop` adjusted by `scrollHeight` delta. During momentum: skipped (content jumps but momentum preserved). |
| **Idle range shrink** | Removes items from one side only. | None | Top shrink: scrollTop already correct. Bottom shrink: no effect on viewport. |
| **Content resize (streaming)** | `ResizeObserver` fires. `stickIfNeeded` may scroll to bottom. | None | Only acts when `shouldStick && !fingerDown && phase !== 'programmatic'`. |
| **Desktop (Chrome/Firefox)** | Browser `overflow-anchor` handles everything natively. | scrollBottom captured but adjustment is 0 | No adjustment needed. |

## Platform behaviors reference (2026-03)

Understanding how each platform behaves is essential before making any change to scroll handling. This table documents what we have learned through testing — our ground truth.

### Feature support

| Feature | iOS Safari | macOS Safari | Chrome (mobile) | Chrome (desktop) | Firefox |
|---------|-----------|-------------|----------------|-----------------|---------|
| `overflow-anchor` | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| `scrollend` event | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Touch momentum (inertia) | ✅ Yes | ❌ No (mouse/trackpad) | ✅ Yes | ❌ No | ❌ No |
| `touchstart` / `touchend` events | ✅ Yes | ❌ No | ✅ Yes | ❌ No | ❌ No |
| ResizeObserver | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

### Programmatic `scrollTop` behavior

Setting `el.scrollTop = X` from JavaScript has platform-specific side effects that affect our anchoring strategy.

| Behavior | iOS Safari | macOS Safari | Chrome | Firefox |
|---------|-----------|-------------|--------|---------|
| `scroll` event fires | ✅ Yes (async, deferred) | ✅ Yes (sync) | ✅ Yes (sync) | ✅ Yes (sync) |
| `scrollend` event fires | ✅ Yes (async, after scroll) | ✅ Yes | ✅ Yes | ✅ Yes |
| Assignment during momentum kills inertia | ✅ Yes — scroll stops dead | N/A (no inertia) | N/A | N/A |
| Assignment from `useLayoutEffect` (before paint) | Deferred — fires after React's commit phase | Synchronous | Synchronous | Synchronous |
| Assignment from `ResizeObserver` callback | Deferred | Synchronous | Synchronous | Synchronous |

**iOS Safari async scroll events are the key hazard.** When we set `scrollTop` programmatically, iOS queues the resulting `scroll` event and fires it later — sometimes after multiple subsequent React renders. This means any state that we update "after the programmatic scroll event" may run in the wrong order. In our implementation:
- We set `programmaticScrollRef = true` before every programmatic `scrollTop` assignment.
- The `handleScroll` listener checks this flag to distinguish our events from user-initiated ones.
- `programmaticScrollRef` resets to `false` on `scrollend`, by which point all deferred events have fired.

### `scrollend` event semantics

`scrollend` has non-obvious behavior on iOS that shapes our scroll controller design.

| Behavior | iOS Safari | macOS Safari | Chrome | Firefox |
|---------|-----------|-------------|--------|---------|
| Fires after momentum stops | ✅ | ✅ | ✅ | ✅ |
| Fires when velocity reaches zero mid-gesture (direction reversal) | ✅ Yes — fires even with finger down | ❌ No | ❌ No | ❌ No |
| Fires for programmatic `scrollTop` assignment | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Reliable "scroll fully stopped" signal | ⚠️ No — may fire mid-gesture | ✅ Yes | ✅ Yes | ✅ Yes |

**iOS `scrollend` mid-gesture**: when a user scrolls up then reverses direction without lifting the finger, the momentary velocity=0 fires `scrollend`. Without the `fingerDown` guard, this would prematurely unlock the virtual list range. Our fix: if `fingerDown === true` when `scrollend` fires, ignore it and wait for the real end-of-gesture.

### ResizeObserver timing

| Behavior | iOS Safari | macOS Safari | Chrome | Firefox |
|---------|-----------|-------------|--------|---------|
| Fires after layout (not before paint) | ✅ | ✅ | ✅ | ✅ |
| `overflow-anchor` runs before ResizeObserver | N/A (no support) | N/A | ✅ Yes — scrollTop already corrected | ✅ Yes |
| Multiple rapid resizes coalesce | Implementation-defined | Implementation-defined | Yes | Yes |

**The Safari drift pattern**: on Chrome/Firefox, when a rendered item grows, the browser's `overflow-anchor` adjusts `scrollTop` during layout — before `ResizeObserver` fires. So by the time our ResizeObserver callback runs, `scrollTop` is already correct and our correction is a no-op. On Safari, no adjustment happens during layout, so our ResizeObserver compensation is the only correction.

### What "user scroll intent" covers

Our `userScrollIntent` ref is `true` during a window that we must not set `scrollTop`. Here is what that window covers on each platform:

| Phase | iOS Safari | Chrome (mobile) | Desktop |
|------|-----------|----------------|---------|
| Finger touching screen | `fingerDown = true`, `userScrollIntent = true` | Same | N/A |
| Momentum scroll (post-lift) | `userScrollIntent = true`, `fingerDown = false` | Same | N/A (wheel inertia is fine to interrupt) |
| After `scrollend` + 150ms | `userScrollIntent = false` | Same | N/A |

Setting `scrollTop` while `userScrollIntent === true` on mobile is safe only for emergency edge-expands (user will see blank space otherwise). All other corrections — `anchor:scrollBottom`, `anchor:contentResize`, prepend restore — are skipped when `userScrollIntent` is true.

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
