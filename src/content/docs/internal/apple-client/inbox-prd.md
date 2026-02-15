---
title: "Inbox Page - Product Requirements Document (PRD)"
---

> Native iOS/macOS implementation for the MyLifeDB inbox feature.

---

## 1. Overview

### 1.1 Purpose

The Inbox is the **primary capture interface** for MyLifeDB. It's where users dump raw content (thoughts, files, links, voice notes) before processing them into organized knowledge. The design philosophy is "chat-style" - newest items at the bottom, scroll up for history.

### 1.2 Key Design Principles

1. **Quick Capture** - Zero friction to add content (text, files, voice)
2. **Chat-style Feed** - Reverse chronological display (oldest top, newest bottom)
3. **Rich Preview** - Inline rendering of images, text, audio, video
4. **Pin Navigation** - Quick jump to important items
5. **Local-first UX** - Optimistic updates, animations, offline indicators

---

## 2. Features Summary

| Feature | Priority | Description |
|---------|----------|-------------|
| Item Feed | P0 | Display inbox items in chat-style layout |
| Omni Input | P0 | Multi-modal input (text, files, voice) |
| File Cards | P0 | Type-specific rendering (image, text, video, audio, PDF) |
| Pull-to-Refresh | P0 | Refresh feed manually |
| Infinite Scroll | P1 | Load older items on scroll up |
| Pinned Items Bar | P1 | Quick navigation to pinned items |
| Delete with Animation | P1 | Swipe-to-delete with undo support |
| Item Detail Modal | P1 | Full-screen preview with navigation |
| Context Menu Actions | P1 | Pin, Delete, Copy, Share, Download |
| Search Overlay | P2 | In-place search replacing feed |
| Multi-Select Mode | P2 | Bulk operations on items |
| Real-time Updates | P2 | SSE-driven live refresh |

---

## 3. Data Models

### 3.1 InboxItem (from backend)

```swift
struct InboxItem: Codable, Identifiable {
    var id: String { path }

    let path: String           // "inbox/filename.ext"
    let name: String           // "filename.ext"
    let isFolder: Bool
    let size: Int64?
    let mimeType: String?
    let hash: String?
    let modifiedAt: String     // ISO8601
    let createdAt: String      // ISO8601
    let digests: [Digest]      // AI processing results
    let textPreview: String?   // First ~1000 chars of text
    let screenshotSqlar: String? // Screenshot path for docs
    let isPinned: Bool
}
```

### 3.2 Key Content Types

| Type | MimeType Pattern | Card Style |
|------|-----------------|------------|
| Text | `text/*`, `.md` | Prose preview (max 20 lines) |
| Image | `image/*` | Inline image with max-height |
| Video | `video/*` | Thumbnail + play button |
| Audio | `audio/*` | Waveform player |
| PDF | `application/pdf` | Screenshot thumbnail |
| Document | `application/vnd.*` (Office) | Screenshot thumbnail |

### 3.3 Pagination

```swift
struct InboxResponse {
    let items: [InboxItem]
    let cursors: InboxCursors  // { first, last }
    let hasMore: InboxHasMore  // { older, newer }
    let targetIndex: Int?      // For "around" queries
}
```

**Cursor format**: `{ISO8601_timestamp}:{path}`
**Example**: `2026-02-01T15:37:06Z:inbox/note.md`

---

## 4. UI Components

### 4.1 Screen Layout

```
┌─────────────────────────────────────┐
│  Navigation Bar: "Inbox"  [↻]       │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Older Item (scroll up)     │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Item Card (aligned right)  │    │
│  │  [timestamp above]          │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Newest Item (at bottom)    │    │
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│  [📌 Pinned Item 1] [📌 Item 2]     │  ← Pinned Tags
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │  "What's up?"          [🎤] │    │  ← Omni Input
│  │  [+]                [Send]  │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 4.2 Component Breakdown

#### 4.2.1 Inbox Feed

**Purpose**: Scrollable list of inbox items in chat order.

**Behavior**:
- Items displayed newest at bottom (reversed from API order)
- Timestamp shown above each card
- Cards right-aligned (chat bubble style)
- Scroll up to load older items (infinite scroll)
- Stick to bottom when new items arrive (if already at bottom)

**States**:
- Loading (initial): Centered spinner
- Empty: "No items in inbox" message
- Error: Error message with retry button
- Content: Item cards

#### 4.2.2 File Cards

Each card type renders content appropriately:

**TextCard**:
- Shows first ~20 lines of text preview
- Supports markdown-style prose
- "..." truncation indicator
- Context menu: Open, Pin, Copy, Delete

**ImageCard**:
- Inline image with max-height (320pt)
- Aspect ratio preserved
- Tap for fullscreen modal
- Context menu: Open, Pin, Share, Save, Delete

**VideoCard**:
- Thumbnail with play button overlay
- Tap to play in modal
- Context menu: Open, Pin, Share, Save, Delete

**AudioCard**:
- Waveform visualization
- Play/pause inline
- Duration display
- Context menu: Open, Pin, Share, Save, Delete

**DocumentCard** (PDF, Office docs):
- Screenshot thumbnail
- File type icon overlay
- Context menu: Open, Pin, Share, Save, Delete

**FallbackCard** (unknown types):
- File icon + name
- Size info
- Context menu: Open, Pin, Share, Delete

#### 4.2.3 Pinned Tags Bar

**Purpose**: Horizontal scroll of pinned items for quick navigation.

**Behavior**:
- Shows above input bar
- Tap to scroll feed to that item
- X button to unpin (with optimistic update)
- Displays `displayText` (first line of text or filename)

**Data**: From `GET /api/inbox/pinned`

#### 4.2.4 Omni Input

**Purpose**: Universal input for text, files, and voice.

**Modes**:

1. **Text Input Mode** (default)
   - Auto-expanding text area
   - Placeholder: "What's up?"
   - Enter to send (Shift+Enter for newline on macOS)
   - Send button appears when content exists

2. **Voice Input Mode** (P2)
   - Tap mic to start recording
   - Waveform visualization
   - Timer display
   - "Save Audio" checkbox option
   - Stop button to finish

3. **File Attachment**
   - [+] button to pick files
   - Drag & drop support (macOS/iPad)
   - File chips shown above input
   - X to remove attachment

**Upload Flow**:
1. Show pending items with progress indicator
2. Optimistic UI update
3. On success: items appear in feed
4. On failure: show error, allow retry

#### 4.2.5 Item Detail Modal

**Purpose**: Full-screen view of item with navigation.

**Features**:
- Swipe left/right for prev/next item
- Full content view (scrollable for text)
- Action buttons: Download, Share, Digests
- Digests panel (side sheet on iPad, overlay on iPhone)
- Close button (top-left)

**Navigation**:
- Keyboard arrows (macOS)
- Swipe gestures (iOS)
- Edge tap zones

---

## 5. API Endpoints

### 5.1 List Items

```
GET /api/inbox?limit=30
GET /api/inbox?limit=30&before={cursor}  // Load older
GET /api/inbox?limit=30&after={cursor}   // Load newer
GET /api/inbox?limit=30&around={cursor}  // Center on item
```

### 5.2 Pinned Items

```
GET /api/inbox/pinned
→ { items: [{ path, name, pinnedAt, displayText, cursor }] }
```

### 5.3 Create Item

```
POST /api/inbox
Content-Type: multipart/form-data

- text: string (optional)
- files: File[] (optional)

→ { path: string, paths: string[] }
```

### 5.4 Delete Item

```
DELETE /api/inbox/{id}
→ { success: true }
```

### 5.5 Pin/Unpin

```
POST /api/library/pin
Body: { path: string }
→ { success: true, isPinned: boolean }
```

### 5.6 Get Item Details

```
GET /api/inbox/{id}
→ InboxItem with full digests
```

### 5.7 File Content

```
GET /raw/{path}   // Raw file content
GET /sqlar/{path} // Screenshot from archive
```

---

## 6. User Interactions

### 6.1 Gestures & Actions

| Action | iOS Gesture | macOS Action |
|--------|------------|--------------|
| Refresh | Pull down | Click refresh button |
| Load more | Scroll to top | Scroll to top |
| Delete | Swipe left | Right-click → Delete |
| Pin/Unpin | Long-press → menu | Right-click → Pin |
| Copy text | Long-press → Copy | Right-click → Copy |
| Open detail | Tap card | Double-click |
| Share | Long-press → Share | Right-click → Share |
| Select multiple | Long-press → Select | Cmd+click |

### 6.2 Keyboard Shortcuts (macOS)

| Shortcut | Action |
|----------|--------|
| ⌘N | Focus input |
| ⌘R | Refresh |
| ⌘⌫ | Delete selected |
| ↑/↓ | Navigate items |
| Enter | Open detail |
| Esc | Close modal |
| ←/→ | Prev/next in modal |

---

## 7. States & Error Handling

### 7.1 Loading States

1. **Initial Load**: Full-screen spinner
2. **Load More**: Bottom spinner (below items)
3. **Refresh**: Pull-to-refresh indicator
4. **Upload**: Progress bar on pending card

### 7.2 Error States

1. **Network Error**: Banner with retry action
2. **Delete Failed**: Restore item, show toast
3. **Upload Failed**: Show error on pending card, allow retry
4. **Offline**: Show offline banner, allow cached content

### 7.3 Empty State

```
┌─────────────────────────────────┐
│         🗂️ (tray icon)          │
│                                 │
│       No items in inbox         │
│                                 │
│  Add something to get started   │
└─────────────────────────────────┘
```

---

## 8. Animations

### 8.1 New Item Animation

When new items arrive:
1. Start hidden (opacity 0)
2. Slide up + fade in (0.4s)
3. Auto-scroll to bottom if user was at bottom

### 8.2 Delete Animation

1. Swipe reveals delete action
2. On confirm: Collapse height + fade out (0.3s)
3. Remove from list

### 8.3 Card Tap Animation

- Scale down slightly on press (0.98)
- Spring back on release

---

## 9. Platform Considerations

### 9.1 iOS Specific

- Bottom tab bar navigation
- Swipe-from-edge for back
- Share sheet integration
- Photo picker for file selection
- Voice recording with microphone permission

### 9.2 macOS Specific

- Sidebar navigation (NavigationSplitView)
- Keyboard-first interactions
- Drag & drop from Finder
- Menu bar items (optional)
- Multi-window support

### 9.3 iPad Specific

- Side-by-side modal and digests
- Keyboard shortcuts
- Pointer/trackpad support
- Split view multitasking

---

## 10. Implementation Phases

### Phase 1: Core Feed (MVP)

- [ ] Basic InboxView with item list
- [ ] TextCard, ImageCard rendering
- [ ] Pull-to-refresh
- [ ] Delete with swipe
- [ ] Simple text input (no voice)
- [ ] File upload (pick from library)

### Phase 2: Rich Experience

- [ ] All card types (Audio, Video, PDF, Doc)
- [ ] Pinned items bar
- [ ] Item detail modal with navigation
- [ ] Context menus
- [ ] Infinite scroll (pagination)
- [ ] Upload progress UI

### Phase 3: Advanced Features

- [ ] Voice input
- [ ] Multi-select mode
- [ ] Search overlay
- [ ] Real-time updates (SSE)
- [ ] Offline support
- [ ] Digests panel

---

## 11. Technical Notes

### 11.1 Scroll Position Management

The feed uses a "stick to bottom" pattern:
- Track if user is near bottom (within 1 viewport height)
- Auto-scroll on new content if was at bottom
- Load older items at top without jarring scroll

### 11.2 Optimistic Updates

- Delete: Remove immediately, restore on API failure
- Pin: Toggle immediately, revert on failure
- Create: Show pending card, replace with real item on success

### 11.3 Image Loading

- Use AsyncImage with placeholder
- Priority loading for visible items
- Preload adjacent items in modal

### 11.4 Content URLs

```swift
// Raw file content
let contentURL = apiClient.baseURL.appendingPathComponent("raw/\(item.path)")

// Screenshot from sqlar archive
let screenshotURL = apiClient.baseURL.appendingPathComponent("sqlar/\(item.screenshotSqlar!)")
```

---

## 12. Acceptance Criteria

### 12.1 Functional Requirements

- [ ] User can view all inbox items
- [ ] User can create text entries
- [ ] User can upload files (images, documents)
- [ ] User can delete items
- [ ] User can pin/unpin items
- [ ] User can navigate to pinned items
- [ ] User can pull to refresh
- [ ] User can load older items by scrolling

### 12.2 Non-Functional Requirements

- [ ] Initial load < 2s on good network
- [ ] Smooth 60fps scrolling
- [ ] Images load progressively
- [ ] Offline state handled gracefully
- [ ] Memory efficient for large feeds (page eviction)

---

## 13. Open Questions

1. **Voice Input**: Should we support real-time transcription or just audio upload?
2. **Search**: Inline search replacing feed, or separate search tab?
3. **Drag & Drop**: Priority for macOS drag & drop support?
4. **Widgets**: iOS home screen widget for quick capture?

---

## Appendix A: Current Implementation Status

The Apple client already has:
- ✅ `InboxView.swift` - Basic list view
- ✅ `InboxItemRow.swift` - Simple row component
- ✅ `InboxItem.swift` - Data model
- ✅ `InboxAPI.swift` - API endpoints

Missing:
- ❌ Chat-style layout (currently standard List)
- ❌ Rich file cards (currently text-only rows)
- ❌ Omni input component
- ❌ Pinned items bar
- ❌ Item detail modal
- ❌ Context menus
- ❌ Animations

---

## Appendix B: Reference Implementation

The React web frontend (`frontend/app/routes/home.tsx`) demonstrates:
- Chat-style feed with reverse chronological order
- Multiple card types with type-specific rendering
- Omni input with text, file, and voice modes
- Pinned tags for quick navigation
- Search overlay that replaces feed
- Multi-select action bar
- Real-time updates via notifications
