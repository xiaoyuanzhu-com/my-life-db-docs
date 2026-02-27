# Beta Onboarding Docs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the Get Started section so cloud and self-hosted beta users each have a clean, focused setup guide.

**Architecture:** Three files changed in `src/content/docs/get-started/`. Installation is rewritten for cloud users. A new Self-Hosted page gets the Docker content. Data Collectors keeps its content but updates its sidebar order.

**Tech Stack:** Markdown (Astro Starlight), no code changes.

**Worktree:** `/home/xiaoyuanzhu/my-life-db/data/projects/MyLifeDB/my-life-db-docs/.worktrees/beta-onboarding`

---

### Task 1: Rewrite Installation page for cloud users

**Files:**
- Modify: `src/content/docs/get-started/installation.md` (full rewrite)

**Step 1: Rewrite the file**

Replace the entire contents of `installation.md` with:

```markdown
---
title: "Installation"
sidebar:
  order: 1
---

> Want to run MyLifeDB on your own server? See [Self-Hosted](./self-hosted).

## 1. Create your account

Use the invitation link we sent you to register a 小圆猪 account. This account works across all 小圆猪 services, including MyLifeDB.

## 2. Sign in on the web

Visit your MyLifeDB URL (provided with your invitation) and log in with your 小圆猪 account.

## 3. Install the app

Join the iOS and macOS beta via TestFlight:

**[Join TestFlight →](TBD)**

Available on iPhone, iPad, and Mac. Open the app and sign in with your 小圆猪 account — it connects to the cloud automatically.

## What's next

- **Send something to your Inbox** — text, photo, file, or voice memo.
- **Set up [Data Collectors](./data-collectors)** — bring in Apple Health, Screen Time, calendar events, and more.
- **Try Search** — find anything across all your files.
```

**Step 2: Verify the page builds**

Run from worktree root:
```bash
npm run build
```
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/content/docs/get-started/installation.md
git commit -m "docs: rewrite installation page for cloud beta users"
```

---

### Task 2: Create Self-Hosted page

**Files:**
- Create: `src/content/docs/get-started/self-hosted.md`

**Step 1: Create the file**

Create `src/content/docs/get-started/self-hosted.md` with:

```markdown
---
title: "Self-Hosted"
sidebar:
  order: 2
---

Run MyLifeDB on your own hardware with Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

## Quick Start

1. Create a directory for MyLifeDB and set up the data folders:

\`\`\`bash
mkdir mylifedb && cd mylifedb
mkdir -p data app-data
\`\`\`

2. Create a `docker-compose.yml` file:

\`\`\`yaml
services:
  mylifedb:
    image: ghcr.io/xiaoyuanzhu-com/my-life-db:latest
    container_name: mylifedb
    ports:
      - 12345:12345
    volumes:
      - ./data:/home/xiaoyuanzhu/my-life-db/data
      - ./app-data:/home/xiaoyuanzhu/my-life-db/.my-life-db
    restart: unless-stopped
    environment:
      - USER_DATA_DIR=/home/xiaoyuanzhu/my-life-db/data
      - APP_DATA_DIR=/home/xiaoyuanzhu/my-life-db/.my-life-db
\`\`\`

3. Start MyLifeDB:

\`\`\`bash
docker-compose up -d
\`\`\`

4. Visit [http://localhost:12345](http://localhost:12345).

## Data Directories

MyLifeDB uses two directories:

| Directory | Purpose | Rebuildable? |
|-----------|---------|-------------|
| `data/` | Your files — inbox, notes, journal, etc. | **No** — this is your source of truth |
| `app-data/` | SQLite database, search index, cache | **Yes** — rebuilds automatically from your files |

You can safely delete `app-data/` at any time. MyLifeDB will regenerate it on next startup by scanning your files.

## Permissions

The container runs as UID/GID 1000. If you encounter permission issues with the mounted volumes:

\`\`\`bash
sudo chown -R 1000:1000 ./data ./app-data
\`\`\`

## Configuration

Pass environment variables in your `docker-compose.yml` to configure MyLifeDB:

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 12345 | Server port |
| `USER_DATA_DIR` | ./data | Your files directory |
| `APP_DATA_DIR` | ./.my-life-db | App metadata directory |

### Authentication (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `MLD_AUTH_MODE` | none | `none`, `password`, or `oauth` |
| `MLD_OAUTH_CLIENT_ID` | | OAuth 2.0 client ID |
| `MLD_OAUTH_CLIENT_SECRET` | | OAuth 2.0 client secret |
| `MLD_OAUTH_ISSUER_URL` | | OIDC issuer URL |

### AI Services (optional)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for summarization and tagging |
| `OPENAI_MODEL` | Model to use (default: `gpt-4o-mini`) |

### Search (optional)

| Variable | Description |
|----------|-------------|
| `MEILI_HOST` | Meilisearch URL (e.g., `http://localhost:7700`) |
| `MEILI_API_KEY` | Meilisearch API key |

## Install the App

Join the iOS and macOS beta via TestFlight:

**[Join TestFlight →](TBD)**

Open the app, tap **Self-Hosted** on the login screen, enter your server URL, and sign in.

## Updating

Pull the latest image and restart:

\`\`\`bash
docker-compose pull
docker-compose up -d
\`\`\`

Your data in `data/` is preserved across updates.

## What's next

- **Send something to your Inbox** — text, photo, file, or voice memo.
- **Set up [Data Collectors](./data-collectors)** — bring in Apple Health, Screen Time, calendar events, and more.
- **Try Search** — find anything across all your files.
```

**Step 2: Verify the page builds**

Run from worktree root:
```bash
npm run build
```
Expected: Build succeeds, new Self-Hosted page appears in sidebar under Get Started.

**Step 3: Commit**

```bash
git add src/content/docs/get-started/self-hosted.md
git commit -m "docs: add self-hosted setup guide for beta users"
```

---

### Task 3: Update Data Collectors sidebar order

**Files:**
- Modify: `src/content/docs/get-started/data-collectors.md` (frontmatter only)

**Step 1: Update the frontmatter**

Change `order: 2` to `order: 3` in the frontmatter of `data-collectors.md`:

```yaml
---
title: "Data Collectors"
sidebar:
  order: 3
---
```

**Step 2: Verify the build**

Run from worktree root:
```bash
npm run build
```
Expected: Build succeeds. Sidebar order is now: Installation → Self-Hosted → Data Collectors.

**Step 3: Commit**

```bash
git add src/content/docs/get-started/data-collectors.md
git commit -m "docs: reorder data collectors after self-hosted in sidebar"
```

---

### Task 4: Final verification

**Step 1: Run dev server and visually verify**

```bash
npm run dev
```

Check in browser at `http://localhost:4321`:
- [ ] Sidebar shows: Installation → Self-Hosted → Data Collectors
- [ ] Installation page has cloud setup content and link to Self-Hosted
- [ ] Self-Hosted page has Docker content and TestFlight section
- [ ] Data Collectors page is unchanged
- [ ] All internal links work (Installation ↔ Self-Hosted, both → Data Collectors)

**Step 2: Stop dev server and confirm all commits are clean**

```bash
git log --oneline -5
git status
```

Expected: Three commits on `beta-onboarding-docs` branch, clean working tree.
