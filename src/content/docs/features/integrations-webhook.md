---
title: "Webhook integrations"
---

> Last edit: 2026-05-04

The **HTTP webhook** surface is the simplest way to push files into MyLifeDB. You mint a credential, get a URL with a bearer token, and POST/PUT bytes — JSON, an image, a CSV, a multipart form — straight into a folder you scoped at mint time.

It's the surface to reach for when you're wiring up an iOS Shortcut, a cron job, an n8n / Zapier flow, or anything else that already knows how to hit a URL with `curl`.

For the bigger picture (when to pick webhook vs WebDAV vs S3, scope rules, the trust model), see [Integrations](/features/integrations/). This page is the protocol-level reference.

## Enable the webhook surface

Webhook routes are **off by default**. Open **Settings → Me → General**, scroll to **Integration surfaces**, and flip the **HTTP webhook** toggle on, then save.

```
Integration surfaces
  HTTP webhook       [ on ]
  WebDAV             [ off ]
  S3-compatible      [ off ]
  Toggling a surface takes effect immediately.
```

The toggle is checked on every request, so flipping it takes effect immediately — no server restart needed. While the toggle is off, requests to `/webhook/...` get a 404, which is the whole point: a surface you don't use is a surface that isn't exposed.

## Mint a webhook credential

Open **Settings → Me → Integrations → New** and fill in:

> **Name**: a human label (e.g. *Apple Health Shortcut*)
> **Protocol**: HTTP webhook
> **Scope**: `files.write` + `/health/apple/raw` (or whatever folder)
>
> [Create]

After clicking Create you'll see a one-shot reveal panel:

> **Webhook URL** — `https://<your-host>/webhook/<credentialId>/{filename}`
> **Bearer token** — `whks_…` (shown once)

Copy both into your sender app immediately. The bearer token is bcrypt-hashed at rest; nobody, including you, can recover it later. If you lose it, revoke and mint again.

## URL shape

```
POST /webhook/<credentialId>/<subpath>
PUT  /webhook/<credentialId>/<subpath>
```

- `<credentialId>` — the public id from the reveal panel (e.g. `whk_8f2a…`).
- `<subpath>` — the destination path *under your scope folder*. For a credential scoped to `/health/apple/raw`, sending `<subpath>=2026-05-04.json` writes to `/health/apple/raw/2026-05-04.json`.

`subpath` is required for raw-body requests (it names the destination file). Multipart requests may pass an empty subpath — each part lands directly under the scope folder, named by its part filename.

Path safety: the resolved path is run through `path.Clean` and prefix-checked against the scope folder. Any payload whose subpath would escape (`..`, absolute paths, sneaky encodings) is rejected with `403 FORBIDDEN`.

## Two ways to authenticate

Both are equivalent — pick whichever your sender supports.

### Authorization header (preferred)

```
Authorization: Bearer whks_…
```

This is the only auth style for serious automations — it can't accidentally show up in a browser history, server access log, or shared screenshot.

### `?token=` query parameter (fallback)

```
POST /webhook/whk_8f2a…/note.txt?token=whks_…
```

Use this when the sender literally cannot set headers — iOS Shortcuts' "Get Contents of URL" lets you set headers, but other tools (some IFTTT actions, browser-based testbeds) only accept a URL. The token will appear in your server's access log. For anything you care about, prefer the header.

## Examples

All examples assume a credential scoped to `files.write:/health/apple/raw`.

### JSON body (Content-Type-aware)

```bash
curl -X POST \
  -H "Authorization: Bearer whks_…" \
  -H "Content-Type: application/json" \
  --data-binary @today.json \
  https://your-host/webhook/whk_8f2a…/2026-05-04.json
```

The body is written verbatim to `/health/apple/raw/2026-05-04.json`. The `Content-Type` header is preserved as the file's MIME type (the leading type, before any `; charset=…`).

### Binary body (image, audio, anything)

```bash
curl -X PUT \
  -H "Authorization: Bearer whks_…" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg \
  https://your-host/webhook/whk_8f2a…/inbox/photo.jpg
```

Use `PUT` when the sender prefers it — both verbs hit the same handler. Binary requests are capped at **100 MB**; bigger payloads should use [TUS uploads](/features/upload/).

### Multipart form (multiple files in one shot)

```bash
curl -X POST \
  -H "Authorization: Bearer whks_…" \
  -F "morning=@2026-05-04-morning.json" \
  -F "evening=@2026-05-04-evening.json" \
  https://your-host/webhook/whk_8f2a…/
```

Each part lands as one file under `<scopePath>/<subpath>/<filename>`. With an empty subpath, the two files write to `/health/apple/raw/2026-05-04-morning.json` and `/health/apple/raw/2026-05-04-evening.json`.

The part's `filename` (from `Content-Disposition`) names the file. Parts with no filename fall back to the form fieldname. Filenames containing `/` or `\` are rejected — multipart is for batches of flat files, not directory trees.

## Walkthrough — Health Auto Export iOS app

[Health Auto Export](https://www.healthyapps.dev/) is the canonical "iOS app that posts to a webhook" use case: it bundles your Apple Health export into a JSON or CSV and `POST`s it on a schedule.

1. **In MyLifeDB**: enable the webhook surface (Settings → Me → General), then mint a credential — protocol `HTTP webhook`, scope `files.write:/health/apple/raw`. Copy the URL and token.

2. **In Health Auto Export → Automations → New automation**:
   - **Type**: REST API
   - **URL**: paste the webhook URL, replacing `{filename}` with the destination filename (e.g. `apple-health-{date}.json`)
   - **Headers**: add `Authorization: Bearer whks_…`
   - **Frequency**: whatever you like (daily / weekly works well for full exports)
   - **Format**: JSON

3. Trigger the automation manually once. In MyLifeDB you should see the file appear in `/health/apple/raw`, and the credential's **Last used** timestamp updates.

If the upload 404s, double-check that the surface is enabled in Settings (the toggle takes effect on the very next request — no restart needed). If it 401s, the bearer token is wrong — mint a new credential rather than trying to recover the old one. If it 429s, the credential has hit its per-credential rate limit (~60 req/min); the client should slow down and retry.

## Limits and behavior

- **Body cap**: 100 MB per request (raw body or multipart total). Bigger payloads should use TUS uploads, which support resumability and chunked progress.
- **Timeout**: each write has a 10-minute server-side ceiling; sender disconnects abort the in-flight write.
- **Filename inference**: if the sender omits `Content-Type`, MyLifeDB infers a MIME type from the file extension.
- **Last-used + audit**: every successful request stamps the credential's `lastUsedAt` and writes one row to `integration_audit` (credential id, IP, method, path, status, scope family). The audit row outlives credential revocation.
- **Auth failures are opaque**: a missing/invalid/revoked credential always returns the same `401 AUTH_INVALID_TOKEN` shape — a caller can't tell "no such id" from "wrong secret", which is what you want for an enumeration-resistant endpoint.
- **Per-credential rate limit**: each credential is bucketed at ~60 req/min (token bucket, 1/sec refill, burst 60). Bursts above that get `429 TOO_MANY_REQUESTS`. Buckets are in-memory; capped at 10,000 active credentials with oldest-eviction.
