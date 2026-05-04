---
title: "WebDAV integrations"
---

> Last edit: 2026-05-04

The **WebDAV** surface turns a folder of MyLifeDB into a remote disk that any sync client can mount — Finder on macOS, the Files app on iOS, Cyberduck, Obsidian Remotely Save, rclone, and so on. Read, write, list, move, copy, lock, all over standard HTTP.

It's the surface to reach for when an app expects to *manage* files (not just dump them), or when you want a folder of MyLifeDB to behave like a network drive your editor or backup tool can speak to natively.

For the bigger picture (when to pick webhook vs WebDAV vs S3, scope rules, the trust model), see [Integrations](/features/integrations/). This page is the protocol-level reference.

## Enable the WebDAV surface

WebDAV routes are **off by default**. Open **Settings → Me → General**, scroll to **Integration surfaces**, flip the **WebDAV** toggle on, then save.

```
Integration surfaces
  HTTP webhook       [ off ]
  WebDAV             [ on  ]
  S3-compatible      [ off ]
  ⚠ Toggling a surface requires a server restart to take effect.
```

In v1 the toggle is read once at startup, so a server restart is required after flipping it. Until you restart, requests to `/webdav/...` get a 404 — which is the whole point: a surface you don't use is a surface that isn't exposed.

## Mint a WebDAV credential

Open **Settings → Me → Integrations → New** and fill in:

> **Name**: a human label (e.g. *iPad Obsidian*)
> **Protocol**: WebDAV
> **Scope**: `files.write` + `/notes` (or whatever folder)
>
> [Create]

After clicking Create you'll see a one-shot reveal panel:

> **Mount URL** — `https://<your-host>/webdav/`
> **Username** — `mldav_…`
> **Password** — `wdvs_…` (shown once)

Copy all three into your sync client immediately. The password is bcrypt-hashed at rest; nobody, including you, can recover it later. If you lose it, revoke and mint again.

## URL shape

```
<any WebDAV verb>  /webdav/<subpath>
```

- The mount URL is always `https://<your-host>/webdav/` — no per-credential path in the URL. The credential's scope folder *becomes* the root your client sees.
- `<subpath>` is everything *under* the scope folder. A credential scoped to `/notes` mounted at `/webdav/` will see `/webdav/2026/today.md` map to the on-disk file at `<USER_DATA_DIR>/notes/2026/today.md`.

The chroot is enforced at the filesystem layer (`webdav.Dir(scopePath)`) — the WebDAV implementation literally cannot see files outside the scope. `..` segments and absolute-path tricks are resolved before they ever reach disk.

## Verbs

The full WebDAV verb set is supported:

| Verb       | Action                            | Scope required |
|------------|-----------------------------------|----------------|
| `OPTIONS`  | Capability discovery              | `files.read`   |
| `GET`      | Download a file                   | `files.read`   |
| `HEAD`     | Metadata for a file               | `files.read`   |
| `PROPFIND` | List a directory / read props     | `files.read`   |
| `PUT`      | Upload / overwrite a file         | `files.write`  |
| `DELETE`   | Remove a file or directory        | `files.write`  |
| `MKCOL`    | Create a directory                | `files.write`  |
| `MOVE`     | Rename / relocate                 | `files.write`  |
| `COPY`     | Duplicate                         | `files.write`  |
| `PROPPATCH`| Set / remove props                | `files.write`  |
| `LOCK`     | Take an exclusive write lock      | `files.write`  |
| `UNLOCK`   | Release a lock                    | `files.write`  |

A read-only credential (`files.read:/p`) accepts the four read verbs and rejects every write verb with **403 Forbidden** before the request reaches the WebDAV layer. There is no partial-success semantics — a `MOVE` from a read-only credential 403s outright.

Locks are stored in-process (`webdav.NewMemLS()` under the hood). They're URL-keyed and shared across all WebDAV credentials, so two clients pointing at the same path coordinate correctly. They do **not** survive a server restart — clients that LOCK then crash will see their locks vanish on next boot.

## Auth — HTTP Basic

```
Authorization: Basic base64(username:password)
```

Username is the credential's `mldav_…` public id; password is the `wdvs_…` secret. Every sync client knows how to do this — you'll typically just paste them into a "Username" and "Password" field.

A failed auth (missing header, unknown username, wrong password, revoked credential) returns a single-shape **401 Unauthorized** with `WWW-Authenticate: Basic realm="MyLifeDB"` and an empty body. The empty body is intentional: Finder and some other macOS clients refuse to prompt for credentials when the server includes a body in the 401.

## Client setup

### macOS Finder

1. **Finder → Go → Connect to Server** (`⌘K`).
2. Enter `https://<your-host>/webdav/` as the server address.
3. Click **Connect**. You'll be prompted for **Name** (the username from the reveal panel, `mldav_…`) and **Password** (the `wdvs_…` secret).
4. Tick **Remember this password in my keychain** if you want it saved.
5. The mount appears in the Finder sidebar. macOS aggressively caches PROPFIND responses — if you make a change from another client, expect a ~30s lag before Finder notices.

If Finder rejects the credential without prompting twice, the most common cause is HTTP — recent macOS versions require HTTPS for WebDAV mounts on physical devices.

### iOS Files

1. Open the **Files** app.
2. Tap **Browse**, then the **⋯** menu in the top-right.
3. Tap **Connect to Server**.
4. Enter `https://<your-host>/webdav/` as the server.
5. Tap **Next**, choose **Registered User**, and enter the username + password from the reveal panel.
6. The mount appears under **Shared** in the Browse tab.

iOS Files requires HTTPS in practice — HTTP mounts work in the simulator but fail on a real device. Terminate TLS via your reverse proxy (Cloudflare Tunnel, Caddy, nginx, Tailscale Funnel, etc.).

### Obsidian Remotely Save

1. Install [Remotely Save](https://github.com/remotely-save/remotely-save) via Obsidian's Community Plugins.
2. Open **Settings → Remotely Save**.
3. **Choose service**: **WebDAV**.
4. **Server address**: `https://<your-host>/webdav/`.
5. **Username**: the `mldav_…` value.
6. **Password**: the `wdvs_…` value.
7. **Authentication type**: **basic**.
8. Tap **Check connectivity**. You should see a green check.
9. Configure sync direction (bidirectional is the typical Obsidian setup) and a sync interval, then tap **Sync** to round-trip your vault.

This is the canonical "editor as a remote-backed app" use case — the credential is typically scoped to `files.write:/notes` (or whatever folder you keep your vault in).

### Cyberduck

1. **File → Open Connection** (`⌘O`).
2. Choose **WebDAV (HTTPS)** from the protocol dropdown.
3. **Server**: `<your-host>` (host only, no scheme or path).
4. **Port**: 443 (or whatever your reverse proxy listens on).
5. **Path**: `/webdav/` (note the trailing slash).
6. **Username** / **Password**: the values from the reveal panel.
7. Click **Connect**. Drag-and-drop into the Cyberduck window to upload, double-click to download.

For HTTP-only setups (LAN, Tailscale), pick **WebDAV (HTTP)** instead.

## Limits and behavior

- **Body cap**: 1 GB per request. Bigger files should use [TUS uploads](/features/upload/) or the [S3 surface](/features/integrations-s3/) (multipart support, when shipped).
- **Last-used + audit**: every successful request stamps the credential's `lastUsedAt` and writes one row to `integration_audit` (credential id, IP, method, path, status, scope family). The audit row outlives credential revocation.
- **Auth failures are opaque**: a missing/invalid/revoked credential always returns the same `401 + WWW-Authenticate` shape — a caller can't tell "no such username" from "wrong password", which is what you want for an enumeration-resistant endpoint.
- **Read-only credentials reject writes**: a credential minted with `files.read:/p` accepts `OPTIONS/GET/HEAD/PROPFIND` and 403s every other verb before the request reaches the filesystem. The chroot still applies — a read-only credential can only read inside its scope folder.
