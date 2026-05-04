---
title: "Reference"
---

> Last edit: 2026-05-04

The full REST API surface is documented as an [OpenAPI 3.1 spec](/docs/openapi.yaml) and rendered with [Scalar](https://scalar.com/).

[Open the interactive reference →](/docs/api/reference/)

The reference covers every endpoint in the API, organized by the [namespace structure](/docs/internal/api/api-structure/):

- **`/api/data/*`** — files, folders, search, uploads, events, directories, apps, collectors
- **`/api/agent/*`** — Claude Code sessions, groups, defs, skills, MCP catalog, share
- **`/api/explore/*`** — feed posts and comments
- **`/api/connect/*`** — owner-side OAuth admin (consent, clients, audit)
- **`/api/mcp`** — MCP transport endpoint
- **`/api/system/*`** — auth, OAuth login, settings, stats (owner-only)
- **`/raw/*`, `/sqlar/*`, `/connect/{token,revoke}`, `/.well-known/*`** — protocol surfaces outside `/api/`

All Connect-callable endpoints under `/api/data/*` are gated by `files.read` / `files.write` scopes. See [Connect](/docs/internal/api/connect/) for the OAuth 2.1 PKCE flow.
