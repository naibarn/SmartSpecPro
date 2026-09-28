# Vertical Drama Remotion worker asset broker design

## Problem

Vertical Drama Remotion assembly can queue a worker payload containing a public absolute form of `/api/storage/files/*`. That route is intentionally tenant/user protected and returns `404` to a worker without the browser session, causing `asset_stage_failed` during worker asset staging.

## Decision

Resolve managed media references at the server-to-worker payload boundary through the existing tenant-scoped managed download broker. Keep server-side staging and byte hashes unchanged. Use the broker URL in both the Remotion template and the asset manifest so the worker fetches the same authorized URL that the manifest describes.

## Coverage

The contract applies to sub-episode assembly and production episode assembly, including video clips, banner images, dialogue audio, watermark images, and BGM. Preview already follows this contract and remains covered by existing tests.

## Compatibility and safety

- Public external URLs remain unchanged.
- Managed references require the submitting tenant and user.
- The existing provider-only 60-minute JWT/Redis grant and filename extension are retained.
- Storage ACL behavior is unchanged.
- Resolution failure prevents queueing a job that would predictably fail later.

## Render-time guard

- The web composition and the portable `@smartspec/remotion-render` composition
  use the shared `REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS` for `<Img>`,
  `<OffthreadVideo>`, and `<Audio>` delay-render handles, with no per-media
  retry loop. This keeps media waiting within the worker attempt policy and
  prevents an older default media timeout from masking the broker/staging
  result.
- The portable renderer artifact is rebuilt whenever this policy changes; the
  runtime pack must consume the matching package version rather than a stale
  tarball.

## Verification

Focused service tests assert signed URLs in templates and manifests, ordering across asset categories, and fail-closed resolver errors. Composition policy, sidecar staging/rewrite, package typecheck, and runtime artifact checks cover the timeout regression. Browser, real worker, provider, deployment, and production checks remain follow-up evidence.
