# Section 01 — Worker URL Resolution

## Ownership

`apps/web/server/services/verticalDramaRemotionRender.ts` only.

## Work

- Reuse the injected `resolveWorkerAssetUrls` dependency and default it to `resolveExternalMediaReferenceUrls`.
- Resolve all managed worker asset URLs in stable order after server-side staging.
- Apply the result to assembly and production templates/manifests.
- Fail closed before queueing when resolution is unavailable or incomplete.

## Acceptance

- No managed `/api/storage/files/*` URL remains in a worker-facing template or manifest for the covered inputs.
- Public URLs are preserved.
- Hashes remain those of server-staged bytes.

## Risk

Ordering mistakes can pair one asset's hash with another URL. Use explicit index maps and tests for each asset category.
