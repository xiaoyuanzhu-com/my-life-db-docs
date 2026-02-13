---
title: "Installation"
---

MyLifeDB runs as a Docker container. This guide gets you up and running in a few minutes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

## Quick Start

1. Create a directory for MyLifeDB and set up the data folders:

```bash
mkdir mylifedb && cd mylifedb
mkdir -p data app-data
```

2. Create a `docker-compose.yml` file:

```yaml
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
```

3. Start MyLifeDB:

```bash
docker-compose up -d
```

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

```bash
sudo chown -R 1000:1000 ./data ./app-data
```

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

## Updating

Pull the latest image and restart:

```bash
docker-compose pull
docker-compose up -d
```

Your data in `data/` is preserved across updates.
