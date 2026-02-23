# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **documentation hub** for the entire MyLifeDB project, built with [Astro Starlight](https://starlight.astro.build/).

All documentation from individual repos has been consolidated here. Individual repos' CLAUDE.md files contain repo-specific guidance; this site contains the comprehensive documentation.

## Build & Dev Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (http://localhost:4321)
npm run build      # Build static site → dist/
npm run preview    # Preview built site
```

## Content Structure

Documentation lives in `src/content/docs/` organized by section:

```
src/content/docs/
├── architecture/    # System overview, backend architecture, tech design
├── components/      # Subsystem deep dives (digest, fs, notifications, auth, etc.)
├── api/             # REST API reference, HTTP caching
├── features/        # Feature docs (inbox, search, voice, people, etc.)
├── claude-code/     # Claude Code integration docs
├── apple-client/    # Apple client architecture, hybrid UI, data collection, inbox PRD
└── design/          # Design system docs
```

### Adding New Docs

1. Create a `.md` or `.mdx` file in the appropriate directory
2. Add frontmatter with at least `title:`
3. The sidebar auto-generates from directory structure (configured in `astro.config.mjs`)

## Git Workflow

**Always use git worktrees for ANY task that involves code — changes, investigation, debugging, code reading.** No exceptions, even for small changes. Never commit directly on `main`. **Create the worktree first, before doing anything with code.** Everything happens inside the worktree directory — reading files, editing, builds, tests, linting, dependency installs, and all other commands. The main directory's files may be arbitrarily stale — never read or run code from it directly.

**Always `git fetch origin` before creating a worktree — every single time, no exceptions.** This guarantees the worktree starts from the latest remote state. Skipping the fetch means working with stale code.

**The main working directory is shared and potentially dirty.** Other sessions may have left uncommitted or untracked files there. Only use it for `git worktree add/remove` — never run builds or other commands from it.

**When launching sub-agents or skills**, always provide the worktree path as the working directory. Never pass the main repo path.

**Never auto-commit or auto-push.** Wait for the user's explicit instruction to commit, merge, or push.

**Always rebase, never merge** — rebase onto `origin/main` and push directly. Never create merge commits.

    # 1. fetch latest and create worktree BEFORE doing anything with code
    cd <repo-root>
    git fetch origin
    git worktree add -b <branch> .worktrees/<name> origin/main
    # 2. commit — ONLY when user explicitly asks
    # 3. rebase & push — ONLY when user explicitly asks
    # Push from WITHIN the worktree — never checkout main (other sessions may have uncommitted work there)
    cd .worktrees/<name>
    git fetch origin
    git rebase origin/main
    git push origin <branch>:main
    # After a successful push, bring the main working directory up to date
    cd <repo-root>
    git pull --rebase origin main
    # If it fails due to dirty main dir: git checkout -- . && git pull --rebase origin main
    # If rebase conflicts arise: resolve them, then git rebase --continue
    # 4. clean up — ONLY when user explicitly asks
    cd <repo-root>
    git worktree remove .worktrees/<name> && git branch -d <branch>

## House Cleaning (periodic, not per-session)

Stale worktrees and branches accumulate naturally — that's fine. Tidy up periodically when things feel cluttered, not after every session:

    # See what worktrees and branches exist
    git worktree list
    git branch

    # Remove a worktree
    git worktree remove .worktrees/<name>          # safe: refuses if uncommitted changes exist
    git worktree remove --force .worktrees/<name>  # discard changes and remove
    git worktree prune                             # fix broken refs after accidental rm -rf

    # Delete stale local branches
    git branch -d <branch>   # safe: refuses if not fully pushed
    git branch -D <branch>   # force delete

## Diagrams — Use Mermaid, Not ASCII

This site has `astro-mermaid` configured — fenced ` ```mermaid ` blocks render automatically at build time.

**Always use Mermaid** for architecture diagrams, flowcharts, sequence diagrams, state machines, and dependency trees. Never use ASCII art for these.

**Pick the right diagram type:**

| What you're showing | Mermaid type | Example |
|---------------------|-------------|---------|
| Component dependencies, data flow | `graph TD` or `graph LR` | Server → DB → Router |
| Request/response sequences | `sequenceDiagram` | OAuth login flow |
| State machines | `stateDiagram-v2` | Digest status transitions |
| Class/struct relationships | `classDiagram` | Database schema |
| Multi-phase pipelines | `graph TD` with `subgraph` | Digest processing phases |

**Exception — UI wireframes stay as ASCII.** Mermaid can't express spatial layouts (screen mockups, component positioning). Use box-drawing characters (`┌ ─ ┐ │ └ ┘`) inside a plain ` ``` ` block for these.

**Style tips:**
- Use descriptive node labels: `DB["SQLite (WAL)"]` not just `DB`
- Use `\n` for multi-line labels: `"Line 1\nLine 2"`
- Quote labels containing special characters: `["label with (parens)"]`
- Prefer `graph TD` (top-down) for hierarchies, `graph LR` (left-right) for pipelines

## Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Doc files | `kebab-case.md` | `ui-architecture.md` |
| Directory names | `kebab-case` | `apple-client/` |
| Frontmatter title | Title Case | `"MyLifeDB Apple Client - Architecture"` |
