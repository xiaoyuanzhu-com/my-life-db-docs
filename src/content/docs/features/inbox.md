---
title: "Inbox"
---

> Last edit: 2026-02-26

The Inbox is your primary capture space. Drop in text, files, photos, links, voice memos — anything — without deciding where it belongs. Capture now, organize later.

Everything you add is a real file on disk. There's no proprietary format — your data stays yours.

## Capture

The Inbox is a chat-style feed with the input bar at the bottom. Newest items appear at the bottom, older items are above.

### Text

Type into the input bar and press **Enter** to send. Use **Shift + Enter** for a newline. The input area grows as you type.

### Files

Attach files in three ways:

- **Drag and drop** from your desktop onto the feed
- **Click the + button** to open a file picker
- **Paste** images directly from your clipboard

You can send multiple files together with optional text in one message.

### Voice

Tap the microphone button to record. You'll see a live waveform and a running transcript as speech is recognized in real time. When you stop, the transcript is automatically cleaned up by AI and appended to the input. You can also save the recording itself as a file.

## File Cards

Each item in the feed renders as a type-specific card with a timestamp.

| Type | What You See |
|------|-------------|
| **Image** | Inline thumbnail |
| **Video** | Video player with controls |
| **Audio** | Waveform visualization with playback controls |
| **PDF** | Inline PDF viewer |
| **EPUB** | Book reader |
| **Word** | Document card with filename and size |
| **PowerPoint** | Presentation card with filename and size |
| **Excel** | Spreadsheet card with filename and size |
| **Text / Markdown / Code** | Prose or syntax-highlighted code preview |

### Context Menu

Right-click any card (or long-press on mobile) to access actions:

- **Open** — navigate to the item's detail view
- **Locate in Feed** — jump to the item's position in the timeline
- **Select** — enter multi-select mode
- **Pin / Unpin** — toggle pin
- **Download** — save the file locally
- **Share** — share via system share sheet
- **Delete** — remove the item

## Preview

Tap any card to open a full-screen preview. The viewer adapts to the file type:

- **Images** — full-size view with pinch-to-zoom; detected objects highlighted with animated outlines
- **Video** — playback controls
- **Audio** — waveform scrubber synced with the transcript — tap any line in the transcript to seek
- **PDF** — continuous multi-page scroll with page selector
- **EPUB** — book reader with table-of-contents navigation
- **Text / Code** — syntax highlighting with line numbers

### Navigating Between Files

Use **arrow keys** or **swipe left/right** to page through files in chronological order. The adjacent files are pre-rendered so transitions feel instant.

### Digests Panel

A side panel (desktop) or overlay (mobile) shows AI-extracted metadata for the current file — captions, OCR text, detected objects, transcripts, summaries, and tags. Toggle it from the preview toolbar.

### Actions

Download or share the current file directly from the preview toolbar.

## AI Enrichment

Files are automatically processed in the background after upload:

- **Images** — captions, OCR text extraction, object detection
- **Documents** (PDF, Office) — converted to searchable markdown plus a visual screenshot
- **Audio** — transcribed with speaker identification
- **Links** — crawled, summarized, and screenshotted
- **Everything** — tagged and indexed for search

A processing indicator appears on each card. Open the detail view to see enrichment progress, re-trigger processing, or reset results.

## Search

Type a query in the input bar to search. MyLifeDB runs keyword and semantic search in parallel — so "vacation photos" can find beach images even if they aren't literally labeled that way.

Search results replace the feed. Use **Locate in Feed** on any result to jump to its position in the timeline.

## Pinning

Pin important items to keep them one tap away. Pinned items appear as tags in a horizontal bar above the input. Tap a tag to scroll directly to that item in the feed. Click **×** on a tag to unpin.

Pin or unpin from the context menu on any card.

## Multi-Select

Enter multi-select mode from the context menu (or long-press on mobile). Checkboxes appear on every card. Select items, then use the action bar to **share** or **delete** in bulk.

## Real-Time Updates

The Inbox updates live via server-sent events. Add a file from another device or through the filesystem — it appears in the feed within about a second, no manual refresh needed. If the connection drops, it reconnects automatically and catches up on missed events.

---

## Under the Hood

These features work behind the scenes to keep the Inbox fast and reliable.

### Resumable Uploads

Large files upload using the TUS resumable protocol. If your connection drops mid-upload, it picks up where it left off — no re-uploading. You'll see a progress bar, and you can cancel at any time.

### Offline-Safe Upload Queue

Every pending upload is saved to IndexedDB, so the queue survives browser refreshes and even tab crashes. Failed uploads retry automatically with exponential backoff. When you're offline, the queue pauses and resumes as soon as the connection returns. The queue also coordinates across multiple browser tabs to avoid duplicate work.

### Scroll & Pagination

The feed uses sparse page-based infinite scrolling — only loaded pages stay in memory (up to 10; distant pages are evicted and re-fetched on scroll). New items auto-scroll to the bottom. When content above shifts (e.g. images finishing loading), a scroll anchor keeps your reading position stable.

### Local Previews

Files you're uploading show an instant local preview from the in-memory blob — no round-trip to the server. Draft text in the input bar is saved to session storage so you don't lose it on accidental navigation.

### Animations

- New items slide up and fade in
- Deleted items collapse and fade out
- Modal transitions are physics-based (Framer Motion)
- Pinned-item jump triggers a highlight flash

### Input Handling

The input bar handles CJK/IME composition correctly — it won't fire a premature send mid-composition. On mobile, **Enter** inserts a newline (send via the button); on desktop, **Enter** sends. The on-screen keyboard shows the correct action label automatically.

### Performance

- Heavy viewers (PDF, EPUB) are lazy-loaded only when the preview opens
- Search debounce adapts to query length — longer queries trigger faster
- Selection state uses fine-grained subscriptions so only affected cards re-render
- Per-item height tracking lays the groundwork for virtual scrolling

---

## Platforms

| Feature | Web | iOS | macOS |
|---------|-----|-----|-------|
| Text & file input | ✓ | ✓ | ✓ |
| Voice input | ✓ | ✓ | ✓ |
| File preview & pager | ✓ | ✓ | ✓ |
| Pin / unpin | ✓ | ✓ | ✓ |
| Search | ✓ | ✓ | ✓ |
| Multi-select | ✓ | — | — |
| Share extension | — | ✓ | — |
| Drag & drop | ✓ | — | ✓ |

On iOS, you can also share content from any app directly to your Inbox using the share sheet.
