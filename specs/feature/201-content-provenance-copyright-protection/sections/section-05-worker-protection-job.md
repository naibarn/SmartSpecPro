# Section 05 — Canonical worker protection job

Add `content_protection` job contract and safe progress/result shapes to the
existing worker control plane. The payload must contain the protection record,
final storage key, modality, effective user choice, provider/version, and
compound envelope. It must not contain provider credentials or raw codewords.

Add the desktop Worker operation path and capability advertisement only where
the configured provider is available. Emit ordered stages: validate, stage inputs, create digital
watermark, self-verify, fingerprint/C2PA, QC, and publish artifact. Verify the
output bytes/hash before persistence. Retry only bounded transient storage or
provider errors; stale, unsupported, and invalid-contract errors are terminal.

Tests first: contract validation, progress ordering, retry classification,
output hash, stale fencing, and Rust/TypeScript secret redaction.

## Implementation record

- Added the strict TypeScript job contract, ordered seven-stage progress
  sequence, bounded retry classification, and secret/raw-byte redaction.
- Added the canonical Node executor and registered the job with the existing
  control plane. The executor records a protected worker artifact first; the
  terminal reconciler alone transitions the asset to `PROTECTED`.
- Added the Rust dedicated capability lane with explicit provider-command
  readiness, source/output hash checks, self-verification, and image/video/
  audio dispatch. No watermark algorithm or provider secret is shipped in the
  repository.
- Focused TypeScript worker/registry tests and three Rust content-protection
  tests pass.
