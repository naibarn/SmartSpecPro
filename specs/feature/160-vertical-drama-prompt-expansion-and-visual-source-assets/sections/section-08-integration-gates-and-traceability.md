# Section 08 — Integration Gates and Traceability

## Objective

Connect feature flags, operational quality gates, security/telemetry/recovery, full focused proof, browser evidence, traceability, and the final five-round gap audit.

## Dependencies

- Sections 01–07.

## Ownership

- Extend existing feature-flag registry/helpers with verticalDramaSourceVideoFootage, verticalDramaNewsReportProfile, and verticalDramaVisualCanonPropagation.
- Extend verticalDramaStoryGenerationTelemetry.ts, quality criteria/QC services, and run validation reports with source admission, snapshot, draft alignment, story alignment, start-frame boundary, B-roll readiness, and news publish readiness gates.
- Add redacted audit/telemetry serializers and focused security/recovery/flag tests.
- Add implementation/ui-browser-evidence.md and implementation/feature160-traceability.md.

## Security and operations

Fail closed on missing tenant/user identity. Verify series/episode/pack/asset/segment ownership in scoped queries. Validate MIME/size/path, storage readiness, finite timecodes, rights/disclosure, and source revisions. Never log raw URLs, signed URLs, private transcripts, EXIF, raw provider payloads, or full claim page bodies.

Bound research source count, analysis frames, transcript length, upload size, segment count, B-roll duration, and generation batch size. Preview/upload registration/binding/assembly do not create generation charges; generation uses the existing idempotent credit ledger. Provider/search/metadata/assembly failures remain recoverable and cannot create verified evidence.

Quality gates emit stable machine-readable code/severity/status/fingerprint fields and user-actionable messages. A correction, rights change, storage loss, segment revision, or snapshot mismatch creates stale/blocking findings and prevents final publish/assembly until reconciled.

## Tests-first requirements

- Flag-off and every flag combination preserve current behavior.
- Missing tenant, cross-tenant media, unsafe MIME/path/timecode, raw provider URL, signed URL leakage, and private metadata are rejected/redacted.
- Gate findings are stable and appear at the correct stage.
- Retry/cancel/provider/search/metadata/partial-assembly recovery is idempotent and recoverable.
- Credit ledger is not charged for preview/upload/bind/assemble and generation tasks are idempotent.
- Run focused server/client, schema, and existing Vertical Drama regressions.
- Run typecheck and relevant Playwright suites; separate baseline failures.

## Traceability matrix

Create implementation/feature160-traceability.md with one row per requirement/acceptance family from spec.md:

| Requirement family | Code | Test | Browser/ops evidence | Status |
|---|---|---|---|---|
| prompt dialog/CAS/research | exact file/symbol | focused tests | dialog evidence | pending until verified |
| visual modality/origin/role | exact contract/service | pure/schema tests | source-card evidence | pending until verified |
| snapshot propagation | exact generation paths | propagation tests | run/QC evidence | pending until verified |
| news evidence/correction | exact service/router/UI | Nan fixture tests | news evidence | pending until verified |
| footage/B-roll assembly | exact binding/assembly paths | timeline tests | footage/assembly evidence | pending until verified |
| security/flags/recovery | exact gate/flag paths | negative/recovery tests | telemetry/rollout notes | pending until verified |

Replace pending with pass/fail/skipped and evidence paths during implementation. A row without code, focused test, and applicable browser/operational proof is a blocking gap.

## Five-round final gap audit

After all code/tests, perform and record five independent passes:

1. Contract/data: every spec field, schema, default, FK, index, revision, fingerprint, migration, legacy behavior.
2. API/flow: preview→apply→source→snapshot→draft/full/deep/retry/resume→start-frame/reference/B-roll/assembly propagation.
3. Media semantics/assembly: image versus video, scene anchor versus reference, exact segment/audio/fit/labels, storage/rights/stale/overflow.
4. News/security: profile, claim ledger, source/as-of/freshness, correction cascade, AI disclosure, tenant/auth/telemetry/credit safety.
5. UX/tests/rollout: all state/responsive/accessibility/copy/browser evidence, flags, recovery, traceability, focused/full tests.

Write each pass into implementation/gap-review-round-N.md with findings, fixes, verification commands, and residual risk. Do not close the feature while a high-confidence gap remains.

## Acceptance

- All eight sections pass cross-section interface review.
- Traceability matrix has no unverified required row.
- Browser evidence is honest about skipped checks.
- Five gap-review files exist and show no unresolved high-confidence gap.
- Final focused tests/typecheck/browser evidence are recorded; baseline failures are clearly separated.

## UI/UX Contract

### Target User / JTBD
N/A — this section coordinates verification and traceability; user-facing surfaces are owned by section 07 and the feature sections.

### Existing Pattern Reference
N/A — no new user interaction is introduced.

### Surface Inventory
N/A — implementation evidence and gate artifacts only.

### Component Map
N/A — no browser component is owned here.

### State Matrix
N/A — gate states are verified through the feature UI sections and browser evidence.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — no direct control is introduced here.

### Copy Contract
N/A — gate copy is covered by owning feature sections.

### Browser Evidence Required
N/A — this section records the evidence generated by section 07 rather than adding a new surface.

## Implementation record

- Completed five documented gap-review rounds in `implementation/gap-review-round-1.md` through `gap-review-round-5.md`.
- Added `implementation/feature160-traceability.md` mapping prompt, source, news, snapshot, B-roll, UI, browser, migration, and deployment requirements to code/proof status.
- Final focused test set: 4 files, 18 tests passed.
- Spec validators: 8/8 sections complete; UI contract checker passed; `git diff --check` passed.
- Whole-workspace typecheck remains baseline-red only at unrelated pre-existing `verticalDramaEpisodes.ts` implicit-any lines; no Feature 160-specific diagnostics remain in the filtered run.
- Browser, live database migration, provider generation, and deployment checks are explicitly skipped and never represented as passed.
