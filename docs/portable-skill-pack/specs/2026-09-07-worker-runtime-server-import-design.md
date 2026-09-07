# Worker Runtime Server-Side Import

## Objective

Allow a system administrator to register a runtime ZIP that already exists on
the SmartAIHub server, without downloading it to a browser machine and
uploading it again.

## Flow

1. The Admin Runtime panel accepts only `version`, `runtimeId`, and `channel`.
2. The server constructs the canonical filename
   `smart-ai-hub-worker-runtime-{runtimeId}-{version}.zip`.
3. The server searches the configured runtime release directory and the normal
   packaged release directories. No client-supplied filesystem path is
   accepted.
4. The existing storage copy, archive validator, manifest/checksum/signature
   checks, and release database insert are reused.
5. The imported release is validated but remains unpublished. The administrator
   must use the existing Publish action after reviewing the checks.

## Configuration

`SMARTAIHUB_RUNTIME_RELEASES_DIR` may point to a release directory or its
parent `releases` directory. Multiple directories are separated by the host
path delimiter. `SMARTAIHUB_PUBLIC_RELEASES_DIR` remains a compatible fallback.

If no variable is set, the server checks the packaged
`client/public/releases/runtime`, `dist/public/releases/runtime`, and
`public/releases/runtime` locations.

## Security and failure behavior

- The import endpoint is system-admin-only and rate-limited with the existing
  runtime release admin router.
- The filename and runtime identity are server-derived; arbitrary paths and
  arbitrary filenames are rejected by construction.
- A missing archive returns an actionable 404 and does not create a database
  record.
- Invalid archives follow the existing validation failure path and cannot be
  published.
- Importing a duplicate version/runtime/channel follows the existing duplicate
  protection and does not overwrite the previous release.
