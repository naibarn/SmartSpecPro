# UWAC implementation work packages

Scope: extend existing owners with the smallest compatible contracts/adapters. G0/WP30 source and identity audit is complete for the inspected baseline; it is not live acceptance. No runtime implementation is authorized in this phase. Each section has explicit deliverable, touched scope, dependencies, verification and known gaps.

## WP31 — work-profiles (P0)

Owner: SPEC-196/269. Prerequisites: G0 source/identity audit; existing context/job owners agree metadata compatibility.

Negotiate additive typed profile/context/source bindings on existing canonical records. Keep Goal semantics in 196, assistant/team lifecycle in 269, physical execution in worker_jobs/outbox. NONE is valid and Git fields are conditional. Define parent/dependency/acceptance/delivery bindings, profile/schema version and backward reads. Exclude retired values from all new admissions without reviving or deleting historical systems.

Exit: observable results for `UW-02 UW-03 UW-09 UW-13 UW-28 UW-29 UW-32` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 01](sections/section-01-work-profiles.md).

## WP32 — event-projection (P0)

Owner: SPEC-294 plus 200/205/206 producers. Prerequisites: WP31 metadata/event boundary agreed; can progress in parallel on independent reducer fixtures.

Extend existing observation projection with normalized source events, original/native identities, work/session/parent bindings, stop reason/health/progress and artifact/Skill evidence. Design bounded replay/dedup/gap/watermark behavior and truthful mutable-field coverage. Observation outage cannot gate workers; do not create a new event scheduler/store.

Exit: observable results for `UW-09 UW-11 UW-12 UW-19 UW-20 UW-21 UW-23 UW-26 UW-27` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 02](sections/section-02-event-projection.md).

## WP33 — unified-experience (P1)

Owner: SPEC-198/277/287. Prerequisites: WP31/32 stable consumer contracts; preserve existing UI capabilities.

Make Chat the general entry with explicit Work/Skill/Develop conversion. Add Simple/Developer lens preference and contextual task/timeline drilldown using the same projection. No-Git context uses inputs/results; developer Git/log/CI/release details appear only when relevant. Use existing Astryx frame/tokens/components and accessibility conventions.

Exit: observable results for `UW-01 UW-02 UW-13 UW-19 UW-20 UW-21 UW-22 UW-26 UW-27 UW-33` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 03](sections/section-03-unified-experience.md).

## WP34 — skill-invocation (P0)

Owner: SPEC-256 plus 198 consumers. Prerequisites: WP31 and 256 documented identity; WP32 event envelope.

Reuse registry/catalog projection for search/describe/select receipts and exact version/digest. Revalidate policy, capabilities, freshness, source trust and budget before effect; use canonical queue/outbox for long work. Preserve direct single-function choice. Discovery is not install/invoke permission. Remediate new-path access to retained direct Python execution without using retired runtime.

Exit: observable results for `UW-05 UW-07 UW-10 UW-17 UW-18 UW-24 UW-28 UW-32` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 04](sections/section-04-skill-invocation.md).

## WP35 — skill-authoring (P1)

Owner: SPEC-221 plus 198 proposal entry. Prerequisites: WP31/34 versioned handoff; existing artifact/registry authority.

Connect create/improve/Save-as-Skill to existing Studio. Build a private versioned non-Git package with input/output contract, redacted examples and reproducible evaluation. Pin dependencies/provenance; executable evaluation uses approved Cloudflare isolation and worker_jobs/outbox. Separate candidate/eval/publication/install/invocation and version revocation/rollback.

Exit: observable results for `UW-06 UW-07 UW-08 UW-17 UW-18 UW-25 UW-32` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 05](sections/section-05-skill-authoring.md).

## WP36 — delegation-controls (P0)

Owner: SPEC-196/269/279 with 200/205/206 adapters. Prerequisites: WP31/32/34 contracts; exact current command/permission/economic owners.

Bind parent/child objective, criteria, return route and attenuated permission/budget; bound graph depth/fanout and retries. Normalize actual supported controls, distinguish requested/accepted/applied, reconcile same canonical attempts across sessions and protocol routes. User actions retain existing action/domain authorities; agent controls use 279.

Exit: observable results for `UW-09 UW-10 UW-11 UW-17 UW-18 UW-21 UW-22 UW-24 UW-29 UW-31 UW-32` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 06](sections/section-06-delegation-controls.md).

## WP37 — artifact-evidence (P1)

Owner: SPEC-269/294 consumers; existing Library/R2/domain owners. Prerequisites: WP31 source/deliverable types and WP32 evidence envelope.

Project report/document/spreadsheet/media/Skill/external record outcomes using immutable revision/digest plus acceptance/QC/access receipt. Keep draft/upload/publish/share/send/apply distinct. Use existing byte/record authorities, disclose local-only recovery limits and uncertain external effects.

Exit: observable results for `UW-03 UW-04 UW-06 UW-12 UW-19 UW-23 UW-25 UW-26` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 07](sections/section-07-artifact-evidence.md).

## WP38 — development-source-release (P0)

Owner: SPEC-218/224/293/295. Prerequisites: WP31/32 conditional bindings; current SPEC224 live work and source policies preserved.

Add consumer bindings and source observation for remote canonical/local/tracking/worktree/last-verified/deployed refs. Use one integration authority with immutable checkpoints while siblings continue. Specify/add exact admitted SHA checkout and common local/Actions provenance through existing builder/release controllers; digest and component runtime verification stay separate.

Exit: observable results for `UW-14 UW-15 UW-16 UW-23 UW-29 UW-30 UW-34 UW-35 UW-36` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 08](sections/section-08-development-source-release.md).

## WP39 — cross-boundary-acceptance (P1)

Owner: SPEC-287 with all evidence owners. Prerequisites: WP31–38 independently integrated; current authorized test environments.

Execute UW-01–36 in progressive contract, persisted integration, rendered cross-device and authorized release-proof layers. Attribute exact source/environment/actor/evidence and metric budgets. Validate monitor-outage noninterference, multi-tenant revocation, economic settlement and outcome truth. Update existing official requirement ledgers only for exercised assertions.

Exit: observable results for `UW-01 through UW-36` with scoped source/target/evidence receipts, or accurately classified remaining acceptance. Implementation paths and checks are in [section 09](sections/section-09-cross-boundary-acceptance.md).

## Integration and rollback

Sequence: WP31/32 contract agreement → WP33/34/35/37 independent scopes → WP36 and WP38 compatibility integration → WP39 measured acceptance. A safe owner slice integrates before all sections finish; serialize only shared writes and merge-critical operations. Existing SPEC224 live acceptance proceeds independently. Prefer additive opt-in/profile capability rollout and replay-compatible versioning; rollback disables the new route/projection through existing controls, preserves canonical events/artifacts and never resets another session. Retain package/source versions and reject stale grants. No production release here.

## Plan-level done

Nine coherent section packets, 32 owner requirement IDs, 36 executable acceptance designs, source/status/ownership traceability and official HandOff updates validate. This planning exit does not set any runtime requirement PASS. Future engineering begins with WP31 after refreshing source/contracts.

Resume rule: before executing these delta packages, follow [Resume existing implementation](resume-existing-work.md). Reuse existing integrated code, section state and valid proof; these packets do not reset or replace any existing SPEC implementation plan. Continue only genuinely missing requirements/acceptance assertions and preserve the existing primary WorkUnit and live blockers.
