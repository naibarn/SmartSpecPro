# Worker Runtime Admin Publish UI

## Approved product decisions

- Publishing is restricted to system `admin` users.
- Admin uploads an already-built and signed runtime ZIP; the web UI does not accept or store a private signing key.
- Runtime artifacts are uploaded separately by target runtime, but share a release version and channel.
- Partial releases are allowed: Windows/WSL2 may be current while macOS arm64 remains pending.
- macOS is shown as unavailable until a valid native artifact is uploaded.

## Design

Extend the existing Admin Desktop Release console with a Worker Runtime section rather than creating a second release system. The section uses the existing authenticated admin route and storage upload pattern, while keeping runtime records and validation rules separate from installer records. A durable runtime release catalog stores one artifact per runtime id/version/channel, its storage key, checksum, parsed manifest, validation result, publication state, and actor timestamps.

The admin flow is intentionally one page: choose version/channel/runtime target, select ZIP, upload, wait for server validation, inspect the checklist, then publish. The Publish action is disabled unless the server validates the archive, manifest, platform, required HyperFrames files, Whisper.cpp `large-v3`, checksum, signature, and filename/version relationship. Publishing a new artifact never deletes the previous one. The latest published artifact is resolved independently for each runtime id, so partial releases are safe.

The Worker App manifest endpoint reads the durable catalog first and retains the existing filesystem fallback for legacy releases during migration. It returns a clear `not_available` response when that platform has no published artifact. The existing Worker App Runtime & agents update/repair button consumes the same endpoint.

## Security and policy

All runtime upload, validate, publish, withdraw, and rollback operations require `admin`; `domain_admin` and normal users receive 403. ZIP paths are normalized and validated inside a bounded temporary directory. The server never exposes a signing private key. A configured public-key fingerprint is managed from the same Runtime section: the Admin may upload a public-key file or paste its contents. The API normalizes and accepts only an Ed25519 public key, rejects private-key material, and stores the public key plus fingerprint in the existing `system_settings` table with `isSensitive=false`. Key replacements retain a bounded public-only history for rotation audit; no private key is generated, uploaded, or stored by the application. Upload validation still rejects placeholder signatures and invalid signed metadata. Published downloads remain public only through the existing runtime download contract, while unpublished artifacts remain admin-only.

## Failure behavior

- Upload or validation failure keeps the artifact unpublished and shows actionable checklist errors.
- Duplicate version/runtime/channel is rejected unless the admin explicitly withdraws the old artifact first.
- Missing macOS artifact is a normal Pending state, not a release failure.
- Storage/database failure does not change publication state.
- If no current artifact exists for a runtime id, Worker App pauses render and points to Runtime & agents.

## Acceptance

1. Admin can upload and publish a valid Windows/WSL2 runtime from UI.
2. Invalid, incomplete, unsigned, placeholder-signed, or mismatched archives cannot be published.
3. macOS remains Pending without blocking Windows.
4. Non-admin users cannot read unpublished runtime metadata or mutate releases.
5. Worker App update/repair resolves the published version and repair path without env editing.
6. Existing desktop installer release flows remain unchanged.
7. Admin can open an in-page key-generation guide, upload or paste an Ed25519 public key, and see its active fingerprint without editing env values.
