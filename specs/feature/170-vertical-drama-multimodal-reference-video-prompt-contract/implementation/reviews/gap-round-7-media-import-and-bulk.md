# Post-implementation gap review 7 — media import and bulk prompt generation

Date: 2026-08-31

Scope: local/Library media import, canonical `media_assets`, mixed reference
resolution, bulk prompt generation, unavailable assets, and error handling.

Findings and actions:

- MUST_FIX: asset import and the Library URL path were image-only even though
  the UI contract accepted video and audio. They now derive and validate the
  actual media type from MIME/type and preserve it in canonical storage.
- MUST_FIX: bulk generation previously caught unresolved references and
  continued with a reduced bundle. It now fails closed when any selected asset
  is missing, not ready, or unsupported, while retaining explicit unavailable
  inspection diagnostics where content inspection is not possible.

Evidence: `mediaAssetService.test.ts` and
`verticalDramaEpisodePipeline.sceneContracts.test.ts`.

Result: no open MUST_FIX findings for this boundary.
