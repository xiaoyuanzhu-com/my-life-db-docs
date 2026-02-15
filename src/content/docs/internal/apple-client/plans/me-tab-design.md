---
title: "Me Tab Design"
---

**Date:** 2026-02-06
**Status:** Implemented

## Overview

Add a fourth "Me" tab to the MyLifeDB Apple app with a user profile avatar and iOS Settings-style configuration screens.

## Requirements

- Gray placeholder avatar at top
- Four settings sections: General, Server, Stats, About
- Each section navigates to a detail screen
- Server settings configure API base URL only
- iOS Settings app visual style

## Architecture

### File Structure

```
Views/
└── Me/
    ├── MeView.swift              // Main tab with avatar + list
    ├── GeneralSettingsView.swift // General settings detail
    ├── ServerSettingsView.swift  // API URL configuration
    ├── StatsView.swift           // App/data statistics
    └── AboutView.swift           // Version, credits, licenses
```

### Component Breakdown

**MeView (Main Tab):**
- Header: 90pt gray circular placeholder avatar with person icon
- List: Four NavigationLinks in insetGrouped style
- Wrapped in NavigationStack for push navigation

**GeneralSettingsView:**
- Placeholder for future settings
- Empty state message: "No settings available yet"
- Form/List layout

**ServerSettingsView:**
- Text field for API base URL
- Default: `http://localhost:12345`
- Stored in `@AppStorage("apiBaseURL")`
- URL format validation
- Connection status indicator (Connected/Not reachable)
- Auto-save on change

**StatsView:**
- Display app/data statistics in grouped list
- Stats to show:
  - Total inbox items (from `/api/inbox`)
  - Total library files (from `/api/library/stats` if available)
  - App version (from Bundle)
  - Last sync time
- Label-value pairs (Settings → About style)
- Loading states with ProgressView
- Graceful failure: show "—" for unavailable stats

**AboutView:**
- App name and version (from Bundle.main)
- Credits section
- Open source licenses button
- Optional: GitHub repo link
- Grouped list layout

## Implementation Details

### Avatar Component

```swift
Circle()
    .fill(Color.gray.opacity(0.3))
    .frame(width: 90, height: 90)
    .overlay(
        Image(systemName: "person.fill")
            .font(.system(size: 40))
            .foregroundColor(.gray)
    )
```

### Settings List Pattern

```swift
List {
    NavigationLink("General") { GeneralSettingsView() }
    NavigationLink("Server") { ServerSettingsView() }
    NavigationLink("Stats") { StatsView() }
    NavigationLink("About") { AboutView() }
}
.listStyle(.insetGrouped) // iOS Settings style
```

### API Configuration Storage

```swift
@AppStorage("apiBaseURL") private var apiBaseURL = "http://localhost:12345"
```

This makes the URL accessible throughout the app via the same property wrapper.

### Stats Data Fetching

```swift
Task {
    let inboxCount = try? await APIClient.shared.inbox.list().items.count
    self.inboxItemCount = inboxCount
}
```

### Platform Adaptation

- iOS: `.insetGrouped` list style
- macOS: `.sidebar` or default list style
- Shared view files with `#if os()` conditionals where needed

## MainTabView Integration

### Tab Enum Update

Add `.me` case to `Tab` enum in [MainTabView.swift](../MyLifeDB/Views/MainTabView.swift):

```swift
enum Tab: String, CaseIterable {
    case inbox = "Inbox"
    case library = "Library"
    case claude = "Claude"
    case me = "Me"

    var icon: String {
        switch self {
        case .inbox: return "tray"
        case .library: return "folder"
        case .claude: return "bubble.left.and.bubble.right"
        case .me: return "person.circle"
        }
    }
}
```

### iOS TabView

Add `MeView()` as fourth tab item with label and tag.

### macOS NavigationSplitView

Add `.me` case to `selectedView` computed property.

## Error Handling

### Server Settings

- **Invalid URL format** → Show inline error message below text field
- **Unreachable server** → Show warning but allow saving (offline usage)
- **Network timeout** → 5 second timeout with clear error message

### Stats View

- **Failed API calls** → Show "—" or "Unavailable" for failed stats
- **Loading state** → Show ProgressView while fetching
- **No retry logic** → User can refresh by navigating away/back

## Edge Cases

- **Empty/missing API URL** → Fall back to default `http://localhost:12345`
- **First launch** → Show default URL, no onboarding needed
- **Platform differences** → Same views, list style adapts automatically
- **macOS vs iOS** → Navigation patterns handled by platform conditionals

## Testing Checklist

- [ ] Navigation to all four detail screens works
- [ ] API URL saves and loads from AppStorage correctly
- [ ] Stats fetching works with real API
- [ ] Stats gracefully handles API failures
- [ ] Avatar displays correctly on iOS and macOS
- [ ] List styling matches iOS Settings on iOS
- [ ] Server URL validation works
- [ ] Invalid URL shows error message
- [ ] About screen shows correct version info

## Future Enhancements

- Replace placeholder avatar with user profile image
- Add theme/appearance settings to General
- Add notification preferences to General
- Add cache clearing option
- Add export/backup functionality
- Add privacy policy and terms of service links
