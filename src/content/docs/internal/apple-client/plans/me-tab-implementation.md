---
title: "Me Tab Implementation Plan"
---

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fourth "Me" tab with user profile avatar and iOS Settings-style configuration screens.

**Architecture:** Create MeView as main tab with avatar header and navigation list. Four detail views (General, Server, Stats, About) navigate via NavigationLink. Server settings use @AppStorage for API URL persistence. Stats view fetches data from API endpoints.

**Tech Stack:** SwiftUI, @AppStorage, URLComponents for validation, Bundle for app info

---

## Task 1: Update MainTabView with Me tab

**Files:**
- Modify: `MyLifeDB/Views/MainTabView.swift:17-29`
- Modify: `MyLifeDB/Views/MainTabView.swift:48-66`
- Modify: `MyLifeDB/Views/MainTabView.swift:72-80`

**Step 1: Add .me case to Tab enum**

In `MainTabView.swift:17-29`, update the `Tab` enum:

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

**Step 2: Build to verify no compilation errors**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build -quiet`
Expected: Success (may have warnings, but no errors about missing MeView yet)

**Step 3: Commit enum changes**

```bash
git add MyLifeDB/Views/MainTabView.swift
git commit -m "feat: add Me tab to Tab enum

Add .me case with person.circle icon to support new Me tab."
```

---

## Task 2: Create MeView with avatar and settings list

**Files:**
- Create: `MyLifeDB/Views/Me/MeView.swift`

**Step 1: Create Me directory**

Run: `mkdir -p MyLifeDB/Views/Me`

**Step 2: Write MeView**

Create `MyLifeDB/Views/Me/MeView.swift`:

```swift
//
//  MeView.swift
//  MyLifeDB
//
//  Main profile and settings tab with avatar header and settings list.
//  Provides access to General, Server, Stats, and About screens.
//

import SwiftUI

struct MeView: View {
    var body: some View {
        NavigationStack {
            List {
                // Avatar header section
                Section {
                    HStack {
                        Spacer()
                        VStack(spacing: 12) {
                            // Gray placeholder avatar
                            Circle()
                                .fill(Color.gray.opacity(0.3))
                                .frame(width: 90, height: 90)
                                .overlay(
                                    Image(systemName: "person.fill")
                                        .font(.system(size: 40))
                                        .foregroundColor(.gray)
                                )

                            Text("User")
                                .font(.title2)
                                .fontWeight(.semibold)
                        }
                        .padding(.vertical, 20)
                        Spacer()
                    }
                }
                .listRowBackground(Color.clear)

                // Settings sections
                Section {
                    NavigationLink {
                        GeneralSettingsView()
                    } label: {
                        Label("General", systemImage: "gearshape")
                    }

                    NavigationLink {
                        ServerSettingsView()
                    } label: {
                        Label("Server", systemImage: "server.rack")
                    }

                    NavigationLink {
                        StatsView()
                    } label: {
                        Label("Stats", systemImage: "chart.bar")
                    }

                    NavigationLink {
                        AboutView()
                    } label: {
                        Label("About", systemImage: "info.circle")
                    }
                }
            }
            #if os(iOS)
            .listStyle(.insetGrouped)
            #else
            .listStyle(.sidebar)
            #endif
            .navigationTitle("Me")
        }
    }
}

#Preview {
    MeView()
}
```

**Step 3: Add file to Xcode project**

Run: `open MyLifeDB.xcodeproj` and manually add `MyLifeDB/Views/Me/MeView.swift` to the project, or use command line:

```bash
# For now, we'll add it in next build step - Xcode will auto-detect
```

**Step 4: Build to verify MeView compiles (will fail on missing detail views)**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build 2>&1 | grep -A 2 "error:"`
Expected: Errors about missing GeneralSettingsView, ServerSettingsView, StatsView, AboutView

**Step 5: Commit MeView**

```bash
git add MyLifeDB/Views/Me/MeView.swift
git commit -m "feat: create MeView with avatar and settings list

Add main Me tab view with:
- Gray circular placeholder avatar with person icon
- Four settings sections (General, Server, Stats, About)
- iOS Settings-style grouped list layout
- Platform-specific list styles"
```

---

## Task 3: Create GeneralSettingsView placeholder

**Files:**
- Create: `MyLifeDB/Views/Me/GeneralSettingsView.swift`

**Step 1: Write GeneralSettingsView**

Create `MyLifeDB/Views/Me/GeneralSettingsView.swift`:

```swift
//
//  GeneralSettingsView.swift
//  MyLifeDB
//
//  General app settings screen.
//  Currently a placeholder for future settings like appearance, notifications, etc.
//

import SwiftUI

struct GeneralSettingsView: View {
    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Image(systemName: "gearshape.2")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)

                    Text("No settings available yet")
                        .font(.headline)
                        .foregroundColor(.secondary)

                    Text("General settings will appear here")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            }
            .listRowBackground(Color.clear)
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
        .navigationTitle("General")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

#Preview {
    NavigationStack {
        GeneralSettingsView()
    }
}
```

**Step 2: Build to verify compilation**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build 2>&1 | grep -A 2 "error:"`
Expected: Errors reduced (only ServerSettingsView, StatsView, AboutView missing)

**Step 3: Commit GeneralSettingsView**

```bash
git add MyLifeDB/Views/Me/GeneralSettingsView.swift
git commit -m "feat: add GeneralSettingsView placeholder

Add empty state view for future general settings.
Shows informative message about upcoming features."
```

---

## Task 4: Create ServerSettingsView with URL configuration

**Files:**
- Create: `MyLifeDB/Views/Me/ServerSettingsView.swift`

**Step 1: Write ServerSettingsView**

Create `MyLifeDB/Views/Me/ServerSettingsView.swift`:

```swift
//
//  ServerSettingsView.swift
//  MyLifeDB
//
//  Server configuration screen for API base URL.
//  Validates URL format and stores in AppStorage for app-wide access.
//

import SwiftUI

struct ServerSettingsView: View {
    @AppStorage("apiBaseURL") private var apiBaseURL = "http://localhost:12345"
    @State private var urlInput: String = ""
    @State private var validationError: String?
    @State private var isCheckingConnection = false
    @State private var connectionStatus: ConnectionStatus = .unknown

    enum ConnectionStatus {
        case unknown, connected, unreachable

        var text: String {
            switch self {
            case .unknown: return "Not checked"
            case .connected: return "Connected"
            case .unreachable: return "Not reachable"
            }
        }

        var color: Color {
            switch self {
            case .unknown: return .secondary
            case .connected: return .green
            case .unreachable: return .orange
            }
        }
    }

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("API Base URL")
                        .font(.headline)

                    TextField("http://localhost:12345", text: $urlInput)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        #if os(iOS)
                        .keyboardType(.URL)
                        #endif
                        .onChange(of: urlInput) { oldValue, newValue in
                            validateAndSave(newValue)
                        }

                    if let error = validationError {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            } header: {
                Text("Server Configuration")
            } footer: {
                Text("Enter the base URL of your MyLifeDB server. Changes are saved automatically.")
            }

            Section {
                HStack {
                    Text("Status")
                    Spacer()
                    if isCheckingConnection {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Text(connectionStatus.text)
                            .foregroundColor(connectionStatus.color)
                    }
                }

                Button("Check Connection") {
                    checkConnection()
                }
            } header: {
                Text("Connection")
            }
        }
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .navigationTitle("Server")
        .onAppear {
            urlInput = apiBaseURL
        }
    }

    private func validateAndSave(_ urlString: String) {
        // Reset error
        validationError = nil
        connectionStatus = .unknown

        // Empty is allowed (will use default)
        guard !urlString.isEmpty else {
            apiBaseURL = "http://localhost:12345"
            return
        }

        // Validate URL format
        guard let url = URL(string: urlString),
              let scheme = url.scheme,
              ["http", "https"].contains(scheme),
              url.host != nil else {
            validationError = "Invalid URL format. Must start with http:// or https://"
            return
        }

        // Valid - save it
        apiBaseURL = urlString
    }

    private func checkConnection() {
        isCheckingConnection = true

        Task {
            do {
                // Try to construct health check URL
                guard let baseURL = URL(string: apiBaseURL) else {
                    await MainActor.run {
                        connectionStatus = .unreachable
                        isCheckingConnection = false
                    }
                    return
                }

                let healthURL = baseURL.appendingPathComponent("api/health")

                // Simple HEAD request with 5 second timeout
                var request = URLRequest(url: healthURL)
                request.httpMethod = "HEAD"
                request.timeoutInterval = 5

                let (_, response) = try await URLSession.shared.data(for: request)

                await MainActor.run {
                    if let httpResponse = response as? HTTPURLResponse,
                       (200...299).contains(httpResponse.statusCode) {
                        connectionStatus = .connected
                    } else {
                        connectionStatus = .unreachable
                    }
                    isCheckingConnection = false
                }
            } catch {
                await MainActor.run {
                    connectionStatus = .unreachable
                    isCheckingConnection = false
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        ServerSettingsView()
    }
}
```

**Step 2: Build to verify compilation**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build 2>&1 | grep -A 2 "error:"`
Expected: Errors reduced (only StatsView, AboutView missing)

**Step 3: Commit ServerSettingsView**

```bash
git add MyLifeDB/Views/Me/ServerSettingsView.swift
git commit -m "feat: add ServerSettingsView with URL configuration

Add server settings screen with:
- API base URL text field with validation
- AppStorage persistence
- Connection status check with timeout
- Auto-save on change
- Clear error messaging for invalid URLs"
```

---

## Task 5: Create StatsView with API data fetching

**Files:**
- Create: `MyLifeDB/Views/Me/StatsView.swift`

**Step 1: Write StatsView**

Create `MyLifeDB/Views/Me/StatsView.swift`:

```swift
//
//  StatsView.swift
//  MyLifeDB
//
//  App and data statistics screen.
//  Fetches counts from API endpoints and displays app version info.
//

import SwiftUI

struct StatsView: View {
    @State private var inboxCount: Int?
    @State private var isLoadingInbox = false
    @State private var inboxError: Error?

    var body: some View {
        List {
            Section("App") {
                StatRow(label: "Version", value: appVersion)
                StatRow(label: "Build", value: buildNumber)
            }

            Section("Data") {
                HStack {
                    Text("Inbox Items")
                    Spacer()
                    if isLoadingInbox {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else if let count = inboxCount {
                        Text("\(count)")
                            .foregroundColor(.secondary)
                    } else if inboxError != nil {
                        Text("—")
                            .foregroundColor(.secondary)
                    } else {
                        Text("—")
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .navigationTitle("Stats")
        .task {
            await loadStats()
        }
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "Unknown"
    }

    private func loadStats() async {
        isLoadingInbox = true
        inboxError = nil

        do {
            let response = try await APIClient.shared.inbox.list()
            await MainActor.run {
                inboxCount = response.items.count
                isLoadingInbox = false
            }
        } catch {
            await MainActor.run {
                inboxError = error
                isLoadingInbox = false
            }
        }
    }
}

struct StatRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundColor(.secondary)
        }
    }
}

#Preview {
    NavigationStack {
        StatsView()
    }
}
```

**Step 2: Build to verify compilation**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build 2>&1 | grep -A 2 "error:"`
Expected: Errors reduced (only AboutView missing)

**Step 3: Commit StatsView**

```bash
git add MyLifeDB/Views/Me/StatsView.swift
git commit -m "feat: add StatsView with app and data statistics

Add stats screen with:
- App version and build number from Bundle
- Inbox item count from API
- Loading states with ProgressView
- Graceful error handling (shows — for unavailable stats)
- Automatic data fetching on appear"
```

---

## Task 6: Create AboutView with app information

**Files:**
- Create: `MyLifeDB/Views/Me/AboutView.swift`

**Step 1: Write AboutView**

Create `MyLifeDB/Views/Me/AboutView.swift`:

```swift
//
//  AboutView.swift
//  MyLifeDB
//
//  About screen with app information, version, and credits.
//

import SwiftUI

struct AboutView: View {
    var body: some View {
        List {
            Section {
                VStack(spacing: 16) {
                    Image(systemName: "folder.badge.questionmark")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)

                    Text("MyLifeDB")
                        .font(.title)
                        .fontWeight(.bold)

                    Text("Version \(appVersion)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            }
            .listRowBackground(Color.clear)

            Section("Information") {
                LabeledContent("Version", value: appVersion)
                LabeledContent("Build", value: buildNumber)
            }

            Section("Credits") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("MyLifeDB Apple Client")
                        .font(.headline)

                    Text("A native iOS and macOS client for the MyLifeDB personal knowledge management system.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section("Legal") {
                Button("Open Source Licenses") {
                    // TODO: Show licenses sheet
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .navigationTitle("About")
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "Unknown"
    }
}

#Preview {
    NavigationStack {
        AboutView()
    }
}
```

**Step 2: Build to verify all views compile**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build -quiet`
Expected: Success (MeView should compile but not yet integrated into MainTabView)

**Step 3: Commit AboutView**

```bash
git add MyLifeDB/Views/Me/AboutView.swift
git commit -m "feat: add AboutView with app information

Add about screen with:
- App icon and name display
- Version and build number
- Credits section
- Placeholder for open source licenses
- Clean, centered layout"
```

---

## Task 7: Integrate MeView into MainTabView

**Files:**
- Modify: `MyLifeDB/Views/MainTabView.swift:48-66`
- Modify: `MyLifeDB/Views/MainTabView.swift:72-80`

**Step 1: Add MeView to iOS TabView**

In `MainTabView.swift:48-66`, add the Me tab after Claude tab:

```swift
// iOS/iPadOS: Bottom tab bar
TabView(selection: $selectedTab) {
    InboxView()
        .tabItem {
            Label(Tab.inbox.rawValue, systemImage: Tab.inbox.icon)
        }
        .tag(Tab.inbox)

    LibraryView()
        .tabItem {
            Label(Tab.library.rawValue, systemImage: Tab.library.icon)
        }
        .tag(Tab.library)

    ClaudeView()
        .tabItem {
            Label(Tab.claude.rawValue, systemImage: Tab.claude.icon)
        }
        .tag(Tab.claude)

    MeView()
        .tabItem {
            Label(Tab.me.rawValue, systemImage: Tab.me.icon)
        }
        .tag(Tab.me)
}
```

**Step 2: Add MeView to macOS selectedView**

In `MainTabView.swift:72-80`, add the .me case:

```swift
#if os(macOS)
@ViewBuilder
private var selectedView: some View {
    switch selectedTab {
    case .inbox:
        InboxView()
    case .library:
        LibraryView()
    case .claude:
        ClaudeView()
    case .me:
        MeView()
    }
}
#endif
```

**Step 3: Build and verify full integration**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build -quiet`
Expected: Success with possible warnings

**Step 4: Commit MainTabView integration**

```bash
git add MyLifeDB/Views/MainTabView.swift
git commit -m "feat: integrate MeView into MainTabView

Add Me tab to both iOS TabView and macOS NavigationSplitView.
Fourth tab now accessible with person.circle icon."
```

---

## Task 8: Update MainTabView header comment

**Files:**
- Modify: `MyLifeDB/Views/MainTabView.swift:1-13`

**Step 1: Update file header comment**

In `MainTabView.swift:1-13`, update the header:

```swift
//
//  MainTabView.swift
//  MyLifeDB
//
//  Root navigation view with four tabs:
//  - Inbox: Incoming items to process
//  - Library: Organized file tree
//  - Claude: AI chat interface
//  - Me: Profile and settings
//
//  Platform behavior:
//  - iOS/iPadOS: Bottom tab bar
//  - macOS: Sidebar navigation
//
```

**Step 2: Build to verify no issues**

Run: `xcodebuild -scheme MyLifeDB -destination 'platform=macOS' build -quiet`
Expected: Success

**Step 3: Commit documentation update**

```bash
git add MyLifeDB/Views/MainTabView.swift
git commit -m "docs: update MainTabView header to include Me tab

Update file header comment to reflect four tabs instead of three."
```

---

## Task 9: Manual Xcode project verification

**Files:**
- Verify: `MyLifeDB.xcodeproj/project.pbxproj`

**Step 1: Open project in Xcode**

Run: `open MyLifeDB.xcodeproj`

**Step 2: Verify Me folder and files are in project**

1. Check that `Views/Me/` folder exists in project navigator
2. Verify all five files are present:
   - MeView.swift
   - GeneralSettingsView.swift
   - ServerSettingsView.swift
   - StatsView.swift
   - AboutView.swift
3. All files should have target membership: MyLifeDB

**Step 3: Add missing files if needed**

If any files are missing from project:
- Right-click Views folder → Add Files to "MyLifeDB"
- Navigate to `MyLifeDB/Views/Me/`
- Select all .swift files
- Ensure "Copy items if needed" is unchecked
- Ensure "MyLifeDB" target is checked
- Click Add

**Step 4: Build from Xcode**

Product → Build (Cmd+B)
Expected: Success

**Step 5: Commit project file changes if needed**

```bash
git add MyLifeDB.xcodeproj/project.pbxproj
git commit -m "chore: add Me views to Xcode project

Add MeView and detail views to Xcode project structure."
```

---

## Task 10: Manual testing on iOS Simulator (if available)

**Step 1: Launch iOS Simulator**

If simulator is available:
```bash
open -a Simulator
```

**Step 2: Build and run for iOS**

In Xcode: Select iOS Simulator → Product → Run (Cmd+R)

**Step 3: Test Me tab functionality**

1. Tap Me tab in bottom tab bar
2. Verify avatar displays correctly
3. Tap each settings section:
   - General → Should show empty state
   - Server → Should show URL field with localhost:12345
   - Stats → Should show loading then inbox count (or error)
   - About → Should show app version and credits
4. Test Server settings:
   - Enter invalid URL (e.g., "not a url") → Should show error
   - Enter valid URL → Error should clear
   - Tap "Check Connection" → Should show status
5. Navigate back from each screen

**Step 4: Document any issues found**

If issues found, create issue notes or fix immediately.

---

## Task 11: Manual testing on macOS

**Step 1: Build and run for macOS**

In Xcode: Select "My Mac" → Product → Run (Cmd+R)

**Step 2: Test Me tab functionality**

1. Click Me in sidebar
2. Verify avatar displays correctly
3. Click each settings section:
   - General → Should show empty state
   - Server → Should show URL field
   - Stats → Should show app/data stats
   - About → Should show app info
4. Test Server settings functionality
5. Verify navigation works correctly

**Step 3: Test platform-specific styling**

1. Verify list style looks appropriate for macOS
2. Check that navigation feels native
3. Ensure keyboard shortcuts work (Cmd+1/2/3/4 for tabs)

---

## Task 12: Update design document status

**Files:**
- Modify: `docs/plans/2026-02-06-me-tab-design.md:3`

**Step 1: Mark design as implemented**

In `docs/plans/2026-02-06-me-tab-design.md:3`, update status:

```markdown
**Status:** Implemented
```

**Step 2: Check testing checklist items**

Update the testing checklist at the end of the design doc to reflect what was tested.

**Step 3: Commit documentation update**

```bash
git add docs/plans/2026-02-06-me-tab-design.md
git commit -m "docs: mark me-tab design as implemented

Update design document status after successful implementation."
```

---

## Testing Checklist

After implementation, verify:

- [ ] Me tab appears in bottom tab bar (iOS) and sidebar (macOS)
- [ ] Avatar displays as gray circle with person icon
- [ ] All four settings sections navigate correctly
- [ ] General settings shows empty state message
- [ ] Server settings saves URL to AppStorage
- [ ] Server settings validates URL format
- [ ] Server settings shows connection status
- [ ] Invalid URLs show error message
- [ ] Stats view shows app version and build
- [ ] Stats view fetches inbox count from API
- [ ] Stats view handles API errors gracefully (shows —)
- [ ] About view shows correct app information
- [ ] Navigation works smoothly on both platforms
- [ ] List styling is appropriate per platform

## Success Criteria

- ✅ Four-tab layout with Me tab functional
- ✅ All navigation links work correctly
- ✅ Server settings persist across app launches
- ✅ Stats view handles loading/error states
- ✅ Platform-appropriate styling (insetGrouped on iOS, sidebar on macOS)
- ✅ No compilation errors or warnings related to new code
- ✅ App builds and runs on both iOS and macOS

## Notes

- If iOS Simulator is not available, skip Task 10 and test on macOS only
- The APIClient.shared.inbox.list() call assumes the API client is properly configured
- Future enhancements can replace placeholder avatar with actual user profile image
- The "Open Source Licenses" button in AboutView is currently a TODO placeholder
