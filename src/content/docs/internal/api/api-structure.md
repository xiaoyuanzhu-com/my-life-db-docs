---
title: "API Structure"
---

> Last edit: 2026-05-04

# API Structure (ADR)

## Status

Accepted — 2026-05-03. Phases A through E are landed; Phase F (this docs pass) lands alongside the OpenAPI/reference updates.

## Context

The REST API at `/api/*` has grown organically. The current shape is a flat bag of feature groups (`/api/library/*`, `/api/inbox/*`, `/api/auth/*`, `/api/oauth/*`, `/api/settings`, `/api/stats`, `/api/collectors`, `/api/apps`, `/api/notifications/stream`, `/api/search`, `/api/upload/*`, `/api/directories`, `/api/share/*`, `/api/agent/*`, `/api/explore/*`, `/api/connect/*`, `/api/mcp`, …) sitting side-by-side with no top-level structure.

Several pain points have accumulated:

- **No domain split.** "Library" routes mix file CRUD, search, notifications, ingestion config, and uploads. There is no name that says "this is the data plane" vs "this is the agent plane" vs "this is the owner-only control plane".
- **REST inconsistency inside `/api/library/*`.** File operations are split across query-param verbs (`POST /library/rename`, `POST /library/move`, `POST /library/pin`, `DELETE /library/pin`, `GET /library/file-info?path=…`) instead of treating the file path as a resource.
- **Bifurcated write paths for Explore.** Reads are REST (`GET /api/explore/posts*`); writes only exist as MCP tools (`create_post`, `add_comment`, `add_tags`). Anything that wants to write without going through MCP has no path.
- **No correspondence with Connect scopes.** The Connect authorization server gates third-party access by scope (`files.read`, `files.write`, …), but the routes those scopes protect (`/raw/*`) live outside `/api/` and the rest of the file API is scattered, so middleware cannot gate a contiguous prefix.
- **No correspondence with OpenAPI tags.** When we generate API reference docs, there is no natural section boundary — every route is its own row.
- **Hard for both internal navigation and third-party builders.** A new contributor (or a new Connect app author) has to read the entire route table to understand what kind of thing each endpoint is.

This ADR locks the namespace structure so subsequent refactor PRs (backend route renames, frontend client updates, iOS client updates, OpenAPI generation, Connect scope gating) all reference one canonical decision.

## Decision

The API is reorganized into **three tiers** containing **six top-level namespaces** under `/api/`:

| Tier | Namespaces | Audience |
|---|---|---|
| Product domains | `/api/data/`, `/api/agent/`, `/api/explore/` | What MyLifeDB *is* |
| Protocol surfaces | `/api/connect/`, `/api/mcp/` | How non-owner callers reach in |
| Admin | `/api/system/` | Owner-only control plane |

Plus **four surfaces that stay outside `/api/`** for protocol or performance reasons. These are explicitly NOT moved:

| Path | Why it stays outside `/api/` |
|---|---|
| `GET /raw/*path`, `PUT /raw/*path` | Byte I/O, no JSON envelope, hot path; served with caching headers and Connect-scope middleware. Moving it inside `/api/` would imply a JSON contract that does not exist. |
| `GET /sqlar/*path` | Derived asset bytes (entries inside SQLite archive files); same byte-I/O contract as `/raw/`. |
| `POST /connect/token`, `POST /connect/revoke` | OAuth 2.1 public endpoints. Third-party apps hardcode these URLs; moving them would break the implicit contract that they live at the top level. |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 discovery document. The path is dictated by the spec. |

## Why this cut

- **Matches the mental model.** When we describe MyLifeDB to a person, we say "data, agent, explore" — not "library, claude-sessions, posts". The URL structure should mirror how we already talk about the product.
- **Maps cleanly onto Connect scopes.** `files.read` and `files.write` gate `/api/data/*` as a single contiguous prefix. The Connect scope-check middleware can attach to one subgroup instead of being scattered across `/raw/`, `/api/library/*`, `/api/upload/*`, `/api/search`, `/api/apps`, etc.
- **Maps cleanly onto OpenAPI tags.** Each namespace becomes one tag, which becomes one rendered section in generated reference docs. Six sections instead of twenty unrelated rows.
- **Survives growth.** New ingestion endpoint → goes under `/api/data/`. New agent feature → `/api/agent/`. New social/feed feature → `/api/explore/`. New OAuth admin endpoint → `/api/connect/`. New owner-only control → `/api/system/`. The "where does this go?" question has a deterministic answer.
- **Audience-cohesive.** `data/` is the surface third-party apps touch through Connect. `agent/` and `system/` are owner-only by design. `mcp/` is the tool runtime for embedded agents. `connect/` is OAuth grant management. Each namespace has one audience, not a mix.

## Endpoint migration map

Every current route has a defined new path. Outside-`/api/` paths are listed for completeness but are unchanged.

### Data — file I/O, search, events, uploads, ingestion config

`/api/library/*` is dissolved into `/api/data/`, with file paths treated as REST resources.

| Current path | Method | New path |
|---|---|---|
| `/api/library/file-info?path=…` | GET | `/api/data/files/*path` |
| `/api/library/file?path=…` | DELETE | `/api/data/files/*path` |
| `/api/library/rename` | POST | `PATCH /api/data/files/*path` body `{name}` |
| `/api/library/move` | POST | `PATCH /api/data/files/*path` body `{parent}` |
| `/api/library/folder` | POST | `POST /api/data/folders` body `{parent, name}` |
| `/api/library/tree?path=…` | GET | `GET /api/data/tree?path=…` (gin's `*path` must be the final segment, so `tree` stays a top-level subroute with a query parameter) |
| `/api/library/pin` | POST | `PUT /api/data/pins/*path` (idempotent) |
| `/api/library/pin` | DELETE | `DELETE /api/data/pins/*path` (idempotent) |
| `/api/library/download?path=…` | GET | `GET /api/data/download?path=…` |
| `/api/library/extract` | POST | `POST /api/data/extract` |
| `/api/library/root` | GET | `GET /api/data/root` |
| `/api/directories` | GET | `GET /api/data/directories` |
| `/api/search` | GET | `GET /api/data/search` |
| `/api/notifications/stream` | GET | `GET /api/data/events` (renamed: filesystem events, not user notifications) |
| `/api/upload/simple/*path` | PUT | `PUT /api/data/uploads/simple/*path` |
| `/api/upload/tus/*path` | Any | `Any /api/data/uploads/tus/*path` |
| `/api/upload/finalize` | POST | `POST /api/data/uploads/finalize` |
| `/api/apps` | GET | `GET /api/data/apps` |
| `/api/apps/:id` | GET | `GET /api/data/apps/:id` |
| `/api/collectors` | GET | `GET /api/data/collectors` |
| `/api/collectors/:id` | PUT | `PUT /api/data/collectors/:id` |

### Agent — sessions, groups, attachments, definitions, skills, MCP catalog, sharing

The `/api/agent/*` namespace is already clean. The only change is colocating session sharing (currently `/api/share/*`) under it, since shares are a per-session feature.

| Current path | Method | New path |
|---|---|---|
| `/api/agent/config` | GET | `/api/agent/config` |
| `/api/agent/info` | GET | `/api/agent/info` |
| `/api/agent/sessions` | GET | `/api/agent/sessions` |
| `/api/agent/sessions/all` | GET | `/api/agent/sessions/all` |
| `/api/agent/sessions` | POST | `/api/agent/sessions` |
| `/api/agent/sessions/:id` | GET | `/api/agent/sessions/:id` |
| `/api/agent/sessions/:id` | PATCH | `/api/agent/sessions/:id` |
| `/api/agent/sessions/:id/messages` | GET | `/api/agent/sessions/:id/messages` |
| `/api/agent/sessions/:id/changed-files` | GET | `/api/agent/sessions/:id/changed-files` |
| `/api/agent/sessions/:id/deactivate` | POST | `/api/agent/sessions/:id/deactivate` |
| `/api/agent/sessions/:id/restart` | POST | `/api/agent/sessions/:id/restart` |
| `/api/agent/sessions/:id/archive` | POST | `/api/agent/sessions/:id/archive` |
| `/api/agent/sessions/:id/unarchive` | POST | `/api/agent/sessions/:id/unarchive` |
| `/api/agent/sessions/:id/share` | POST | `/api/agent/sessions/:id/share` |
| `/api/agent/sessions/:id/share` | DELETE | `/api/agent/sessions/:id/share` |
| `/api/agent/sessions/:id/subscribe` | WS | `/api/agent/sessions/:id/subscribe` |
| `/api/agent/groups` | GET | `/api/agent/groups` |
| `/api/agent/groups` | POST | `/api/agent/groups` |
| `/api/agent/groups/order` | PUT | `/api/agent/groups/order` |
| `/api/agent/groups/:id` | PATCH | `/api/agent/groups/:id` |
| `/api/agent/groups/:id` | DELETE | `/api/agent/groups/:id` |
| `/api/agent/attachments` | POST | `/api/agent/attachments` |
| `/api/agent/attachments/:storageId/:filename` | DELETE | `/api/agent/attachments/:storageId/:filename` |
| `/api/agent/defs` | GET | `/api/agent/defs` |
| `/api/agent/defs/:name` | GET | `/api/agent/defs/:name` |
| `/api/agent/defs/:name` | PUT | `/api/agent/defs/:name` |
| `/api/agent/defs/:name` | DELETE | `/api/agent/defs/:name` |
| `/api/agent/defs/:name/run` | POST | `/api/agent/defs/:name/run` |
| `/api/agent/skills` | GET | `/api/agent/skills` |
| `/api/agent/mcp-servers` | GET | `/api/agent/mcp-servers` |
| `/api/agent/mcp-servers/:name/tools` | GET | `/api/agent/mcp-servers/:name/tools` |
| `/api/agent/mcp-servers/:name` | PATCH | `/api/agent/mcp-servers/:name` |
| `/api/share/:token` | GET | `GET /api/agent/share/:token` |
| `/api/share/:token/messages` | GET | `GET /api/agent/share/:token/messages` |
| `/api/share/:token/subscribe` | WS | `WS /api/agent/share/:token/subscribe` |

### Explore — feed posts and comments (REST writes added)

Reads stay; writes are added as REST mirrors of the existing MCP tools (`create_post`, `add_comment`, `add_tags`). The MCP tools become thin wrappers over the REST endpoints. Backend implementation of the new REST writes may land in a follow-up — this ADR locks the path shape now.

| Current path | Method | New path |
|---|---|---|
| `/api/explore/posts` | GET | `/api/explore/posts` |
| `/api/explore/posts/:id` | GET | `/api/explore/posts/:id` |
| `/api/explore/posts/:id/comments` | GET | `/api/explore/posts/:id/comments` |
| `/api/explore/posts/:id` | DELETE | `/api/explore/posts/:id` |
| *(new)* | POST | `/api/explore/posts` |
| *(new)* | POST | `/api/explore/posts/:id/comments` |
| *(new)* | POST | `/api/explore/posts/:id/tags` |

### Connect — owner-side OAuth admin

Public OAuth endpoints stay at the top level (see "Outside `/api/`" below). Owner-side management already lives under `/api/connect/` and is unchanged.

| Current path | Method | New path |
|---|---|---|
| `/api/connect/consent` | POST | `/api/connect/consent` |
| `/api/connect/clients` | GET | `/api/connect/clients` |
| `/api/connect/clients/:id` | DELETE | `/api/connect/clients/:id` |
| `/api/connect/clients/:id/audit` | GET | `/api/connect/clients/:id/audit` |
| `/api/connect/authorize/preview` | GET | `/api/connect/authorize/preview` |

### MCP — protocol surface for embedded agents

Path is unchanged; the only change is tier classification (now explicitly a protocol surface, alongside Connect).

| Current path | Method | New path |
|---|---|---|
| `/api/mcp` | POST | `/api/mcp` |
| `/api/mcp` | GET | `/api/mcp` (405 sentinel) |

### System — owner-only admin (auth, OAuth login, settings, stats)

Auth, OAuth login flow, settings, and stats are owner-only control-plane endpoints. They move under `/api/system/` so the structure makes that explicit.

| Current path | Method | New path |
|---|---|---|
| `/api/auth/login` | POST | `/api/system/auth/login` |
| `/api/auth/logout` | POST | `/api/system/auth/logout` |
| `/api/oauth/authorize` | GET | `/api/system/oauth/authorize` |
| `/api/oauth/callback` | GET | `/api/system/oauth/callback` |
| `/api/oauth/refresh` | POST | `/api/system/oauth/refresh` |
| `/api/oauth/token` | GET | `/api/system/oauth/token` |
| `/api/oauth/logout` | POST | `/api/system/oauth/logout` |
| `/api/settings` | GET | `/api/system/settings` |
| `/api/settings` | PUT | `/api/system/settings` |
| `/api/settings` | POST | `/api/system/settings` (reset) |
| `/api/stats` | GET | `/api/system/stats` |

### Outside `/api/` — unchanged

These paths are explicitly NOT moved. See the rationale in [Decision](#decision).

| Current path | Method | New path |
|---|---|---|
| `/raw/*path` | GET | `/raw/*path` |
| `/raw/*path` | PUT | `/raw/*path` |
| `/sqlar/*path` | GET | `/sqlar/*path` |
| `/connect/token` | POST | `/connect/token` |
| `/connect/revoke` | POST | `/connect/revoke` |
| `/.well-known/oauth-authorization-server` | GET | `/.well-known/oauth-authorization-server` |

## Refactor plan

The migration is staged so each step is independently shippable and reviewable.

- **Phase A — Foundation.** ✅ Landed. This ADR is the foundation. No code changes. All subsequent phases reference this document.
- **Phase B — In-repo refactor with aliases.** ✅ Landed. Backend registers handlers at the new paths and keeps the old paths as aliases (same handler, identical behavior). Frontend is migrated to the new paths in the same PR. Aliases stay temporarily so iOS continues to work unchanged.
- **Phase C — iOS migration.** ✅ Landed. The Apple client is updated to call the new paths.
- **Phase D — Remove aliases.** ✅ Landed. Old paths are deleted. The route table contains only the new structure.
- **Phase E — Connect scope widening.** ✅ Landed. The Connect scope-check middleware is extended from `/raw/*` to gate the entire `/api/data/*` subtree, with per-route scope decisions and SSE event filtering by scope. A reference Python client lives at [`examples/connect-python/`](https://github.com/xiaoyuanzhu-com/my-life-db/tree/main/examples/connect-python).
- **Phase F — Final docs.** ✅ Landing. Generated API reference (OpenAPI tags = the six namespaces) and Connect scope reference are regenerated against the final route table.

## Out of scope

- **No URL versioning.** This project does not use `/v1/` / `/v2/` prefixes. Backwards compatibility is handled by the alias window in Phase B/C, not by version negotiation.
- **No touching `/raw/*`, `/sqlar/*`, `/connect/{token,revoke}`, or `/.well-known/*`.** See the "Outside `/api/`" rationale.
- **No splitting `/api/agent/mcp-servers/*`.** This is the agent's tool catalog, deeply tied to the agent runtime. It stays under `/api/agent/`, not under the protocol-surface `/api/mcp/`. The two paths look similar but mean different things: `/api/mcp` is the JSON-RPC endpoint MCP clients call; `/api/agent/mcp-servers/*` is the owner-facing catalog of which MCP servers the agent can use.

## Consequences

- **Handler names do not change.** Every backend handler keeps its current Go function name. Only route registration moves.
- **Frontend and iOS each need a one-time path-rewrite PR.** The shape of requests and responses is unchanged; only the URL prefix differs.
- **Connect middleware can gate `/api/data/*` as a single subgroup.** This was the original motivator for the namespace cut — the `files.read` / `files.write` scopes now correspond to a contiguous URL prefix instead of a scatter.
- **OpenAPI tags = the six namespaces.** Each namespace becomes one rendered section in generated reference docs.
- **New endpoints must land in the right namespace.** Reviewers should reject "where does this go?" PRs that ignore the structure. If a new endpoint genuinely doesn't fit into one of the six namespaces, that is a signal to revisit this ADR — not to add a seventh ad-hoc namespace silently.
- **The Explore REST writes are a forward-looking commitment.** The path shape is locked here; the backend implementation lands in a follow-up. Until then, writes continue to flow through the MCP tools.
