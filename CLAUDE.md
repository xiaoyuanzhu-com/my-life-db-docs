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

**Always use git worktrees** for code changes — no exceptions, even for small changes. Never commit directly on `main`. **Create the worktree first, before making any code changes.** All edits happen inside the worktree directory.

**Never auto-commit or auto-push.** Wait for the user's explicit instruction to commit, merge, or push.

    # 1. create worktree BEFORE making changes
    git worktree add -b <branch> .worktrees/<name> main
    # 2. commit — ONLY when user explicitly asks
    # 3. merge & push — ONLY when user explicitly asks
    git checkout main && git pull && git merge <branch> && git push
    # 4. clean up — ONLY when user explicitly asks (or after merge)
    git worktree remove .worktrees/<name> && git branch -d <branch>

## Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Doc files | `kebab-case.md` | `ui-architecture.md` |
| Directory names | `kebab-case` | `apple-client/` |
| Frontmatter title | Title Case | `"MyLifeDB Apple Client - Architecture"` |
