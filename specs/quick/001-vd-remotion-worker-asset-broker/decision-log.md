# Decision Log

## Chosen approach

Reuse the canonical `resolveExternalMediaReferenceUrls` broker resolver at every Remotion worker payload boundary. Resolve the URLs after server-side staging has produced the byte hashes, then use the broker URLs consistently in the Remotion template and `assetManifest`.

## Rejected alternatives

- Patch only the UI retry: leaves queued jobs broken and does not fix the source contract.
- Make `/api/storage/files/*` unauthenticated: violates tenant isolation and changes a shared security boundary.
- Re-download or re-hash broker URLs: unnecessary and could make hashes differ from the server-side staged bytes.

## Scope choice

Standard quick-plan, two implementation sections: assembly payloads and production payloads, with regression coverage in the existing Remotion service test file.
