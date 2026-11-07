<!-- SPLIT_MANIFEST
01-p0-nonblocking-foundation
02-p1-director-and-visual-continuity
03-p2-advisory-qa-and-asset-preservation
04-p3-audio-editing-and-cross-episode
05-p4-budgeted-production-optimization
END_MANIFEST -->

# CPE Non-Blocking Gap Closure — Project Manifest

## Goal and architecture decision

Close the remaining CPE capability and evidence gaps in the existing Vertical Drama production path while preserving baseline image/video eligibility. CPE is an optional enhancement layer over current stages. The first insertion seam is `VerticalDramaEpisodePipeline.generateRealStoryboard` before storyboard persistence; optional scene-state enrichment remains at `generateRealStartFramePlan`. Every optional enhancement returns a usable existing-contract fallback when it does not complete within its bounded allowance. Do not create an independent renderer, provider catalog, asset store, approval workflow, or job control plane.

The key invariant is:

```text
productionEligibility(existingInputs, cpeState) = productionEligibility(existingInputs)
```

for every CPE state that is advisory or unavailable. Existing hard business/security/technical conditions remain authoritative.

## Phase structure and dependencies

| Split | Objective | Depends on | Parallelizable | Readiness predicate |
|---|---|---|---|---|
| 01-p0-nonblocking-foundation | Reconcile the canonical requirement baseline; codify advisory/hard-control boundaries; add fail-open and production-eligibility regression harness | None | No; establishes shared contracts | Feature-off and injected enhancement failures produce the same image/video eligibility as baseline, with diagnostics and no asset/approval side effects |
| 02-p1-director-and-visual-continuity | Close the director, camera, lighting/style, cast/wardrobe/prop/location and start/stop-frame integration gaps using current contracts | 01 | No; shared storyboard/pipeline contracts | Valid optional intent reaches storyboard/render prompts; absent/invalid/stale intent uses original storyboard; current user-selected assets/settings remain authoritative |
| 03-p2-advisory-qa-and-asset-preservation | Complete visual QA, selective user-driven repair, asset version safety and partial-assembly behavior | 01, 02 | No; shares episode router and media contracts | Warnings never reject usable media; failed candidates leave last successful asset intact; technical failures remain distinct and partial outputs are truthful |
| 04-p3-audio-editing-and-cross-episode | Reconcile and implement the needed audio/lip-sync/edit/continuity slices over current services | 01, 02, 03 | No; depends on accepted shot/asset lineage | Optional audio/QC/continuity degradation leaves the valid video path available and preserves existing explicit audio choices |
| 05-p4-budgeted-production-optimization | Add bounded optimization and outcome learning under explicit budgets and idempotent billing | 01, 03, 04 | No; needs actual cost/QC evidence contracts | Optimization cannot dispatch a paid operation without existing authorization and available budget; no repeated charge/retry on ambiguous outcomes |

The order is intentionally sequential at shared integration points. Independent test-authoring may happen alongside a section only when it uses a frozen contract and has non-overlapping ownership. Do not parallel-edit `verticalDramaEpisodePipeline.ts`, `verticalDramaEpisodes.ts`, shared contracts, or the same UI component.

## Earliest safe development slice

Start with P0 section 01 as a read-only requirement/source/handoff reconciliation, then P0 section 02 to codify the advisory-versus-hard-control boundary and P0 section 03 for a minimal baseline-parity regression fixture. The first implementation change should be the smallest source-backed case where an advisory CPE result can change image/video eligibility; if current code already passes, make the proof the deliverable and do not refactor. Promote each fast-gate-passing development slice through the repository's normal integrated-main workflow. Do not wait for unrelated full-suite/UAT evidence to checkpoint safe changes, and do not treat a checkpoint as a phase completion claim.

Keep rollout reversible: use existing feature flags where they already govern the optional path, preserve old record reads, keep the original storyboard/prompt/provider path as fallback, and apply only additive development migrations when source reconciliation proves they are necessary. After each slice, verify feature-off parity and the affected authenticated API/UI behavior. Any advisory degradation must leave image/video controls and successful assets available. No production release is included.

## Requirement ledger

| Requirement | Existing evidence / current classification | Owning split | Completion evidence |
|---|---|---|---|
| NB-01 CPE off preserves original image/video workflow | Feature flags and pipeline tests exist; full cross-stage parity is not established | 01 | Feature-off parity tests for storyboard, image request, video request, assembly eligibility |
| NB-02 timeout, missing service, provider outage, invalid or stale CPE data falls back | Scene-intent and scene-continuity fail-open code/tests exist; not a complete phase-wide failure matrix | 01, 02 | Inject each failure class and prove original-contract fallback + successful generation eligibility |
| NB-03 CPE quality, continuity, identity, camera, lighting or cinematic score stays advisory | `verticalDramaQc.stageBlocksPaidGeneration` blocks only severity `blocking`; some route evidence exists | 01, 03 | Matrix of low score/warnings/errors across image/video/assembly shows no rejection or stage failure |
| NB-04 Preserve generated assets and last successful version | Asset/artifact and assembly-version code exists; direct QC-warning and failed-candidate availability proof is incomplete | 03 | Asset lineage test plus authorized-tenant read/download after advisory and failed repair |
| NB-05 No mandatory CPE approval/wait; preserve manual approval/rejection/cancel | Existing manual actions and status flows exist; CPE-wide non-interference not proved | 01, 02, 03 | State-machine tests prove no advisory wait/approval and no override of explicit user decisions |
| NB-06 Bounded provider fallback/retries and authorized capability checks | Provider/model capability code and bounded prompt judge exist; end-to-end matrix incomplete | 02, 03 | Fake-provider matrix: capability, tenant allowlist, timeout, bounded attempts, safe fallback |
| NB-07 Credit/budget enforcement and idempotency | Credit service and task idempotency exist; canonical Feature 155 remains unresolved | 01, 05 | Repeated/ambiguous retry tests show no duplicate debit and no paid work without valid reserve |
| NB-08 Tenant, media-asset, content-safety and cancellation controls | Existing scoped queries and safety gates exist; all CPE boundaries require consolidated regression proof | 01, 03 | Cross-tenant and stale-owner tests; hard safety remains blocking; cancellation is honored |
| CPE-01/02 director, shot composition, camera movement | Scene intent, motion profiles, prompt authoring and Smart Director components exist but are not verified as one storyboard-to-render flow | 02 | Contract tests from shot facts to valid shot intent and prompt; failure uses baseline |
| CPE-03 style, lighting and color | Series look-lock/preset machinery exists; exact persistence and every render-path projection require reconciliation | 02 | Stable style snapshot through storyboard/start-frame/video prompts, plus flag-off compatibility |
| CPE-04/05 character identity, wardrobe and props | Character reference/motion/identity QC and object reference components exist; cross-shot lineage and advisory accessibility need proof | 02, 03 | Required identity/wardrobe/object facts reach prompts; warning does not hide or replace output |
| CPE-06 scene/location continuity | Feature 138 scene-state/coverage/QC components exist; optional timeout is now fail-open | 02 | Current plan revision and stale metadata fallback tests; warning does not block frame/video generation |
| CPE-07 first/last-frame planning | Start/stop-frame code and Feature 167 plan exist; canonical handoff is unresolved | 02 | User-reviewed frames remain distinct; missing optional stop frame uses current supported mode |
| CPE-08 compatible multi-model routing | Model registry, provider routing and reference/duration capabilities exist | 02 | Routing and fallback only choose configured, authorized, compatible models; no unsafe substitution |
| CPE-09 storyboard preview/approval | Existing storyboard preview and explicit approvals exist | 02 | CPE suggestions are previewable/advisory; optional rejection uses baseline; existing approval semantics unchanged |
| CPE-10/11 visual QA and selective repair | Frame/clip QC, QC reports and repair operations exist; direct user-asset availability and version rollback tests remain gaps | 03 | Advisory QC matrix; manual repair; failed repair preserves successful version; bounded retries |
| CPE-12/13 dialogue, lip-sync, sound and editing | Dialogue/audio/QC/assembly components exist; Feature 175 is design-only/unresolved | 04 | Audio off/on contract, audio failure fallback, timing/QC/assembly evidence; video remains accessible |
| CPE-14 cross-episode continuity | Story bible and series memory components exist; visual/audio continuity integration needs reconciliation | 04 | Prior-episode facts are versioned, tenant-scoped, optional, and cannot invalidate current episode outputs |
| CPE-15 cost-aware production/retries | Credit primitives exist; Feature 155 has no canonical passes and 114 unresolved requirements | 05 | Forecast/cap before paid work, immutable actuals, no retry on unknown outcome, idempotent debit |
| CPE-16 reusable style presets/templates | Look-lock and preset work exists; full user-facing template lifecycle is not established | 02 | Existing projects hydrate unchanged; presets version and apply through existing UI/API without new approval gate |

## Existing-spec reconciliation — do not duplicate

Before implementing a requirement, inspect the canonical Spec registry and current source for the nearest existing work. Candidate records include Features 137, 138, 140, 149, 150, 155, 157, 167, 170, 173, and 175 and Quick Specs 167, 186, 191, and 298. The current canonical handoff reports some of these as `DORMANT_UNRESOLVED` despite implementation claims in their specs; therefore the first section maps each requirement to current source, current tests, and ledger disposition. Close or continue the authoritative existing work unit where it owns the gap; only create a new canonical Spec if later registry reconciliation proves no suitable home.

Feature 157 is the closest cross-workflow assurance umbrella, but its broad `provider_ready`, `awaiting_action`, and final-QC language must be reconciled against the newer critical CPE policy before reuse. Existing hard controls stay hard; subjective CPE outcomes and optional CPE failures cannot be promoted into those gates.

## Non-goals and safety boundaries

- No rewrite of the current image/video renderer, no standalone CPE application, no duplicate provider/job/asset system.
- No relaxation of credits, tenant ownership, user permissions, content safety, provider allowlists/capabilities, verified-artifact requirements, or cancellation.
- No automatic paid regeneration loop and no score threshold that rejects an otherwise usable output.
- No production deployment, Cloudflare resource creation, or domain routing change in this project plan.
- Long-running LLM/media/agent work uses the canonical `worker_jobs` plus outbox control plane. No retired workflow, Agency, Docker/OpenSandbox, or parallel queue is introduced.

## Discovery fallback

SocratiCode tools are unavailable in the session. The baseline was verified with `canonical_source.py preflight`; source discovery used targeted `rg`, handoff status files, existing SPECs and focused service/test reads. Planning does not claim full source-level CPE acceptance; the first implementation section must reconcile the exact live source and canonical requirements before changing behavior.
