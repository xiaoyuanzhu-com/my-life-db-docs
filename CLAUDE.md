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

**Always use worktrees for ANY task involving code.** Create the worktree FIRST — before reading, editing, building, or running any code. The main directory's files may be stale; never read or act on them. Use the `using-git-worktrees` skill to set one up — it handles directory selection, `.gitignore` verification, project setup, and baseline tests.

**Project-specific rules that extend the skill:**

- **`git fetch origin` first — every time, no exceptions.** Branch from `origin/main`, not HEAD:
  `git worktree add -b <branch> .worktrees/<name> origin/main`
- **Main directory is off-limits** — only `git worktree add/remove` there; everything else (reads, edits, builds) happens inside the worktree.
- **Sub-agents get the worktree path** — never pass the main repo path.
- **Never auto-commit or auto-push** — when changes are ready (tests pass, work complete), prompt: *"Ready to commit, push, and clean up?"* so the user can reply **"go"** to confirm. Consent applies to the current batch only; after each push + clean up cycle, wait for the user's next instruction.
- **Always rebase, never merge** — push `<branch>:main` directly; no PRs, no merge commits.

**Each worktree has one lifecycle: create → work → push → clean up.**
A worktree may accumulate multiple commits before pushing. After every push, clean up immediately.
To continue work in the same session, start a **new worktree** — the full cycle (including commit/push consent) resets.

**Workflow (commit only when user asks; push + sync + clean up after every push):**

    # --- start of work ---
    cd <repo-root>
    git fetch origin
    git worktree add -b <branch> .worktrees/<name> origin/main

    # --- commit (repeat as needed before pushing) ---
    cd .worktrees/<name>
    # ... git add, git commit ...

    # --- push + sync + clean up (after every push) ---
    git fetch origin && git rebase origin/main
    git push origin <branch>:main
    # Sync main working directory
    cd <repo-root>
    git pull --rebase origin main
    # If dirty main dir: git checkout -- . && git pull --rebase origin main
    # Clean up
    git worktree remove .worktrees/<name>
    git branch -d <branch>

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
| Frontmatter title | Title Case, matches filename | `ui-architecture.md` → `"UI Architecture"` |

## Doc Format Rules

1. **Filename = title.** The frontmatter `title` must be the Title Case form of the kebab-case filename. If you rename a file, update the title (and vice versa). Example: `claude-code-sessions.md` → `title: "Claude Code Sessions"`.

2. **Last-edit date on top.** Every doc must have a `> Last edit: YYYY-MM-DD` blockquote immediately after the frontmatter (before any other content). Update this date whenever the doc is edited.

```markdown
---
title: "Example Doc"
---

> Last edit: 2026-02-26

Content starts here.
```
