# Deep Plan Spec Completeness Review Round 2

Date: 2026-06-12

## Review Scope

Compared `spec.md` against:

- `claude-plan.md`
- `claude-plan-tdd.md`
- `sections/index.md`
- all 9 section files

## Result

The plan was broadly complete against the Feature 120 implementation model. It
already covered the major architecture: creative preset registry, Storyboard
Review persistence, runtime APIs, editable preview, composition timeline,
render worker, Library/Media History handoff, observability, cleanup, and
rollout gates.

## Gaps Found And Added

1. Evidence-bound copy needed stronger explicit coverage.
   - Added product truth, ad policy, stale volatile fact, user edit, copy source,
     claim evidence, safe omission, and render-time LLM/web-search prohibition
     requirements.
2. Thai font coverage needed exact family names.
   - Added explicit `Prompt`, `Noto Sans Thai`, `IBM Plex Sans Thai`,
     `Sarabun`, and `Kanit` test/contract requirements.
3. Accessibility and responsive acceptance criteria needed to be promoted from
   general UI wording to test evidence.
   - Added keyboard, accessible names, live-region, reduced-motion, and viewport
     evidence requirements.
4. Audio/SFX asset provenance and behavior needed sharper tests.
   - Added source, license, checksum, SFX trigger/timing, ducking, and volume
     validation requirements.
5. Admin/tenant flag metadata needed explicit coverage.
   - Added Admin Tenant Feature Flags metadata requirement for new creative
     flags.
6. Open questions needed implementation decision gates.
   - Added decision gates for SFX source, music source, karaoke timing,
     producer path, and HyperFrames Studio/player preview.

## Remaining Watch Items

- The plan intentionally does not pick answers for the open questions; it now
  requires decisions before those capabilities are enabled.
- Companion table schema remains deferred until Section 02 proves JSON
  subdocument storage is insufficient.
- HyperFrames upstream runtime details should be rechecked immediately before
  dependency/runtime implementation.

## Verdict

After the additions, the plan is materially aligned with the spec and has the
right guardrails for implementation.

## Round 3 Additions

A deeper keyword and acceptance review found additional coverage that should be
explicit before implementation:

- `social_variant_package` rollout-gated status;
- artifact/output kind compatibility and Feature 119 enum preservation;
- HyperFrames data attributes, `data-volume`, and `window.__timelines`;
- runtime profile hash and Chrome/Playwright, FFmpeg/FFprobe, libass/fontconfig,
  Node, and HyperFrames version diagnostics;
- staged-manifest ownership, MIME, duration/size, checksum, and license/source
  validation;
- no raw enum/status/lifecycle copy leakage;
- retention dry-run skipping active, locked, retry-grace, Library-owned, and
  operator-held artifacts.
- clipped Thai glyph QA, word-level karaoke timing gates, and internal
  `artifactRefs` versus sanitized `outputRefs` handling.

These additions were applied to the plan, TDD plan, and relevant section files.
A traceability matrix was added in `reviews/spec-to-plan-traceability-matrix.md`.

## Round 4 Additions

An acceptance and keyword audit found remaining spec language that was covered
semantically but not explicit enough for implementation handoff. The plan now
also names:

- dependencies, external references, local research, prompt intent, staged
  assets, QA results, and output artifacts;
- commercial product videos, product-category-aware presets, electronics/spec,
  social proof, exact subtitle preset families, and sound effects;
- deterministic preview, preserve native audio, long-term adapter, preset
  lifecycle, historical outputs, agent-authored template generation, future
  HyperFrames Studio, and manifest traceability;
- audio-reactive text, complex masking, safe fallback mode, worker queueing,
  polite live regions, mandatory disclosure, repair action, safe labels,
  operator replay, purge, canary tenants, and candidate to active promotion.

## Round 5 Additions

Security/non-goal and open-question wording was tightened to explicitly cover:

- arbitrary tenant-authored HTML not becoming executable production HTML;
- no manual play/pause/seek audio with JavaScript;
- no SmartSpecPro API calls, cookies, or localStorage from composition/preview
  HTML;
- custom React preview staying inside the trusted-player boundary;
- raw signed URLs and private URLs redaction;
- SFX starter pack and music generation decisions;
- thumbnail policy from platform profile.
- all text escaped and avoid excessive repeated SFX checks.

## Round 6 Additions

A symbol/table coverage audit found that the plan covered preset families, but
did not yet require the exact starter registry ids from the spec. The plan now
adds:

- a section 01 exact starter preset id checklist for all overlay, subtitle,
  music, SFX, and audio pack ids;
- TDD checks that those ids exist exactly once, use the correct category, and
  are not replaced by aliases or family-level placeholders;
- exact exported contract/schema symbol coverage for creative variables,
  manifests, QA results, shot assignments, artifact/output refs, and final
  composite create input/output;
- exact runtime/provenance terms for
  `MARKETPLACE_HYPERFRAMES_RUNTIME_READY`,
  `marketplace_auto_review_runs.storyboardReviewId`, `marketplaceContext`,
  `marketplace_capture_field`, and the Feature 119 render credit idempotency
  key.

## Round 7 Additions

An exact compatibility-name audit found several Feature 119 names and Feature
120 field names that were present in the spec but only described generically in
the plan. The plan now explicitly covers:

- the contract version anchor and copy source enum values;
- Feature 119 capability and flag projection names;
- preserved runtime API procedure names plus the new Storyboard Review state
  API names;
- MVP Storyboard Review JSON state keys and companion-table key shapes;
- HyperFrames timing/preset data attributes and canonical timeline field names;
- outbox payload field names, current artifact kinds, current output kinds, and
  Library finalize metadata fields.

## Round 8 Additions

A final exact-term audit found remaining spec terms that were still only implied
by broader sections. The plan now explicitly covers:

- audio role enum values and deterministic `<audio>` element usage;
- `policyRulePackRef`, `preserveNativeAudio`, `runtimeCapabilityHash`, and
  editable `styleBrief`;
- raw enum leakage checks for `fallback_quality`, `producer_ready`, and
  `smoke_only`;
- platform profile ids `generic_vertical_9_16` and
  `tiktok_reels_shorts_9_16`;
- legacy `HyperframesFinalCompositeConfig.shots[].startSec` stale timeline
  validation;
- `createdAt` and optional `deletedAt` lifecycle fields for promoted storage.

## Round 9 Additions

A release-gate completeness pass found that command names and acceptance
criteria were covered, but rollout ownership should be stricter. The plan now
requires:

- `apps/web/package.json` to expose every release gate script named by the spec;
- dependency audit and doctor gates to fail closed for unapproved producer
  packages, missing FFmpeg/FFprobe, missing Chrome/Playwright readiness, missing
  Thai fonts, invalid licenses, missing temp/storage readiness, runtime image
  mismatch, or worker isolation gaps;
- Feature 119 base Marketplace HyperFrames behavior to be rechecked with Feature
  120 creative flags disabled before rollout evidence is accepted.

## Round 10 Additions

An implementation-readiness pass found that open questions were gated in the
plan but lacked a concrete decision-record artifact. The plan now includes
`reviews/open-question-decision-log.md`, and Section 09 rollout gates must fail
when enabled capabilities depend on an `Open` decision row.
