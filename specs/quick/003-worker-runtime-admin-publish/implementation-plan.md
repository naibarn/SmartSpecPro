# Implementation plan

## Objective

Add a durable, admin-only, UI-driven Worker Runtime upload/validate/publish catalog and connect it to the existing Worker App update/repair flow without environment editing.

## Work areas

1. Shared contracts and persistence: add runtime artifact/release types, validation result shape, and a dedicated catalog table/service with storage key, manifest JSON, checks, publication state, and actor timestamps.
2. Runtime API: add admin catalog/upload-presign/finalize/publish/withdraw endpoints. Validate ZIPs in a bounded temporary workspace, including exact runtime id/version, required files, Whisper.cpp/large-v3 paths and hashes, checksum/signature presence, and placeholder/mock rejection.
3. Runtime manifest/download integration: resolve latest published durable artifact per runtime id/channel, preserve legacy filesystem fallback, and return explicit unavailable reasons.
4. Admin UI: add a Worker Runtime panel to Admin Desktop Host with platform cards, upload form, validation checklist, publish/withdraw actions, loading/error/success states, and Thai/English copy. Only `admin` can see mutations.
5. Worker App: align endpoint error copy and Update/repair behavior with durable catalog and partial platform semantics; preserve render fail-closed behavior.

## Data and storage

Use a dedicated `worker_runtime_releases` table created through the existing schema bootstrap convention or the repository's migration path if available. Key fields: version, runtimeId, channel, fileName, contentType, storageKey, size, archive SHA-256, parsed manifest JSON, validation JSON, isPublished, publishedAt, withdrawnAt, uploadedBy, timestamps. Add indexes for runtimeId/channel/published/version and a uniqueness guard for storage key and active runtime/version/channel.

Use presigned storage upload for large ZIPs. Finalize must verify the storage key prefix, independently stream the stored object to compute its server-side size/hash, download to a bounded temporary file for ZIP inspection, and delete temporary files on every path. Client-provided size/hash are hints only. Require the generated runtime filename pattern and exact manifest runtimeId/version match. Persist only after validation; publish is a separate mutation.

## Authorization and safety

Use authenticated session identity and require role `admin` in every runtime mutation and unpublished catalog endpoint. Public manifest/download resolution may expose only published artifacts from the durable catalog or an explicitly valid legacy fallback. Reject path traversal, unexpected runtime ids, filename mismatches, duplicate active artifacts, incomplete manifests, placeholder signatures, invalid signatures, and archives missing required files. Do not add a private-key form, secret column, or browser-visible signing operation.

## UI/UX contract

- Target user: system admin responsible for release operations.
- Surface: Admin Desktop Host, Worker Runtime section.
- Components: current-runtime cards for Windows/WSL2 and macOS arm64; upload form; validation checklist; release history; action confirmation.
- States: loading, empty/pending, file selected, uploading, validating, valid, invalid, published, withdrawn, storage/API error, unauthorized.
- Responsive: one column on narrow screens; cards and form become two columns at desktop; no horizontal scrolling.
- Accessibility: labels bound to inputs, keyboard-operable buttons, focus-visible states, status announced with `role=status/alert`, color not the sole status signal.
- Copy: concise Thai/English labels; explain “signed ZIP required” and “macOS pending” without exposing infrastructure secrets.
- Browser evidence: route-level admin test plus a browser/screenshot pass for upload checklist, pending macOS, invalid validation, and published Windows states.

## Acceptance criteria

- Valid Windows/WSL2 artifact can be uploaded and published from Admin UI.
- Invalid/placeholder/incomplete artifacts never become public.
- Windows current and macOS pending can coexist in one release version; current resolution is per runtime id so no macOS URL is invented.
- Admin-only enforcement works server-side and in UI.
- Worker App retrieves the published runtime and repair button works; no env edits required.
- Legacy published filesystem artifacts continue to resolve during migration.
- Existing desktop release tests and flows remain green.

## Rollout

Deploy schema/service/API and UI together. Publish the first valid Windows runtime through the new UI. Do not mark macOS current until a native arm64 artifact is uploaded and validated. Keep the old filesystem fallback until the catalog contains the production runtime, then remove only after observed parity.
