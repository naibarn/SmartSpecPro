# Section 05 — Profile, Source, Visual Context, and Cross-Stage Admission

## Outcome

Implement one server-owned profile/source admission boundary that captures the
current `ProductionContextSnapshot`, evaluates the readiness required by the
requested stage, and passes the admitted snapshot identity to every downstream
artifact. The completed section must cover every profile in
`VD_SERIES_PROFILE_IDS`, preserve source/evidence/rights/disclosure facts exactly,
keep visual roles distinct, validate B-roll and managed-media readiness, and
reject stale or mixed context before model, provider, activation, assembly, or
export work begins.

This is an additive convergence layer. It composes the existing profile registry,
source pack, visual source snapshot, claim/coverage, managed storage, and durable
assurance-attempt authorities. It does not create a second source ledger, infer
ownership from content, let an Agent promote evidence, replace the existing
start-frame lock, or move credit/provider authority into this section.

## Dependencies and ownership boundaries

Section 01 must land first and provide the versioned
`ProductionContextSnapshot`, canonical fingerprint helpers, readiness vocabulary,
stable finding/error codes, and the shared assurance request/result envelope.
Section 02 must provide durable attempt admission, idempotency, event append,
lease/fence handling, and artifact lineage references. This section consumes
those contracts; it must not redefine them locally.

The authoritative inputs remain:

- `apps/web/shared/verticalDramaSeries/seriesProfile.ts`: `VD_SERIES_PROFILE_IDS`,
  `SERIES_PROFILE_REGISTRY`, `getSeriesProfile`, `resolveSeriesProfile`, profile
  versions, content/fact/source-gate/B-roll policies, default slots, and visual
  grounding.
- `apps/web/shared/verticalDramaSeries/formatProfiles.ts`: pacing and format
  policy only. Do not infer source/evidence readiness from a format tier.
- `apps/web/shared/verticalDramaSeries/sourcePack.ts`:
  `evaluateSourcePackReadiness`, source kinds, source-pack statuses, rights and
  disclosure enums, digest, and B-roll manifest contracts.
- `apps/web/shared/verticalDramaSeries/visualSource.ts`: media origin/modality,
  semantic-role, evidence-status, coverage, segment, usage-reference, snapshot,
  and B-roll binding schemas.
- `apps/web/shared/verticalDramaSeries/visualGrounding.ts`, `newsReport.ts`, and
  `qualityPolicy.ts`: profile grounding, news freshness/correction rules, and
  policy findings.
- `apps/web/server/services/verticalDramaSourcePackService.ts`: tenant/user
  scoped source-pack persistence, `getSourcePackReadiness`, draft-readiness
  assertions, rights mutation, stored digest/B-roll manifest, and staged-pack
  attachment.
- `apps/web/server/services/verticalDramaVisualSourceCore.ts`:
  `validateVisualCoverage`, `validateVisualUsageRef`, `validateBrollTimeline`,
  `visualSourceStaleReasons`, and canonical visual-source fingerprinting.
- `apps/web/server/services/verticalDramaVisualSourceSnapshotService.ts`:
  `captureSeriesVisualSourceSnapshot`, `persistVisualSourceSnapshot`,
  `validateSnapshotForRun`, and snapshot drift detection.
- `apps/web/server/services/verticalDramaBrollService.ts`:
  `validateBrollBinding`, `projectBrollTimeline`, and render placement projection.
- Existing managed-storage/media services: tenant ownership, durable object
  existence, playability, and canonical `/api/storage/files/...` identity.
  Provider URLs remain provenance or a bounded fallback and never prove
  production availability.

Add or complete the profile/source orchestration in
`apps/web/server/services/verticalDramaProductionContext.ts`, which Section 01
introduces for snapshot capture and canonical stage-readiness decisions. If a
thin call-site façade is needed, add
`apps/web/server/services/verticalDramaProfileSourceAdmission.ts`; it may only
load authoritative inputs, call the shared validators, and return an admission
decision. It must not persist alternate profile/source facts or perform model,
credit, provider, or activation side effects.

## Admission contract

Every admission request must be server-scoped by `tenantId`, `userId`, series or
staged-draft identity, domain task, required readiness, source artifact
references, expected snapshot revision/fingerprint, and the durable attempt or
idempotency identity from Section 02. Missing tenant or user identity fails
closed. The service must load the series, profile, source pack, assets, segments,
visual canon, claim ledger, coverage plan, and managed objects through
owner-scoped repositories; client or Agent payloads may supply expected IDs but
never authoritative statuses or URLs.

The result must be a typed decision with the admitted snapshot identity,
effective profile policy, achieved and required readiness, findings grouped by
blocking/advisory severity, affected artifact scope, disposition, and one stable
next action. The helper must return the same normalized result shape in legacy,
shadow, and active modes. Callers must not reconstruct readiness from raw
messages or catch a generic exception and proceed.

Use four risk boundaries without making all editing depend on production media:

| Boundary | Required proof | Allowed while proof is incomplete |
| --- | --- | --- |
| Authoring | owner scope, valid profile, schema-valid staged source data | edit/save, source-slot changes, deterministic premise/source preview, navigation |
| `draft_ready` | profile-required slots or explicit `not_applicable`, current draft source snapshot, deterministic coverage/claim findings | story and prompt drafting, non-paid preview, inspection, repair preparation |
| `provider_ready` | current `production_ready` source pack when required, exact roles, usable rights/disclosure, durable managed media, current claims/canon/coverage, no blocking finding | editing and retry preparation; paid submission itself remains owned by Sections 03/07 |
| `production_ready` | all provider-ready proofs plus final B-roll timeline, assembly binding manifest, disclosure, output durability, and current final-gate evidence | inspection and bounded repair; export/publish/assembly activation is blocked |

For a pre-series wizard operation identified only by a tenant-owned
`draftSessionId`, the helper may return authoring or draft readiness against the
staged source pack. It must not manufacture a series snapshot or report
`provider_ready`. `attachStagedSourcePackInTransaction` is the handoff that binds
the proven staged pack to the created series; the canonical series
`ProductionContextSnapshot` must then be captured before any paid provider,
candidate activation, assembly, export, or publish operation.

## Complete thirteen-profile policy matrix

The implementation and fixtures must derive completeness from
`VD_SERIES_PROFILE_IDS`, not from a hand-maintained profile count. The following
thirteen rows are the current required behavior; a registry addition must fail CI
until policy, snapshot, cross-stage, and browser fixtures are added.

| Profile | Source/fact/B-roll policy | Admission requirements |
| --- | --- | --- |
| `drama_romance` | optional source, `fictional_ok`, `reference_only` | Always record the explicit null/optional-source decision when no pack exists. Validate relationship-driven setting/wardrobe, character identity, story contract, visual canon, and continuity; do not introduce an evidence/rights hard block for absent optional source. |
| `horror_thriller` | optional source, `fictional_ok`, `reference_only` | Preserve explicit threat evidence and atmospheric consequence within the fiction canon; reject unmotivated tone/identity/world drift, while keeping source optional. |
| `sci_fi_cyberpunk` | optional source, `fictional_ok`, `reference_only` | Require the approved functional technology mechanic and its constraint/cost in the visual/story canon; decorative styling cannot substitute for the mechanic. Source remains optional. |
| `action_epic` | optional source, `fictional_ok`, `reference_only` | Preserve the physical objective/threat, readable action consequence, cast identity, and shot continuity. Reference media cannot silently become a scene anchor or evidence. |
| `fantasy_fairytale_xianxia` | optional source, `fictional_ok`, `reference_only` | Preserve the approved magic/supernatural mechanic, artifact or realm evidence, and its rule/cost. Source absence is valid; world-rule drift is not. |
| `animation_cartoon` | optional source, `fictional_ok`, `reference_only` | Preserve stylized-world identity and imaginative visual action across prompts and shots. A live-action or unrelated style reference cannot overwrite the approved canon. |
| `documentary` | required source, `required_sources`, `evidence_and_broll` | Require subject/context plus source, interview, or archive evidence; separate observation from claim; cover counterpoint/limitation; and require an explicit reenactment label. An upload alone is not verified evidence. |
| `news_report` | required source, `required_sources`, `evidence_and_broll` | Require scene/current-event evidence, claim-level attribution, `asOf` freshness, impact coverage, correction/retraction cascade, archive/file-footage labels, and strict AI-illustration disclosure. A stale or corrected material claim invalidates every dependent artifact. |
| `location_review` | required source, `required_sources`, `evidence_and_broll` | Require place identity/exterior, interior or spatial detail, route/activity, access/limitation, and explicit separation of map metadata from visual proof. Coordinates alone cannot verify visible conditions. |
| `restaurant_review` | required source, `required_sources`, `evidence_and_broll` | Require venue/sign identity, interior/service flow, menu/price/time scope, dish/detail and atmosphere coverage, opinion/fact separation, and applicable sponsorship/visit disclosure. |
| `product_review` | required source, `required_sources`, `evidence_and_broll`, product-tie-in disclosure | Require exact product identity, material/control or specification evidence, in-use demonstration, result, comparison/limitation, and disclosure. Unsupported performance/specification claims block the affected production path. |
| `software_review` | required source, `required_sources`, `evidence_and_broll`, product-tie-in disclosure | Require exact product/UI/version context, setup/workflow, feature result, platform/responsive evidence, limitation/plan evidence, and stale-screen detection. Old screenshots cannot verify current product or plan claims. |
| `hybrid_docu_drama` | required source, `mixed`, `evidence_and_broll` | Require documentary evidence while keeping observation, dramatized scenes, and reenactment assets in separate roles, labels, prompts, and QC outcomes. Dramatization can illustrate but cannot verify a factual claim. |

The six fiction profiles may share parameterized policy code, but each remains a
separate registry row and focused fixture because its grounding rules differ.
The seven source-required profiles must prove both `draft_ready` and
`production_ready` behavior; a generic fiction snapshot is not acceptable
coverage for them.

## Snapshot capture and authority rules

Build the immutable production snapshot only from server-owned current records.
It must include the profile and policy versions, explicit source-pack policy,
source-pack ID/version/fingerprint/readiness or explicit null decision, slot and
asset IDs, segment IDs and revisions, semantic roles, media modality/origin,
evidence/rights/disclosure statuses, managed-storage object identity/revision,
visual-canon version/fingerprint, and any claim-ledger and coverage-plan
versions/fingerprints. Signed URLs, temporary provider URLs, prompt prose, and
browser-local state must not be fingerprint authority.

Capture follows this order:

1. Resolve the current profile from the registry and reject unknown, inactive,
   or version-incompatible policy.
2. Load the tenant/user-owned attached source pack, or record an explicit null
   source for an optional fiction profile. A required profile with no pack
   becomes `awaiting_action`.
3. Re-evaluate source readiness from current slots/assets rather than trusting a
   stored or client-supplied label. Preserve the stored server-owned statuses in
   the snapshot and surface any disagreement as a finding.
4. Capture or load the current visual-source snapshot and verify all referenced
   assets, segments, coverage IDs, and managed objects still belong to the same
   tenant/series and are not deleted.
5. Include current visual canon, claim ledger, coverage plan, and binding
   metadata, then compute the canonical overall fingerprint defined by Section
   01. Canonical ordering must make equivalent input stable while any material
   profile/source/claim/canon/coverage/binding change changes the fingerprint.
6. Persist the immutable snapshot and link it to the durable assurance attempt
   before external model/provider work. Reusing the same exact fingerprint may
   return an existing immutable snapshot; mutating an existing snapshot is
   forbidden.

An Agent may select only server-issued profile, slot, asset, segment, claim, and
coverage IDs already present in the admitted snapshot. It may propose a role or
repair for review, but the server must reject invented IDs, URLs, facts,
timestamps, evidence status, rights status, or disclosure status.

## Role, evidence, rights, and disclosure invariants

Preserve all current visual roles. `scene_anchor`, `reference`,
`b_roll_still`, and `b_roll_footage` are the production-critical roles;
`graphic` and `text_overlay` remain separate non-substitutable roles in the
registry contract.

- A `scene_anchor` grounds scene composition and the approved start-frame
  flow. A subject portrait or generic reference cannot replace it without the
  existing explicit promotion/lock action and a new snapshot.
- A `reference` grounds identity, product, dish, software UI, material, or prop
  detail. It cannot enter the B-roll timeline or overwrite scene/cast identity
  through implicit conversion.
- A `b_roll_still` is an editorial still with a finite display duration and no
  video trim bounds.
- A `b_roll_footage` is an editorial video segment with exact source asset,
  segment revision, finite in/out bounds, and audio policy.
- A `graphic` or `text_overlay` must follow its own overlay contract and cannot
  satisfy scene, reference, evidence, or B-roll coverage merely because it is
  visible.

Preserve the full evidence vocabulary: `not_applicable`, `illustrative`,
`needs_verification`, `partially_verified`, `verified`, `stale`,
`contradictory`, and `blocked`. Upload, managed storage, model visibility, or
successful generation does not raise evidence status. In particular,
AI-generated material remains `illustrative` unless a separate authoritative
verification process changes the source record; neither an Agent nor a
downstream prompt may promote it.

Preserve rights states `pending`, `creator_owned`, `licensed`, `restricted`, and
`rejected`, plus disclosure states `not_required`, `required`, and `shown`.
`pending` and `rejected` cannot satisfy paid production or export. `restricted`
must be evaluated against the exact requested use and fails closed when that
use is not proven. `creator_owned` or `licensed` passes only when the intended
use and any required disclosure are compatible. A required disclosure must be
bound to the resulting prompt/assembly/export manifest and be `shown` before
the final production boundary.

Client and Agent requests may not overwrite any of these statuses. Status
changes continue through their current owner-scoped source service and create a
new source/snapshot revision so running and completed attempts can be fenced or
re-evaluated.

## B-roll and managed-media admission

Extend the existing pure B-roll/visual validators rather than creating a
parallel timeline model. Admission must verify the binding against the exact
snapshot revision/fingerprint and source segment revision, then check:

- role and modality match, including still duration versus footage trim rules;
- tenant/series ownership and current non-deleted managed object existence;
- playability from canonical managed storage, not merely a live provider URL;
- finite in/out points within source duration, positive duration, deterministic
  ordering, no prohibited overlap, and total shot/episode duration budget;
- audio policy (`keep`, `mute`, or `replace`) and collision with dialogue,
  native clip audio, voice-over, music, or another active segment;
- aspect ratio, `cover`/`contain`/`crop_safe` behavior, safe zones, and no crop
  that removes required subject/evidence context;
- evidence, rights, source/archive/AI-illustration label, reenactment label, and
  disclosure compatibility with the profile and intended output;
- profile-specific coverage fulfilled by the approved slot/segment, not by a
  generic “has media” count.

A missing/unplayable object, invalid trim, duration overflow, audio collision,
unsafe crop, stale segment, or changed rights/disclosure returns an actionable
finding and preserves the source and last valid binding. It must not delete the
source, silently drop the segment, convert footage to a still/reference,
regenerate media, consume credit, or mark an assembly ready.

## Staleness and minimal invalidation

Every artifact created after admission stores `inputContextFingerprint`, the
specific source/slot/asset/segment/claim/coverage references it consumed,
contract and policy versions, and its verification disposition. Before reuse,
queue execution, activation, provider submission, assembly, export, or publish,
the helper compares those facts with the current snapshot.

Use dependency-aware invalidation rather than either global silent reuse or
unconditional deletion:

| Changed authority | Minimum stale scope |
| --- | --- |
| Profile ID/version, content kind, or source/fact/B-roll policy | All downstream artifacts from architecture onward; retain old versions for audit |
| Source-pack version or a slot asset/evidence change | Artifacts referencing that slot/asset plus descendants; broader story/coverage artifacts only when their declared inputs include it |
| Claim text, attribution, `asOf`, correction, or evidence link | The claim and every premise/story/shot/prompt/assembly artifact that cites it |
| Visual canon or identity fingerprint | Affected scene/character start frames, references, video prompts, generated outputs, and assemblies |
| Coverage-plan requirement | The affected series/episode/scene/shot branch and its final readiness decision |
| Segment trim, revision, audio policy, fit, or crop | The exact B-roll binding and dependent assembly/render; other source uses remain current unless they share the changed segment |
| Rights/disclosure change | Every use of the affected asset and final export readiness; content need not be deleted, but it cannot pass the gated use |

Mark stale artifacts and old attempts inspectable. A stale attempt cannot append
success or activate after a newer snapshot exists. A fresh attempt may reuse
unaffected current descendants only when their stored dependency references and
fingerprints still match. There is no blind retry against mixed fingerprints,
and no automatic backfill of missing owner, status, or lineage facts.

## Entry-point integration and bypass prevention

The admission helper must be called inside the authoritative service boundary,
not only in a router or UI. Router checks may provide early feedback, but a
background worker, internal caller, or future route must not bypass the gate.
Queued work performs admission twice: once before enqueue to reject known bad
input without side effects, and once in the worker immediately before model or
provider work to detect intervening profile/source changes. Recovery reads the
existing attempt and current snapshot; it never creates a new attempt merely
because a page refreshed or a worker restarted.

Integrate the following current entry points:

| Entry point | Required admission and persisted handoff |
| --- | --- |
| `savePromptExpansionPreview` and `applyPromptExpansion` in `verticalDramaPromptExpansionService.ts` | Authoring/staged-source admission. Preserve tenant/user/draft-session ownership and approved prompt-expansion revision. Applying a new slot plan invalidates the prior staged source fingerprint but must not claim provider readiness. |
| `attachStagedSourcePackInTransaction` and series source-pack draft-readiness assertions | Bind the exact staged pack/version to the new series, then capture the canonical series snapshot. Required profiles cannot proceed with an absent pack; optional fiction captures explicit null or the attached optional pack. |
| `generateStartFrameRenderPlan` and `generateStartFrameShotPrompt` in `verticalDramaStartFrameGeneration.ts` | Require current shot/scene contract, visual canon, explicit `scene_anchor`, reference manifest, and stage-appropriate snapshot. Persist the admitted fingerprint and role refs on the prompt artifact before any generation caller can submit paid work. |
| `enqueueVerticalDramaShotPromptJob` and `runVerticalDramaShotPromptJob` | Enqueue with the admitted snapshot and attempt identity; re-admit in the worker. Missing/mismatched context becomes stale or `awaiting_action`, not a generic failed job or a silent legacy bypass. |
| `generateVideoMotionPromptPack`, `generateVerticalDramaShotVideoPrompt`, speaker-switch variants, and judged variants in `verticalDramaVideoMotionPromptGeneration.ts` | Require the exact approved start-frame version, reference manifest, shot contract, and current production context. The role manifest cannot be rebuilt from URLs or prompt prose. Section 07 adds the post-admission prompt validators and provider gate. |
| `enqueueVerticalDramaShotVideoPromptJob`, `runVerticalDramaShotVideoPromptJob`, and `recoverVerticalDramaShotVideoPromptJob` | Enqueue and worker re-admission use one fingerprint/idempotency lineage. Recovery may resume only the exact current attempt; stale or ambiguous work is fenced and never blindly resubmitted. |
| `validateBrollBinding`, `projectBrollTimeline`, and the existing assembly/render callers | Validate every binding and the immutable manifest against the current snapshot before assembly. Export/publish requires final `production_ready`; preview remains available with advisory findings. |

Section 07 will use the same helper for story architecture, full story/deep
draft, prompt QC, provider submission, post-generation QC, and season adapters.
This section must therefore expose a stable, task-agnostic service contract and
contract tests that fail whenever an enabled entry point reaches its model,
provider, activation, assembly, or export dependency without a successful
admission decision.

Legacy callers may omit the new snapshot fields while the active flag is off.
The compatibility wrapper must load and capture current context server-side and
label the decision with the legacy policy/schema version. It may continue a
safe authoring or deterministic preview path, but it must return a typed
`awaiting_action`/`needs_review` result if exact production identity, ownership,
or lineage cannot be proven. It must never invent a source pack, evidence level,
rights approval, claim freshness, managed object, or recovered status.

## Error and UX projection contract

Use the stable Section 01 taxonomy for at least: missing tenant/actor context,
unknown or unsupported profile policy, required source pack missing, source
readiness unmet, evidence insufficient, rights/disclosure blocked, claim stale
or contradictory, visual role/modality conflict, visual coverage missing,
managed object missing/unplayable, segment/timeline invalid, and production
context missing/stale. Each blocking decision names the affected slot, asset,
segment, claim, coverage item, or artifact when safe to expose and supplies one
valid next action such as edit source, verify evidence, update rights, show
disclosure, recapture context, replan, or retry after reconciliation.

Advisory findings do not block edit/save/navigation/non-paid preview. Hard
findings block only the unsafe transition: candidate activation, paid provider
submission, assembly, export, or publish. Preserve the last editable draft,
source pack, media, prior artifact, and audit evidence in every failure path.
The API projection must not expose signed/provider URLs, cross-tenant IDs, raw
storage errors, or raw model text.

This section owns no new browser component or visual redesign. UI/UX state,
responsive, accessibility, localization, and browser implementation remain in
Section 08; this section supplies the typed state, disposition, readiness,
finding targets, capability flags, and next-action data that UI work consumes.

## TDD plan

Write the failing tests before changing shared policy or service behavior.
Follow existing Vitest conventions and keep tests at the current seams rather
than replacing them with a second harness.

### Shared contract and registry tests

Extend `apps/web/shared/verticalDramaSeries/__tests__/seriesProfile.test.ts`,
`sourcePack.test.ts`, `visualGrounding.test.ts`, and `qualityPolicy.test.ts`, and
add a focused Section 01/05 production-context contract test where the new
shared module lives.

- Parameterize directly from `VD_SERIES_PROFILE_IDS` and assert that the matrix
  contains exactly all thirteen current IDs, each resolves an active profile
  version, and every row has source/fact/B-roll/visual policies.
- Assert each of the six fiction profiles produces an explicit optional/null
  source snapshot and remains authorable/provider-eligible when no source pack
  is required and all other stage checks pass.
- Assert Documentary, News, Location Review, Restaurant Review, Product Review,
  Software Review, and Hybrid Docu-Drama cannot satisfy required readiness with
  a missing source pack or generic media-only coverage.
- Assert profile-specific coverage and claim rules described in the matrix,
  including product/software disclosure and news freshness/correction behavior.
- Assert a new registry ID fails until it has policy, snapshot, cross-stage, and
  browser-fixture metadata; do not use a hard-coded expected count as the only
  proof.

### Snapshot, source, and authority tests

Add focused tests for `verticalDramaProductionContext.ts` and extend
`verticalDramaSourcePackService.test.ts`,
`verticalDramaVisualSourceCore.test.ts`, and
`verticalDramaVisualSourceIntegration.test.ts`.

- Prove stable canonical hashing for reordered equivalent inputs and a changed
  fingerprint for profile, explicit-null source decision, pack, slot, asset,
  segment, evidence, rights, disclosure, claim, canon, coverage, or binding
  changes.
- Prove server-loaded status wins over stale or forged client/Agent status, and
  invented IDs/URLs/facts are rejected.
- Prove tenant/user/series mismatch and missing identity fail before snapshot
  capture, model/provider calls, or returned resource details.
- Prove exact same fingerprint may reuse an immutable snapshot while any
  material change creates a new revision and retains the old one.
- Prove optional-source fiction, required-source draft readiness, required-source
  production readiness, and `needs_review` each map to the correct admission
  disposition and next action.
- Prove legacy staged and series callers are wrapped server-side without
  fabricated ownership/readiness and cannot reach a hard production boundary
  when exact lineage is unavailable.

### Roles, evidence, rights, media, and B-roll tests

Extend `verticalDramaVisualSourceCore.test.ts`,
`verticalDramaVisualSourceIntegration.test.ts`,
`verticalDramaBrollService.test.ts`, and the relevant managed-storage fixture
tests.

- Exercise `scene_anchor`, `reference`, `b_roll_still`, `b_roll_footage`,
  `graphic`, and `text_overlay`; assert no implicit role or modality conversion.
- Assert uploaded or AI-generated media is not upgraded to `verified`, and each
  evidence status remains server-owned through snapshot, prompt, binding, and
  projection.
- Cover `pending`, `creator_owned`, `licensed`, `restricted`, and `rejected`
  rights plus `not_required`, `required`, and `shown` disclosure at draft,
  provider, and export boundaries.
- Cover missing managed object, provider-only URL, unplayable object, stale
  object/source/segment revision, invalid trim, out-of-range duration, still
  duration misuse, non-contiguous ordering, overlap, total-duration overflow,
  audio collision, aspect/fit/crop/safe-zone failure, and missing required label.
- Assert each failure preserves the source and previous valid binding, emits an
  actionable finding, and performs no regeneration, credit deduction, provider
  submission, deletion, or silent drop.

### Staleness and entry-point admission tests

Add a focused entry-point admission contract suite and extend the existing
start-frame, prompt-expansion, shot-prompt job, video-motion prompt, video-prompt
job, and B-roll suites named by the integration table.

- For every enabled entry point, inject a spy/fake admission dependency and
  prove the model, provider, activation, assembly, or export dependency is never
  called when admission is missing or rejects.
- Prove enqueue records the admitted fingerprint and worker execution rechecks
  it; a source/profile edit between those moments fences the old job as stale
  without duplicate work.
- Prove refresh, reconnect, recovery, and duplicate delivery return the existing
  attempt/projection and do not create another admission or paid side effect.
- Parameterize drift by profile, source slot, claim, visual canon, coverage,
  segment, rights, and disclosure; assert only declared descendants become
  stale and no artifact from two fingerprints can be assembled or activated.
- Prove a scene anchor/reference conflict, footage-as-image-reference conflict,
  illustrative-as-evidence proposal, and B-roll-as-identity-reference proposal
  all fail with distinct stable codes.

Run the focused web suites with `npm --workspace apps/web test --` followed by
the exact changed test files. Use `--environment jsdom` only for any browser
component test delegated to Section 08. Also run `git diff --check` and focused
changed-file diagnostics. Report broad `npm --workspace apps/web run check`
separately because repository-wide typecheck may remain baseline-noisy or OOM.
Unit tests are not browser, migration, provider, deployment, or production
proof.

## Implementation sequence

1. Freeze the registry-derived thirteen-profile policy fixture and write the
   failing snapshot/readiness tests.
2. Complete server-owned snapshot composition in
   `verticalDramaProductionContext.ts`, reusing source/visual/claim/coverage and
   managed-storage authorities. Keep all flags off.
3. Add the thin admission façade and typed findings/next-action projection;
   prove identity, compatibility, and side-effect-free rejection.
4. Strengthen role/evidence/rights/disclosure, visual coverage, staleness, and
   B-roll validators at their existing shared/service seams.
5. Wire authoring and source attachment first, then start-frame and shot-prompt
   entry points, then video-prompt jobs, then B-roll/assembly. Add bypass tests
   with each call-site change.
6. Run the focused matrix, review the complete owned diff, and hand the stable
   admission contract to Sections 06 and 07 before they add Agent and
   story/prompt/media adapters.

Do not combine this work with UI redesign, Agent Runtime implementation,
billing changes, provider submission changes, story/season adapter behavior, or
database ownership redesign. If implementation proves a shared schema or
persistence change is required, return it to Sections 01 or 02 and preserve a
single owner rather than creating a local duplicate.

## Rollout, observability, and rollback

Use the canonical `verticalDramaAssuranceShadow`,
`verticalDramaStoryAssuranceActive`, `verticalDramaPromptQcOrchestraActive`, and
`verticalDramaAssuranceKillSwitch` controls. Profile/source admission is a
sub-capability of the story/prompt flag according to task kind; do not add a
new `verticalDramaProfileSourceAdmissionActive` flag. The kill switch selects
the safe legacy/deterministic path for authoring while
continuing to fail closed at paid/export boundaries whose exact rights,
ownership, or currentness cannot be proven.

Roll out in bounded stages:

1. Deploy shared contracts, immutable snapshot capture, and dual-read/dual-write
   lineage with all hard gates off. Do not backfill ambiguous snapshots.
2. Run profile/source/evidence/rights/disclosure/coverage/B-roll admission in
   shadow for internal tenant/series cohorts. Record decisions and differences
   without user credits, provider tasks, activation, or UX blocking.
3. Exercise registry-derived synthetic fixtures for all thirteen profiles and
   authenticated canary flows for each profile family. Specifically verify no
   accidental optional-source block for every fiction profile and actionable
   claim/freshness/disclosure/B-roll findings for source-required profiles.
4. Enable hard admission for start-frame and prompt entry points only after
   shadow parity is explained. Enable video prompt and B-roll/assembly as one
   fingerprinted chain; never enable video alone against legacy unadmitted
   visual inputs.
5. Expand by explicit tenant/series cohorts only after Sections 07, 08, and 10
   provide provider, browser, replay, migration, and canary evidence.

Emit tenant-safe metrics/events for admission count and latency by profile,
stage, mode, achieved/required readiness, disposition and stable reason code;
shadow/legacy disagreement; missing admission/bypass rejection; stale or mixed
fingerprint rejection; role/evidence/rights/disclosure conflict; managed-media
failure; and B-roll timeline failure. Logs and traces include IDs, revisions,
hashes, and redacted finding codes, never private story text, source payloads,
signed/provider URLs, or untrusted evidence content.

Promotion requires all focused profile/source/media tests passing, complete
registry coverage, zero successful bypasses, zero mixed-fingerprint
activations/assemblies, zero implicit role or evidence promotion, zero
cross-tenant reads, and no unexplained shadow mismatch. Browser/API flows must
have zero raw errors and every rejection must expose a stable next action.
Provider, deployment, migration rehearsal, and production canary evidence must
be recorded separately; local Vitest success alone cannot promote the flag.

Rollback disables active admission by cohort or task boundary while preserving
snapshots, attempts, source packs, media, bindings, accepted artifacts, and
audit evidence. It must not roll back additive schema destructively, erase a
user edit, delete a source, fabricate legacy readiness, refund without ledger
proof, or resubmit uncertain provider work. Keep the old read path until every
lease and provider reconciliation admitted under the old version is terminal.

## Acceptance and handoff

Section 05 is complete when:

- the registry-derived suite proves all thirteen profiles and their distinct
  optional/required source, claim, evidence, rights/disclosure, visual grounding,
  and B-roll policies;
- one immutable server-owned snapshot identity is persisted and propagated,
  with explicit optional/null fiction source and no invented non-fiction facts;
- all critical semantic roles and evidence/rights/disclosure states remain
  distinct and server-owned through admission;
- managed storage, segment/timeline, audio, crop/safe-zone, coverage, and
  staleness failures are actionable and side-effect free;
- every listed entry point admits before work and re-admits at asynchronous
  execution/final boundaries, with contract tests preventing bypass;
- dependency-aware staleness fences mixed fingerprints while retaining old
  artifacts for audit and unaffected current artifacts for safe reuse;
- shadow/canary metrics, kill-switch behavior, rollback, and evidence boundaries
  are documented and verified at the appropriate layer.

The handoff to Section 06 is the admitted snapshot and deterministic findings,
never raw source content or client-owned status. The handoff to Section 07 is
the same fingerprinted decision plus exact role/source references for each
story/prompt/media adapter. Section 08 consumes only the typed projection and
next actions. Section 10 owns final cross-stage, browser, provider, deployment,
migration, and production closeout proof.

## UI/UX Contract

### Target User / JTBD

Creators can use fiction, documentary, review, software-review, attached-media, and B-roll profiles without guessing which source or rights evidence is missing.

### Surface Inventory

Existing profile, source attachment, preview, prompt, and media panels receive additive role/rights/fingerprint findings; advisory preview remains usable.

### Component Map

Admission findings map to the common status projection and current source/B-roll components. No profile requires a new mandatory wizard step.

### State Matrix

`admitted`, `needs_review`, `blocked`, and `legacy_unverified` are explicit; missing rights, stale source, and wrong role never silently become ready.

### Responsive Matrix

Source names, role badges, rights notices, and B-roll bindings wrap at 360x800, 390x844, 768x1024, and 1440x900.

### Accessibility Acceptance

Role/source/rights findings have text labels, keyboard access to evidence, non-color indicators, and accessible media names.

### Copy Contract

Localized copy names the missing role/evidence and safe next action; it never invents ownership, rights, claims, or provenance.

### Browser Evidence Required

Section 10 covers all 13 profiles, attached images/video, B-roll, missing rights, stale media, and advisory versus blocking behavior.
