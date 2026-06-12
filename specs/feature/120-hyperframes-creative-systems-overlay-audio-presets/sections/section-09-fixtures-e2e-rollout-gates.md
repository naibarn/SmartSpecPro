# Section 09: Fixtures, E2E, and Rollout Gates

## Goal

Prove Feature 120 works end-to-end before broad rollout: editable text, distinct
presets, safe Thai rendering, audio behavior, playable final output, download
links, Media History discovery, Library save, and Video Editor handoff.

## In Scope

- fixture products and render manifests;
- snapshot evidence for overlay/subtitle preset differences;
- Playwright Storyboard Review and Media History coverage;
- dependency audit and doctor extension;
- production rollout gate evidence;
- canary tenants and candidate to active promotion evidence;
- mobile and desktop browser evidence.

## Out of Scope

- Manual-only QA without automated evidence.
- Broad tenant rollout before gates pass.

## Existing Files To Review

- `apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts`
- `apps/web/test-fixtures/hyperframes/marketplace-hyperframes-fixtures.json`
- `apps/web/scripts/hyperframes-dependency-audit.mjs`
- `apps/web/scripts/hyperframes-doctor.mjs`
- `apps/web/scripts/hyperframes-fixture-render.mjs`
- `apps/web/scripts/hyperframes-snapshot-test.mjs`
- `apps/web/scripts/hyperframes-production-rollout-gate.mjs`
- `apps/web/package.json`
- `specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/reviews/open-question-decision-log.md`

## Test First

Add failing tests or fixture gates for:

- `apps/web/package.json` exposes every release gate script named in `spec.md`
  before rollout evidence is accepted;
- ecommerce toy final composite with native audio;
- electronics spec overlay with product specs and price;
- UGC review subtitle style;
- long Thai text overflow prevention;
- no-audio video with explicit silent policy;
- music/SFX/audio pack event map;
- fallback-only runtime hides or limits producer-only presets;
- completed output has playable `final_video` output ref;
- Media History route includes playable video and download/open action;
- Library save is idempotent;
- Video Editor opens completed MP4;
- route evidence includes product/run-specific media history and library links.
- fixture evidence covers stale price, unsupported user-edited claim,
  productTruthHash mismatch, missing audio license/source, and Thai font fallback
  failure;
- open-question decisions are recorded before enabling SFX packs, music packs,
  karaoke word timing, producer runtime, or HyperFrames Studio/player preview.
- release gates fail when an enabled capability depends on an `Open` row in the
  open-question decision log.
- social variant package rollout remains disabled until fixture and platform
  evidence exist;
- fixture suite includes product-category-aware, electronics/spec, price/deal,
  social proof, classic box, karaoke word highlight, highlight sweep, creator
  pop, cinematic wide, audio clipping, exact duration, mandatory disclosure, and
  remote font rejection cases;
- production gate verifies artifact/output kind compatibility, runtime profile
  diagnostics, staged-manifest validation, no raw enum copy leaks, and retention
  dry-run behavior.
- production gate verifies custom React preview sandbox/trusted-player behavior,
  no raw signed/private URL exposure, no composition API/cookie/localStorage
  access, and thumbnail policy resolution.
- dependency audit and doctor gates fail closed when HyperFrames producer
  packages, FFmpeg/FFprobe, Chrome/Playwright, Thai fonts, storage, temp
  workspace, licenses, runtime image, or worker isolation are not approved.
- Feature 119 base Marketplace HyperFrames behavior is rechecked with Feature
  120 creative flags disabled so rollout cannot regress existing render adapter
  behavior.

## Implementation Notes

Use the existing scripts instead of creating a new gate family. Extend fixtures
and expected evidence to include creative plan, preset manifest, audio report,
and output probe.

Treat `reviews/open-question-decision-log.md` as a rollout input, not just
documentation. Candidate-to-active promotion must verify that the selected
preset does not depend on an unresolved decision row.

## Acceptance Criteria

- `npm --prefix apps/web run e2e:marketplace-hyperframes` passes.
- `npm --prefix apps/web run hyperframes:dependency-audit` passes or reports an
  approved partial state before producer-only presets are active.
- `npm --prefix apps/web run hyperframes:doctor` reports runtime, storage, temp
  workspace, and Thai font readiness before final render rollout.
- `hyperframes:fixture-render` produces valid playable MP4 evidence.
- `hyperframes:snapshot-test` proves preset visual differences.
- `hyperframes:production-rollout-gate` rejects manifest-only completion.
- Existing Feature 119 Marketplace HyperFrames flows still pass with Feature 120
  creative flags disabled.
- Mobile screenshots show no overflow or broken scroll.

## Rollback Notes

Keep gates failing closed. If evidence is missing, rollout remains disabled and
Feature 119 base behavior stays available.
