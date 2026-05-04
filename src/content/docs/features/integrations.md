---
title: "Integrations"
---

> Last edit: 2026-05-04

**Integrations** are long-lived credentials you mint inside MyLifeDB so apps that can't speak OAuth — shortcuts, scripts, sync clients, S3-aware tools — can still push data into your instance over a familiar protocol.

Where [Connect](/features/connect/) is the polished door for apps that *can* go through a consent screen, Integrations are the side door for everything else. You decide what gets minted, what folder it touches, and when it stops working.

## When to use Integrations vs Connect

| Use Connect when… | Use Integrations when… |
|--------------------|-----------------------|
| The app supports OAuth 2.1 / PKCE | The app only knows bearer tokens, basic auth, or S3 keys |
| You want a consent screen and per-app audit log | You're wiring up a one-off shortcut, cron job, or sync client |
| The app might want to read *and* write across folders later | One credential per folder, one purpose, is enough |

Both share the same scope vocabulary (`files.read:/path`, `files.write:/path`) and the same path-prefix containment rules — so a credential bound to `/health/apple/raw` cannot escape into `/journal`, the same way a Connect grant can't.

## The three protocol surfaces

Each credential is bound to one protocol when minted. Pick whichever your source app already speaks.

### HTTP webhook

```
Authorization: Bearer whks_…
```

A bearer token you POST/PUT to a MyLifeDB endpoint. Useful for iOS Shortcuts, n8n / Zapier-style automations, or any script with `curl` in reach.

### WebDAV

```
Username: mldav_…
Password: wdvs_…
```

A username/password pair for HTTP basic auth. Mounts as a folder in macOS Finder, Windows Explorer, or any WebDAV-aware sync client (Joplin, Obsidian-WebDAV, Cyberduck).

### S3-compatible

```
Access key id:    mlds3_…
Secret access key: <shown once at mint>
```

A SigV4 access key pair. Drop it into anything that talks to S3 — `aws s3 cp`, rclone, restic, MinIO clients, mobile photo backup apps that target Wasabi/B2/etc. The credential's scope folder appears as the bucket. See [S3 integrations](/features/integrations-s3/) for the protocol-level reference.

## Minting a credential

Open **Settings → Integrations → New** and you'll see:

> **Name**: a human label (e.g. *Apple Health Shortcut*)
> **Protocol**: webhook · WebDAV · S3-compatible
> **Scope**: `files.write` or `files.read` + a folder path
>
> [Create]

After you click Create, MyLifeDB shows the raw secret (and, for WebDAV/S3, the matching public ID) **exactly once**. Copy it into your app immediately — there's no "show again" button. The hash is what's stored; nobody, including you, can recover the original later.

If you lose it, just revoke and mint a new one.

## Scope binding — one folder, one credential

Every credential is pinned to **one** scope at mint time:

- `files.write:/health/apple/raw` — the credential can write anywhere under `/health/apple/raw`, and nothing else
- `files.read:/journal/2026` — read-only, scoped to one year of journal

There is no "all my files" credential. If an app needs two folders, mint two credentials — that way revoking one doesn't blast away the other.

The scope is checked **on every request**. A leaked webhook token aimed at `/health` cannot suddenly start writing to `/notes`.

## Managing & revoking

The Integrations tab shows every active credential with its protocol badge, scope, secret prefix, created time, and last-used time. One click on the trash icon revokes it — the credential is soft-deleted and stops working on the very next request.

Revocation is permanent; the row stays in the audit trail but the secret hash is gone. Rotating a credential is just *revoke + mint new*.

## Trust model — what to know

- **No expiry by default.** Webhook/WebDAV/S3 credentials live until you revoke them. That's appropriate for unattended automations but means you should review the list periodically and prune anything you don't recognize.
- **Last-used is your tripwire.** If a credential's last-used time jumps from "yesterday" to "10 minutes ago" and you didn't trigger anything, treat it as compromised and revoke immediately.
- **Secrets are bcrypt'd at rest.** A read-only copy of the database (a stolen backup, a leaked snapshot) does not leak usable credentials.
- **The prefix on each credential is intentional.** `whks_` vs `wdvs_` vs `mlds3_` makes them obvious in logs, secret scanners, and `git grep` — if one ever leaks into a repo, it's recognizable on sight.

## For app builders

If you're building or wiring up an app, the protocol surfaces themselves are stock. Send `Authorization: Bearer <token>` to the webhook endpoint, mount the WebDAV URL with the issued username/password, or point your S3 client at MyLifeDB's S3 endpoint with the issued access key — same shapes as any other host that speaks those protocols.
