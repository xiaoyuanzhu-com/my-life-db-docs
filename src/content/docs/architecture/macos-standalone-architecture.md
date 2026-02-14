---
title: macOS Standalone Architecture
---

## System Overview

```mermaid
graph TB
    subgraph "MyLifeDB.app"
        subgraph "Core (Required)"
            APP[Go Binary<br/>my-life-db]
            SQLITE[(SQLite<br/>Embedded DB)]
            FRONTEND[React SPA<br/>frontend/dist]
            FSWATCH[FS Watcher<br/>fsnotify]
        end

        APP --> SQLITE
        APP --> FRONTEND
        APP --> FSWATCH
    end

    subgraph "User Data"
        USERDATA[~/Library/Application Support/<br/>MyLifeDB/data/]
        APPDATA[~/Library/Application Support/<br/>MyLifeDB/.my-life-db/]
    end

    FSWATCH --> USERDATA
    SQLITE --> APPDATA

    subgraph "Optional: Local Services"
        MEILI[Meilisearch<br/>Full-text Search]
        QDRANT[Qdrant<br/>Vector Search]
    end

    subgraph "Optional: Cloud APIs"
        OPENAI[OpenAI API<br/>Summarization]
        HAID[HAID Service<br/>OCR/Documents]
        ALIYUN[Aliyun ASR<br/>Voice]
    end

    subgraph "Optional: Claude Integration"
        CLAUDE[Claude CLI<br/>Subprocess]
    end

    APP -.->|optional| MEILI
    APP -.->|optional| QDRANT
    APP -.->|optional| OPENAI
    APP -.->|optional| HAID
    APP -.->|optional| ALIYUN
    APP -.->|optional| CLAUDE

    BROWSER[Web Browser<br/>localhost:12345] --> APP
```

## Dependency Layers

```mermaid
graph LR
    subgraph "Layer 1: Essential"
        L1A[SQLite + CGO]
        L1B[Gin HTTP Server]
        L1C[React Frontend]
        L1D[File System Watcher]
    end

    subgraph "Layer 2: Enhanced"
        L2A[Meilisearch]
        L2B[Qdrant]
    end

    subgraph "Layer 3: AI Features"
        L3A[OpenAI API]
        L3B[HAID Service]
        L3C[Aliyun ASR]
    end

    subgraph "Layer 4: Integrations"
        L4A[Claude CLI]
        L4B[OAuth/OIDC]
    end

    L1A --> L2A
    L1A --> L2B
    L2A --> L3A
    L2B --> L3A
    L3A --> L4A
```

## Build & Distribution Flow

```mermaid
flowchart TD
    subgraph "Build Phase"
        SRC[Source Code] --> BUILD_FE[Build Frontend<br/>npm run build]
        SRC --> BUILD_BE[Build Backend<br/>CGO_ENABLED=1 go build]

        BUILD_FE --> DIST[frontend/dist/]
        BUILD_BE --> BIN_ARM[my-life-db<br/>ARM64]
        BUILD_BE --> BIN_X64[my-life-db<br/>x86_64]

        BIN_ARM --> UNIVERSAL[Universal Binary<br/>lipo -create]
        BIN_X64 --> UNIVERSAL
    end

    subgraph "Package Phase"
        UNIVERSAL --> BUNDLE[MyLifeDB.app<br/>Bundle]
        DIST --> BUNDLE

        BUNDLE --> SIGN[Code Sign<br/>codesign -s]
        SIGN --> NOTARIZE[Notarize<br/>xcrun notarytool]
        NOTARIZE --> STAPLE[Staple<br/>xcrun stapler]
    end

    subgraph "Distribution"
        STAPLE --> DMG[DMG Installer]
        STAPLE --> ZIP[ZIP Archive]
        STAPLE --> APPSTORE[Mac App Store]
    end
```

## Component Details

```mermaid
graph TB
    subgraph "Go Backend Components"
        MAIN[main.go] --> SERVER[server/server.go]

        SERVER --> DB[db/<br/>SQLite + Migrations]
        SERVER --> FS[fs/<br/>File Watcher + Scanner]
        SERVER --> NOTIF[notifications/<br/>SSE Service]
        SERVER --> DIGEST[workers/digest/<br/>File Processor]
        SERVER --> API[api/<br/>HTTP Handlers]
        SERVER --> AUTH[auth/<br/>OAuth/Password]
        SERVER --> CLAUDEPKG[claude/<br/>Session Manager]

        API --> VENDORS[vendors/]
        VENDORS --> V_MEILI[meilisearch.go]
        VENDORS --> V_QDRANT[qdrant.go]
        VENDORS --> V_OPENAI[openai.go]
        VENDORS --> V_HAID[haid.go]
        VENDORS --> V_ALIYUN[aliyun.go]
    end

    subgraph "Frontend Components"
        ROOT[root.tsx] --> ROUTES[routes/]
        ROUTES --> R_HOME[home.tsx]
        ROUTES --> R_INBOX[inbox.tsx]
        ROUTES --> R_LIB[library.*.tsx]
        ROUTES --> R_CLAUDE[claude.tsx]

        ROOT --> CONTEXTS[contexts/]
        ROOT --> HOOKS[hooks/]
        ROOT --> COMPONENTS[components/]
    end
```

## Three Operating Modes

```mermaid
graph TB
    subgraph "Mode 1: Connect to Remote Server"
        M1_APP[macOS App<br/>Frontend Only] -->|HTTPS| M1_SERVER[Remote Server<br/>your-server.com]
        M1_SERVER --> M1_SERVICES[All Services<br/>Meilisearch, Qdrant, etc.]
    end

    subgraph "Mode 2: Connect to Cloud Service"
        M2_APP[macOS App<br/>Frontend Only] -->|HTTPS| M2_CLOUD[Cloud Service<br/>api.mylifedb.com]
        M2_CLOUD --> M2_SERVICES[Managed Services]
    end

    subgraph "Mode 3: Standalone (This Doc)"
        M3_APP[macOS App<br/>Full Package]
        M3_APP --> M3_BACKEND[Embedded Backend<br/>localhost:12345]
        M3_BACKEND --> M3_SQLITE[(SQLite)]
        M3_BACKEND -.->|optional| M3_DOCKER[Docker Desktop<br/>Meilisearch + Qdrant]
        M3_BACKEND -.->|optional| M3_APIS[Cloud APIs<br/>OpenAI, HAID]
    end
```

## Deployment Tiers

```mermaid
graph LR
    subgraph "Tier 1: Minimal"
        T1[SQLite + Files + UI]
    end

    subgraph "Tier 2: Search"
        T2[Tier 1 + Meilisearch + Qdrant]
    end

    subgraph "Tier 3: AI"
        T3[Tier 2 + OpenAI + HAID]
    end

    subgraph "Tier 4: Full"
        T4[Tier 3 + Claude CLI + Voice]
    end

    T1 -->|+Docker| T2
    T2 -->|+API Keys| T3
    T3 -->|+Claude CLI| T4
```

## macOS App Bundle Structure

```
MyLifeDB.app/
├── Contents/
│   ├── Info.plist                    # App metadata
│   ├── MacOS/
│   │   └── my-life-db                # Universal binary (ARM64 + x86_64)
│   ├── Resources/
│   │   ├── AppIcon.icns              # App icon
│   │   ├── frontend/                 # Built React SPA
│   │   │   ├── index.html
│   │   │   └── assets/
│   │   └── defaults.env              # Default configuration
│   ├── Frameworks/                   # (Optional) Bundled dependencies
│   └── Entitlements.plist            # Sandbox permissions
└── (CodeSignature, etc.)
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Backend
    participant SQLite
    participant FSWatcher
    participant Meilisearch
    participant OpenAI

    User->>Browser: Open localhost:12345
    Browser->>Backend: GET /
    Backend->>Browser: React SPA

    User->>Browser: Drop file in Inbox
    Browser->>Backend: POST /api/upload
    Backend->>SQLite: Insert file record
    Backend->>FSWatcher: Notify change

    FSWatcher->>Backend: File changed event
    Backend->>SQLite: Queue digest

    alt Meilisearch Available
        Backend->>Meilisearch: Index content
    end

    alt OpenAI Available
        Backend->>OpenAI: Analyze intent
        OpenAI->>Backend: Suggested action
    end

    Backend->>Browser: SSE: digest complete
    Browser->>User: Show enriched file
```

## CGO Build Requirements

```mermaid
flowchart TD
    subgraph "macOS Build Environment"
        XCODE[Xcode Command Line Tools<br/>xcode-select --install]
        GO[Go 1.25+<br/>with CGO support]

        XCODE --> GCC[gcc / clang]
        XCODE --> MAKE[make]

        GCC --> CGO[CGO_ENABLED=1]
        GO --> CGO

        CGO --> SQLITE3[mattn/go-sqlite3<br/>C bindings]
        CGO --> HEIC[gen2brain/heic<br/>Image conversion]
    end

    subgraph "Build Targets"
        CGO --> ARM64[darwin/arm64<br/>Apple Silicon]
        CGO --> AMD64[darwin/amd64<br/>Intel Mac]

        ARM64 --> LIPO[lipo -create]
        AMD64 --> LIPO
        LIPO --> UNIVERSAL[Universal Binary]
    end
```

## Summary Table

| Component | Required | Bundled | External | Notes |
|-----------|----------|---------|----------|-------|
| Go Binary | ✅ | ✅ | - | CGO required for SQLite |
| React Frontend | ✅ | ✅ | - | Pre-built static files |
| SQLite | ✅ | ✅ | - | Embedded via CGO |
| Meilisearch | ❌ | ❌ | Docker/Standalone | ~50MB binary |
| Qdrant | ❌ | ❌ | Docker/Standalone | ~100MB binary |
| OpenAI API | ❌ | - | Cloud | User provides API key |
| HAID | ❌ | - | Cloud | Your hosted service |
| Claude CLI | ❌ | ❌ | User installs | npm i -g @anthropic/claude-code |
| Aliyun ASR | ❌ | - | Cloud | For voice features |
