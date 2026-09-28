# Section 01 — Assurance contracts, context snapshot, and runtime mapping

## Outcome and implementation context

This section establishes the additive, versioned contract layer that every later
Feature 157 adapter depends on. It does not activate Agent Runtime for Vertical
Drama, persist assurance attempts, charge credits, submit provider work, or add a
new router/UI flow. After this section, callers can construct and validate a
tenant-scoped assurance request, capture a deterministic production-context
snapshot, map each Vertical Drama task onto an existing Agent Runtime capability,
derive a server-authoritative UI projection, and wrap a legacy request without
changing the legacy request's required fields.

The motivating production failure is that Draft QC can retain an exact valid
baseline while its current API projection says `failed`; repair then cannot prove
that a completed current result exists. This section does not repair that job or
ledger behavior—that belongs to Sections 02 and 04—but it fixes the vocabulary
and normalization seams so later sections cannot encode a recovered result as an
ordinary failure or infer repairability in the browser.

The implementation is deterministic-first:

1. Node/domain services remain authoritative for tenant ownership, source and
   profile facts, candidate activation, credits, provider submission, and final
   gates.
2. `ProductionContextSnapshot` is composed from server-issued profile,
   source-pack, visual-source, claim/coverage, and binding facts. Model text is
   never the identity or fingerprint authority.
3. The existing Agent Runtime assurance envelope remains the inner runtime
   contract. Vertical Drama adds a typed outer domain contract and an explicit
   mapping to existing `OrchestraTaskKind` values; it does not pass arbitrary
   Vertical Drama strings to the runtime.
4. All new fields and exports are additive. All Feature 157 flags are off by
   default, so deploying this section cannot change current execution behavior.

SocratiCode was unavailable during planning (`codebase_status` was not exposed),
so the file/symbol inventory below is grounded in targeted repository reads and
must be rechecked with `codebase_impact` before implementation if SocratiCode is
available then.

## Scope and boundaries

In scope:

- Versioned Zod schemas/types for the Vertical Drama assurance request, result,
  public state, disposition, readiness, mode, stable error codes, and UI
  projection.
- A versioned `ProductionContextSnapshot` schema with canonical hashing,
  explicit optional-source decisions, readiness evaluation, and stale/change
  classification.
- A total domain-task-to-runtime-task mapping and capability-manifest check.
- Pure admission, legacy wrapping, flag selection, result normalization, and UI
  projection seams.
- Server-owned context capture that reads authoritative inputs through injected
  tenant-scoped loaders and performs no model/provider call.
- Default-off flag registration and focused contract tests.

Out of scope:

- Database tables, migrations, backfills, durable attempts/events, Redis leases,
  reconciliation, CAS activation, billing, provider authorization, Python Agent
  Runtime changes, router mutations, and browser UI changes.
- Moving or renaming the generic client-side `StoryboardProductionContext`.
- Changing shared `OrchestraTaskKindSchema` or creating a new Agent SDK bridge.
- Adding a hard admission gate to any current Vertical Drama entry point.

## Existing authorities and call flow to preserve

The implementer must preserve these existing boundaries:

- `apps/web/shared/agentRuntime/orchestraSchemas.ts` owns
  `OrchestraTaskKindSchema`, `OrchestraAssuranceRequestSchema`,
  `OrchestraAssuranceResultSchema`, `canonicalJson`, and the current runtime
  budget/evidence/side-effect schemas.
- `apps/web/shared/agentRuntime/types.ts` owns `AgentRuntimeRequestSchema`,
  runtime contract-version checks, surfaces, and entry points. Its request
  already accepts optional `assurance`.
- `apps/web/server/services/agentRuntime/requestBuilder.ts` owns
  `BuildAgentRuntimeRequestInput` and `buildAgentRuntimeRequest`; it already
  passes a supplied assurance envelope through schema validation.
- `apps/web/shared/agentRuntime/skillManifest.ts` owns
  `SkillCapabilityManifestSchema`, `supportsSkillCapabilityCaller`, and
  `toAgentCapabilityManifest`.
- `apps/web/shared/verticalDramaSeries/seriesProfile.ts` owns
  `VD_SERIES_PROFILE_IDS`, `SERIES_PROFILE_REGISTRY`, `getSeriesProfile`, and
  `resolveSeriesProfile`. The registry currently contains thirteen profiles and
  remains the sole profile/policy authority.
- `apps/web/shared/verticalDramaSeries/sourcePack.ts` owns source rights,
  disclosure/status enums and `evaluateSourcePackReadiness`.
- `apps/web/shared/verticalDramaSeries/visualSource.ts` owns
  `VisualSourceSnapshot`, semantic roles, evidence statuses, source slots,
  segments, and coverage contracts.
- `apps/web/server/services/verticalDramaVisualSourceSnapshotService.ts` owns
  `createVisualSourceSnapshot`, `validateSnapshotForRun`, and
  `snapshotStaleReason`; the new production context composes this snapshot and
  does not replace it.
- `apps/web/server/services/verticalDramaVisualSourceCore.ts` owns
  `visualSourceFingerprint` and existing visual coverage/staleness validators.
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts` owns the unrelated
  generic `StoryboardProductionContext` used by Media Studio/Storyboard Review.
  Treat it as a compatibility input only. Do not import this client module into
  shared/server code, rename the interface, or conflate it with the new durable
  Vertical Drama context.

The intended future call flow is:

`router/job -> captureProductionContextSnapshot -> admitVerticalDramaAssuranceRequest -> mapVerticalDramaTaskToRuntimeCapability -> existing buildAgentRuntimeRequest -> deterministic result normalization -> later durable final gate/CAS`.

Only the pure/capture/mapping portion is implemented here. Later sections wire
the call flow into routers, jobs, ledgers, and the runtime.

## Exact file and symbol plan

### New shared contracts

Create `apps/web/shared/verticalDramaSeries/verticalDramaAssuranceContext.ts`
with these exported symbols:

- `VERTICAL_DRAMA_PRODUCTION_CONTEXT_SCHEMA_VERSION` — initial version `1`.
- `ProductionContextReadinessSchema` and `ProductionContextReadiness` —
  `draft`, `verified`, `provider_ready`, `production_ready`, or
  `needs_review`, plus stable blocking reason codes.
- `ProductionContextSourcePackDecisionSchema` — `selected` or
  `explicit_none`. `explicit_none` is valid only when the selected profile's
  source policy is optional.
- `ProductionContextSnapshotSchema` and `ProductionContextSnapshot`.
- `ProductionContextSnapshotInput` — the unhashed authoritative input used by
  the builder.
- `buildProductionContextSnapshot` — validates and normalizes input, computes
  the fingerprint, and returns immutable identity/revision/hash fields.
- `fingerprintProductionContextSnapshot` — hashes only the canonical payload,
  excluding `fingerprint` and non-authoritative capture timestamps.
- `validateProductionContextSnapshotRef` — compares snapshot ID, revision, and
  fingerprint and returns a stable stale/mismatch result rather than throwing
  raw text.
- `productionContextStaleReasons` — returns deterministic changed domains so
  later sections can invalidate the smallest downstream scope.

`ProductionContextSnapshot` must contain:

- `schemaVersion`, `snapshotId`, numeric `revision`, `fingerprint`, `seriesId`.
- Profile identity and policy versions: `profileId`, profile version,
  `contentKind`, visual-grounding version/fingerprint, fact-policy version, and
  B-roll-policy version.
- `sourcePackPolicy` (`required`, `optional`, or `not_applicable`), the explicit
  `sourcePackDecision`, and either a normalized source-pack reference or `null`.
  A selected source pack carries pack ID, version, fingerprint, readiness,
  slot keys, asset IDs, segment IDs, semantic roles, evidence status,
  rights status, and disclosure status.
- Visual-source snapshot ID/revision/fingerprint and visual-canon
  version/fingerprint.
- Claim-ledger and coverage-plan version/fingerprint fields normalized to
  explicit `null`, not omitted, when unavailable.
- Server-issued story-control, character, scene, shot, claim, coverage, slot,
  asset, segment, and media-binding references needed by downstream stages.
- A computed overall readiness and blocking reason list.

Canonicalization must reuse `canonicalJsonStringify` and `sha256Hex` from
`apps/web/shared/verticalDramaSeries/artifacts.ts`; do not introduce a third
JSON/hash implementation. Sort object keys through that helper and normalize
set-like reference arrays by stable identity before hashing. Preserve order for
ordered timeline/binding arrays where order is authoritative. Explicit `null`
source/claim/coverage decisions participate in the hash. Capture timestamps,
display labels, and generated prose do not determine identity unless they are
already authoritative contract fields.

Create `apps/web/shared/verticalDramaSeries/assurance.ts` with these exports:

- `VERTICAL_DRAMA_ASSURANCE_SCHEMA_VERSION` — initial version `1`.
- `VERTICAL_DRAMA_ASSURANCE_TASK_KINDS` and
  `VerticalDramaAssuranceTaskKindSchema` for `premise_expansion`,
  `story_architecture`, `full_story`, `draft_qc`, `draft_repair`,
  `start_frame_prompt`, `reference_image_prompt`, `video_prompt_qc`,
  `broll_assembly_qc`, and `season_qc`.
- `VERTICAL_DRAMA_ASSURANCE_STATES` and `VerticalDramaAssuranceStateSchema` for
  `queued`, `running`, `awaiting_action`, `succeeded`, `recovered`,
  `retryable_failed`, `fatal_failed`, `cancelled`, `stale`, and
  `reconciliation_required`.
- `VerticalDramaAssuranceDispositionSchema` for `verified`,
  `recovered_needs_repair`, `blocked`, and `retryable`.
- `VerticalDramaAssuranceReadinessSchema` for `draft`, `verified`,
  `provider_ready`, and `production_ready`.
- `VerticalDramaAssuranceModeSchema` for `agent_active`, `agent_shadow`,
  `legacy_deterministic`, and `recovered_result`; keep fallback reason as a
  separate stable code.
- `VERTICAL_DRAMA_ASSURANCE_ERROR_CODES` and
  `VerticalDramaAssuranceErrorCodeSchema`. The initial closed set is
  `VD_ASSURANCE_REQUEST_INVALID`, `VD_ASSURANCE_TENANT_MISMATCH`,
  `VD_ASSURANCE_CONTEXT_MISSING`, `VD_ASSURANCE_CONTEXT_STALE`,
  `VD_ASSURANCE_SOURCE_NOT_READY`, `VD_ASSURANCE_ROLE_INVALID`,
  `VD_ASSURANCE_EVIDENCE_STATUS_INVALID`, `VD_ASSURANCE_TASK_UNMAPPED`,
  `VD_ASSURANCE_CAPABILITY_UNAVAILABLE`,
  `VD_ASSURANCE_RUNTIME_VERSION_UNSUPPORTED`, and
  `VD_ASSURANCE_SIDE_EFFECT_POLICY_INVALID`.
- `VerticalDramaAssuranceRequestSchema`/type, result schema/type, finding
  schema/type, snapshot-ref/source-ref schemas, and
  `AssuranceUiProjectionSchema`/type.
- `VERTICAL_DRAMA_RUNTIME_TASK_MAP` and
  `mapVerticalDramaTaskToRuntimeCapability`.
- `buildAssuranceUiProjection` and `wrapLegacyVerticalDramaAssuranceRequest`.

The logical request contains tenant/user identity, domain task kind, mapped
runtime kind, source and context snapshot references, input references,
contract/output versions, rule-pack IDs, policy/model hashes, compatibility mode
(`native` or `legacy_wrapped`), required readiness, idempotency key, bounded
budget, and side-effect policy (`none`, `candidate_only`, or
`provider_ready`). The logical result preserves execution/attempt IDs, state,
disposition, readiness, findings, runtime/trace metadata, assurance/fallback
mode, stable error code, and next action. Raw model text is never a required
contract field.

Use this total runtime mapping:

| Domain task | Existing `OrchestraTaskKind` | Output authority |
| --- | --- | --- |
| `premise_expansion`, `story_architecture`, `full_story`, `season_qc` | `structured_generation` | existing story/season contracts plus deterministic domain gates |
| `draft_qc`, `draft_repair`, `video_prompt_qc`, `broll_assembly_qc` | `skill_execution` | Node QC/domain validators and final gate |
| `start_frame_prompt`, `reference_image_prompt` | `image_prompt` | existing prompt composer and image contract |

`mapVerticalDramaTaskToRuntimeCapability` must return the domain task, mapped
runtime kind, required manifest task type, and output authority. It must verify
that `OrchestraTaskKindSchema` accepts the mapped kind and, when a manifest is
provided, that its task types and caller support include the mapping. Missing or
incompatible capability is typed; there is no silent arbitrary-string fallback.

Modify `apps/web/shared/verticalDramaSeries/index.ts` to export
`verticalDramaAssuranceContext` and `assurance`. Keep both modules browser-safe:
no DB, filesystem, server service, or Node-only import.

### New server adapters

Create `apps/web/server/services/verticalDramaProductionContext.ts` with:

- `ProductionContextOwner` (`tenantId`, `userId`) and
  `ProductionContextCaptureDependencies` for tenant-scoped profile,
  source-pack, visual snapshot, claim/coverage, story-control, canon, and
  binding loaders.
- `captureProductionContextSnapshot` — loads every input under the supplied
  owner/series scope, rejects owner mismatch or unavailable required facts, and
  delegates deterministic assembly/hash work to
  `buildProductionContextSnapshot`.
- `evaluateProductionContextReadiness` — translates existing
  `evaluateSourcePackReadiness`, visual coverage/evidence/rights/disclosure,
  and stage requirements into the shared readiness contract.
- `validateProductionContextAdmission` — validates tenant, source/context ref,
  role/status enums, and required stage readiness using stable codes.

The capture dependencies make unit tests pure and prevent the new service from
creating a parallel persistence owner. The default dependency implementation
may call `getSeriesProfile`, existing source-pack loaders,
`createVisualSourceSnapshot`/visual snapshot readers, and existing claim/canon
services, but it must never accept client-supplied ownership or model-invented
IDs as authority.

Create `apps/web/server/services/verticalDramaAssuranceAdapter.ts` with:

- `VerticalDramaAssuranceFlagSnapshot` and
  `getVerticalDramaAssuranceFlagSnapshot`.
- `selectVerticalDramaAssuranceMode` — kill switch wins; otherwise choose the
  task-specific active flag, then shadow, then legacy deterministic.
- `admitVerticalDramaAssuranceRequest` — validates owner, context/source refs,
  readiness, versions, side-effect policy, mapping, and idempotency inputs; it
  returns a normalized logical request or a typed admission finding and does
  not perform a network call.
- `toOrchestraAssuranceRequest` — maps the logical request to the existing
  `OrchestraAssuranceRequestSchema`, including the mapped runtime task kind,
  contract hash, evidence/output policy, budget, and side-effect policy.
- `normalizeVerticalDramaAssuranceResult` — maps runtime/legacy/recovered
  outcomes into the shared domain result without treating `recovered` as
  `succeeded`.

The side-effect translation is explicit: `none` maps to runtime `read_only`;
`candidate_only` maps to `approval_required`; `provider_ready` maps to
`mutating_allowed` only when a later section supplies valid one-time
authorization. Section 01 admission must reject a provider-ready request that
does not yet have the required authorization seam; it must not fabricate one.

### Existing runtime files: inspect and regression-test, do not change by default

Do not modify `apps/web/shared/agentRuntime/orchestraSchemas.ts`,
`apps/web/shared/agentRuntime/types.ts`, or
`apps/web/server/services/agentRuntime/requestBuilder.ts` in this section unless
a red test proves the typed adapter cannot use the existing optional assurance
envelope. The planned outer Vertical Drama schemas hold domain/source/context
metadata, while the existing generic inner envelope carries the mapped runtime
task and contract hash. This avoids an unnecessary Node/Python wire-version
change. If implementation evidence proves an additive generic field is
unavoidable, stop this section at a compatibility decision: update Node and
Python contract versions together in Section 06 rather than emitting a Node-only
wire shape here.

### Feature flags

Modify `apps/web/shared/featureFlags.ts` only to add these keys to
`TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`:

- `verticalDramaAssuranceShadow: false`
- `verticalDramaDraftQcOrchestraActive: false`
- `verticalDramaPromptQcOrchestraActive: false`
- `verticalDramaStoryAssuranceActive: false`
- `verticalDramaAssuranceKillSwitch: false`

No alias is added. The kill switch is an override, not an enable flag: when it
is true, selection returns `legacy_deterministic` even if an active/shadow flag
is true. With every default false, current legacy behavior is unchanged.

## Contract and implementation decisions

### Snapshot identity and readiness

- Snapshot ID, revision, and fingerprint are immutable. A changed authoritative
  input creates a new revision/fingerprint; no running snapshot is mutated.
- Fiction with optional source records `sourcePackDecision: explicit_none` and
  hashes `sourcePack: null`. Missing source is not silently treated as absent.
- Profiles with required source policy cannot use `explicit_none`. They may be
  `draft`/`needs_review` for editing, but only proven source/visual readiness may
  satisfy `provider_ready` or `production_ready`.
- Profile, source, claim/evidence, visual canon, coverage, and binding changes
  must each change the overall fingerprint. Key insertion order must not.
- Invalid or unsupported semantic roles/evidence statuses fail schema/admission
  with stable codes. Reuse the existing visual enums; do not create a divergent
  role/status list.
- The snapshot contains references and hashes, not provider URLs or copied
  durable content. Tenant ownership is enforced by the server capture/admission
  record, because the existing visual snapshot itself is tenant-scoped in
  persistence rather than embedding tenant identity in its shared payload.

### Legacy and compatibility behavior

- `wrapLegacyVerticalDramaAssuranceRequest` accepts the old domain payload as
  an opaque input reference, preserves its existing required fields unchanged,
  adds `compatibilityMode: legacy_wrapped`, and creates typed source/context
  references only from server-proven facts.
- Missing optional claim/coverage data is normalized to explicit `null`; missing
  tenant, source identity, or required context is never invented.
- Legacy clients continue receiving existing fields. New assurance projection
  fields are additive and server-derived. Unknown additive fields must remain
  safe for older parsers.
- A legacy record with failed status plus exact recovered-result evidence maps
  to `state: recovered` and `disposition: recovered_needs_repair`; it never maps
  to `succeeded/verified`.

### Server-owned UI projection

`buildAssuranceUiProjection` implements the state/action matrix from the spec.
It derives `nextAction` and every `can*` field from state, disposition,
readiness, current source/version match, recovery presence, and reconciliation
status. The client cannot opt into repair or paid continuation by changing a
local boolean. At minimum:

- queued/running remains editable and inspectable, allows cancel, and blocks
  repair/retry/paid continuation;
- succeeded/verified allows continuation only when required readiness is met;
- recovered/current allows inspect, repair, and retry but never paid/export;
- stale disallows repair against stale input and points to retry from fresh
  source;
- reconciliation-required blocks paid retry and points to reconcile;
- fatal/cancelled remains editable/inspectable and requires a new run.

## Tests first

Write the tests below before implementation. Keep each test focused and use the
existing Vitest conventions.

### Shared context tests

Create
`apps/web/shared/verticalDramaSeries/__tests__/verticalDramaAssuranceContext.test.ts`:

1. `canonicalizes object key order without changing the production-context fingerprint`.
2. Parameterized tests prove each authoritative profile, source-pack,
   claim/evidence, visual-canon, coverage, slot/asset/segment, and binding change
   changes the fingerprint.
3. `hashes explicit null source-pack decision for optional fiction`.
4. `rejects explicit-none source for every required-source profile`.
5. `preserves ordered timeline bindings while normalizing set-like reference arrays`.
6. `detects stale snapshot id, revision, and fingerprint with stable codes`.
7. `rejects unsupported semantic role and evidence status`.

Extend
`apps/web/shared/verticalDramaSeries/__tests__/seriesProfile.test.ts` only if
needed for registry parity: assert every value in `VD_SERIES_PROFILE_IDS`
appears exactly once in `SERIES_PROFILE_REGISTRY` and resolves source, fact,
visual, and B-roll policy. This test must fail when a future profile is added
without an assurance policy path.

### Shared assurance/mapping tests

Create
`apps/web/shared/verticalDramaSeries/__tests__/verticalDramaAssurance.test.ts`:

1. Every value in `VERTICAL_DRAMA_ASSURANCE_TASK_KINDS` maps to a value accepted
   by `OrchestraTaskKindSchema` and to a declared output authority.
2. Unmapped domain tasks fail with `VD_ASSURANCE_TASK_UNMAPPED`.
3. Missing/incompatible capability manifests fail with
   `VD_ASSURANCE_CAPABILITY_UNAVAILABLE`; compatible manifests pass.
4. Logical request parsing rejects missing context, malformed fingerprints,
   unsupported runtime/contract version, and invalid side-effect policy with
   stable codes.
5. A wrapped legacy request stays parseable, preserves the original required
   fields/input reference, and sets `legacy_wrapped` without inventing source or
   ownership.
6. `buildAssuranceUiProjection` covers all public states and proves only
   `succeeded + verified + sufficient readiness` can continue across a hard
   boundary.
7. Recovered results remain repairable/actionable but never become verified.

### Server context/admission tests

Create
`apps/web/server/services/__tests__/verticalDramaProductionContext.test.ts`:

1. `captureProductionContextSnapshot` composes exact profile/source/visual/
   claim/coverage/binding references from injected authoritative loaders.
2. Optional fiction with no source creates an explicit-null decision.
3. Documentary, News, Review, and Hybrid profiles fail provider-ready admission
   when source/evidence/rights/disclosure/coverage readiness is insufficient.
4. Tenant/user/series mismatch fails closed with
   `VD_ASSURANCE_TENANT_MISMATCH` and no downstream loader/model call.
5. A stale visual snapshot or changed context reference fails with
   `VD_ASSURANCE_CONTEXT_STALE`.
6. Draft readiness permits edit/preview while provider readiness remains
   blocked.

Create
`apps/web/server/services/__tests__/verticalDramaAssuranceAdapter.test.ts`:

1. Admission emits both domain and mapped runtime task kinds and validates the
   current runtime compatibility range.
2. `toOrchestraAssuranceRequest` parses with the existing
   `OrchestraAssuranceRequestSchema` and preserves attempt/contract hash.
3. Missing tenant, context, source, manifest, or required readiness returns the
   corresponding stable code before any runtime call.
4. Side-effect translation is exact and provider-ready admission cannot invent
   authorization.
5. Kill switch overrides every active/shadow combination; otherwise
   task-specific active wins over shadow, and all-default-off selects legacy.
6. Runtime failed plus exact baseline recovery normalizes to
   `recovered/recovered_needs_repair`, not `succeeded`.

### Feature flag and existing-runtime regression tests

Create `apps/web/shared/__tests__/verticalDramaAssuranceFeatureFlags.test.ts` to
prove all five keys exist in `TenantFeatureFlags` and `ALLOWED_FEATURE_FLAGS`,
all default to false, typo variants are rejected, and kill-switch precedence is
handled by the adapter selector.

Run the existing regression files unchanged:

- `apps/web/shared/agentRuntime/__tests__/assurance.test.ts`
- `apps/web/server/services/agentRuntime/__tests__/client.assurance.test.ts`
- `apps/web/server/services/__tests__/agentRuntimeRequestBuilder.test.ts`
- `apps/web/shared/verticalDramaSeries/__tests__/sourcePack.test.ts`
- `apps/web/server/services/__tests__/verticalDramaVisualSourceIntegration.test.ts`

## Implementation sequence

1. Add failing shared context schema/hash tests and registry-drift tests.
2. Implement `verticalDramaAssuranceContext.ts` using existing canonical JSON/
   SHA-256 helpers; export it from the barrel.
3. Add failing domain assurance, task-map, UI projection, and legacy-wrapper
   tests; implement `assurance.ts` and its barrel export.
4. Add failing server capture/admission tests; implement
   `verticalDramaProductionContext.ts` with injected tenant-scoped loaders.
5. Add failing adapter/flag-selection tests; implement
   `verticalDramaAssuranceAdapter.ts` without invoking Agent Runtime.
6. Register the five default-off flags and add the dedicated flag parity test.
7. Run focused tests and existing runtime/source/visual regressions. Inspect the
   final diff to confirm no generic runtime/Python/DB/router/UI file changed.

## Migration, feature flags, deployment, and rollback

There is no database migration or backfill in Section 01. “Schema” here means
additive TypeScript/Zod contracts. No Python wire schema changes are required
because every domain task maps to an existing `OrchestraTaskKind`. Section 02
owns any durable migration after it inventories Feature 151/152 persistence.

Deployment order:

1. Deploy shared schemas, pure helpers, server capture/adapter seams, and
   default-off flag definitions.
2. Do not wire an existing router/job to the adapter in this section.
3. Verify legacy requests and all existing Agent Runtime contract tests still
   pass with all flags false.
4. Hand the frozen contracts to Section 02 before adding durable fields.

Rollback is application-only and safe: revert callers to the current legacy
path or set `verticalDramaAssuranceKillSwitch=true`. Because this section writes
no assurance records, changes no active version, and performs no paid side
effect, rollback requires no data deletion/refund/requeue. Do not remove accepted
domain/source/visual data. The new shared fields may remain deployed and unused
while flags are off.

## Verification commands

Run focused web tests with the repository command:

`npm --workspace apps/web test -- apps/web/shared/verticalDramaSeries/__tests__/verticalDramaAssuranceContext.test.ts apps/web/shared/verticalDramaSeries/__tests__/verticalDramaAssurance.test.ts apps/web/server/services/__tests__/verticalDramaProductionContext.test.ts apps/web/server/services/__tests__/verticalDramaAssuranceAdapter.test.ts apps/web/shared/__tests__/verticalDramaAssuranceFeatureFlags.test.ts`

Then run the existing regression set:

`npm --workspace apps/web test -- apps/web/shared/agentRuntime/__tests__/assurance.test.ts apps/web/server/services/agentRuntime/__tests__/client.assurance.test.ts apps/web/server/services/__tests__/agentRuntimeRequestBuilder.test.ts apps/web/shared/verticalDramaSeries/__tests__/seriesProfile.test.ts apps/web/shared/verticalDramaSeries/__tests__/sourcePack.test.ts apps/web/server/services/__tests__/verticalDramaVisualSourceIntegration.test.ts`

Run `git diff --check` and inspect a path-scoped diff. If changed-file
TypeScript diagnostics are available, run them separately. A broad
`npm --workspace apps/web run check` is diagnostic only because this checkout
may be baseline-noisy/OOM; report focused results and broad-check results
separately.

## Acceptance criteria

Section 01 is accepted only when all of the following are true:

1. The two new shared modules are browser-safe, exported from the existing
   Vertical Drama barrel, and contain no server/DB imports.
2. Snapshot fingerprints are key-order stable and change for every authoritative
   profile/source/claim/canon/coverage/binding change; optional source absence is
   explicit and hashed.
3. All thirteen registered profiles resolve a source/fact/visual/B-roll policy,
   and registry drift is test-failing.
4. Every declared Vertical Drama task maps to an existing valid runtime kind and
   compatible manifest requirement; there is no arbitrary task passthrough.
5. Tenant mismatch, missing/stale context, invalid role/evidence status,
   insufficient readiness, unmapped task, unsupported runtime version, and
   invalid side-effect policy fail closed with the specified stable codes.
6. The logical request/result includes source/context/version/hash/budget/
   side-effect lineage and never treats raw model prose as authority.
7. The server-owned UI projection covers every public assurance state and only
   permits continuation when state, disposition, version, and readiness all
   allow it.
8. Legacy wrapping preserves existing required fields and maps exact recovered
   evidence to `recovered/recovered_needs_repair`, never to verified success.
9. All five Feature 157 flags are allowlisted and default off; kill switch
   precedence is proven.
10. Existing Agent Runtime, profile, source-pack, and visual-snapshot regressions
    pass; no Python, DB schema/migration, router, job, credit, provider, or UI
    behavior changed.
11. The implementation diff is limited to the exact Section 01 files above and
    passes `git diff --check`.

## Handoff and safe commit boundary

The commit boundary is the shared contracts, pure/server adapters, default-off
flags, barrel exports, and focused tests only. Section 02 may depend on the
frozen `ProductionContextSnapshot` reference, domain request/result/state/error
schemas, and task map. If Section 02 discovers that durable ownership requires a
contract change, update this section's shared schema and tests first; do not
fork a persistence-only shape. Sections 03–10 must consume these exports rather
than define parallel readiness, error, task-map, or UI-action vocabularies.

## UI/UX Contract

### Target User / JTBD

Creators and operators need one stable assurance vocabulary explaining what can continue, what needs repair, and why.

### Surface Inventory

Existing story, QC, prompt, media, and job-status surfaces consume the additive projection; no mandatory new screen is introduced here.

### Component Map

Shared schemas are rendered by existing status components and typed router responses; this section owns no parallel UI component.

### State Matrix

`queued`, `running`, `awaiting_action`, `succeeded`, `recovered`, failures, `cancelled`, `stale`, and reconciliation states map deterministically to readiness and next action.

### Responsive Matrix

The projection remains readable at 390x844, 768x1024, and 1440x900; wrapping is required and data may not be clipped.

### Accessibility Acceptance

Every state/action has a programmatic label, keyboard path, focus treatment, and live progress/error announcement.

### Copy Contract

Thai/English copy uses stable state/error keys; raw provider, database, or stack details never reach creator-facing responses.

### Browser Evidence Required

Sections 08/10 must prove the projection through authenticated loading, empty, failure, repair, and success flows.
