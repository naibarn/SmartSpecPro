# Presign Badge

This repo publishes a `presign` badge (Shields endpoint JSON) on the `badges` branch.

## What it represents

A safety heuristic for artifact upload/download presigned URLs based on Control Plane source code:

- Presign TTL (seconds) if detected
- Content-Type enforcement (allowlist + content-type usage)
- Max upload/body bytes if detected

Badge message example:
- `ttl:300s ct:on max:50MB`

> This badge helps catch accidental loosening of presign restrictions (TTL too long, no content-type enforcement, no size limit).
