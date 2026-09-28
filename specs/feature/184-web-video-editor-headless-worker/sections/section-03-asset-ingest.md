# Section 03 — Asset ingest, import migration, and proxy artifacts

## Scope and dependencies

Use Section 01 asset refs and Section 02 project/revision IDs. Convert Worker NLE and legacy Web documents through an explicit preview/commit pipeline and store originals/provenance.

## Tests first

- Add import golden tests for Worker NLE 1.0.0 and legacy Web projects covering clips, tracks, trim/speed/VFR timing, transforms, subtitles, audio, styles, metadata, unknown fields, unsupported fields, and missing/relink assets.
- Test source-hash plus migration-version idempotency, tenant ownership, MIME/size/duration limits, path/symlink/archive traversal and external URL rejection.
- Test authenticated range access/URL refresh and proxy/waveform/thumbnail provenance, source/proxy hashes, timing metadata and dedupe.

## Implementation

Implement migration utilities in `apps/web/client/src/services/projectManager.ts`, `webProjectManager.ts`, `videoEditorService.ts`, and a new pure migration module. Preserve immutable source JSON and a report of converted, unresolved and unsupported fields. Resolve local paths only through explicit user-selected ingest/Worker bridge; canonical documents contain managed refs (`media_asset`, `library_item`, `worker_artifact`) rather than paths or expiring URLs.

Use existing managed-media/R2 services for upload and authenticated range streaming. Submit probe/proxy/analysis operations to Section 04; retain original media as final-render authority. Derived artifact keys include tenant, source hash, profile version and operation. Preserve VFR/source timestamps, rotation/color metadata, audio alignment and playback-rate mapping. Missing assets remain relinkable placeholders and required unsupported fields block final render.

## Acceptance and evidence

Record import report fixtures, range/auth tests, and proxy metadata checks. This section closes AC-01, AC-02, AC-07, AC-11, and the asset portions of AC-13/AC-16.

## Safety and rollback

Import is additive and retryable. Never delete source files or overwrite an existing project on failed conversion. A failed proxy leaves the original and a classified job failure.

## Implementation status

Implemented shared migration projection for Worker NLE `mediaPool`/`tracks` and legacy Web `timeline.tracks` shapes (including explicit millisecond trim/timeline timing, markers, asset references, settings and unresolved/unsupported reporting) plus `apps/web/shared/videoEditorAssetSecurity.ts` with tenant/MIME/path/URL checks for all URI schemes, protocol-relative URLs, control characters and absolute/home-relative paths. Managed R2 ingest, proxy execution, and authenticated range integration remain gated on the existing storage runtime.

## UI/UX Contract
### Target User / JTBD
Creator needs to import media and fix missing links without data loss.
### Surface Inventory
Import preview, mapping report, relink picker, proxy progress/error.
### Component Map
Browser import UI calls migration service; server owns managed asset access.
### State Matrix
Preview, uploading, unresolved, unsupported, relinked, proxying, ready, failed.
### Responsive Matrix
Desktop supports full mapping; tablet supports review; mobile supports status/relink.
### Accessibility Acceptance
Reports use headings, labelled inputs, focus return, and progress announcements.
### Copy Contract
Explain every unresolved/unsupported field in Thai with stable error code.
### Browser Evidence Required
Authenticated Playwright import/relink and jsdom error-state checks.
