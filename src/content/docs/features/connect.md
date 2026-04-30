---
title: "Connect"
---

> Last edit: 2026-04-30

**MyLifeDB Connect** lets third-party apps act as clients of your MyLifeDB instance — read or write specific folders on your behalf, without ever seeing your password or the rest of your data.

It's OAuth 2.1 (with PKCE), the same flow used by "Sign in with Google" and "Sign in with GitHub", but pointed at your own MyLifeDB instead of a big provider. **You stay in control:** every app must show you a consent screen the first time, and you can revoke its access at any moment.

## How it feels

When an app wants access, you see a consent screen like:

> **Acme Notes** wants permission to:
> - **Read** files in `/journal`
> - **Write** files in `/apps/acme-notes`
>
> [Approve] [Deny]

Approve once, and the app can keep using its access token quietly in the background — bounded to the folders you picked, nothing else.

## What an app can ask for

Apps request **path-keyed scopes**:

| Scope | Meaning |
|-------|---------|
| `files.read:/some/path` | Read any file under `/some/path` |
| `files.write:/some/path` | Write any file under `/some/path` |
| `files.read:/` | Read your **entire** filesystem (shown prominently as broad) |
| `files.write:/` | Write your **entire** filesystem (shown prominently as broad) |

Scopes are **prefix-contained**: granting `files.read:/journal` covers `/journal/2026/...` but not `/notes`. Apps that ask for narrow scopes earn your trust faster than apps that ask for `/`.

## Managing connected apps

Open **Settings → Connected Apps** to see every app that has ever asked for access:

- **Active grants** — what each app currently has permission to do, with last-used timestamps
- **Audit log** — every `/raw/*` request the app made (method, path, allowed/denied)
- **Revoke** — one click invalidates the app's tokens immediately and forgets the grant; the app must re-ask for consent next time

Revocation is durable. Even if the app still holds a refresh token in memory, the next call fails.

## Trust model — what to know

- **No app pre-registration.** Any app can knock on the door. The trust gate is **your consent**, not a vendor-controlled allowlist. You decide who's in.
- **Apps self-declare** their name, icon, and redirect URL. Treat the consent screen with the same scrutiny as any "permission to access" prompt — verify the app is who it says it is before approving.
- **Tokens are short-lived.** Access tokens expire in 1 hour; refresh tokens in 30 days. Apps must renew, which gives you time to notice and revoke unwanted access.
- **Revoking a refresh token kills its whole rotation chain** — replay attacks on stolen tokens auto-revoke the entire grant.

## For app builders

If you're building an app that integrates with MyLifeDB, see the [**Connect API protocol reference**](/docs/internal/api/connect/) — full OAuth 2.1 endpoint specs, PKCE flow, scope semantics, and copy-pasteable client examples.
