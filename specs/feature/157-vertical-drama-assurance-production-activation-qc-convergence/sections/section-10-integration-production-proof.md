# Section 10 — Cross-Section Integration, Production Proof, and Release Closeout

## Outcome and release authority

This section is the final integration and release gate for Sections 01–09. It
does not add another runtime, ledger, provider path, profile registry, status
store, or creator flow. It proves that the contracts implemented by the prior
sections converge at the real Vertical Drama boundaries and that the system can
be enabled, observed, interrupted, reconciled, and rolled back without unsafe
activation, duplicate credits, duplicate provider tasks, tenant leakage, or a
dead creator workspace.

Implementation completion and production activation are deliberately separate:

- **implementation complete** means the code, migrations, deterministic tests,
  replay fixtures, browser harness, release-gate harness, and runbook are in the
  repository and all locally executable mandatory gates pass;
- **production activation approved** additionally requires recorded staging
  migration/restart/Redis proof, authenticated browser evidence, live-provider
  reconciliation proof, deployment evidence, canary evidence, and a rollback
  drill for the exact release commit;
- any required environment proof that was not run is `blocked` or `not_run`,
  never `pass`; local Vitest/pytest success cannot substitute for it.

Sections 01–09 must be implemented and their focused suites green before this
section changes shared behavior or enables a flag. Section 10 may add test,
fixture, evidence, and release-gate files and may fix integration defects found
by the five review loops, but it must return contract ownership fixes to the
section that owns the affected production file. Do not duplicate an export or
work around a mismatch in the integration harness.

## Dependencies and frozen integration decisions

The final implementation must consume these authorities exactly:

| Concern | Producer/authority | Section 10 proof consumer |
| --- | --- | --- |
| Context and domain assurance schemas | `ProductionContextSnapshotSchema`, `VerticalDramaAssuranceRequestSchema`, `AssuranceUiProjectionSchema`, and `buildAssuranceUiProjection` from `apps/web/shared/verticalDramaSeries/verticalDramaAssuranceContext.ts` and `assurance.ts` | profile/stage matrix, API/browser fixture parser, evidence manifest |
| Runtime task mapping | `VERTICAL_DRAMA_RUNTIME_TASK_MAP` and `mapVerticalDramaTaskToRuntimeCapability` | registry drift and Node/Python golden-fixture tests |
| Admission and mode | `captureProductionContextSnapshot`, `validateProductionContextAdmission`, `admitVerticalDramaAssuranceRequest`, and `selectVerticalDramaAssuranceMode` | bypass spies and runtime-mode scenarios |
| Durable state | Section 02 `verticalDramaAssuranceRepository.ts`, `verticalDramaAssuranceReconciliation.ts`, event replay, lease/fence, and domain activation CAS | restart, Redis expiry, duplicate delivery, stale-worker, and projection replay tests |
| Billing/provider readiness | `verticalDramaAssuranceBilling.ts`, physical-call observer, durable provider authorization, `assertOrchestraFinalGate`, and existing media reconciliation owner | crash matrix and live-provider proof |
| Draft QC | `runVerticalDramaDraftQualityQc`, `runVerticalDramaDraftQualityQcRepair`, the one authoritative current-result resolver, job projection, ledger CAS, and existing router procedures | observed-error regression and browser repair flow |
| Profile/source/visual policy | `VD_SERIES_PROFILE_IDS`, `SERIES_PROFILE_REGISTRY`, source/visual registries, source-pack/visual snapshot/B-roll services | all-profile and all-visual-source coverage |
| Agent Runtime | existing Node client/request/selection/final-gate/replay/checkpoint services and Python internal OpenAI Agents runtime | canonical parity, bounded fallback, security, and active/shadow canary proof |
| Story/prompt/media adapters | existing Feature 152/153 story owners, start-frame/reference composers, prompt QC, video-prompt jobs, B-roll/assembly/final QC owners | one-fingerprint cross-stage lineage proof |
| API and UX | existing `verticalDramaSeries` procedures, `CreateSeriesWizard`, `VerticalDramaDraftQualityQcPanel`, and current story/prompt/media surfaces | authenticated browser/action/accessibility evidence |
| Operations | Section 09 flags, metrics, alerts, migration/backfill, runbook, and cohort controls | release manifest, canary, rollback, and sign-off |

One known planning mismatch must be resolved before implementation can pass the
first review loop. The canonical story/season activation flag is
`verticalDramaStoryAssuranceActive`, matching `spec.md`, `claude-plan.md`, and
Sections 01 and 03. Section 06's provisional
`verticalDramaStorySeasonOrchestraActive` spelling must be replaced at its
owner before implementation; do not register both names and do not add an
alias. The full canonical Feature 157 set is:

- `verticalDramaAssuranceShadow`;
- `verticalDramaDraftQcOrchestraActive`;
- `verticalDramaPromptQcOrchestraActive`;
- `verticalDramaStoryAssuranceActive`;
- `verticalDramaAssuranceKillSwitch`.

All default to `false`. The kill switch has highest domain precedence, while
the existing generic Agent Runtime master/rollback flags remain lower-level
prerequisites. A durable attempt retains its frozen mode/billing facts; a kill
switch may fence a future dispatch or resume but must not rewrite history,
delete an accepted candidate, refund from absence, or resubmit uncertain work.

There is also a confirmed migration-number collision in the planning inputs.
`apps/web/drizzle/0240_vertical_drama_draft_series_link.sql` already exists and
the current repository sequence ends at
`0244_vertical_drama_prompt_expansion.sql`; therefore Section 02's provisional
`0240_vertical_drama_assurance_attempts_reconciliation.sql` path is invalid.
At this repository snapshot the additive Feature 157 migration is
`apps/web/drizzle/0245_vertical_drama_assurance_attempts_reconciliation.sql`.
Re-list migrations immediately before implementation; if another migration has
landed, take the next unused number and update schema tests, evidence, and every
section reference together. Never overwrite or renumber an existing migration.

## Exact files and symbols to add or change

### Registry-derived integration fixture

Add
`apps/web/shared/verticalDramaSeries/__tests__/fixtures/assuranceProductionMatrix.ts`.
It exports data only and imports the authoritative constants instead of copying
their values:

- `VERTICAL_DRAMA_ASSURANCE_STAGE_IDS` for `profile_source`, `premise`,
  `story_architecture`, `full_story`, `shot_contract`, `start_frame`,
  `reference_image`, `video_prompt`, `broll_assembly`, `post_generation_qc`,
  and `final_gate`;
- `VERTICAL_DRAMA_PROFILE_ACCEPTANCE_MATRIX`, keyed by every value in
  `VD_SERIES_PROFILE_IDS`;
- `VERTICAL_DRAMA_VISUAL_SOURCE_COVERAGE_MATRIX`, covering every value in
  `VD_SOURCE_KINDS`, `VISUAL_MEDIA_TYPES`, `VISUAL_MEDIA_ORIGINS`,
  `VISUAL_SEMANTIC_ROLES`, `VISUAL_EVIDENCE_STATUSES`,
  `VD_SOURCE_RIGHTS_STATUSES`, `VD_SOURCE_DISCLOSURE_STATUSES`,
  `VISUAL_AUDIO_POLICIES`, and `VISUAL_FIT_MODES`;
- `buildVerticalDramaAssuranceAcceptanceCases`, a pure case builder that fails
  if a registry member has no positive fixture, blocking fixture, expected
  next action, cross-stage row, and browser metadata.

The fixture must use synthetic tenant/user/asset/claim IDs and managed-object
references. It must contain no signed URL, provider credential, private story,
or production tenant data. It is the one matrix consumed by Vitest and browser
tests; Python consumes only the redacted cross-runtime golden fixture owned by
Section 06.

### Integration and failure-injection suites

Add these focused files:

- `apps/web/shared/verticalDramaSeries/__tests__/assuranceProductionMatrix.test.ts`
  for registry completeness, all profiles, all visual-source enum members,
  stage coverage, and fixture uniqueness;
- `apps/web/server/services/__tests__/verticalDramaAssuranceIntegration.test.ts`
  for the complete context → adapter → durable attempt → domain final gate/CAS
  chain with faked network owners;
- `apps/web/server/services/__tests__/verticalDramaAssuranceFaultInjection.test.ts`
  for deterministic crash points, restart, Redis loss, redelivery,
  reconciliation, and exact-once assertions;
- `apps/web/server/routers/__tests__/verticalDramaSeries.assuranceProduction.test.ts`
  for the existing public procedures and additive request/result/error
  compatibility contract;
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaAssuranceFlow.test.tsx`
  for the cross-component state/action/reconnect flow in jsdom;
- `apps/web/tests/e2e/vertical-drama-assurance-production.spec.ts` for the
  authenticated application-route browser matrix. Reuse the existing tRPC
  route interception/authentication pattern from
  `apps/web/tests/e2e/production-director-browser.spec.ts`; do not use a static
  standalone HTML fixture as proof of the Vertical Drama creator route.

Extend, rather than replace, these existing suites where they own the asserted
behavior:

- `apps/web/shared/agentRuntime/__tests__/assurance.test.ts`;
- `apps/web/server/services/agentRuntime/__tests__/client.assurance.test.ts`;
- `apps/web/server/services/agentRuntime/__tests__/orchestraFinalGate.test.ts`;
- `apps/web/server/services/agentRuntime/__tests__/orchestraEventReplay.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaDraftQualityQc.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaDraftQualityQcJobs.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaDraftLedger.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaPromptQc.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaSourcePackService.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaVisualSourceCore.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaVisualSourceIntegration.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaStartFrameGeneration.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaShotPromptJobs.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaShotVideoPromptJobs.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaBrollService.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaStoryGenerationContracts.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaStoryGenerationRuntime.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaSeasonQcPasses.test.ts`;
- Python contract/runtime/security tests named in Section 06.

The integration suite may call production services through injected fakes, but
it must not restate their validators. A spy at every external or authoritative
boundary must prove that rejected admission does not call a model, reserve or
draw credit, issue provider authorization, submit a provider task, activate a
candidate, assemble, export, or publish.

### Release-gate harness and evidence files

Add `apps/web/scripts/verify-vertical-drama-assurance-release-gate.ts` and the
package script `release-gate:vertical-drama-assurance`. The script is read-only:
it validates evidence files and current registries, reports missing/failed
gates, and exits nonzero unless every required gate for the requested tier is
`pass`. It must never enable flags, run a migration, submit media, change
credits, or deploy.

The script accepts `--tier implementation` or `--tier production` and
`--evidence <path>`. The implementation tier requires local contract, replay,
fault, Python, browser-harness, migration-static, diff, and review-loop proof.
The production tier additionally requires staging migration, staging restart,
live-provider, deployed browser, canary, observability, and rollback proof.

Record evidence under the existing feature directory:

- `specs/feature/157-vertical-drama-assurance-production-activation-qc-convergence/implementation/release-evidence/manifest.json`;
- `implementation/section-10-production-proof.md`;
- `implementation/ui-browser-evidence.md`;
- `implementation/reviews/section-10-loop-01-contracts.md` through
  `section-10-loop-05-release.md`.

The manifest is machine-readable and each entry has: stable gate ID, evidence
class, `pass | fail | blocked | not_run`, exact commit SHA, environment,
timestamp, command or procedure, artifact path, profile IDs, runtime modes,
source/visual dimensions covered, assertion counts, redacted correlation IDs,
and reviewer. `blocked` requires a reason and owner; `not_run` requires a
reason. An artifact from another commit, an expired canary window, a missing
profile, or an unredacted file is invalid evidence.

Section 10 adds no database migration and no production state table. It verifies
the additive migration selected in Section 02. For the current repository
snapshot that path is
`apps/web/drizzle/0245_vertical_drama_assurance_attempts_reconciliation.sql`,
because `0240`–`0244` are already occupied. If implementation must take a later
number because repository ordering changed, update all test and evidence
references together; never edit an already-applied migration.

## TDD-first implementation sequence

### 1. Freeze matrix and release-gate tests

Before integration code or active flags, write failing tests for the matrix and
release-gate parser:

- set equality, not only count equality, between matrix profile keys and
  `VD_SERIES_PROFILE_IDS`;
- set equality for every visual/source registry listed above;
- every profile has a success case, a profile-specific blocking case, a repair
  or next-action case, every stage, and authenticated browser metadata;
- every mandatory gate ID is unique and understood by the evidence parser;
- missing, stale-commit, failed, blocked, not-run, malformed, unredacted, or
  duplicate evidence makes the requested tier fail;
- implementation evidence cannot satisfy a production-only gate;
- a registry addition without all matrix/browser metadata fails CI.

Implement only enough fixture and parser code to make these tests pass.

### 2. Add the cross-section happy-path suite

Build one deterministic integration harness with injected repositories,
runtime, credit owner, provider owner, storage resolver, clock, UUID factory,
and fault controller. Run it first for `drama_romance`, then parameterize it
from the complete profile matrix. The happy path must assert the same
`tenantId`, `executionId`, child `attemptId` lineage, source version/fingerprint,
`contextSnapshotRef`, contract/output/policy hashes, and declared predecessor
refs at every stage. The final accepted state requires a current verified
candidate, reconciled billing, final-gate record, and successful domain CAS.

No generated prose or prompt string is used to correlate stages. Every stage
must carry typed refs and hashes. A mismatch must fail at the first consuming
boundary and preserve the prior artifact.

### 3. Add failure injection before implementation fixes

Expose a test-only dependency hook with named crash points; do not add
environment-variable crash switches to production code. Each point throws or
returns a typed fake owner result at a dependency boundary. Write the failing
assertions before changing production transaction/order behavior. After each
fix, rerun that focused case and the full crash matrix.

### 4. Add router, UI, and browser flows

Freeze the additive public response/error contract in router tests, then add
the jsdom state/action flow, then the authenticated Playwright matrix. Browser
fixtures may intercept deterministic model/provider responses, but they must
load the real application route, real components, real tRPC request shapes,
and authenticated tenant/user state. A separate staging run records real
service/worker/provider behavior.

### 5. Add evidence parser, run five reviews, then activate only by gate

Generate no `pass` entry by hand. Test commands or an operator procedure write
their bounded evidence; the read-only release-gate script validates it. Run the
five review loops below in order. Fix every release-blocking finding at its
owner, rerun the affected loop and every later loop, then run the implementation
tier. Production flags remain off until the production tier passes for the
exact deployed commit and cohort.

## Exact end-to-end acceptance scenarios

The following ten scenarios are release-blocking. Each is represented by a
deterministic service/router replay; scenarios with a user action also have an
authenticated browser case. Staging/live variants are required where noted.

| ID | Setup and action | Required terminal proof |
| --- | --- | --- |
| `E2E-01-recovered-draft-repair` | Persist a complete current Draft QC baseline, return an attempted revision that mutates immutable `storyContract`, refresh the page, then press Repair. | Original attempt is `recovered/recovered_needs_repair`; baseline/report/history and exact fingerprints survive; repair admits one child attempt and does not emit “Draft QC repair requires a completed, current QC result”; valid repair is freshly evaluated and activates only through final gate/CAS. |
| `E2E-02-repair-preconditions` | Attempt repair with no result, historical result, wrong source version, same version/wrong fingerprint, wrong contract or policy, and a matching repair already running. | Stable codes are respectively `qc_result_missing`, `qc_result_not_current`, `qc_source_version_mismatch`, `qc_source_fingerprint_mismatch`, `qc_contract_version_mismatch`, and `qc_repair_already_running`; each returns its server-owned projection/action, mutates no draft, and spends no credit before admission. |
| `E2E-03-runtime-modes` | Execute the same advisory flow in legacy, shadow, active, manifest-missing, timeout, and active-runtime-error modes, then exercise a provider boundary. | Save/edit/preview/inspect remain available in every mode; shadow cannot activate or charge; active output is deterministically revalidated; fallback runs at most once within budget; an incomplete paid/export gate becomes actionable instead of downgrading readiness. Staging proves active and kill-switch paths separately. |
| `E2E-04-interruption-resume` | During queued/running work perform browser refresh, tab close/reopen, network loss/reconnect, worker restart, Redis progress/pointer expiry, and duplicate queue delivery. | All reads restore one durable projection and event cursor; no read admits work; no duplicate attempt/reservation/call/provider task exists; no infinite spinner remains after lease/reconciliation window. Staging worker and Redis proof are mandatory. |
| `E2E-05-context-race` | Edit the Draft, profile, source slot, claim, visual canon, or B-roll segment after enqueue and before completion. | Old fence loses; old evidence remains inspectable; only declared descendants become stale; no mixed fingerprint activates/assembles; fresh admission uses the new fingerprint and does not reuse an incompatible reservation or authorization. |
| `E2E-06-crash-accounting` | Inject failure before reservation, after reservation, after model response, after provider request, after provider acceptance, after usage capture, after credit draw, after final-gate persistence, after authorization claim, and after domain CAS. | Ledger/provider effects are zero or exactly one by policy; accepted/uncertain provider work is never resubmitted or blindly refunded; replay is idempotent; state is terminal/actionable; editing/saving remains available. Live provider proves accepted-response loss/reconciliation with an allowlisted low-cost task. |
| `E2E-07-all-profiles` | Run create/save, refresh/reconnect, source behavior, preview/edit during QC, QC completion, repair/retry, and next-stage gating for every registry profile. | All 13 rows pass their own policy; six fiction rows work with explicit optional/null source; seven required-source rows expose their profile-specific coverage/claim/evidence/rights/disclosure findings and can reach readiness only with valid current source. |
| `E2E-08-cross-stage-lineage` | Traverse profile/source → premise → architecture → full story → shot contract → start frame → reference/image → video prompt → B-roll/assembly → post-QC/final gate. | One current context fingerprint and explicit semantic-role/predecessor refs persist end to end; changed inputs fence only affected descendants; final output has managed-storage and final-gate evidence. Story/season flags remain independently controllable. |
| `E2E-09-provider-limit` | Produce an over-limit video prompt with protected speaker/identity/action/dialogue fields that cannot be losslessly compressed. | No hard truncation is marked verified/provider-ready; prior prompt remains editable; response is `awaiting_action` with provider/profile choice or safe repair/retry; no paid submission occurs. |
| `E2E-10-provider-uncertain` | Lose the response after a provider may have accepted a task, then cancel, redeliver the job, refresh, and run reconciliation twice. | State is `reconciliation_required`; paid retry and auto-refund are disabled; recovered provider task attaches to the original authorization/call; terminal settlement and projection happen once; only then may the next safe action be offered. |

For every scenario assert tenant isolation, stable error code and `nextAction`,
event/replay equivalence, preserved editable source, no raw exception-only UI,
and absence of secrets/private content in traces and evidence.

## Failure-injection and replay matrix

The deterministic fixture set must cover all source-spec failures, not only the
ten broad browser scenarios:

| Fixture | Injection | Expected state/gate |
| --- | --- | --- |
| `FI-01` | Revision mutates `storyContract`. | Reject revision; recover exact baseline; repair remains eligible if current. |
| `FI-02` | Revision fails after a valid baseline. | `recovered` or `awaiting_action`; never erase baseline. |
| `FI-03` | Judge returns malformed/truncated JSON. | Bounded structural retry/fallback if budget allows; otherwise recover or retryable fail. |
| `FI-04` | Valid JSON omits required criteria. | Schema/domain rejection; no fabricated score or success. |
| `FI-05` | Repair uses stale source version. | `qc_source_version_mismatch`; refresh; no charge. |
| `FI-06` | Version matches but fingerprint differs. | `qc_source_fingerprint_mismatch`; fresh QC; no repair. |
| `FI-07` | Worker crashes after baseline persistence. | Durable recovery; no repeated paid call. |
| `FI-08` | Redis record and pointer expire. | Durable projection/event replay remains authoritative. |
| `FI-09` | Queue delivers the same job twice. | One attempt/call/settlement/activation. |
| `FI-10` | Cancel during model call. | Fence activation; known usage settles once or unknown usage reconciles. |
| `FI-11` | Reservation/draw/refund result is lost or fails. | Query durable call and `credit_transactions`; never guess/repeat. |
| `FI-12` | Provider response is lost after acceptance. | `reconciliation_required`; no resubmit/refund. |
| `FI-13` | Prompt exceeds provider limit. | Safe lossless correction or actionable block; no verified truncation. |
| `FI-14` | Character/reference evidence is ambiguous. | Distinct finding; preserve identity/canon; no activation. |
| `FI-15` | Newer user edit races repair CAS. | User edit wins; candidate is stale and inspectable. |
| `FI-16` | Any source-required profile misses required coverage. | Profile-specific `awaiting_action`; fiction optional source unaffected. |
| `FI-17` | Restaurant/product/software factual claim lacks source. | Claim-level block and source/verify action; no provider/export readiness. |
| `FI-18` | AI illustrative media is proposed as verified evidence. | Reject status escalation; retain `illustrative`. |
| `FI-19` | Uploaded video is bound as image reference/start frame. | Role/modality error; require explicit approved promotion/new snapshot. |
| `FI-20` | B-roll trim/audio/duration/storage/rights/disclosure is invalid. | Preserve source/binding; block assembly only; return targeted action. |
| `FI-21` | Snapshot changes between story/frame/reference/video jobs. | Smallest dependent stale scope; no mixed-context chain. |
| `FI-22` | Reference attempts to replace approved scene anchor. | Reject role conflict; preserve start-frame lock. |
| `FI-23` | Full story drops required claim/source/coverage binding. | Candidate rejected; prior architecture/story remains current. |
| `FI-24` | Video prompt changes speaker, position, cast, or action. | Post-validator rejects proposal; no paid submission. |
| `FI-25` | News claim is stale/unattributed or corrected. | Claim and all dependent artifacts stale; correction lineage retained. |

Add transaction crash points around reservation creation, network-request start,
provider acceptance, usage capture, credit settlement, final-gate persistence,
authorization claim, candidate persistence, and domain CAS. At each point run
the operation, restart/replay the worker, run reconciliation twice, and assert:

1. user credit delta matches the known physical calls exactly;
2. provider task count is at most one for one authorization/idempotency key;
3. accepted domain version count is at most one;
4. event IDs/cursor contain no duplicate logical transition;
5. terminal/actionable state and `nextAction` are stable after refresh;
6. editing/saving/inspection remain available;
7. traces/evidence are redacted and tenant-scoped.

## Thirteen-profile acceptance matrix

The executable matrix is generated from `VD_SERIES_PROFILE_IDS`; the table
below freezes the required semantics for the current release.

| Profile | Positive path | Required negative/browser assertion |
| --- | --- | --- |
| `drama_romance` | Explicit null/optional source; relationship setting, identity, story contract, and visual continuity carry through the chain. | Missing source is not a hard block; unrelated world/identity drift is actionable. |
| `horror_thriller` | Optional source; approved threat evidence and atmospheric consequence remain in canon. | Missing source does not block; unmotivated tone/threat/world drift does. |
| `sci_fi_cyberpunk` | Optional source; functional technology mechanic and cost/constraint survive story and prompts. | Decorative neon cannot satisfy the mechanic; absent source remains allowed. |
| `action_epic` | Optional source; physical objective, consequence, cast, and shot continuity are preserved. | Reference media cannot become scene anchor/evidence implicitly. |
| `fantasy_fairytale_xianxia` | Optional source; magic/artifact/realm rule and cost survive downstream. | World-rule drift blocks activation while authoring remains available. |
| `animation_cartoon` | Optional source; stylized world and visual action remain consistent. | Unapproved live-action/style reference cannot overwrite canon. |
| `documentary` | Current source/interview/archive evidence, observation/claim separation, counterpoint, and reenactment disclosure reach production readiness. | Upload alone is not evidence; absent disclosure/counterpoint/source is actionable and blocks only unsafe boundary. |
| `news_report` | Claim attribution, current `asOf`, impact, archive labels, corrections, and AI illustration disclosure persist. | Stale/unattributed/corrected claim invalidates every dependent artifact and is visible in UI. |
| `location_review` | Place/exterior/interior/route/access coverage and limitations are proven. | Coordinates/map metadata alone cannot prove visible conditions. |
| `restaurant_review` | Venue/sign, service, menu/price/time, dish, atmosphere, opinion/fact, and disclosure are grounded. | Unsupported current price/fact or missing disclosure blocks readiness. |
| `product_review` | Exact product/spec, in-use proof, result, comparison, limitation, and tie-in disclosure are grounded. | Unsupported performance/spec claim or illustrative-only media blocks the affected path. |
| `software_review` | Exact product/UI/version, setup/workflow/result, platform/responsive, limitation/plan evidence are current. | Stale screen or unsupported current plan/feature fails with source refresh action. |
| `hybrid_docu_drama` | Evidence/observation and dramatized/reenacted assets retain separate roles, prompts, labels, and QC. | Dramatization never verifies a factual claim; missing reenactment label blocks production readiness. |

Every profile browser case proves create/save, refresh/reconnect, source-slot or
optional-source behavior, preview/edit while QC runs, successful or actionable
QC completion, repair/retry, and correct next-stage gate. All profiles run in
legacy and active deterministic-fixture modes. A representative profile from
each policy family additionally runs shadow, manifest-missing, timeout,
runtime-error, and kill-switch modes. A legacy pass proves compatibility only;
it does not prove the Agent path.

## Visual-source completeness matrix

Coverage is registry-derived and uses pairwise cases plus mandatory unsafe
combinations; it does not attempt an uninformative full Cartesian product.

- Source kinds: `known_place`, `coordinates`, `product_snapshot`,
  `software_review`, `upload_image`, `upload_video`, `generated_reference`,
  `documentary_note`, and `custom` each appear in at least one profile-positive
  or profile-blocking row.
- Media/origin: both `image` and `video`, and all of `ai_generated`,
  `user_upload`, `web_import`, and `existing_managed`, are captured, hashed,
  reloaded, and checked for ownership/durability.
- Semantic roles: `scene_anchor`, `reference`, `b_roll_still`,
  `b_roll_footage`, `graphic`, and `text_overlay` each have a valid use and a
  forbidden substitution case.
- Evidence: every status from `not_applicable` through `blocked` round-trips
  without Agent/client promotion; `illustrative → verified` is explicitly
  rejected.
- Rights/disclosure: all five rights statuses and all three disclosure statuses
  are checked at authoring, provider, and production boundaries.
- Timeline: all `keep | mute | replace` audio policies and
  `cover | contain | crop_safe` fit modes have valid and conflicting cases;
  still/video duration rules, trim bounds, overlap, ordering, total duration,
  safe zones, and crop preservation are asserted.
- Labels: `none`, `source`, `archive`, and `ai_illustration` are preserved into
  usage, assembly, and export manifests where applicable.

Critical combinations are mandatory: AI-generated illustrative reference;
user-uploaded footage B-roll with explicit trim/audio; existing-managed scene
anchor; web-imported source with pending/restricted rights; archive footage for
news; generated reference that cannot act as evidence; video-as-image role
conflict; and scene-anchor/reference conflict. Provider URLs never satisfy the
managed-storage row.

## Cross-stage and cross-section contract assertions

The integration test records one row per profile and stage with required input
refs, output fingerprint, blocking findings, repair route, runtime mode,
billing owner, final-gate decision, and evidence test ID. It must fail on:

- missing or differently named export/import, schema version, state,
  disposition, readiness, error code, next action, or feature flag;
- a Vertical Drama domain task emitted directly as an arbitrary
  `OrchestraTaskKind`;
- Node/Python canonical hash, contract range, output-schema, task mapping, or
  request/result echo divergence;
- Redis-only currentness, client-inferred `canRepair`, Agent-inferred
  `provider_ready`, or provider-URL-inferred durability;
- model/provider/activation/export calls without successful owner/context
  admission;
- a stage whose output omits `inputContextFingerprint`, source refs,
  predecessor version/hash, contract version, policy hash, and verification
  disposition;
- long database transactions spanning model/provider calls;
- a repaired/recovered result treated as verified without fresh validation and
  CAS;
- a shadow result used for activation, user billing, provider readiness, or
  publication evidence;
- two billing/provider/domain owners for the same logical operation.

The test must also prove backward compatibility: legacy requests may omit new
fields while flags are off and are wrapped server-side; old response fields and
the current tRPC success/error envelope remain; old clients ignore additive
metadata; new clients tolerate unknown additive fields; old records are
projected only from provable facts; ambiguous legacy rows remain legacy or
needs-review.

## Browser, UX, responsive, and accessibility proof

The Playwright suite uses the real authenticated Vertical Drama route and the
real six-step wizard/component tree. It must not start another admission on
refresh, reconnect, tab restoration, or status polling. It records request
counts and idempotency keys so the assertion is behavioral, not visual only.

Run all thirteen functional profile flows at `390x844` and `1440x900`. Run the
complete risk-state matrix at `360x800`, `390x844`, `768x1024`, `1024x768`,
`1280x800`, and `1440x900` for at least one optional-fiction profile plus
Documentary, News, Software Review, and Hybrid Docu-Drama. Check light, dark,
and reduced-motion modes on representative risk flows.

Required states are loading, empty/no result, queued, running, succeeded,
recovered, awaiting action, retryable failed, stale, reconciliation required,
fatal failed, and cancelled. For each state verify action availability from the
server projection, editable workspace behavior, long Thai/English copy
wrapping, no horizontal overflow/clipping, no infinite spinner, and no raw
`TRPCClientError`-only presentation.

Browser evidence also proves:

- keyboard order reaches run, cancel, inspect, repair, retry, and continue;
- visible focus returns to the triggering control/dialog after mutation;
- live regions announce meaningful state changes once rather than every poll;
- disabled actions explain why and are not enabled from legacy local inference;
- status is not color-only, contrast and accessible names pass the existing
  axe pattern, and reduced motion suppresses nonessential progress animation;
- save/edit/preview/navigation remain usable while queued/running/degraded/
  stale/awaiting/reconciling;
- source/profile warnings identify the affected safe-to-expose item and next
  action without leaking signed URLs or cross-tenant IDs.

Write screenshots/traces only on failure or for the explicitly selected release
evidence states. Redact cookies, tokens, signed URLs, and private content before
retention. The generated `implementation/ui-browser-evidence.md` lists each
viewport/profile/mode/state as pass, fail, blocked, or not run.

## Five mandatory review loops

Execute exactly five ordered review passes. Each report lists files reviewed,
commands/evidence, findings by severity, fixes, residual risks, and final
`pass/fail`. A release-blocking finding is fixed at the authoritative owner,
then that loop and every later completed loop are rerun. “Reviewed” without
recorded assertions is not a pass.

### Loop 1 — Contract and dependency convergence

Compare spec, plan, TDD plan, all section files, exported schemas/symbols,
migration order, router contracts, Node/Python versions, task mapping, and flag
names. Build a producer/consumer map and run type/schema/golden-fixture tests.
Resolve the known story flag mismatch to
`verticalDramaStoryAssuranceActive` and the migration-number collision to the
next unused number (`0245` at this snapshot). Pass only when there are no
duplicate authorities, unresolved imports, enum mismatches, migration edits,
or backward-compatibility gaps.

### Loop 2 — Deterministic behavior and replay completeness

Run all ten E2E service/router scenarios, `FI-01`–`FI-25`, all state
transitions, all thirteen profiles, all stages, all visual-source registries,
restart/Redis/redelivery, and CAS races. Pass only with 100% fixture success,
100% terminal/actionable outcomes, zero invalid activations, stable replayed
projections, and no uncovered registry member.

### Loop 3 — Tenant, security, credit, and provider safety

Review every owner-scoped lookup, untrusted evidence boundary, redaction path,
budget, physical call, reservation settlement, one-time authorization, provider
submission, reconciliation, and cancellation race. Run cross-tenant,
prompt-injection, arbitrary/internal URL, oversized input, crash, and duplicate
effect tests. Pass only with zero tenant leaks, zero unauthorized tools/network
fetches, zero duplicate user deductions, zero duplicate provider tasks, and no
secret/private payload in trace/evidence.

### Loop 4 — Compatibility, UX, browser, and accessibility

Run legacy/new API contract tests, jsdom interaction tests, all-profile browser
flows, risk viewports, light/dark/reduced motion, keyboard/focus/live-region,
console, overflow, refresh/reconnect, and long-copy checks. Pass only when the
six-step routes and save/edit/preview/confirm behavior remain intact, every
failure has stable copy/action, and browser evidence has no raw exception,
dead action, accidental fiction source block, or infinite spinner.

### Loop 5 — Operations, rollout, rollback, and evidence integrity

Rehearse migration/dual-read/dual-write/proven-only backfill, worker/Redis
restart, metrics/alerts, Agent kill switch, task-family rollback, provider
reconciliation, deployment health, and canary stop criteria. Validate evidence
against the exact commit. Pass only when the runbook procedures work, rollback
preserves accepted/unsettled data, every required evidence class is current,
and the release-gate production tier exits zero.

## Test and evidence matrix

| Layer | Mandatory proof | Gate classification |
| --- | --- | --- |
| Shared types/pure validators | profile/context/hash/task/state/error/action/visual registry tests | local contract |
| Durable DB/state | migration schema, transaction admission/event/lease/CAS/reconciliation tests with real Postgres pattern | local DB + staging migration |
| Draft QC/router | observed regression, repair preconditions, compatibility, restart and duplicate delivery | local service/API + browser |
| Billing/provider | physical call, reservation/draw/refund, authorization, crash/reconciliation fakes | local fault; live provider separate |
| Node/Python runtime | common golden fixture, version/hash/task/output/security parity, fallback/budget/redaction | local cross-runtime; staging active separate |
| Profile/source/media | 13 profiles, source/visual registries, role/evidence/rights/disclosure/timeline/storage/staleness | local matrix + browser |
| Story/prompt/media chain | one-fingerprint stage lineage, predecessor contracts, final gates, no bypass | local integration + canary |
| UI/accessibility | jsdom action matrix, localized copy, reconnect; real-route Playwright viewports/axe/console/overflow | local browser + deployed browser |
| Operations | migration/backfill, restart/Redis, dashboards/alerts, runbook, kill switch, rollback | staging/production evidence |
| Source hygiene | `git diff --check`, owned-path review, no unrelated staging, generated artifact redaction | local closeout |

### Concrete local verification commands

Run commands from `/home/dev/projects/SmartSpecPro`. Update focused paths only
when implementation created the exact replacement documented in its section.

```bash
npm --workspace apps/web test -- shared/verticalDramaSeries/__tests__/assuranceProductionMatrix.test.ts shared/verticalDramaSeries/__tests__/seriesProfile.test.ts shared/verticalDramaSeries/__tests__/sourcePack.test.ts server/services/__tests__/verticalDramaAssuranceIntegration.test.ts server/services/__tests__/verticalDramaAssuranceFaultInjection.test.ts server/services/__tests__/verticalDramaAssuranceRepository.test.ts server/services/__tests__/verticalDramaAssuranceReconciliation.test.ts server/services/__tests__/verticalDramaAssuranceBilling.test.ts server/services/__tests__/verticalDramaDraftQualityQc.test.ts server/services/__tests__/verticalDramaDraftQualityQcJobs.test.ts server/services/__tests__/verticalDramaDraftLedger.test.ts server/routers/__tests__/verticalDramaSeries.assuranceProduction.test.ts
```

```bash
npm --workspace apps/web test -- shared/agentRuntime/__tests__/assurance.test.ts server/services/agentRuntime/__tests__/client.assurance.test.ts server/services/agentRuntime/__tests__/orchestraFinalGate.test.ts server/services/agentRuntime/__tests__/orchestraEventReplay.test.ts server/services/__tests__/verticalDramaAssuranceAdapter.agentRuntime.test.ts server/services/__tests__/verticalDramaPromptQc.test.ts server/services/__tests__/verticalDramaSourcePackService.test.ts server/services/__tests__/verticalDramaVisualSourceCore.test.ts server/services/__tests__/verticalDramaVisualSourceIntegration.test.ts server/services/__tests__/verticalDramaStartFrameGeneration.test.ts server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts server/services/__tests__/verticalDramaShotPromptJobs.test.ts server/services/__tests__/verticalDramaShotVideoPromptJobs.test.ts server/services/__tests__/verticalDramaBrollService.test.ts server/services/__tests__/verticalDramaStoryGenerationContracts.test.ts server/services/__tests__/verticalDramaStoryGenerationRuntime.test.ts server/services/__tests__/verticalDramaSeasonQcPasses.test.ts
```

```bash
npm --workspace apps/web test -- --environment jsdom client/src/components/verticalDramaSeries/__tests__/VerticalDramaAssuranceFlow.test.tsx client/src/components/verticalDramaSeries/__tests__/VerticalDramaDraftQualityQcPanel.test.tsx client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.test.tsx client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.lineage.test.tsx
```

```bash
cd python-backend && pytest tests/unit/test_agent_output_assurance.py tests/unit/test_openai_agents_contracts.py tests/unit/test_openai_agents_adapter.py tests/unit/test_openai_agents_orchestra.py tests/unit/test_openai_agents_vertical_drama_outputs.py tests/unit/test_openai_agents_trace_redaction.py tests/api/test_internal_openai_agents_runtime.py tests/security/test_openai_agents_subagent_security.py
```

```bash
npm --workspace apps/web run e2e:vertical-drama-assurance
npm --workspace apps/web run release-gate:vertical-drama-assurance -- --tier implementation --evidence ../../specs/feature/157-vertical-drama-assurance-production-activation-qc-convergence/implementation/release-evidence/manifest.json
npm --workspace apps/web run check
git diff --check
git status --short
```

Add `e2e:vertical-drama-assurance` to `apps/web/package.json` as
`playwright test tests/e2e/vertical-drama-assurance-production.spec.ts --project=chromium`.
The broad `npm --workspace apps/web run check` result is recorded separately;
baseline noise or OOM is `blocked` with captured evidence, never silently
reported as pass. Focused suites and changed-file diagnostics remain mandatory.
Python's configured coverage threshold remains authoritative; do not weaken it
to make a focused run green.

### Migration, staging, provider, and canary procedures

These procedures require explicit target environment and credentials and must
never be inferred from local tests:

1. On a disposable clone of current production schema/data shape, record row
   counts and representative old Feature 152/Draft QC reads, set a task-specific
   rehearsal database URL, and run
   `npm --workspace apps/web run db:migrate`. Run old/new reads, dual-write,
   bounded backfill dry-run, bounded apply, idempotent rerun, query-plan/index,
   draft-save concurrency, and application-level rollback checks. Never use
   `db:push` for production proof.
2. In staging, admit a synthetic allowlisted attempt, restart the exact worker
   after baseline and after provider authorization claim, expire only the
   synthetic Redis progress/pointer keys, redeliver the exact job, and run the
   reconciler twice. Prove one durable projection and exact-once effects.
3. For live provider proof, use a dedicated tenant/series, explicit small credit
   ceiling, one provider/model profile, one provider idempotency key, managed
   storage validation, and an injected/lab-controlled lost-response scenario.
   Record actual versus reserved/refunded credit and provider task count.
4. Deploy with all active flags off, verify health, migrations/readers,
   dashboards, alerts, and legacy traffic; then enable shadow for an internal
   cohort, Draft QC active canary, prompt/media chain canary, and story/season
   canary in dependency order. Never enable video prompt alone against an
   unverified/stale visual chain.
5. At each cohort, run authenticated browser scenarios, compare legacy/shadow
   baseline hashes/findings/costs, inspect terminality/reconciliation/duplicate
   metrics, and exercise the kill switch. Record rollback to legacy by task
   family without deleting events, changing accepted versions, blindly
   refunding, or resubmitting uncertain tasks.

## Release gate, promotion, and rollback

Promotion is denied unless all of these invariants are true for the exact
release commit and evidence window:

- 100% of mandatory focused contract/recovery/replay fixtures pass;
- 100% of all thirteen profile rows and all registered visual/source dimensions
  are represented and pass expected positive/blocking behavior;
- 100% of admitted synthetic/canary runs reach a durable terminal or actionable
  waiting state within the configured lease/reconciliation window;
- 100% of activation, paid-provider, assembly, export, and publish decisions
  have current context fingerprint, final-gate evidence, and CAS/authorization
  result;
- zero invalid candidate activations, duplicate user-credit deductions,
  duplicate paid provider submissions, tenant-scope leaks, or unredacted
  sensitive evidence;
- 100% of browser-visible failures have a stable code, localized safe message,
  and server-owned next action; no raw exception-only view, dead repair button,
  accidental fiction source block, or infinite spinner;
- shadow comparison has no unexplained accepted-baseline divergence and zero
  user/domain/provider side effects;
- staging migration/backfill/restart/Redis proof, authenticated deployed browser
  proof, live-provider reconciliation proof, dashboard/alert proof, canary proof,
  and rollback drill are all `pass` rather than absent or inferred;
- all five review reports pass and `git diff --check` plus owned-path review are
  clean.

Any invalid activation, duplicate financial/provider effect, tenant breach,
unbounded run, unknown-credit/provider reconciliation beyond the operator SLA,
registry coverage gap, or inability to execute the kill switch is an immediate
release blocker and canary stop. Provider latency/outage alone may produce a
safe retryable/awaiting/reconciliation state; it is not allowed to corrupt
state or lock editing.

Rollback is application/flag based. Assert the domain kill switch, stop new
task-family Agent admissions and provider authorizations, keep dual-read and
reconciliation workers running, preserve accepted candidates/events/call
records, and route supported advisory work to the deterministic legacy path.
Do not roll back additive schema destructively, clear Redis broadly, delete
evidence, revert user edits, automatically refund uncertain usage, or resubmit
an uncertain provider task. Keep the new reader until all old leases,
reservations, authorizations, and provider reconciliations are terminal.

## Compatibility and UX closeout

The release is backward compatible only when all current six wizard step IDs,
routes, direct save/edit, preview/synthesize → edit → confirm flow, local/session
recovery, profile/source-pack pointer recovery, history/candidate selection,
and existing legacy fields remain functional with every new flag disabled.

New projection fields are additive. Server capability booleans and
`nextAction` are authoritative when present; legacy client inference is used
only when fields are absent. A refresh/status read never creates an attempt.
Recovered is never presented as succeeded/provider-ready. Reconciliation
disables paid retry but not editing/inspection. Hard findings block only the
unsafe transition, while advisory findings preserve normal authoring.

Unknown new additive fields are tolerated by clients; known stable errors are
rendered through Thai/English message keys with a generic safe fallback and
trace ID. Authorization failures do not disclose another tenant's existence.
The browser evidence must demonstrate these behaviors rather than relying only
on component snapshots.

## Definition of done

Feature 157 is complete only when every item below is satisfied:

1. Sections 01–09 expose one consistent context, assurance, state, error,
   runtime, persistence, billing, provider, API, UX, security, and operations
   contract; the canonical flag names and Node/Python versions match.
2. The original recovered Draft QC repair precondition failure has service,
   job, router, jsdom, and authenticated browser regression proof.
3. Invalid revisions and repairs preserve the last valid baseline/candidate;
   no invalid or stale candidate can win final gate/CAS.
4. Redis expiry, worker restart, cancellation, duplicate delivery, browser
   reconnect, and stale source recover one durable projection without duplicate
   model calls, credits, provider tasks, events, or activations.
5. Every enabled model/provider/activation/assembly/export entry point performs
   tenant/domain authorization, current context admission, deterministic pre-
   and post-validation, and the correct final boundary gate.
6. Runtime legacy, shadow, active, outage/fallback, recovered, and kill-switch
   modes are bounded, traced, redacted, correctly billed, and independently
   evidenced; shadow never affects the user result or charge.
7. All thirteen profile rows pass their exact source/claim/evidence/rights/
   disclosure/B-roll policy, and fiction remains usable with explicit optional
   source.
8. All source kinds, media types/origins, semantic roles, evidence statuses,
   rights/disclosure states, audio policies, fit modes, and mandatory unsafe
   visual combinations are covered without implicit conversion or status
   promotion.
9. One typed context fingerprint and explicit predecessor/source/role refs flow
   through premise, architecture, full story, shot, start frame, reference,
   video prompt, B-roll, assembly, post-QC, and final gate; changes invalidate
   only affected descendants.
10. Prompt over-limit and provider-uncertain paths are actionable and never
    become silent truncation, blind retry, automatic refund, or duplicate
    submission.
11. The full test/evidence matrix passes, all five review loops pass, and the
    implementation-tier release gate exits zero.
12. Staging migration/backfill, restart/Redis, authenticated browser,
    live-provider, deployment, dashboard/alert, canary, and rollback evidence
    are separately recorded and the production-tier release gate exits zero
    before production activation is claimed.
13. The operator runbook can inspect an exact attempt/fingerprint/candidate,
    recover stale work, reconcile credit/provider uncertainty, use the kill
    switch, roll back one task family, and distinguish application, migration,
    worker, browser, provider, deployment, and canary failures.
14. No unrelated dirty-worktree file is modified, staged, or claimed; generated
    evidence is redacted, scoped to the release commit, and retained according
    to policy.

## Safe commit and handoff boundary

Commit Section 10 test/harness/evidence-parser work separately from production
contract fixes. If a review finds a production defect, fix it in the section
owner's files with its focused tests, then return to Section 10 and rerun the
affected and downstream review loops. Do not stage the entire untracked feature
directory or unrelated work; stage only owned files/hunks.

The final handoff reports four states independently: implementation/local proof,
staging/deployment proof, live-provider/canary proof, and production activation.
It lists every skipped or blocked gate. “Production ready” is permitted only
when the production-tier manifest is valid for the exact deployed commit and
all release invariants above are passing.

## UI/UX Contract

### Target User / JTBD

The final proof shows a creator can complete the unchanged workflow and recover from supported failures while operators see evidence for each gate.

### Surface Inventory

Authenticated story/QC/prompt/media/B-roll surfaces plus operator evidence and release dashboards are covered; hidden test-only UI is not proof.

### Component Map

Section 08 owns the reusable projection/components; this section verifies integration with real routers, queues, storage, provider, and flags.

### State Matrix

Loading, empty, queued, running, succeeded, recovered, stale, retryable/fatal failure, cancelled, and reconciliation-required each need evidence and correct actions.

### Responsive Matrix

Browser proof covers 360x800, 390x844, 768x1024, 1024x768, 1280x800, and 1440x900 with Thai/English where supported.

### Accessibility Acceptance

Keyboard, focus, labels, announcements, contrast/non-color status, and no data clipping are included in the evidence manifest.

### Copy Contract

Screenshots/traces use stable localized keys and truthful actionable state; raw exceptions are not accepted as user-facing copy.

### Browser Evidence Required

Each E2E scenario links to authenticated browser, provider, queue, storage, database, and ledger evidence or remains a release blocker.
