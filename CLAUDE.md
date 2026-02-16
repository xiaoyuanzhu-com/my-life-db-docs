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

Prefer using **git worktrees** for code changes to avoid conflicts with concurrent sessions:

    git worktree add -b <branch> .worktrees/<name> main
    # work and commit on the branch, then merge when done
    git checkout main && git pull && git merge <branch> && git push
    # clean up
    git worktree remove .worktrees/<name> && git branch -d <branch>

## Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Doc files | `kebab-case.md` | `ui-architecture.md` |
| Directory names | `kebab-case` | `apple-client/` |
| Frontmatter title | Title Case | `"MyLifeDB Apple Client - Architecture"` |
