---
title: "Inbox Page — Product Requirements"
---

**Version:** 1.0
**Last Updated:** 2026-02-16
**Status:** Living document — reflects current implementation + planned work

> See also: [Inbox UX](../features/inbox) for web-specific scroll/pagination implementation details, [Apple Client Inbox PRD](../apple-client/inbox-prd) for native iOS/macOS specifics.

---

## 1. Purpose

The Inbox is the **primary capture interface** of MyLifeDB. It accepts any raw content — text, files, links, voice — without requiring the user to decide where it belongs. The philosophy is **"capture now, organize later."**

### 1.1 Design Principles

| Principle | Meaning |
|-----------|---------|
| **Zero-friction capture** | Adding content should take < 10 seconds |
| **Chat-style feed** | Newest items at bottom, scroll up for history — feels like messaging yourself |
| **Rich inline preview** | See what you captured without opening anything |
| **AI-assisted enrichment** | System extracts metadata, generates tags, transcribes audio — automatically |
| **User owns the data** | Files are real files on disk; no proprietary format |

### 1.2 Inbox in the Product

```mermaid
flowchart LR
    Capture["Capture\n(Inbox)"] --> Enrich["AI Enrichment\n(Automatic)"] --> Settle["Settle to Library\n(User-driven)"]
```

The Inbox is the **left side** of MyLifeDB's dual-zone architecture:

| Zone | Inbox | Library |
|------|-------|---------|
| **Purpose** | Continuous capture stream | Curated, structured knowledge |
| **Mental model** | "My daily flow" | "Where things I care about live" |
| **Organization** | None required | User-defined folder structure |
| **Lifecycle** | Temporary staging | Long-term storage |

---

## 2. Features Overview

### 2.1 Feature Matrix

| Feature | Priority | Web | iOS | macOS | Description |
|---------|----------|-----|-----|-------|-------------|
| **Item Feed** | P0 | ✅ | ✅ | ✅ | Chat-style display of inbox items |
| **Text Input** | P0 | ✅ | ✅ | ✅ | Create text/markdown entries |
| **File Upload** | P0 | ✅ | ✅ | ✅ | Upload images, documents, audio, video |
| **File Cards** | P0 | ✅ | ✅ | ✅ | Type-specific inline previews |
| **Delete** | P0 | ✅ | ✅ | ✅ | Remove items with animation |
| **Pin/Unpin** | P1 | ✅ | ✅ | ✅ | Pin important items for quick access |
| **Pinned Bar** | P1 | ✅ | ✅ | ✅ | Horizontal scroll of pinned items |
| **Infinite Scroll** | P1 | ✅ | ✅ | ✅ | Load older items on scroll up |
| **File Preview Modal** | P1 | ✅ | ✅ | ✅ | Full-screen preview with file-type viewers |
| **Media Pager** | P1 | ✅ | ✅ | — | Swipe between images/videos in preview |
| **Context Menu** | P1 | ✅ | ✅ | ✅ | Pin, Delete, Copy, Share, Download |
| **Real-time Updates** | P1 | ✅ | ✅ | ✅ | SSE-driven live refresh |
| **Search** | P2 | ✅ | ✅ | ✅ | Full-text + semantic search |
| **Multi-Select** | P2 | ✅ | — | — | Batch delete/share operations |
| **Voice Input** | P2 | ✅ | — | — | Record audio with transcription |
| **Share Extension** | P1 | — | ✅ | — | iOS share sheet → Inbox |
| **Drag & Drop** | P2 | ✅ | — | ✅ | Drop files from Finder/desktop |
| **AI Digest Processing** | P1 | ✅ | ✅ | ✅ | Auto-enrich files with tags, OCR, transcription |

### 2.2 Interaction Modes (Web)

The web inbox has four mutually exclusive modes:

| Mode | Trigger | UI Changes |
|------|---------|------------|
| **Default** | Initial state | OmniInput visible, feed scrollable |
| **Search** | Type query in OmniInput | Search results overlay replaces feed |
| **Selection** | Long-press → "Select" | Checkboxes appear, action bar replaces input |
| **Modal** | Click/tap file card | Full-screen file preview with navigation |

---

## 3. Data Model

### 3.1 InboxItem

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Unique ID — e.g. `inbox/photo.jpg` |
| `name` | string | Filename |
| `isFolder` | boolean | Whether this is a folder |
| `size` | int64? | File size in bytes |
| `mimeType` | string? | MIME type (e.g. `image/jpeg`, `text/markdown`) |
| `hash` | string? | SHA256 content hash |
| `modifiedAt` | ISO8601 | Last modified timestamp |
| `createdAt` | ISO8601 | Creation timestamp |
| `digests` | Digest[] | AI processing results (tags, OCR, transcription, etc.) |
| `textPreview` | string? | First ~1000 chars for text files |
| `screenshotSqlar` | string? | Path to document screenshot in SQLAR archive |
| `isPinned` | boolean | Whether item is pinned |

### 3.2 Digest (AI Processing Result)

Each inbox item can have multiple digests — one per processing type:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique digest ID |
| `filePath` | string | Parent file path |
| `digester` | string | Processing type (see §4.4) |
| `status` | enum | `todo` · `running` · `done` · `failed` · `skipped` |
| `content` | string? | Output content (tags JSON, extracted text, etc.) |
| `sqlarName` | string? | Name in SQLAR archive (for screenshots) |
| `error` | string? | Error message if failed |
| `attempts` | int | Retry count |

### 3.3 Cursor-Based Pagination

| Field | Description |
|-------|-------------|
| `cursors.first` | Cursor of newest item in batch |
| `cursors.last` | Cursor of oldest item in batch |
| `hasMore.older` | More items exist before this batch |
| `hasMore.newer` | More items exist after this batch |

**Cursor format:** `{ISO8601_timestamp}:{path}` — e.g. `2026-02-01T15:37:06Z:inbox/note.md`

---

## 4. Core Features — Detailed Requirements

### 4.1 Item Feed

**Goal:** Display inbox items in reverse-chronological chat-style layout.

**Requirements:**
- Newest items at the bottom, oldest at top
- Infinite scroll: loading older items when scrolling up
- Stick-to-bottom behavior: auto-scroll to newest when user is already at bottom
- Items display with timestamp, type-specific card, and optional metadata
- Animated transitions: slide-up for new items, collapse-fade for deleted items
- Empty state: friendly illustration + "Add something to get started"

**Pagination:**
- Page size: 30 items
- Maximum 10 pages in memory (LRU eviction of distant pages)
- Gap spacers for unloaded pages with estimated heights
- Scroll position preservation when loading/evicting pages

### 4.2 File Cards

Each file type renders with a specialized inline preview card:

| File Type | Detection | Card Rendering |
|-----------|-----------|----------------|
| **Text / Markdown** | `text/*`, `.md`, `.txt` | Up to 20 lines of prose preview |
| **Image** | `image/*` | Inline image thumbnail, aspect ratio preserved |
| **Video** | `video/*` | Black thumbnail with play button overlay |
| **Audio** | `audio/*` | Waveform visualization with play icon |
| **PDF** | `application/pdf` | Document icon with red accent, filename + size |
| **Office Docs** | `application/vnd.*` | Color-coded icon (Word=blue, Excel=green, PPT=orange), filename + size |
| **Other** | Fallback | Generic document icon, filename + size |

**Card interactions:**
- Tap → open full-screen preview modal
- Long-press / right-click → context menu
- Cards display filename, formatted size, and relative timestamp

### 4.3 File Preview (Modal)

**Goal:** Full-screen, type-specific file viewing with navigation.

**Type-specific viewers:**

| Type | Viewer | Key Features |
|------|--------|-------------|
| **Image** | Native image viewer | Two-finger pinch-to-zoom, double-tap to zoom, single tap to dismiss, pan when zoomed in |
| **Video** | Native video player | Standard playback controls, auth header injection |
| **Audio** | Audio player | Waveform icon, playback controls, filename display |
| **PDF** | PDF viewer | PDFKit (iOS) / native renderer, auto-scaling, continuous scroll |
| **Text** | Text viewer | Monospace font, text selection, scroll for long content |
| **Other** | Metadata view | File icon, name, size, MIME type, extension, dates |

**Image gestures:**

| Gesture | Action |
|---------|--------|
| Two-finger pinch | Zoom in/out |
| Single tap | Dismiss preview |
| Double tap | Toggle zoom |
| Swipe right | Previous media file (image or video) |
| Swipe left | Next media file (image or video) |

**Thumbnail → Full-Screen Transition:**

Tapping a thumbnail opens the full-screen viewer with a **zoom transition** — the image visually expands from the card into the viewer, giving spatial continuity. Dismissing reverses the animation.

| Aspect | Requirement |
|--------|-------------|
| **Open** | Image expands from card position/size to full-screen center; black backdrop fades in simultaneously |
| **Dismiss** | Reverse — image shrinks back to card position; backdrop fades out |
| **Corner radius** | Animate from card's rounded corners to zero (full-screen) |
| **Duration** | 250–350ms, ease-out feel |
| **Fallback** | If the source card is unavailable (e.g. scrolled off-screen, image not loaded), use a simple center-scale + fade instead |

> Implementation is platform-specific — use the idiomatic matched-geometry / hero-animation API available on each platform.

**Media pager:**
- Horizontal swipe between images and videos only
- Non-media files open as single viewer (no paging)
- Infinite scroll: loads older media items when approaching end
- The zoom animation only plays for the *first* file opened; subsequent swipe transitions use a 150ms crossfade

**Navigation (Web):**
- Keyboard: ← / → for previous/next file
- Swipe gestures on touch devices
- Digests panel toggle for AI-generated content

**Shared features:**
- Share button (download + share sheet)
- Close button
- Black background for focus

### 4.4 AI Digest Processing

Files are automatically enriched after upload. Processing is async and status is trackable.

**Available digesters:**

| Digester | Applies To | Output |
|----------|-----------|--------|
| `tags` | All files | JSON array of extracted tags |
| `url-crawler` | URLs/links | Crawled page content |
| `url-crawl-summary` | Crawled URLs | AI summary of page |
| `doc-to-markdown` | Documents | Markdown conversion |
| `doc-to-screenshot` | Documents | Visual screenshot (SQLAR) |
| `image-captioning` | Images | AI-generated caption |
| `image-ocr` | Images | Extracted text via OCR |
| `image-objects` | Images | Detected objects list |
| `speech-recognition` | Audio | Raw transcription |
| `speech-recognition-cleanup` | Transcripts | Cleaned transcript |
| `speech-recognition-summary` | Transcripts | AI summary |
| `speaker-embedding` | Audio | Speaker identification vector |
| `search-keyword` | All files | Meilisearch index entry |
| `search-semantic` | All files | Qdrant vector embedding |

**Processing flow:**
1. File uploaded → saved to disk
2. Digest worker picks up new file
3. Applicable digesters run in sequence
4. Status updates available via `GET /api/inbox/:id/status`
5. SSE notification broadcast on completion

**Re-enrichment:** User can trigger `POST /api/inbox/:id/reenrich` to re-run all digesters.

### 4.5 Input & Upload

**OmniInput (Web) / InboxInputBar (iOS):**
- Multi-line text input (auto-expanding)
- File attachment via picker, camera, or drag-and-drop
- Attachment chips with preview and remove button
- Send button (visible when content exists)
- Enter to send, Shift+Enter for newline

**Upload methods:**

| Method | Platform | Use Case |
|--------|----------|----------|
| Multipart POST | All | Standard file upload to `/api/inbox` |
| TUS protocol | Web | Large/resumable uploads with progress tracking |
| Photo picker | iOS | Select from Photos library |
| File importer | iOS | Pick from Files app |
| Share extension | iOS | Share from any app → Inbox |
| Drag & drop | Web, macOS | Drop files from desktop/Finder |

**Upload states:**
1. **Pending** — file selected, not yet uploaded (shown as local pending item)
2. **Uploading** — transfer in progress (progress indicator)
3. **Processing** — upload complete, digests running
4. **Ready** — fully processed, visible in feed

**Error handling:**
- Network failure → retry with exponential backoff (iOS), manual retry (web)
- Upload failure → error indicator on pending card with retry action

### 4.6 Pin / Unpin

**Purpose:** Mark important items for quick access and navigation.

**Behavior:**
- Toggle via context menu or long-press action
- Optimistic UI update (toggle immediately, revert on API failure)
- Pinned items appear in the Pinned Bar above input
- Each pinned item includes a cursor for direct feed navigation

**Pinned Bar:**
- Horizontal scrollable row of pinned item chips
- Shows `displayText` (first line of text or filename)
- Tap → scroll feed to that item's position (loads page via `around` cursor)
- Close/unpin button on each chip

### 4.7 Search

**Backend:** Dual search system — Meilisearch (keyword) + Qdrant (semantic).

**UX:**
- Search input integrated into OmniInput (web) / separate search view (iOS)
- Debounced as user types
- Results replace feed (web) or show in overlay (iOS)
- "Locate in Feed" action: clears search, scrolls to item's feed position
- Result count display

### 4.8 Real-Time Updates (SSE)

**Endpoint:** `GET /api/notifications/stream`

**Events:** `inbox-changed`, `pin-changed`

**Client behavior:**
1. Connect to SSE stream on mount
2. On `inbox-changed` → debounce (200ms) → refresh newest page
3. On disconnect → auto-reconnect after 5 seconds
4. On reconnect → full refresh to catch missed events

**Timing:** File change → ~700ms → UI update (500ms write stabilization + 200ms client debounce).

### 4.9 Delete

**Single delete:**
- Swipe-to-delete (iOS) or context menu (all platforms)
- Optimistic removal with collapse animation (300ms)
- API call: `DELETE /api/inbox/:id`
- On failure: restore item, show error toast

**Batch delete (web multi-select):**
- Select multiple items via checkboxes
- Confirmation dialog: "Delete X items?"
- Parallel API calls for all selected items

### 4.10 Multi-Select Mode (Web)

**Entry:** Right-click / long-press → "Select" on any card.

**UI changes:**
- Circle checkboxes appear on all cards
- OmniInput slides out, MultiSelectActionBar slides in
- Bar shows: `[X selected] ——— [Share] [Delete] [Cancel]`

**Actions:**
- **Share** — fetch all selected files as blobs → native share sheet
- **Delete** — confirmation dialog → parallel delete
- **Cancel** — clear selection, exit mode

**Exit:** Cancel button, deselect last item, or complete delete action.

---

## 5. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inbox` | List items (cursor pagination: `limit`, `before`, `after`, `around`) |
| `POST` | `/api/inbox` | Create item (multipart: `text`, `files[]`) |
| `GET` | `/api/inbox/:id` | Get single item with full digests |
| `PUT` | `/api/inbox/:id` | Update item content |
| `DELETE` | `/api/inbox/:id` | Delete item |
| `POST` | `/api/inbox/:id/reenrich` | Re-trigger all digest processing |
| `GET` | `/api/inbox/:id/status` | Get digest processing status |
| `GET` | `/api/inbox/pinned` | List pinned items (with cursors for navigation) |
| `GET` | `/api/inbox/intentions` | Get AI agent file intention analysis |
| `POST` | `/api/library/pin` | Pin a file (`{ path }`) |
| `DELETE` | `/api/library/pin` | Unpin a file (`{ path }`) |
| `GET` | `/raw/{path}` | Raw file content (authenticated) |
| `GET` | `/sqlar/{path}` | Screenshot from SQLAR archive (authenticated) |
| `POST` | `/api/upload/tus/*` | TUS resumable upload (web) |
| `POST` | `/api/upload/finalize` | Finalize TUS upload(s) with optional text |
| `GET` | `/api/notifications/stream` | SSE stream for real-time updates |
| `GET` | `/api/search?q=...` | Full-text + semantic search |

---

## 6. File Caching & Authentication

All file access requires authentication (Bearer token). Standard `AsyncImage` / browser `<img>` cannot be used directly.

### 6.1 iOS Three-Tier Cache (`FileCache`)

| Tier | Storage | Limits | Lookup |
|------|---------|--------|--------|
| **Memory** | `NSCache` (raw Data) | 100 items, 80MB | O(1) hash lookup |
| **Memory** | `NSCache` (decoded images) | 150 items, 60MB | O(1) hash lookup |
| **Disk** | `Caches/` directory | Unbounded (OS-managed) | SHA256-hashed filenames |
| **Network** | Authenticated HTTP | — | URLSession with auth headers |

### 6.2 Web Caching

- Browser HTTP cache with `Cache-Control` headers
- TUS protocol provides resumability for large uploads

---

## 7. Platform-Specific Considerations

### 7.1 iOS

- Bottom tab bar navigation (Inbox is first tab)
- Photo picker via iOS Photos framework
- File importer via document picker
- Share extension for capturing from any app
- Swipe-from-edge for back navigation
- Haptic feedback on actions (pin, delete)

### 7.2 macOS

- Sidebar navigation (`NavigationSplitView`)
- Keyboard-first interactions (see §7.4)
- Drag & drop from Finder
- No media pager (single file viewer instead of swipeable pages)
- Right-click context menus

### 7.3 Web

- React Router with nested routes (`/inbox`, `/inbox/:id`)
- OmniInput with combined text/file/voice/search functionality
- TUS protocol for large file uploads with progress
- Multi-select mode with batch operations
- Sparse page-based infinite scroll with LRU eviction

### 7.4 Keyboard Shortcuts (macOS / Web)

| Shortcut | Action |
|----------|--------|
| `⌘N` | Focus input |
| `⌘R` | Refresh feed |
| `⌘⌫` | Delete selected item |
| `↑` / `↓` | Navigate items |
| `Enter` | Open detail / send |
| `Shift+Enter` | New line in input |
| `Esc` | Close modal |
| `←` / `→` | Previous/next in modal |

---

## 8. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Initial load time | < 2s on good network |
| Scroll performance | 60fps, no jank |
| Image loading | Progressive, prioritized for visible items |
| Upload (small file) | < 3s end-to-end |
| Upload (large file) | Resumable, progress visible |
| SSE latency | < 1s from file change to UI update |
| Search response | < 500ms for keyword, < 2s for semantic |
| Memory (iOS) | Efficient page eviction, no unbounded growth |
| Offline | Graceful degradation — show cached content, queue uploads |

---

## 9. AI Inbox Agent (Optional)

When `MLD_INBOX_AGENT=1`, an AI agent analyzes each inbox item to suggest where it should be filed in the Library.

**Intention model:**

| Field | Type | Description |
|-------|------|-------------|
| `intention_type` | string | File category/classification |
| `intention_details` | string | Additional context |
| `confidence` | float | 0–1 confidence score |
| `suggested_folder` | string | Recommended library path |
| `reasoning` | string | AI explanation |

**Endpoints:**
- `GET /api/files/intention?path=...` — single file intention
- `GET /api/inbox/intentions` — all inbox item intentions

This feature is opt-in and does not affect core inbox functionality.

---

## 10. Implementation Status

### 10.1 Implemented

- ✅ Chat-style feed with cursor pagination (web + iOS)
- ✅ All file card types (text, image, video, audio, document, fallback)
- ✅ File preview modal with type-specific viewers
- ✅ Media pager with swipe navigation (iOS)
- ✅ Text + file input (OmniInput / InboxInputBar)
- ✅ Pin/unpin with pinned bar navigation
- ✅ Delete with optimistic UI and animations
- ✅ SSE real-time updates
- ✅ TUS resumable uploads (web)
- ✅ iOS share extension
- ✅ Full digest processing pipeline (14 digesters)
- ✅ Keyword + semantic search
- ✅ Multi-select mode (web)
- ✅ Three-tier file cache (iOS)
- ✅ Context menus (all platforms)

### 10.2 Planned / In Progress

- 🔲 Voice input with real-time transcription (iOS)
- 🔲 Multi-select mode (iOS)
- 🔲 Drag & drop file upload (macOS)
- 🔲 Offline queue with sync (iOS)
- 🔲 Swipe-to-delete (iOS)
- 🔲 Inbox → Library settlement workflow UI
- 🔲 AI intention suggestions surfaced in UI
- 🔲 iPad side-by-side digests panel

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-16 | Initial product requirements document |
