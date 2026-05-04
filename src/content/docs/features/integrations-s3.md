---
title: "S3 integrations"
---

> Last edit: 2026-05-04

The **S3-compatible** surface lets any tool that speaks S3 — `rclone`, `restic`, `Duplicati`, `aws s3`, `s3cmd`, `s5cmd`, application SDKs — read and write inside a folder of MyLifeDB as if it were an S3 bucket. SigV4 auth, multipart uploads, range reads, listing, the lot.

It's the surface to reach for when an app expects an S3 endpoint as its only storage option (most backup tools), or when you want to push large multi-gigabyte uploads with the resumability and parallelism that S3 multipart provides.

For the bigger picture (when to pick webhook vs WebDAV vs S3, scope rules, the trust model), see [Integrations](/features/integrations/). This page is the protocol-level reference.

## Enable the S3 surface

S3 routes are **off by default**. Open **Settings → Me → General**, scroll to **Integration surfaces**, flip the **S3-compatible** toggle on, then save.

```
Integration surfaces
  HTTP webhook       [ off ]
  WebDAV             [ off ]
  S3-compatible      [ on  ]
  Toggling a surface takes effect immediately.
```

The toggle is checked on every request, so flipping it takes effect immediately — no server restart needed. While the toggle is off, requests to `/s3/...` get a 404, which is the whole point: a surface you don't use is a surface that isn't exposed.

## Mint an S3 credential

Open **Settings → Me → Integrations → New** and fill in:

> **Name**: a human label (e.g. *restic-backup*)
> **Protocol**: S3
> **Scope**: `files.write` + `/backup` (or whatever folder)
>
> [Create]

After clicking Create you'll see a one-shot reveal panel:

> **Endpoint URL** — `https://<your-host>/s3`
> **Bucket name** — derived from the scope folder (e.g. scope `/backup` → bucket `backup`; `/health/apple/raw` → `health-apple-raw`; `/` → `root`)
> **Access key id** — `mlds3_…`
> **Secret access key** — shown once

Copy all four into your S3 client immediately. The secret is stored as a bcrypt hash; nobody, including you, can recover it later. If you lose it, revoke and mint again.

## URL shape

```
<S3 op>  /s3/<bucket>/<key>?<query>
```

- The endpoint is always `https://<your-host>/s3` — path-style addressing is required (virtual-host style is not supported).
- `<bucket>` must match the credential's derived bucket name. Any other bucket name returns **404 NoSuchBucket** before the request reaches the filesystem.
- `<key>` is the object key *inside* the credential's scope folder. A credential scoped to `/backup` calling `PUT /s3/backup/2026/snapshot.bin` writes to `<USER_DATA_DIR>/backup/2026/snapshot.bin` on disk.
- Region is ignored — clients can send any region (`us-east-1`, `auto`, `mldb`, anything) and SigV4 will still verify because the region is folded into the signing key on both sides.

The chroot is enforced by resolving every key against the scope folder and rejecting `..` segments before the path reaches `fs.Service`. Keys that try to escape the scope return **403 AccessDenied**.

## Operations

The full set of common S3 ops is supported:

| Op                          | Method  | Path / query                              | Scope required |
|-----------------------------|---------|-------------------------------------------|----------------|
| ListBuckets                 | GET     | `/s3`                                     | `files.read`   |
| HeadBucket                  | HEAD    | `/s3/<bucket>`                            | `files.read`   |
| CreateBucket                | PUT     | `/s3/<bucket>`                            | `files.write`  |
| ListObjectsV2               | GET     | `/s3/<bucket>?list-type=2&prefix=…`       | `files.read`   |
| GetObject                   | GET     | `/s3/<bucket>/<key>`                      | `files.read`   |
| HeadObject                  | HEAD    | `/s3/<bucket>/<key>`                      | `files.read`   |
| PutObject                   | PUT     | `/s3/<bucket>/<key>`                      | `files.write`  |
| CopyObject                  | PUT     | `/s3/<bucket>/<key>` + `x-amz-copy-source`| `files.write`  |
| DeleteObject                | DELETE  | `/s3/<bucket>/<key>`                      | `files.write`  |
| CreateMultipartUpload       | POST    | `/s3/<bucket>/<key>?uploads`              | `files.write`  |
| UploadPart                  | PUT     | `/s3/<bucket>/<key>?partNumber=N&uploadId=U` | `files.write` |
| CompleteMultipartUpload     | POST    | `/s3/<bucket>/<key>?uploadId=U`           | `files.write`  |
| AbortMultipartUpload        | DELETE  | `/s3/<bucket>/<key>?uploadId=U`           | `files.write`  |
| ListMultipartUploads        | GET     | `/s3/<bucket>?uploads`                    | `files.read`   |

A read-only credential (`files.read:/p`) accepts the four read ops and rejects every write op with **403 AccessDenied** before the request reaches the filesystem.

`CreateBucket` is a no-op success when the requested name matches the credential's derived bucket; any other name is rejected. There is no way to create additional buckets — one credential, one bucket, by design.

`ListMultipartUploads` always returns an empty list in Phase 3 — multipart upload state is tracked on disk, but the listing endpoint is not yet wired up. Tools that probe it for resumability won't crash, they just won't find anything to resume.

## Auth — SigV4

```
Authorization: AWS4-HMAC-SHA256 Credential=<access-key-id>/<date>/<region>/s3/aws4_request,
               SignedHeaders=…, Signature=…
```

Or a presigned URL with `X-Amz-Algorithm=AWS4-HMAC-SHA256` and the same fields in the query string.

Access key id is the credential's `mlds3_…` public id; the SigV4 signing secret is the credential secret returned at mint time. The server stores only a bcrypt hash, but the SigV4 secret on the wire is the **raw mint-time value** — copy it from the reveal panel and treat it like any other AWS secret access key.

Three SigV4 modes are supported:

- **Header auth + signed body** (`x-amz-content-sha256: <hex>`) — the canonical request includes the body's SHA-256, the server verifies the signature against the drained body. Used by `aws s3`, `s3cmd`.
- **Header auth + UNSIGNED-PAYLOAD** (`x-amz-content-sha256: UNSIGNED-PAYLOAD`) — body is not part of the signature; the server skips drain-and-hash and streams directly. Used by `rclone` for large uploads when configured.
- **Presigned URL** — signature lives entirely in the query string; works for both reads and writes.

**Streaming SigV4** (`STREAMING-AWS4-HMAC-SHA256-PAYLOAD`, where each chunk is signed individually) is **not supported** in Phase 3. If your client defaults to streaming, configure it to use UNSIGNED-PAYLOAD or full-body SigV4 instead — see the rclone section below for the relevant flag.

A failed auth (missing header, unknown access key id, bad signature, expired timestamp, revoked credential, scope mismatch) returns the appropriate `<Code>` in the standard S3 XML error envelope (`InvalidAccessKeyId`, `SignatureDoesNotMatch`, `RequestTimeTooSkewed`, `AccessDenied`, …). The body is always XML so SDKs that parse it for retry logic behave correctly.

## Client setup

### rclone

The most flexible S3 client and the best one to test with.

```ini
# ~/.config/rclone/rclone.conf
[mldb]
type = s3
provider = Other
endpoint = https://<your-host>/s3
access_key_id = mlds3_…
secret_access_key = <secret from reveal panel>
region = mldb
force_path_style = true
chunk_size = 16M
upload_cutoff = 0
```

Two flags that matter:

- `force_path_style = true` — required. The default is virtual-host style (`<bucket>.<host>/<key>`) which MyLifeDB does not handle.
- `upload_cutoff = 0` — forces every upload above 0 bytes through the multipart path, which uses UNSIGNED-PAYLOAD per part. Without this, rclone uses streaming SigV4 for single-shot PUTs above its default cutoff and the request will fail with `SignatureDoesNotMatch`. Equivalent CLI flag: `--s3-upload-cutoff=0`.

Then:

```bash
rclone ls    mldb:backup/
rclone copy  ./snapshot.tar mldb:backup/2026/
rclone sync  ~/notes mldb:backup/notes/
rclone mount mldb:backup /mnt/mldb-backup --vfs-cache-mode writes
```

### restic

restic stores backup repositories on object storage. Use it to back up *into* MyLifeDB, not to back up MyLifeDB to elsewhere.

```bash
export AWS_ACCESS_KEY_ID="mlds3_…"
export AWS_SECRET_ACCESS_KEY="<secret from reveal panel>"
export RESTIC_REPOSITORY="s3:https://<your-host>/s3/backup"
export RESTIC_PASSWORD="<encrypts the repo content>"

restic init
restic backup ~/Documents
restic snapshots
```

The path after the endpoint (`/backup` above) is the bucket name from the reveal panel. restic always uses path-style addressing, so no extra flags are needed.

For large initial snapshots, restic chunks aggressively (typically 4-16 MB pack files) and uses multipart automatically — the on-disk staging dir at `APP_DATA_DIR/.s3-multipart/` will grow during the upload and clear out as each file completes.

### Duplicati

GUI-driven backup tool with an S3 backend.

1. **Add backup → Local folder or drive**, configure source paths.
2. **Storage Type**: **S3-compatible**.
3. **Use SSL**: yes (assuming HTTPS).
4. **Server**: `<your-host>`.
5. **Bucket**: the bucket name from the reveal panel.
6. **Folder path**: optional sub-prefix inside the bucket.
7. **Storage class**: leave default.
8. **AWS Access ID**: the `mlds3_…` value.
9. **AWS Access Key**: the secret from the reveal panel.
10. **Advanced options** → add `s3-ext-forcepathstyle=true`. Also helpful: `s3-server-name=<your-host>`, `s3-location-constraint=` (empty).

Click **Test connection** — you should see a green "OK".

### aws CLI / s3cmd / s5cmd

For one-off operations:

```bash
# aws CLI
aws --endpoint-url https://<your-host>/s3 \
    s3 ls s3://backup/

# s3cmd
s3cmd --host=<your-host> --host-bucket='%(bucket)s.<your-host>' \
      --no-ssl=false --signature-v2=false \
      ls s3://backup/

# s5cmd
s5cmd --endpoint-url https://<your-host>/s3 \
      ls s3://backup/
```

Path-style addressing is required for all three. `aws` and `s5cmd` use it by default once an `--endpoint-url` is set; `s3cmd` needs the `--host-bucket` template above.

Application SDKs (boto3, AWS SDK for Go/Java/JS, etc.) follow the same pattern — pass `endpoint_url` (or its language equivalent), set `force_path_style: true` (or `s3ForcePathStyle: true`), and use the `mlds3_…` / secret pair as the credentials. Region can be anything.

## Limits and behavior

- **Body cap**: 5 GB per individual request. For larger objects, use multipart upload — there's no cap on the *total* object size you can assemble from parts (the part-count cap is the standard S3 10,000).
- **Multipart staging**: parts stage on disk at `APP_DATA_DIR/.s3-multipart/<uploadId>/<NNNNN.bin>` along with a `manifest.json` recording the credential, scope, key, and content-type. `CompleteMultipartUpload` streams the parts into the destination via `io.MultiReader` (no full-object buffering). `AbortMultipartUpload` and a successful `Complete` both delete the staging dir.
- **Startup sweep of stale multipart staging**: on server boot, MyLifeDB walks `APP_DATA_DIR/.s3-multipart/` and removes any upload whose `manifest.json` (or, missing that, the directory itself) is older than 7 days. The sweep is one-shot at boot — multipart uploads only orphan in three rare scenarios (client crash, server kill, deliberate abandon), so a periodic janitor would be wasted background work on a personal server. If you want to clear stale staging dirs sooner than next restart, `rm -rf APP_DATA_DIR/.s3-multipart/` is still safe (no active upload's manifest predates its parts).
- **Per-credential rate limit**: each credential is bucketed at ~60 req/min (token bucket, 1/sec refill, burst 60). Bursts above that get `503 SlowDown` (the standard S3 throttling code) with `Retry-After: 1`. Buckets are in-memory; capped at 10,000 active credentials with oldest-eviction so a key-rotation storm can't pin memory.
- **ETags**: PutObject and GetObject use `sha256(path|size|mtime)` truncated to 32 hex chars — stable across reads, recomputed on writes. Multipart objects use `sha256(concat(part-etags))-N` where N is the part count, mirroring the AWS scheme so backup tools that fingerprint by ETag behave correctly.
- **Range requests**: `GET` honors `Range:` headers (delegated to `http.ServeContent`), so partial downloads, resumes, and seekable backends work.
- **Last-used + audit**: every successful op stamps the credential's `lastUsedAt` and writes one row to `integration_audit` (credential id, IP, method, path, status, scope family). The audit row outlives credential revocation.
- **Auth failures are XML**: every error is the standard S3 `<Error><Code>...</Code><Message>...</Message><Resource>...</Resource></Error>` envelope, so SDK retry logic and tools that parse the body for diagnostics behave correctly.
- **Read-only credentials reject writes**: a credential minted with `files.read:/p` accepts ListBuckets, HeadBucket, ListObjectsV2, GetObject, HeadObject and 403s every write op before the request reaches the filesystem.
