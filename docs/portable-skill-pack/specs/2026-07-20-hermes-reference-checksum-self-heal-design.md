# Hermes Reference Checksum Self-Heal

Date: 2026-07-20
Status: Approved for implementation

## Problem

Hermes image jobs correctly attach at most three reference assets, but some
legacy `media_assets` rows contain a stale `checksumSha256`. The Worker
downloads the current image bytes and rejects them because their SHA-256 does
not match the stale checksum frozen into the job contract.

## Evidence

- Worker job `dac7bd91-6dbc-4365-b6e1-aeb5cec4640a` attached three references
  and failed with `HERMES_REFERENCE_DOWNLOAD_FAILED: reference sha256 mismatch`.
- Assets `687`, `655`, and `670` all return HTTP 200 PNG files, while each
  downloaded SHA-256 differs from the cached database value.

## Design

1. Canonicalize legacy managed storage paths before resolving object bytes.
2. Hash the current stored bytes whenever a Hermes reference contract is built.
3. Freeze the freshly computed checksum into the current job.
4. Update `media_assets.checksumSha256` only when it is missing or stale.
5. Keep checksum cache write-back best-effort; the current job still uses the
   verified checksum if the database update fails.
6. Do not change the schema, reference limit, ownership checks, or Worker
   download verification.

## Trade-off

Each Hermes submission reads at most three reference images once on the web
server before queueing. This small bandwidth/latency cost prevents deterministic
Worker failures and repairs stale metadata as affected assets are reused.

## Verification

- Regression test: stale cached checksum is replaced and the current hash is
  used in the job contract.
- Regression test: a matching checksum does not trigger a database write.
- Existing missing-checksum and best-effort write-back tests remain green.
- Live hashes for the affected assets match the next queued contract.
