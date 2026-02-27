# Beta Onboarding Documentation — Design

**Date:** 2026-02-27
**Scope:** Rewrite the Get Started section to support beta user onboarding for both cloud and self-hosted users.

## Context

MyLifeDB is preparing for a closed beta via TestFlight. Beta users fall into two groups:

- **Cloud users** — we provision their instance; they receive an invitation link to create a 小圆猪 account and sign in.
- **Self-hosted users** — they run MyLifeDB via Docker on their own hardware.

The existing Installation page only covers self-hosted Docker setup. There is no documentation for the iOS/macOS client, the cloud path, or the 小圆猪 account system.

## Decision: Separate pages per user type

Cloud and self-hosted users have different setups and different technical backgrounds. A single page trying to serve both adds noise for each group. Two focused pages — each readable top-to-bottom without skipping sections — is cleaner.

## Get Started section (3 pages)

### 1. Installation (cloud users — order: 1)

**Audience:** Non-technical or lightly technical users who want the simplest path.

**Top of page:** A one-line link to Self-Hosted for users who want to run their own server.

**Content outline:**

1. **Create your account**
   - Use the invitation link we sent you to register a 小圆猪 account.
   - This account works across all 小圆猪 services, including MyLifeDB.

2. **Sign in on the web**
   - Visit your MyLifeDB URL (provided with your invitation).
   - Log in with your 小圆猪 account.

3. **Install the iOS / macOS app**
   - Join the beta via TestFlight: [link TBD].
   - Available on iPhone, iPad, and Mac.
   - Open the app and sign in with your 小圆猪 account — it connects to the cloud automatically.

4. **What's next**
   - Send your first message to the Inbox — text, photo, file, or voice.
   - Set up Data Collectors to bring in Apple Health, Screen Time, and more.
   - Try Search to find anything across your files.

### 2. Self-Hosted (order: 2)

**Audience:** Technical users who want to run MyLifeDB on their own hardware.

**Content outline:**

1. **Prerequisites**
   - Docker and Docker Compose.

2. **Quick start**
   - Create directory structure.
   - docker-compose.yml template (existing content, preserved as-is).
   - `docker-compose up -d`.
   - Visit `http://localhost:12345`.

3. **Data directories**
   - Table: `data/` (your files, not rebuildable) vs `app-data/` (SQLite/cache, rebuildable).

4. **Permissions**
   - UID/GID 1000 note and chown command.

5. **Configuration**
   - Environment variable tables: Core, Authentication, AI Services, Search.
   - Kept from existing page, no changes.

6. **Install the iOS / macOS app**
   - Join the beta via TestFlight: [link TBD].
   - Open the app → tap "Self-Hosted" on the login screen → enter your server URL → sign in.

7. **Updating**
   - `docker-compose pull && docker-compose up -d`.

8. **What's next**
   - Same pointers as the cloud page.

### 3. Data Collectors (order: 3)

**No changes.** Existing page is comprehensive and well-structured. Reorder from 2 to 3.

## Features section

**No changes.** Inbox and Claude Code pages remain as-is.

## Sidebar configuration

No changes to `astro.config.mjs` needed — the Get Started section uses `autogenerate` from the `get-started` directory, and ordering is controlled by frontmatter `sidebar.order`.

## Files changed

| Action | File |
|--------|------|
| **Rewrite** | `src/content/docs/get-started/installation.md` — Cloud-only setup |
| **Create** | `src/content/docs/get-started/self-hosted.md` — Self-hosted Docker setup |
| **Update** | `src/content/docs/get-started/data-collectors.md` — Change order from 2 to 3 |

## Open items

- TestFlight invitation link (TBD — to be filled in when available).
- 小圆猪 account registration URL / invitation link format (TBD).
- Cloud instance URL format (e.g., `username.mylifedb.com` or a shared domain with user routing).
