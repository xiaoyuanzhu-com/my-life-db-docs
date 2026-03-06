---
title: "Claude Code"
---

> Last edit: 2026-03-06

Syncs Claude Code session files from `~/.claude/` into the MyLifeDB imports tree. Session JSONL files and index files are copied so they can be browsed, searched, and digested like any other user data.

## File Layout

### Source (Claude CLI data)

```
~/.claude/
  projects/
    -Users-iloahz-MyLifeDB/
      sessions-index.json
      abc123.jsonl
      abc123/
        subagents/
          agent-xyz.jsonl
    -Users-iloahz-SomeOtherProject/
      sessions-index.json
      def456.jsonl
```

Project directory names are sanitized paths (slashes replaced with hyphens).

### Destination (MyLifeDB imports)

```
USER_DATA_DIR/
  imports/
    claude-code/
      projects/                          <-- mirrors ~/.claude/projects/
        -Users-iloahz-MyLifeDB/
          sessions-index.json
          abc123.jsonl
          abc123/
            subagents/
              agent-xyz.jsonl
        -Users-iloahz-SomeOtherProject/
          ...
```

The `projects/` subdirectory keeps the namespace open for syncing other Claude dirs in the future (e.g., `settings/`, `todos/`).

## Synced Files

Only these files are copied:

| Pattern | Description |
|---------|-------------|
| `*.jsonl` | Session message history (main sessions and subagent sessions) |
| `sessions-index.json` | Per-project session index with metadata |

Everything else (`.DS_Store`, text files, etc.) is ignored.

## Triggers

The collector runs:

1. **On startup** -- initial sync when the server boots
2. **Every 10 minutes** -- periodic sync via a background goroutine

The sync is context-aware and cancels cleanly on server shutdown.

## Change Detection

Files are only copied when they differ from the destination:

1. If destination file doesn't exist -- copy
2. If file sizes differ -- copy
3. If sizes match -- compare SHA-256 hashes, copy only if different
4. Otherwise -- skip

This makes repeated syncs cheap (no unnecessary I/O).

## Indexing

Synced files land in `USER_DATA_DIR/imports/claude-code/projects/` which is inside the FS service watch tree. The standard pipeline applies:

1. **FS Service** detects the new/changed files via fsnotify or periodic scan
2. **Digest Worker** processes them through registered digesters
3. Files become searchable and browsable in the library under `imports/claude-code/`


## Platforms

Runs on the **Go backend** server. The source directory (`~/.claude/projects/`) exists wherever the Claude Code CLI has been used -- typically macOS and Linux. On platforms where the directory doesn't exist the collector silently no-ops.
## Configuration

The collector is enabled automatically when `~/.claude/projects/` exists. No environment variables or settings are required.

Collector state (enabled/disabled) is stored in the `collectors` table via the `/api/collectors` API, toggled from the Data Sources settings UI.

## Code

| File | Description |
|------|-------------|
| `backend/collectors/claudecode/collector.go` | Sync logic (walk, diff, copy) |
| `backend/collectors/claudecode/collector_test.go` | Unit tests |
| `backend/server/server.go` | Initialization and periodic sync loop |
| `frontend/app/lib/data-collectors.ts` | Frontend collector definitions (id: `ai-chats`, source: `claude_sessions`) |
