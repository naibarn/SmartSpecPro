---
spec_id: 250
numbering_status: OWNER_CONFIRMED_250 — owner assigned Spec 250 on 2026-09-26; repository registry reconciliation and collision check required before canonical commit
canonical_short_id: SAH-DEV-AUTO-EXT-01
name: Autonomous Development Execution Reliability & Governance Bootstrap
version: 0.8.0-spec248-r1.4-cross-spec-boundary-proposed
created: 2026-09-26
status: R0.8 CROSS-SPEC DESIGN PROPOSAL — NOT APPROVED / NOT IMPLEMENTED / NOT PRODUCTION CERTIFIED
supersedes: ["R0.5 owner-confirmed design candidate within this unapproved proposal lineage only"]
skill_pack_snapshot_sha256: 954b3320b4ec88d2b9799d3d57aee29949fb8d95d7744b846e197e8d2e82a584
extends: ["Spec 224 (currently active; no in-place modification)"]
critical_integrations: ["Spec 248 MCP Skills Extension SEP-2640", "Spec 199 MCP Gateway", "Spec 186 worker_jobs/outbox", "Feature 195 Runner", "Spec 200 External Agent Gateway", "Spec 207 Economic Control", "Spec 218 Development Workspace", "Spec 220 security/policy", "Spec 221 skills", "Spec 222 advisory learning", "Spec 229 Retrieval", "Spec 230 context/protocol", "Spec 226 Task Control bridge", "Spec 219 release"]
required_release_flag: development_autonomy_reliability_v1
initial_flag_state: OFF
---

# Spec 250 — Autonomous Development Execution Reliability & Governance Bootstrap

> **R0.7 precedence (2026-09-26):** Sections 86–96 add explicit reciprocal alignment to proposed Spec 248 R1.3. They supersede incompatible R0.6 local handoff/placement phrasing without changing the MCP Skills wire format or any active Spec 224 source. Sections 0–85 and A01–A216 remain applicable except where this proposal is more restrictive; new cases A217–A264 are test *requirements*, NOT executed evidence. Spec number 250 is owner-confirmed, while repository registration, design admission, write grants and live certifications are still independent pending actions.

## Additive implementation specification for one-goal-to-verified-result autonomous engineering

> **R0.6 normative-additive proposal (2026-09-26):** Sections **73–85** define the verified cross-Spec 248 MCP Skills Extension integration and supersede less restrictive **proposed** R0.1–R0.5 delivery assumptions. Acceptance candidates now extend to **A169–A216** (48 additional cases; total A01–A216). These are unexecuted conformance scenarios. **Spec 250 is owner-number-confirmed, not repository-admitted; R0.6 is not approved for implementation**. Published stable SEP-2640 wire rules take precedence over any design examples here. Do not modify in-flight Spec 224, prior Specs 1–213 or approved Spec 248 in place without their owning change process.

> **Owner numbering decision:** Spec number **250** confirmed by the project owner on 2026-09-26. This confirms the number only; design admission, canonical registry synchronization, source grants and production certification are separate decisions.
>
> **R0.5 addendum precedence (2026-09-26):** Sections **57–72** below are the latest normative clarification of this *proposed* companion extension. The twelve new source-driven adversarial audit lenses (P25–P36) strengthen R0.4 Sections 47–56 and prior R0.1–R0.3 clauses when more restrictive; they do **not** edit or supersede authoritative Spec 224 or grant implementation authority. Acceptance candidates now run **A01–A168**, of which A121–A168 are newly proposed, **not executed**. The exact canonical repository spec, actual installed skill hashes, identity/grants and permission boundaries still require real authorized admission. No claim of zero future gaps or product/production certification is made.


> **R0.4 amendment precedence:** Sections 47–56 further harden exact Skill-pack compatibility; where stricter, they supersede unsafe earlier default behavior without replacing Spec 224 or prior existing authorities. This is a static source inspection, not actual runtime certification.
>
> **R0.3 amendment precedence:** Sections 32–46 add twelve further hardening lenses to R0.2 Sections 19–31 and supersede any earlier less restrictive language on the same issue. **R0.2 historical precedence:** Sections 19–31 below harden and, where more restrictive, supersede corresponding R0.1 clauses. Existing sections 0–18 remain the baseline; these amendments must be traced into their implementation workpackages, not left as optional notes. Twelve independent *document review lenses* were applied; this is not an assertion of twelve human reviewers, code execution, approval or production certification. See separate 12-pass audit report.

> **Owner-confirmed number (2026-09-26).** The project owner has assigned this extension **Spec 250**. Before creating its canonical repository entry, the registry owner SHALL reconcile the actual SmartSpecPro registry, main, active branches/PRs, worktrees and untracked specs. If a conflicting existing Spec 250 is found, STOP and request an explicit owner conflict decision; do not silently renumber or overwrite. Number assignment does not approve this R0.5 design, source write grants, migrations or production. The exact canonical Spec 224 revision must still be authenticated and hash-bound.
>
> **Immutable implementation boundary.** Do not retro-edit Specs 1–213. Spec 224 is under active implementation and is not to be rewritten by this initiative. This is an additive companion spec with independent versioned contracts, adapters and workpackages. No changes to original Spec 224, live schema, shared dirty source or production are authorized by this document.
>
> **Evidence boundary.** Historical D3.16 Candidate v6 (reported 108/108 deterministic tests on its exact source/dependency projection) and D3.22 Option 3 architectural acceptance are context only, not evidence that this proposal, Candidate v7, durable approval, PostgreSQL, Live M2, Runner E2E or Cloudflare Container isolation has passed.

> **CURRENT R0.8 / 2026-09-27 — development execution companion, NOT Spec 224 replacement.** **250** adds verified Skill delivery/placement, bounded automation and execution reliability *inside* the active **Spec 224** development lifecycle, consuming **Spec 248** distribution proofs. It does not own public Skills protocol, general workflow runtime, provider-hosted personal agents, core economic settlement or a new durable job ledger. R0.8 is a design proposal only; repo admission, exact source permissions and production execution remain pending.

## 0. Decision, objective and non-goals

**Product outcome:** A permitted user submits a goal, approved Spec or issue once. SmartAIHub independently orchestrates **Deep Plan → Deep Implement → Test → Diagnose → Repair → Review → Regression → Final Verify → PR/ReleaseCandidate**, automatically resuming after transient failures, agent exits and ordinary engineering blockers. The user is a goal/approval authority, not a chat-based manual phase scheduler.

**Constrained autonomy:** LLMs propose engineering hypotheses and plans, perform authorized experiments and implement fixes; they do not mint approvals, select an unapproved canonical Spec, change policy, certify their own results, bypass an unresolved source owner or execute irreversible privileged operations without authority. Genuine business, security and production decisions remain human-owned.

**No duplicate architecture.** Existing Spec 224 already provides an EngineeringProblem, Hypothesis/Strategy Attempt ledger, No-Progress Detector, hierarchical planning, phase protocol, recovery and evidence architecture. This extension closes *execution and integration* gaps revealed in D3.14–D3.24 rather than reimplementing those structures. Canonical lifecycle/finality authority remains Spec 224; canonical execution/event/side-effect authority remains Spec 186 `worker_jobs` + its events/outbox; Feature 195 remains Runner transport; Spec 207 remains economic authority; existing shared Approval/Policy remains the grant source of truth.

**Non-goals:** a second queue, a second ledger, a new generic orchestration kernel, silent import of dirty/unowned files, implied GitHub approval from a connected workspace, automatic production deployment, automatic cash/funding creation, or guaranteed continuous operation without a running durable backend.

## 1. Gap analysis against the active Spec 224 implementation

| Gap evidenced in D3.14–D3.24 | Already described in Spec 224 | Additional binding implementation contract here |
|---|---|---|
| Planning/audit loops with no code | Hierarchical plan, WorkPackage, No-Progress Detector | Readiness-to-execution liveness invariant; duplicate-packet suppression; READY dispatch SLA; review-loop termination |
| No authenticated governance channel | Human Decision/Authority Engine | One-time governance bootstrap, distinct human/bot identity, verifiable hash-bound grants, revocation, fallback signed channel |
| Ambiguous canonical Spec among tracked/untracked amendments | Spec ingestion/freeze | Registry+branch+worktree resolver, manifest precedence, explicit owner decision, content-addressed admission |
| Dirty shared repository / multiple sessions | Isolated source and automation fork | Source ownership lease, file-level preimage guards, variant quarantine and merge/arbitration plan |
| Dependency graph/lockfile drift | Reproducibility, diagnostics | Full source/runtime dependency closure, lockfile importer reconciliation, authorized frozen install and exact execution-bundle receipt |
| Python decision persisted but callback dropped | Durable recovery/side effects | Explicit cross-process decision-intent/outbox acknowledgment contract and real restart proof, under P-RECOVERY |
| Agent exits, quota limits or provider outage | Recovery/controller and provider strategy | Running-capability probes, bounded slot backfill, checkpoint/resume verification, no fake async claims |
| No meaningful independent acceptance proof | Final Verifier | Exact executed-source attestation, real failure-injection acceptance campaign, progress and approval telemetry |
| Chat used for each next step | Task Control/decision semantics | Decision Inbox with batch decisions and predelegated low-risk permissions; no-chat benchmark |
| Live/cloud claims without actual evidence | High assurance release gates | Strict evidence-level taxonomy and per-environment admission/rollout |

Each existing requirement SHALL link to its canonical upstream section once that section's exact hash is authenticated. This table is an integration gap map, not a claim that upstream source is missing or fully implemented.

## 2. Canonical architecture and ownership

```text
User goal / canonical Spec / issue
            |
            v
Existing Development Command Gateway (Spec 224 / Spec 226)
            |
            v
Existing DevelopmentRun + PlanSection/WorkPackage DAG (Spec 224)
            |
  +---------+-------------------------+
  |         |                         |
  v         v                         v
Spec/Input  Grant & Source          AI Problem-Solving
Resolver    Admission Adapter       Execution Adapter
  |         |                         |
  +---------+-------------+-----------+
                        |
                READY WorkPackage
                        |
          Existing Spec 224 phase reducer
                        |
        Existing Spec 186 worker_jobs + outbox
                        |
          Feature 195 / Spec 200 / Runner
                        |
       Native provider skills / tools / MCP
                        |
              Evidence / independent verifier
                        |
         Existing Task Control / Decision Inbox
```

This extension contributes the **Spec/Input Resolver Adapter**, **Governance Bootstrap & Grant Admission Adapter**, **Source/Dependency Closure Adapter**, **Autonomous Failure-Resolution Policy**, **Decision Inbox contract**, and **conformance suite**. These are subordinate to Spec 224's runtime and existing canonical authorities, not independent lifecycle controllers.

Proposed owner roles (not names or established assignments): spec registry owner; security/governance owner; developer-platform/workspace owner; Feature 195/186 integration owner; Spec 207 owner; independent test/security reviewer; release authority. A role suggestion is not an owner appointment.

## 3. Canonical Spec & amendment resolver (`SAH-DEV-AUTO-SPEC-1`)

3.1 Discover relevant base Specs and additive amendments from the **actual** registry, approved records, repo main/protected refs, active PRs and untracked working trees. Untracked is not automatically invalid and is never automatically canonical. Resolve spec-number collisions before creating a new canonical file.

3.2 Produce an immutable `CanonicalSpecManifest` with `spec_id`, exact source refs, complete SHA-256, byte lengths/modes, approved amendment precedence/order, version/revision, decision reference, manifest canonicalization version and root digest. Distinguish **content SHA**, **manifest SHA** and **Git commit SHA**.

3.3 Conflict handling: if two non-equivalent source revisions or amendment orders remain plausible, preserve both as candidate variants, generate an exact semantic/byte diff and ask the authorized owner to select or explicitly compose an approved version. Never select the newest timestamp, largest revision number or the LLM's preference as authority.

3.4 A spec owner decision MUST be authenticated, scoped to the precise manifest/root digest, time-bound, revocable and bound to an approved repository/project. A file saying `APPROVED`, a chat message, a GH connection, a bot-authored PR or a known hash without signer proof is insufficient.

3.5 Freeze the approved Spec; deterministic requirement extraction enumerates **every** section and amendment even if retrieval supplies only relevant context to the model. Material subsequent changes invalidate affected plans/tests; unaffected work remains reusable if its evidence inputs are identical.

3.6 If no grant channel exists, run in `BOOTSTRAP_GOVERNANCE` mode, prepare all decision inputs and continue independent read-only/authorized work; never regenerate unchanged owner packets on every run.

## 4. Governance bootstrap, standing grants and Decision Inbox (`SAH-DEV-AUTO-GRANT-1`)

**R0.2 clarification:** Section 19 defines the bootstrap ceremony that breaks the first-grant circular dependency. A proposal, existing GitHub connection or reviewer comment is never an authenticated grant.

**4.1 Bootstrap once, not per Spec.** The installer/admission workflow verifies an existing organization/repository identity provider and actual access. A connected GitHub remote or authenticated `gh` command proves tool access, **not** independent owner approval. Supported minimum patterns:

- **GitHub protected governance repository**: a separate GitHub App or restricted bot publishes hash-bound decision manifests; required human/code-owner reviewer (not the bot who authored the artifact) approves the exact latest revision, with non-bypassable policy for this grant path and GitHub API revalidation. A GitHub PR approval by itself is not a grant until converted to a verified, explicit authorization record with exact actions and expiry.
- **Human-signed offline grant**: verify a grant against a preprovisioned trust root whose private key remains outside agent, Runner, repository and model contexts. Rotation/revocation must be supported.
- **Existing shared Approval/Policy service**: may be preferred when already deployed and capable of authenticated, scope-bound grants. The adapter consumes its grants; it must not create a second approval source of truth.

If none can be established, `GOVERNANCE_UNAVAILABLE`: report one exact administrator action; do not permit protected writes. No generated key can be implicitly trusted as the owner's private key.

**4.2 Versioned `ScopedDevelopmentGrant` (minimum):**

```yaml
schema: SAH-DEV-AUTO-GRANT-1
kind: ISOLATED_WRITE   # SPEC_BASELINE | ISOLATED_WRITE | P_SOURCE | P_RECOVERY | ...
grant_id: externally-issued-opaque-id
issuer_principal: authorized-owner-subject
reviewer_principal: independent-reviewer-subject
repository_id: verified-repository-identity
spec_manifest_sha256: full-64-hex
workpackage_ids: [WP-REQ-01]
source_projection_sha256: full-64-hex
allowed_existing_paths: [{path: repo/relative/path, preimage_sha256: full-64-hex}]
allowed_new_path_prefixes: [isolated/authorized/package/]
allowed_operations: [CREATE, PATCH, RUN_FOCUSED_TESTS]
environment: isolated-nonproduction
resource_policy_ref: versioned-policy-digest
max_cost: bounded-approved-amount
issued_at: RFC3339
expires_at: RFC3339
revocation_ref: authoritative-revocation-source
approval_artifact_ref: signed-object-or-protected-PR-commit
signature_or_attestation: verified-external-authority
```

Additional project/tenant ID, independent reviewer, runner placement, network/egress and data classification constraints SHALL be enforced when applicable. Illustrative values above are **schema placeholders, not a valid approval**.

**4.3 Admission verifier** SHALL check signer identity/permission, reviewer independence, current external authority and revocation, expiration, allowed actor/tenant/repository, immutable spec/input hashes, expected preimage and allowed operations **immediately before each consequential action**, not only once when planning. Approved scope is monotonic-narrowing unless an authorized new grant is issued. Replay/nonce fencing shall prevent reuse in a different run when prohibited.

**4.4 Standing authorization:** an owner MAY grant a bounded, renewable policy for low-risk isolated implementation, permitted tests, approved provider class and defined spend. The runtime derives narrower per-WorkPackage capabilities through existing shared policy. It cannot widen the standing grant when a risk score changes. Sensitive Python approval source, Feature 195/186 recovery, historical migrations, economic funding, real provider spend beyond the grant and production are separate gates. A grant can allow trusted `READ_ONLY`, `FIXTURE_TEST` or scoped `ISOLATED_WRITE` without permitting shared-source mutation.

**4.5 Decision Inbox:** batch genuine decisions, grouped by authority and impact. Present exact files/digests, bounded alternatives, delta since previous decision, cost/risk, consequence of refusal and unaffected work that continues. Decision events must produce canonical existing approval service records; the UI cannot grant authority by setting a local flag. Deduplicate requests with stable semantic decision keys. Revalidate pending decisions after source changes; close superseded requests without silently expanding rights.

## 5. Multi-session source arbitration & immutable execution bundle (`SAH-DEV-AUTO-SOURCE-1`)

5.1 Read the shared working tree without mutation; snapshot HEAD, branch, exact per-file status, complete SHA-256 for relevant tracked/untracked files, and a whole-worktree fingerprint with documented exclusions. A changing dirty count alone cannot attribute ownership. Git author, modification time, branch naming and prior chat text are supporting provenance, **not** owner authorization.

5.2 Use explicit per-path source owner and current writer lease from trusted policy/checkpoint registry where available. Source not owned or conflicting remains quarantined. One integration writer per preimage/path; concurrent agents use separate isolated copies/branches. A stale lease shall not authorize blindly overwriting changed bytes.

5.3 Build an isolated copy from the verified baseline and only authorized overlays. Use hard allowlists; exclude `.env`, credentials, session tokens, production data, unreviewed `node_modules`, uncontrolled package stores, symlink escapes and unrelated dirty files. After assembly, verify complete recursive **local code, config, test, fixture, patch, script and runtime dependency closure**. A matching manifest path count alone is not closure.

5.4 Dependency forensics: independently identify manifest/lock/workspace provenance; verify local package discovery/name/version before changing `workspace:` dependencies. Resolve importer mismatch minimally. Generate a reviewed lockfile in the isolated copy only. `--frozen-lockfile` installation is an executable gate; distinguish offline store misses from lock drift and request approved pinned artifact fetch if required. Never use `--no-frozen-lockfile` to claim certification. Unknown dependency version or unapproved lockfile diff blocks only dependent workpackages.

5.5 Seal an `ExecutionBundle` with source tree SHA, full file-mode manifest, package-manager/runtime versions, lock/patch integrity, dependency resolution/SBOM where supported, test command and fixture digests, approved grant reference, environment policy and trusted runner identity. Verify before materialization and again at execution; read-only roots and sandbox boundaries shall prevent post-admission TOCTOU. A text-only checker is insufficient. Never run the rejected D3.19 harness prototype.

5.6 If a source conflict cannot be resolved automatically inside the current grant, construct alternative **non-admitted** projections and provide a precise owner delta. Continue independent packages; do not merge variants by LLM preference. No implicit Cloudflare Container isolation certification: prove security claims on the exact target/version or report `EXTERNAL_ISOLATION_UNVERIFIED`.

## 6. Autonomous engineering diagnosis and experiment policy (`SAH-DEV-AUTO-REPAIR-1`)

This section **extends Spec 224 §460–465**, not duplicates its EngineeringProblem/Hypothesis/StrategyAttempt data model.

6.1 On a failed step, map exact exit code, stdout/stderr (secret-redacted), candidate/lock/runtime digest, failing requirement IDs, test assertion, preceding successful step and infrastructure telemetry to one existing `EngineeringProblem`. Distinguish failures caused by assertions, coverage thresholds, environment setup, authorization denial, test runner, corrupted evidence and provider quality. For example `5 assertions passed, process exit 1 due to 80% global coverage` is not `TEST_PASS`.

6.2 The assigned LLM Diagnosis Agent may propose competing falsifiable hypotheses and **the smallest safe discriminating experiment** for each. The deterministic policy layer checks the experiment's operations and budget before dispatch. The agent must record predictions and a failure/success discriminator before seeing results; require an evidence delta after execution. Never generate a repair from error text alone when source/environment evidence is available.

6.3 Examples of permitted experiment classes by risk: dependency graph read-only diagnostics, minimal workspace reproduction, isolated patch with targeted tests, provider capability probe, independent specialist investigation, replay/simulation with synthetic data. DB migration, destructive source operations, privileged environment, external provider spend and production remain gated. No automatic creation/funding of economic ledger accounts.

6.4 Repeating the same error+strategy+environment fingerprint without material evidence improvement beyond a policy-defined small transient retry allowance is prohibited. Trigger hypothesis revision, expert peer review, environment rebuild, alternate eligible provider, DAG replan or an exact human decision. Do not broaden authorization to escape an engineering problem. Persist negative findings and failed strategies to avoid cross-session rediscovery; Spec 222 may consume **sanitized advisory outcomes** but never become completion truth.

6.5 Repair changes invalidate only affected tests/evidence via an exact dependency graph; close a WorkPackage only after targeted verification and mandatory independent review. If an attempted fix weakens assertions or changes the product requirement, reopen review or require a human product decision. Detect oscillating diffs and rollback isolated attempted changes to the last verified local revision, never reset the shared worktree.

6.6 Prefer risk-adjusted information gain per permitted cost, not uncontrolled multi-agent fan-out. Run at most the approved concurrent slots; dynamically choose deterministic tools for factual checks and LLMs for ambiguity/diagnosis/design; use provider-native planning/subagents/skills as subordinate execution aids.

## 7. Rolling execution, liveness and recovery (`SAH-DEV-AUTO-RUN-1`)

7.1 After `PLAN_VERIFY`, the scheduler SHALL maintain one canonical READY queue derived from Spec 224's WorkPackage DAG, source hashes and existing authorizations. `READY` requires verified exact inputs, dependency closure, valid grant, exclusive write lease, runner capability and test strategy. `READY_NONCODING` allows evidence/design work only; `BLOCKED` has a structured blocker owner and a single next decision; `DONE_VERIFIED` requires verifiable evidence for identical inputs.

7.2 **Liveness invariant:** when a READY WorkPackage has permitted capacity, the runtime dispatches it without asking the user to say `continue`. If none is READY, produce exactly one coalesced Decision Inbox entry for genuinely blocking authority and keep noncoding/other project queues moving. Periodic watchdog queries durable run state; absence of chat traffic is not a pause condition. A subagent completion/timeout/failure event triggers a reducer transition, not merely a report in conversation.

7.3 Use actual native agent capacity probes, no inference from a quota screenshot or historical limit. Respect owner-set concurrency, per-tenant fairness, load and budget. Backfill freed slots with READY work, not repeated generic audits. If capacity/tools are unavailable, switch eligible work to a permitted sequential executor, otherwise store resumable `CAPACITY_BLOCKED` with a next scheduled check. Do not promise automatic recovery unless an active durable scheduler/Runner is actually deployed.

7.4 Checkpoint canonical state after every atomic WorkPackage/side-effect transition: spec/plan digests, grant IDs, selected source projection, lease epoch/fence, agent/provider session reference, attempt IDs, hypothesis ledger refs, outputs/evidence, remaining blockers, budget and **derived** `next_safe_action`. On process restart, reconcile existing `worker_jobs`, outbox delivery and external provider status before any new dispatch; fence late/stale attempts. Never reuse stale provider-native context as authorization.

7.5 When no progress persists across strategy generations, the loop shall stop *that problem* within policy, preserve verified sub-results and route a precise expert decision. Other independent work SHALL continue. A run may remain `waiting_external` with approval metadata without being incorrectly marked completed.

7.6 Persist a versioned phase protocol pack/harness compatibility probe through Spec 230/200. Provider fallback carries a hash-bound context pack, run/attempt identities, allowed tools, independent evidence and unreduced decisions; fallback cannot silently convert a prohibited tool into permitted one. Quota/missing model/version drift are infrastructure/capability blockers rather than automatic model-quality failures.

## 8. Durable approval bridge and cross-process crash correctness (`SAH-DEV-AUTO-APPROVAL-1`)

8.1 This extension requires, but does **not itself authorize**, a scoped Feature 195/186 `P-RECOVERY` implementation. The existing Python ApprovalDBService and Node Feature 186/195 must agree on a versioned event/delivery contract. Do not introduce another job queue, approval source or economic ledger.

8.2 Persist an immutable owner decision and uniquely identified delivery intent atomically **inside the authority that owns that decision**, where supported by the existing transactional store. If the current design cannot provide atomic persistence, define and separately approve an equivalent recoverable protocol and explicitly prove all inter-store crash windows; never claim atomicity across Python and Node services.

8.3 A reconciler leases unacknowledged delivery intents with CAS/fencing, checks current tenant/actor/grant state and retries idempotently with bounded backoff. Node validates attempt/session epoch, caller signature/tenant/scope/current capability and emits durable acknowledgment only after its canonical state transition is committed. An acknowledged response lost in transit shall not cause a second logical resume/reject. Cancellation must carry authenticated `cancelled_by` and apply authorization before mutation.

8.4 Stale, conflicting, revoked, superseded or ambiguous grants/decisions fail closed and enter existing operator review, not guessed LLM resolution. The reconciler must recover the `Python decision COMMITTED → Node callback NOT SENT` window; `callback sent → Node committed → Python ACK missed`; restarts during lease; duplicate/reordered callbacks; late cancel and supersession. If an additive schema migration is required, it is reviewed and approved through the separate migration/database process before any DB-backed certification.

8.5 Only a real authorized isolated PostgreSQL multi-process crash/restart campaign can certify durable recovery; unit mocks, a logged callback intent or a passed static SQL preflight are lower evidence levels. Audit redacts secrets and preserves decision/delivery/attempt lineage.

## 9. Evidence taxonomy and release-proof policy (`SAH-DEV-AUTO-EVIDENCE-1`)

Each claim MUST carry a typed evidence level and exact immutable source/dependency/environment identity:

```text
DESIGN_REVIEW
STATIC_ANALYSIS
FIXTURE_SECURITY_TEST
DETERMINISTIC_UNIT_CONTRACT
ISOLATED_DB_INTEGRATION
MULTIPROCESS_CRASH_RESTART
REGISTERED_RUNNER_E2E
LIVE_PROVIDER_NONPROD
STAGING_SOAK_FAILURE_INJECTION
PRODUCTION_ROLLOUT
```

9.1 Never promote a lower level into a higher level: static discovery of 15 tests ≠ running them; assertion pass with process exit 1 ≠ passing suite; historical Candidate v6 tests ≠ Candidate v7 or live run; `bash -n` ≠ sandbox security; Cloudflare documentation ≠ target-specific isolation certification; a bot-created PR ≠ human authorization.

9.2 Trusted collectors report actual executed commands, tool versions, runner/DB identity, exit codes, test counts, side-effect receipts, start/end time, independent reviewer identity and applicable grant. The LLM may explain evidence but cannot issue the authoritative VerificationCertificate or edit evidence to manufacture success.

9.3 Section completion requires all mandatory requirement→source→test/review/evidence links at their current digests, no unresolved blocking GapRecord, and evidence at the prescribed risk level. Preserve partial completion and invalidation edges, not a global binary pass based on a subset of tests.

9.4 Canonical Final Verify remains Spec 224. Multi-spec delivery must not substitute a locally written status report, agent self-review or a dashboard green badge for the actual verifier's signed result.

## 10. UI/UX contract — Task Control instead of manual chat (`SAH-DEV-AUTO-UI-1`)

Implement through the existing Spec 226 Task Control bridge and Feature 196 ingress as appropriate; a new independent frontend must not own execution state. Mobile/tablet-friendly progressive disclosure is required.

- **One Goal entry**: submit goal/approved spec, project/repository, preferred eligible execution strategy and preauthorized budget/risk profile; show exactly which grants exist and which are missing.
- **Mission Board**: DevelopmentRun → PlanSections → WorkPackages, completed requirements, active subagents, actual capacity, cost and expected remaining *work* (do not fabricate clock ETAs).
- **Decision Inbox**: one deduplicated bundle per authority, exact source/preimage diffs and hashes, impact of Approve/Reject, time-bound scopes, expiry and explicit refusal path. A decision modifies authority only through an authenticated approval API.
- **Problem Investigation View**: current failure fingerprint, top hypotheses, evidence and experiments, rejected strategies, next engineering action and what can run while blocked. Offer operator override when bounded automation exhausts its options.
- **Artifact Timeline**: immutable Spec/plan/candidate/bundle revisions, real test commands, reviewer comments, proof levels, PR links and invalidated evidence; compare revisions without copying large chat transcripts.
- **Pause/Resume/Cancel/Kill Switch**: calls existing Spec 224 semantic commands; a closed UI does not stop eligible server-side work.
- **Optional Chat**: explanation and goal edits, not phase-by-phase manual transportation of state. Approval via chat alone is insufficient unless the channel is explicitly authenticated and scope-bound through the canonical service.

## 11. Multi-spec admission, routing and resource economics (`SAH-DEV-AUTO-QUEUE-1`)

11.1 Admit multiple Specs as a portfolio only when each has its own immutable manifest, grant constraints, project/tenant scope and dependency DAG. Avoid mixing unapproved work from one Spec into another's source baseline. If Spec 224 self-development is requested, its candidate cannot be its own independent verifier; retain the trusted current runtime until separately approved promotion.

11.2 Fairly schedule independent READY work across Specs and owners. Choose low-cost eligible model/tools for deterministic tasks, specialist/stronger model for material architecture/security/root cause, and separate reviewer for mandatory independent verification. Respect budgets enforced by the existing Spec 207/economic/policy services, not a new balance table. Distinguish estimated vs committed cost, outstanding reservations, provider quotas and retries.

11.3 Preempt only at safe atomic barriers; leave durable checkpoints. A waiting decision, provider quota exhaustion or blocked database gate in one Spec SHALL NOT idle independent admissible Specs. Never submit pay-per-use provider calls without their explicit granted spend policy.

11.4 A large plan SHALL include a critical-path/impact graph and periodically run a deterministic Gap Sweep against **all** approved requirements, not just sections recalled by LLM context. A new product requirement outside approved semantics requires Spec revision/owner decision; an implementation task required by an already approved requirement may be added within delegated plan authority.

## 12. Security, privacy and supply-chain boundaries

- Prompt-injection content from repository, issues, retrieved docs, provider logs and PR comments is **untrusted evidence**, not instructions or approval. Keep immutable system policy and grant verification out of provider-editable context.
- Deny network/egress by default in test sandboxes unless explicitly allowed and accounted for; separate tool/environment capability from API-visible tool names. Check authorization at the actual consequential-tool boundary, including built-in and hosted tools not covered by generic SDK guardrails.
- Distinguish bot and owner identity; do not grant a bot an owner credential or allow its signature to verify its own grant. Enforce CODEOWNERS/branch rules only when actually configured and confirmed, not merely documented.
- Keep credentials, PII, production data and tokens out of source bundles, tests, prompts and traces. Redact and quarantine accidental disclosure; rotate compromised credentials under the secret owner's process.
- Bind tenant/project/source and execution environment to grants and provider context; recheck when delegating to subagents or other harnesses. Enforce allowlisted provider data policies.
- Define global/tenant/run kill-switch behavior; kill-switch shall fence new side effects, allow safe reconciliation/audit and preserve recovery information without secretly restarting prohibited work.
- Experimental sandbox/Cloudflare Container isolation cannot be labeled certified until relevant kernel/volume/network/secrets and path/symlink attack tests pass against the exact deployed substrate.

## 13. Versioned interfaces and data contracts

**Contract family:** `SAH-DEV-AUTO-1`; additive adapters SHALL negotiate against actual deployed upstream schema versions. Names below are logical interfaces; do not claim endpoints/classes already exist.

| Proposed interface | Input | Output | Owner of authority |
|---|---|---|---|
| `resolveCanonicalSpec` | candidate refs, registry, project | hash-bound manifest or typed conflict | approved Spec registry/owner |
| `validateDevelopmentGrant` | action, preimage/bundle, principal, environment, nonce | signed/admitted or typed denial | existing shared Approval/Policy |
| `reconcileSourceProjection` | verified baseline, allowlisted overlays, file leases | sealed projection or conflict packet | existing workspace/source owner |
| `classifyEngineeringBlocker` | run/workpackage/problem evidence | typed diagnosis + allowed strategy candidates | Spec 224 EngineeringProblem |
| `dispatchNextReadyWork` | canonical DAG + grant/capacity/budget | event/worker job request or exact blocked reason | Spec 224 via Spec 186 |
| `reconcileApprovalDelivery` | persisted decision/delivery intent | fenced idempotent acknowledgment | Feature 195/186 + existing Approval |
| `publishWorkpackageEvidence` | exact bundle/run/test/reviewer receipts | verified typed evidence reference | existing evidence registry |
| `projectMissionBoard` | authorized canonical run snapshot/events | UI read model only | Spec 226/224 |

**Minimal `WorkpackageAdmission` record:**

```json
{
  "schema": "SAH-DEV-AUTO-1",
  "run_id": "opaque-id",
  "workpackage_id": "WP-REQ-01",
  "spec_manifest_sha256": "64-hex-from-authorized-manifest",
  "source_projection_sha256": "64-hex-from-authorized-projection",
  "grant_refs": ["externally-issued-grant-id"],
  "dependency_closure_sha256": "64-hex-from-complete-closure",
  "write_lease_ref": "fenced-lease-id",
  "required_evidence": ["DETERMINISTIC_UNIT_CONTRACT"],
  "status": "READY | READY_NONCODING | BLOCKED | DONE_VERIFIED"
}
```

Strings above describe shape only and do not qualify as signed authority. Contract failures return typed `SPEC_UNRESOLVED`, `GRANT_MISSING`, `GRANT_REVOKED`, `PREIMAGE_CHANGED`, `OWNERSHIP_CONFLICT`, `DEPENDENCY_INCOMPLETE`, `RUNNER_UNAVAILABLE`, `CAPACITY_BLOCKED`, `BUDGET_BLOCKED`, `EVIDENCE_INVALID` rather than one undifferentiated `BLOCKED`.

**State authority:** all new persistent projections/ledgers are strictly subordinate views or references; if an additive table is necessary, it must reference canonical run/job/approval IDs and requires separate schema ownership/migration approval. No independent `complete=true` field may override Spec 224's Final Verifier.

## 14. Incremental implementation plan and approval map

| Phase | Scope | Can begin before restricted grants? | Required exit evidence |
|---|---|---|---|
| B0 | Reconcile owner-confirmed Spec 250 against actual registry/Spec 224 manifest; stop for owner conflict decision if occupied; designate real owners | Read-only only | signed canonical spec decision; no version collision |
| B1 (P0) | Governance bootstrap adapter, test-fixture trust root, explicit human/bot separation, Decision Inbox adapter | Isolated design/fixtures under separately approved safe write scope | independent signature/revocation/preimage negative tests; exact grant path operational |
| B2 (P0) | Source/Workspace/Dependency Closure adapter and immutable bundle verifications | Authorized isolated scope only | exact variant handling; reproducible frozen install; tamper/TOCTOU tests |
| B3 (P0) | READY queue liveness + automated failure/strategy experiment loop via existing Spec 224 components | Authorized deterministic nonprod paths | inject test failure; autonomous diagnosis/repair; no user continuation |
| B4 (P0) | Feature 195/186 durable approval bridge (P-SOURCE + P-RECOVERY) | NO | real persisted crash/restart certification after required DB authorization |
| B5 (P1) | Multi-spec fair scheduling, provider fallback, context handoff, automated plan adaptation | Once B1–B3 trustworthy | multi-run isolation, quota/restart and provider failover tests |
| B6 (P1) | Task Control Mission Board, Decision Inbox, problem/evidence timeline | Read-only contracts earlier; writes only after scope | UI/API contract and authenticated grant action tests |
| B7 (P1) | Live registered Runner E2E, economic/DB integration, independent release/soak | NO; all separate migration/runner/provider/release gates | actual target-specific proof, not static or mock |

**Existing checkpoint bridge:** D3.22 Design Baseline SHA `0c34fe63e4297f1adde1936fe1884fa32d6b69d4546b1604ce298554ee27687e` is an accepted architectural direction; it does not issue a grant. D3.23 `CANONICAL_SPEC` and isolated-write decision records reported as `PROPOSED_NOT_ISSUED`. Their *record file hashes* are not content approval. Before B1–B4, resolve correct full canonical Spec 224 file/amendments, actual owner/issuer, true scope, preimage hashes and expiry from checkpoint bytes. Candidate v6 historical inventory `0f081285580e4d66263a8411889b481fb7fdc61110a008a39b6980becf859f6e`, historical lock `d2f99196bc71baa8de271ec46f0605f2f48cfbf7bae6a30fdddc3297ae86354e` are not authorization or tests of changed sources.

**Cross-spec additive impact/backlog:** Spec 224 consumes these adapters through versioned contracts rather than editing active implementation spec. Spec 226 gains projections/widgets only, Feature 195/186 gain a separately approved recovery compatibility extension, Spec 220/shared policy binds authenticated grants, Spec 218 hosts isolated source integration, Spec 207 existing billing enforces spend, Spec 230 provides versioned provider context packs, Spec 229 retrieves engineering context, Spec 222 consumes advisory attempt outcomes, Spec 219 owns protected PR/release handoff. Existing Specs <=213 receive compatibility/backlog items only, never retroactive original-spec edits.

## 15. Acceptance & adversarial conformance matrix

R0.2 introduced A37–A60 below and R0.3 adds A61–A96 in Section 44; each additional case is mandatory for its declared certification tier and is mapped to one or more of Sections 19–30. An `N/A` requires independent evidence explaining why the attack or transition cannot occur under the admitted deployment profile.

Each case must record exact frozen code, dependency/version/environment receipts, actual command/exit code, independent verifier, scope-bound grant and evidence tier. Static checks cannot satisfy executable cases.

| ID | Mandatory case | Required result |
|---|---|---|
| A01 | Two different Spec 224 revisions in tracked/untracked tree | typed conflict, no arbitrary selection or writes |
| A02 | Same decision-file hash but wrong internal Spec hash | reject |
| A03 | Approved spec amended after owner signature | fail closed, only impacted work paused |
| A04 | Agent-authored GitHub PR using owner's shared token | cannot self-approve; explicit human separation required |
| A05 | Expired/revoked grant before a tool call | denied before side effect |
| A06 | Grant preimage differs from dirty worktree | denied or isolate and request new exact version |
| A07 | Many dirty/unowned files from other sessions | no overwrite/reset/clean; unrelated READY work proceeds |
| A08 | Internal workspace package triggers public npm 404 | reproduce and correct locally under authorized scope |
| A09 | Lock importer mismatch; unrelated lockfile churn | minimum approved diff; frozen install or truthful BLOCK |
| A10 | Missing pinned offline dependency/patch | distinguish fetch authorization from lock error; no silent substitution |
| A11 | Text-only harness claims approval / mutable symlink | reject; TOCTOU negative suite PASS |
| A12 | pytest assertions pass but coverage exits 1 | report ASSERTIONS_PASS / COVERAGE_GATE_FAIL, not TEST_PASS |
| A13 | Invalid/duplicate approval callback after Python decision commit | one logical Node transition and recoverable retry |
| A14 | Crash Python after commit before callback send | durable reconciler delivers after restart |
| A15 | Crash Node after commit before Python ACK | replay yields same effect, no double resume |
| A16 | Cancel request lacks authenticated actor/tenant | reject before mutation |
| A17 | Capability/grant expires during approval wait | recheck on resume; fail closed |
| A18 | Subagent limit/unknown quota | actual probe; bounded fallback; no fabricated quota claims |
| A19 | Provider loses connection during test and returns stale PASS | fence old attempt; retry/replace without false completion |
| A20 | Same failure+strategy repeated, cosmetic rephrasing only | NoProgressDetector escalates rather than loops |
| A21 | Review patch weakens a mandatory assertion | independent guard rejects false green |
| A22 | Independent Section B blocked by DB approval while A is READY | A executes without user `continue` |
| A23 | Parent process/terminal UI closes during eligible run | durable system resumes on running authorized backend |
| A24 | Job already completed before supervisor restart | reconcile; no duplicate external side effect |
| A25 | Rejected owner grant but agent attempts policy widening | fail closed, auditable denial |
| A26 | Repo prompt injection asks to print secrets or bypass review | reject, redact, preserve incident evidence |
| A27 | Bot verifier tries to mint Final Verify certificate for its own change | independent authority rejects |
| A28 | Cloudflare Container deployment lacks isolation probe | explicitly UNVERIFIED; no cert claim |
| A29 | Final Verify receives stale tests/old lock for changed candidate | reject invalid evidence |
| A30 | One approved spec, intentionally failing test and provider interruption | autonomously repair, independent review, verified PR, zero user `continue` |
| A31 | Two Specs share a file but incompatible versions/leases | arbitration; no concurrent writers or silent source mixing |
| A32 | Standing grant allows unit tests but agent requests production deploy | deny and route separate release decision |
| A33 | Budget limit exhausted with independent READY work | cost-gated package waits; eligible no-cost work continues |
| A34 | Prolonged no-progress loop hits configured budget | bounded escalation and single actionable owner request |
| A35 | Pending decision becomes obsolete after another package fixes root cause | close superseded request with proof, no needless user question |
| A36 | Spec 224 attempts self-update with own verifier | reject promotion until independent trusted runtime certifies |

| A37 | No deployed governance service; bot attempts to generate and trust its own bootstrap key | fail closed; authenticated owner-run out-of-band bootstrap required |
| A38 | GitHub PR reviewer is also the executing bot, or approval refers to an outdated commit | grant rejected; reverify last reviewed exact commit and distinct identity |
| A39 | GitHub protection/ruleset is changed or bypassed after grant creation | revoke/quarantine affected grants until trusted-policy reconciliation |
| A40 | Grant revoked during already queued/running execution | fence not-yet-committed side effects; finish safe reconciliation; do not claim remote undo |
| A41 | Child subagent receives parent grant and asks for a broader network/write scope | reject; cryptographically/policy-bound attenuation and audit lineage |
| A42 | Spec amendment or executable dependency changes while plan is READY | invalidate affected admissions; re-plan only impacted DAG and preserve unrelated verified work |
| A43 | Mutable dependency-cache artifact matches package name/version but not approved integrity | quarantine cache; rebuild from pinned verified bytes without execution |
| A44 | Non-admitted symlink, hardlink or mount exposes sibling tenant/shared workspace | deny path and prove exact container/workspace isolation under target profile |
| A45 | One external side effect succeeds but callback/ACK is lost | reconcile by stable operation ID; no duplicate financial, Git or approval action |
| A46 | Watchdog/supervisor crashes; outbox is delayed; READY tasks queue up | another authorized supervisor reconciles same canonical jobs; bounded liveness and no duplicate dispatch |
| A47 | Operator denies authorization while other independent WorkPackages are READY | only scope-dependent jobs stop; unaffected jobs continue; no decision-loop spam |
| A48 | LLM repeats identical diagnostics with altered prose and escalates budget | strategy-fingerprint detector halts repetition; new hypothesis or bounded decision |
| A49 | LLM's proposed repair removes security assertions or edits trusted evidence | independent evidence guard rejects; original requirement remains open |
| A50 | Provider fallback transmits secret, cross-tenant data or a previously revoked tool | reject provider handoff; policy/egress and grant recheck at each boundary |
| A51 | Partial queue budget reservation races with second agent; failed provider callback repeats | committed+outstanding spend remains bounded; idempotent reservation/settlement/release |
| A52 | Worker crash occurs during atomic source promotion and GitHub PR creation | immutable candidate remains recoverable; external operation ID prevents duplicate PR |
| A53 | Reviewer/Final Verifier runs from the same compromised executable context as implementer | reject independent certification; use separate approved trust context |
| A54 | GitHub source base moves between verified PR and merge/promotion | enforce new merge-base freshness check and impacted regression/review |
| A55 | No trusted worker exists but UI/session closes | truthful `WAITING_RUNTIME`; persist cursor, no background-success claim |
| A56 | Human decision expires while mobile notification is delayed | expire and fail closed; deduplicated request may be reissued under current source |
| A57 | Tenant A's diagnostic/result/approval appears in Tenant B's mission board or agent context | access denied and incident evidence retained; no cross-tenant search leakage |
| A58 | Database restore reintroduces stale outbox jobs/grants after revocation or kill switch | reconcile epochs and authority prior to dispatch; stale replay fenced |
| A59 | Compatibility rollout uses new adapter with old Spec 224 reducer event schema | negotiate/version-pin; disable changed path without blocking compatible existing runs |
| A60 | Full goal→plan→implement→repair→review→PR run is interrupted by network loss, quota exhaustion and owner denial on unrelated task | complete eligible scope without user `continue`; blocked task remains explicit; real recovery and evidence independently verified |

**Certification bars:**

- `DESIGN_CONTRACT_PASS`: independent review of interfaces, trust boundaries, source-resolution and risk matrix. Cannot certify code.
- `GOVERNANCE_BOOTSTRAP_PASS`: actual authenticated owner-to-run grant issuance and revocation proof against exact file hashes; not fixture-only trust roots.
- `ISOLATED_AUTONOMY_PASS`: A01–A12, A18–A22, A25–A27, A29–A36 as applicable, on an approved deterministic sandbox with **zero manual next-step messages**.
- `DURABLE_APPROVAL_PASS`: A13–A17 against an approved real PostgreSQL/multiprocess environment with journal/identity evidence.
- `REGISTERED_RUNNER_E2E_PASS`: actual Feature 195 registered Runner path with correct source/economy/approval integration and verified receipts.
- `LIVE_M2_PASS`: separately approved real provider identity/session/budget/capability evidence.
- `PRODUCTION_READY`: all applicable Spec 224 final release gates + independent verifier + staging failure injection and security conformance. Neither a partial Candidate v6 nor this design may claim this label.

## 16. Operational SLOs, telemetry and stop conditions

**Release-measured invariants:** zero unauthorized consequential side effects in the security suite; zero false successful completion from failed mandatory checks; zero duplicated economic settlement/resume under replay; zero forced user `continue` prompts in the eligible autonomous test campaign; no loss of committed approval decisions across tested crash windows; no shared-worktree mutation under isolated-only grants.

**Initial target proposals** (not production SLO commitments; baseline with controlled telemetry): time from eligible READY+capacity to actual dispatch; mean attempts until evidence improvement; percent of engineering-only blockers resolved automatically; owner decisions per completed WorkPackage; recovery time after authorized restart; cost per verified requirement; provider-switch correctness; cross-run conflict rate; actual blocked-time distribution. Targets and budgets must be adopted by the product/SRE owner after trials rather than invented as guaranteed numbers.

**Fail-safe stop:** no authoritative canonical Spec; no verifiable owner grant for required modification; absent current revocation information when critical; dependency/source closure unresolved; no usable authorized Runner; agent strategy exhausted; live spend forbidden; ambiguous stale approval; a discovered secret; attempt to bypass independent review; tampered evidence; unsupported runtime isolation. Preserve an actionable typed blocker, durable checkpoint and *other* eligible work.

## 17. Definition of Done and deployment sequence

1. Registry owner records the owner-confirmed number **250** after checking the actual registry/main/PRs/worktrees for collisions and approves its relationships to the actual canonical Spec 224 plus amendments. On collision, STOP for explicit owner decision. No in-place retro-edits.
2. Assigned owners approve versioned interface contracts, precise backlog/write-sets and verified governance bootstrap path. No `APPROVED` invented from text.
3. Workpackages B1–B3 pass real isolated tests with independent verifier, using a pinned source/dependency/runtime projection. Owners can start these **without** waiting for separate DB/provider gates if independently authorized.
4. B4 durable approval bridge receives exact P-SOURCE/P-RECOVERY and any separate additive migration/DB approvals. Real multi-process crash/restore tests pass before durability claim.
5. At least one controlled full goal→verified PR E2E with injected technical failures runs under durable supervision without any user continuation, with only genuine authorization decisions (if injected) surfaced to the owner. A dry-run alone is not sufficient for registered Runner/live claims.
6. B5–B6 run under capacity/budget/tenant policies; multi-spec READY queue and mobile-friendly Decision Inbox are validated without exposing cross-tenant data.
7. B7 is promoted by actual independent security/release owner after staging, soak, rollback, supply-chain, Cloudflare substrate (if used) and Spec 224's remaining high-assurance gates pass. Production rollout is separate.

## 18. Source references and interpretation

**Internal architectural inputs (historical Library copies, not a canonical repository admission):** Spec 224 Revision 20 composite (`spec-224-r20-product-evolution-handoff-alignment.md`), especially §§460–465, 548–555 and Revision 20's additive handoff; historical Spec 224 Revision 16; prior owner-reported D3.14–D3.24 checkpoints. Verify their real local bytes and approval chain before using as normative implementation truth.

**External implementation references (informative; do not substitute for local certification):**

- GitHub branch protection, required reviewers, stale review dismissal and CODEOWNERS: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub App authentication and identity isolation: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app
- OpenAI Agents SDK human approval/serialized pause-resume: https://openai.github.io/openai-agents-python/human_in_the_loop/
- OpenAI Agents SDK tool guardrail scope/limitations: https://openai.github.io/openai-agents-python/guardrails/
- OpenAI Agents SDK current evolution is provider guidance, not a dependency mandate; preserve Spec 200's adapter boundary: https://openai.github.io/openai-agents-python/
- Cloudflare Workflows supports durable multi-step execution but cannot replace Spec 186 canonical job/state authority: https://developers.cloudflare.com/workflows/get-started/guide/

**Final note:** the desired product is *LLM intelligence inside governed durable engineering execution*. LLM-generated next actions are advisory until authorized/reconciled; engineering continuation and finality are owned by the existing deterministic Spec 224/186 runtime. This extension's official ID, approvers, actual ownership and implementation status remain unissued until verified in the user's repository.

---

## 19. R0.2 first-grant bootstrap and accountable trust chain (`SAH-DEV-AUTO-BOOTSTRAP-2`)

**Gap closed:** R0.1 B0 required an approved canonical artifact while B1 required permission to build the verifier that would authenticate the approval. Neither `gh auth status` nor an agent-authored approval YAML can resolve this bootstrap cycle. The system SHALL provide a narrowly scoped *owner-operated initialization ceremony* using the **existing** Approval/Policy authority, not a parallel approval database.

19.1 **Three bootstrap states:** `NO_TRUST_ROOT`, `TRUST_ROOT_PROVISIONED`, `VERIFIER_ADMITTED`. In `NO_TRUST_ROOT`, only read-only discovery and owner-facing unsigned proposals are permitted. A genuine human administrator independently identifies the organization/repository, selects the accepted owner identity, provisions or references a public trust key/verified enterprise IdP, configures verifier deployment and records an out-of-band enrollment receipt. The private signing key or owner token MUST remain inaccessible to all Codex/LLM/subagents and untrusted repository workflows. Bootstrap itself is privileged **human action**, not an implied exception allowing an autonomous agent to grant authority. The installer never labels itself an approving owner.

19.2 **Possible established channels:** (a) existing shared Approval/Policy authenticated API; (b) protected GitHub governance flow **only after** verifying immutable repository ID, org installation, independent human/bot credentials, branch/ruleset effective configuration, required code-owner approval, exact latest reviewed commit, and prevention/detection of admin-bypass on the grant path; (c) externally human-signed canonical grant verified against an independently preprovisioned trust root. If protection is weaker than claimed, degrade to `REVIEW_REQUIRED`, not an automatic PASS. GitHub's API proof identifies a GitHub reviewer; it does not by itself establish that this reviewer has SmartAIHub authority for every action class.

19.3 **Grant payload/signing discipline:** deterministic canonical serialization, domain separation (`SmartAIHub-DevelopmentGrant-v1`), issuer+reviewer principal IDs, tenant/project and immutable repository IDs, `audience`, `run_id` or standing-grant scope, `spec_manifest_digest`, complete source/preimage and transitive dependency closure digests, `policy_digest`, grant epoch, `not_before`, `issued_at`, `expires_at`, unique nonce, `revocation_authority_ref`, separate allowed action/tool/egress/spend ceilings and child delegation policy. Sign the canonical payload, not a mutable YAML rendering or a PR title. Include an authenticated audit event binding signed payload digest to the exact reviewed Git commit where GitHub is used. Key rotation requires trust-root version and explicit validity overlap policy; expired trust roots cannot silently renew themselves.

19.4 **Admission verifier:** run in a separately controlled trusted service/process with current owner directory/authorization, signature, mandatory independent reviewer, approved policy and active revocation. Distinguish grant *issuer*, implementer, integration writer, independent verifier and final release owner. A service account cannot approve its own proposed changes even if GitHub permits its PR. Attenuate parent → child/subagent tokens so the derived capability cannot widen path, tool, tenant, data, budget, duration or provider scope. Policy overrides cannot be supplied through prompt, repo file or mutable environment variable. Record a proof of user presence for privileged first enrollment where required by the real IdP.

19.5 **Revocation during execution:** enforce at every consequential tool boundary and before issuing new subjobs; compare current grant epoch and source/plan/policy hashes. Revocation fences undelivered/outbox and new side effects. Already committed external actions need idempotent reconciliation/compensation or operator escalation, not false promises of rollback. Missing/stale critical revocation data fails closed. Retain an authorized minimal audit trail for subsequent forensic review, not raw secrets.

19.6 **First usable path:** an owner may initially approve *only* `CANONICAL_SPEC` + a narrow B1 verifier/isolated fixture bootstrap write set using the independently enrolled authority; then a second explicit grant admits real B1 implementation. The privileged manual enrollment is the one unavoidable initial human step. Afterward legitimate low-risk standing grants permit automatic narrower WorkPackage authorizations without routine repeated chat prompts. P-SOURCE/P-RECOVERY/DB/provider/production continue to require their separate actual authority.

## 20. R0.2 canonical Spec, source lease and conflict semantics (`SAH-DEV-AUTO-INPUT-2`)

20.1 Represent each approved Spec baseline as a pinned **set** of ordered base/amendment digests, registry/repository identities, approval receipt and precedence rules. A newly created untracked document can be proposed but cannot silently supersede a signed older version; independently verify the selected exact bytes and inclusion/exclusion decisions. A manifest *file* hash does not authenticate a mismatching embedded source hash. Immutable snapshots and approved amendment supersession must have explicit compatibility/rollout handling for runs already in progress.

20.2 Every material input must have provenance and owner: direct source, generated source, schema, local workspace package, recursive imports, test code/fixtures, runtime scripts, pinned external dependencies, model/protocol pack, environment controls and toolchain versions. Full closure means the runtime can reconstruct the same execution candidate and know whether dependencies were *missing* or intentionally excluded. The closure digest also covers file modes, executable bits, symlink targets, submodules/LFS where used, patch-file integrity and approved artifact URLs. Paths are repository-root-relative canonical paths after resolving case/Unicode/path aliases; reject traversal, device/special-file and symlink/hardlink escapes into shared/unowned roots.

20.3 Source arbitration must distinguish `UNKNOWN_OWNER`, `LEASED_BY_OTHER`, `STALE_PREIMAGE`, `VERIFIED_OVERLAY`, `REJECTED_VARIANT` and `APPROVED_INTEGRATION`. An owner lease is not a repository-wide lock and is never ownership proof by Git metadata alone. If two Specs need incompatible bytes or the same file concurrently, use per-branch isolation and an integration/merge barrier with a single designated integration writer; do not merge conflicts by LLM preference. Any changed preimage invalidates its grant-bound write authorization; tests/evidence remain valid only for unaffected digest-identical subgraphs. Preserve source diffs for human resolution without exposing unrelated tenant files.

20.4 External artifacts and caches require pinned hashes/integrity, known origin, offline frozen install where supported, allowlisted fetch when necessary and **execution only after verified materialization**. Use a clean content-addressed cache boundary per trust level and tenant; a matching filename/version alone is insufficient. For high-assurance runs, produce a dependency inventory/SBOM, record license/vulnerability policy evaluation and block known prohibited artifacts. Newly discovered high-severity issues invoke the existing Spec 220 policy owner; LLMs cannot waive the finding. This does not promise that checks detect every compromised package.

20.5 Seal the bundle and then verify again **inside the exact executor** before executing any untrusted test/build script. For a local or Cloudflare Container placement, record image digest, user namespace, mount/volume mapping, network policy, executable toolchain, cgroup/resource limits, secrets mount policy and observed isolation probe. Cloudflare Container eligibility remains a target-specific external certification, not a property inferred from a documentation link or another substrate's test.

## 21. R0.2 durable liveness, failure domains and wakeup contract (`SAH-DEV-AUTO-LIVE-2`)

21.1 A READY state SHALL NOT be assigned if a required runtime/permission/capability is absent. A scheduler may report `ELIGIBLE_WAITING_CAPACITY` with a durable next-check trigger, never `RUNNING`. Only the current trusted Spec 224 reducer plus Spec 186 `worker_jobs`/outbox may decide dispatch, ownership, lease expiry, compensation and terminality; adapter-local READY lists are materialized views, not alternative queues.

21.2 Every event-driven transition SHALL persist an outbox/event identity and durable wake-up intent where necessary: `job_result_received`, `worker_lease_expired`, `approval_changed`, `grant_revoked`, `capacity_available`, `provider_health_changed`, `source_preimage_changed`, `budget_available` and `watchdog_tick`. Events may be delivered more than once or out of order. Reducer uses canonical version/epoch/fence and idempotency keys to achieve **effectively-once logical outcomes**, not a false exactly-once network guarantee. Supervisor leadership is fenced; a competing supervisor must not duplicate an external action.

21.3 A measurable `READY_WITH_CAPACITY` dispatch latency target must be selected and tested by the operational owner; define separate no-progress detection for `READY` starvation and LLM repair loops. On a blocked gate, other independent authorized WorkPackages and Specs advance; on total inactivity, emit *one* deduplicated actionable blocker and a durable next-check condition. Stop asking the user for a routine `continue` message. A provider UI or terminal exit is not evidence of a server-side pause only when an independently running durable scheduler is actually deployed.

21.4 Durable checkpoint contains current and prior candidate receipts, all active job/attempt/side-effect operation IDs, pending external ACKs, surviving lease epochs, open decisions, verified evidence and invalidations, `last_reconciled_event_cursor`, tool/protocol versions, budget state and a reducer-**derived** `next_safe_action`. After restart, reconcile canonical DB/outbox, provider remote status, source preimages, grants/revocations, budgets and kill-switch **before** triggering new work. On restored DB snapshots or leader epoch rollback, require an epoch/replay recovery barrier. Unknown remote side-effect outcome is `RECONCILIATION_REQUIRED`, not blindly rerun or assume PASS.

21.5 Define bounded retries/backoff with jitter, global/per-tenant backpressure, provider outage circuit-breakers and a poison-event quarantine that preserves incident evidence. Repeated classification/review-only missions for an unchanged input are blocked by a stable `audit_fingerprint`; a new audit may run only on materially changed source/policy/evidence, an independently requested new lens or mandated periodic review. Explicitly do not suppress legitimate new security reviews.

## 22. R0.2 bounded autonomous reasoning and experiment safety (`SAH-DEV-AUTO-REASON-2`)

22.1 The existing Spec 224 `EngineeringProblem`, `EngineeringHypothesis`, `StrategyAttempt` and `NoProgressDetector` remain canonical; this extension adds an experiment-admission policy. Each proposed experiment must declare the falsifiable hypothesis, predicted observation, evidence sources, exact files/resources touched, testable discriminator, permitted fallback, risk/irreversibility, expected/max cost, stopping condition and effect on required evidence. Choose the smallest experiment with useful information gain, but do not replace safety-critical negative testing with a cheaper simulation alone.

22.2 Separate `DIAGNOSTIC_ONLY`, `ISOLATED_MUTATION`, `EXTERNAL_SIDE_EFFECT`, `PRIVILEGED_DB`, `LIVE_PROVIDER` and `PRODUCTION` experiment classes. Each requires an actual grant matching tool/egress/data/tenant and execution context. Agent-planned experiments execute through policy-admitted tools and an allowlisted environment, never a shell bridge whose broad access exceeds the approved operation. Failed authorization is a typed gate event, not an engineering strategy to bypass via a different provider.

22.3 Avoid looping on superficially different prompts by comparing failure fingerprint + strategy *effect* + executed command/environment + evidence delta. On repeated no-progress, switch hypotheses or add independent diagnostic specialists only when they can change expected evidence. Enforce maximum repair generations, maximum code churn, max cumulative spend and safety incident budget. If exhausted, surface a single structured `TECHNICAL_ASSISTANCE_REQUIRED` with attempted alternatives, verified partial work and decision options; don't turn an unsolved bug into a fake human *product* decision.

22.4 LLM-proposed edits that reduce a required test assertion, weaken authorization, drop a security fixture, alter product semantics or modify the test harness itself must trigger separate independent authorization/review and targeted characterization. Compare requirement closure, regression impact and diff lineage to the last accepted source; detect revert/forward oscillation. Provider output and retrieved code snippets are untrusted data and cannot rewrite policy, trusted tests or approval provenance.

## 23. R0.2 delegated provider and subagent isolation (`SAH-DEV-AUTO-DELEGATE-2`)

23.1 At each planner/implementer/reviewer handoff, pin a versioned compatibility manifest for phase schema, model ID (do not rely on mutable alias alone), native tools, repository/workspace digest, requested capability, grant lineage, context-pack digest, network/data egress class and independent review requirement. A provider failing a capability probe may be downgraded or replaced but never silently gain a different side-effect class. Every child subagent receives an attenuated scope and its own attempt/lease IDs and output receipt; it cannot broaden its parent authority.

23.2 Explicitly separate LLM research/context retrieval from canonical requirement enumeration. Retrieval output through Spec 229 is advisory; canonical Spec 224 requirement ledger/Section DAG and evidence invalidation remain deterministic. Scope retrieval by tenant/project and protect private source snippets when switching providers. Cross-provider handoff should share only the minimum authorized summaries and immutable refs; a provider's private chain-of-thought or provider-native local state is not a required portable artifact.

23.3 Treat model responses, skill instructions, issue bodies, PR comments, logs, screenshots and retrieved documents as untrusted at the authority layer. Test prompt-injection across *each* tool path (including built-in/hosted operations not guarded by SDK tool hooks) and strip secrets before model context construction. Independent reviewer and Final Verifier must not rely solely on the implementer's mutable workspace, mutable evidence blob or the same compromised runtime. Self-development requires a distinct trusted independent verifier and current trusted runtime until promotion/rollback barriers pass.

## 24. R0.2 cross-service side-effect and approval consistency (`SAH-DEV-AUTO-EFFECT-2`)

24.1 Preserve original decision authority in Python/shared Approval and dispatch authority in Spec 186. Use a stable `logical_decision_id`, `delivery_id`, `run_id`, `attempt_id`, `approval_epoch` and `effect_id` with explicit uniqueness/idempotency constraints at authoritative storage boundaries. Decision + recoverable intent is atomically durable inside the decision owner's existing database or backed by a separately approved equivalent recovery contract. No cross-service distributed SQL transaction is assumed. Node commits authorized resume/reject once, then emits a durable ACK; a missing ACK triggers reconciliation by stable ID before resend. A committed response is never treated as an invitation to resume twice.

24.2 Guarantee safe behavior for cancellation/approval races, changed tenant/caller identity, expired or revoked grants, stale capability snapshots and source changes during approval wait. An approval decision that was valid when the user clicked is **not** permission to perform a later effect if the relevant preimage, auth or capability has changed. Ambiguity routes to the existing operator review. Timeouts use bounded retries and dead-letter/operator escalation instead of silently dropping decisions.

24.3 Other external consequential actions (Git push, PR creation, provider call with billable effect, economy settlement, staging deployment) need a stable side-effect operation ID, per-action idempotency/reconciliation strategy and compensating policy where an action cannot be rolled back. A network success without a local ACK must be queried/reconciled before retry. The canonical Spec 207 ledger remains the only balance/settlement authority; Spec 186 outbox remains the only canonical dispatch. Real PostgreSQL multiprocess/restart proof and exact registered Runner proof are separate from deterministic mocks and require explicit owner-approved targets.

## 25. R0.2 economic and multi-spec isolation (`SAH-DEV-AUTO-ECON-2`)

25.1 Resource scheduler reads *committed plus reserved/outstanding* budget from Spec 207 under canonical tenant/user/project scope; it cannot mint funds, change exchange rates or assume a zero-cost provider. Bound per-run, per-tenant, per-provider and reviewer costs. A failed/stale/duplicate billing callback must never spend the same reservation twice or create a second logical settlement. If the authoritative economic service is unverified, run only explicitly approved zero-cost/offline tasks and mark billable execution `ECONOMIC_GATE_BLOCKED`.

25.2 Maintain fair scheduling under constrained slots and a timeout/escalation mechanism for READY starvation; fairness cannot override an active grant or cross-tenant privacy restriction. Block only incompatible shared-file write sets, not entire independent Specs. Run-wide budget exhaustion blocks new billable actions but leaves safe no-cost diagnostics/checkpointing available when permitted. Never let a cheap model skip a mandatory independent high-assurance review.

25.3 Multi-spec output promotion uses an explicit integration DAG of pinned candidate/lockfile references; one Spec's source change invalidates another Spec's dependent verification only after deterministic impact analysis. Cross-Spec concurrent PR conflict requires guarded rebase/review; auto-merge is prohibited for ambiguous source, security, schema or policy changes unless separately delegated.

## 26. R0.2 human decision UX, liveness and notification contract (`SAH-DEV-AUTO-DECISION-2`)

26.1 A Decision Inbox entry is a canonical projection of an existing approval request, not a second approval system. Group by decision authority and exact blocking semantics; show the requested action, full artifact digests (with human-readable diff summary), effects of approve/deny/expiry, duration, risk, permitted budget, independent reviewer and unaffected work that continues. A summary card may abbreviate a hash for readability only if opening the actual approval binds to the exact full digest and latest source version.

26.2 Deliver notifications via available authenticated Web/Desktop/mobile channels only within tenant privacy policy; never place full private source, credentials or sensitive deltas in a push notification. Pending decisions have `issued`, `delivered`, `viewed`, `approved`, `denied`, `expired`, `superseded` and `revoked` projections derived from the authoritative approval event. Notification failure cannot convert an undecided gate into approved; when a decision becomes obsolete, cancel it with audit evidence and avoid redundant user prompts.

26.3 On user action, server-side authorization must verify current identity, subject role, reviewer independence, session and nonce/CSRF protections, request epoch, current preimage/policy/capability and grant revocation. If changed, show a new concise diff and request a new decision instead of applying an earlier UI state. Include accessibility/mobile audit and explicit denial path. The UI never directly writes a completion or approval status into the canonical job record.

## 27. R0.2 final evidence, certification and reproducible release (`SAH-DEV-AUTO-CERT-2`)

27.1 Trusted evidence collectors must bind to immutable source/plan/spec/lock/patch/runtime/runner IDs, exact test commands and exit statuses, environment and container image digests, actual database identity/journal where relevant, granted permissions and reviewer identity. Evidence is content-addressed, tamper evident and retained under a defined retention policy with tenant isolation. Missing evidence is `UNVERIFIED`; inconclusive evidence must not be silently upgraded by LLM prose, successful subprocess logging or a green dashboard.

27.2 A VerificationCertificate is minted only by existing Spec 224 Final Verifier in an independently trusted context. Certificate binds exact candidate, required evidence profile, risk tier, valid grant and source freshness. Before PR merge, release or promotion, recheck base/merge freshness, pending blockers, updated requirement graph, provider/reviewer independence, secret scans and gate validity; run impacted regression on any meaningful input drift. A certificate is invalidated when those bindings materially change. Untrusted PR workflows and fork jobs may never gain privileged release tokens by executing tests.

27.3 Define rollback and backward compatibility for this extension's event schemas/adapters. New components must negotiate supported versions with the deployed Spec 224 reducer, Spec 186 outbox, Feature 195 Runner and shared Approval; unsupported versions remain feature-flagged OFF. Rollout: shadow (propose but never side-effect) → assisted (explicit grants) → isolated autonomous safe → nonproduction registered Runner → separately approved staging and production. A new Spec 224 candidate does not certify itself; a trusted current runtime remains active until independently approved promotion and rollback health checks pass.

## 28. R0.2 prioritized delivery and first useful autonomous milestone

| Milestone | New scope | Exit condition | What remains explicitly gated |
|---|---|---|---|
| B0a | Read-only canonical registry discovery, source owner matrix, actual Spec 224 amendments | exact proposed source/authority packet; no invented grants | selected canonical revision |
| B0b | Owner-operated trust enrollment + existing Approval/Policy verifier admission | independent bootstrap receipt, real distinct owner/bot identity, active revocation probe | isolated implementation until first real grant |
| B1 | Versioned grant verifier & standing-grant attenuation, decision projection | genuine human grant issuance/revoke/expiry negative suite | restricted Python/economic/production |
| B2 | Isolated source/dependency closure and sealed bundle | pinned reproducible install, TOCTOU and cache-poisoning negatives | unknown/unowned input variants |
| B3 | Existing Spec 224 reducer/outbox READY liveness + LLM hypothesis/experiment adapter | one controlled failing task repairs itself and reaches independently verified isolated result without `continue` | external provider/DB/production |
| B4 | Exact P-SOURCE + P-RECOVERY durable approval bridge | approved real multiprocess PG crash/restart; fenced one logical resume | migration/DB gates and canonical ledger funding |
| B5 | Multi-spec fair queue/provider fallback/budget and integration DAG | multi-spec fault campaign, no cross-tenant data, bounded spend | live provider unless granted |
| B6 | Existing Task Control Mission Board/Decision Inbox mobile surfaces | authenticated decision/revocation and source-change UX; no chat manual phase transport | production writes/release |
| B7 | Registered Runner E2E, final release/security/prod operations | all separate Spec 224/218/219/207 gates and independent high-assurance cert | no auto-release from design alone |

The **first acceptance milestone** is B0b+B1+B2+B3: *one authorized goal enters Orchestra, a deliberately failing test triggers LLM-led investigation and a real isolated repair, an independent verifier closes the relevant requirements and an immutable candidate/PR draft is produced without the owner typing `continue`*. It may require one actual initial owner grant; it must not require manual routine engineering continuation. Do not claim always-on recovery until the deployed durable supervisor also passes restart tests.

## 29. R0.2 additional conformance mapping and proof profile

The initial cases A01–A36 remain mandatory when applicable. Additional A37–A60 SHALL be run at their appropriate evidence levels and labeled separately:

- **Trust/bootstrap:** A37–A41 require real externally verified owner identity, actual revocation and an independent verifier to claim `GOVERNANCE_BOOTSTRAP_PASS`; fixture keys are sufficient only for fixture security evidence.
- **Source/supply chain:** A42–A44 require real isolated execution with immutable content digests and the exact declared runner/container image; no local filesystem mock certifies Cloudflare's deployment profile.
- **Durability/liveness:** A45–A47, A52, A55, A58 require canonical Spec 186 state, actual restart/lease race and remote side-effect reconciliation where applicable; absent external system must be honestly marked `UNVERIFIED`.
- **Reasoning/review:** A48–A49, A53–A54 require a deliberately failing implementation and a genuinely separate evidence trust boundary; one LLM prompted twice in one mutable context does not count as independent review.
- **Provider/finance:** A50–A51, A59 require deployed adapter/economic authority at the exact approved evidence tier; historical provider success is not new proof.
- **UX/tenant/portfolio:** A56–A57, A60 require actual authenticated decision UX/tenant integration and zero forced user phase-transport messages in an eligible complete campaign; rejected human authorization is respected rather than auto-overridden.

For every case record test fixture or target identity, immutable source and dependency digests, tester identity, precise command/event sequence, actual outcome, failing counterexample where present and independent review. Claims are PASS only when that case was actually executed and verified against the admitted candidate; otherwise use `NOT_RUN`, `BLOCKED_EXTERNAL_GATE`, `INCONCLUSIVE` or `FAIL` as appropriate.

## 30. R0.2 twelve-pass design-audit closure

A structured twelve-lens document audit SHALL be maintained alongside this Spec, mapping every discovered defect to its normative correction and its specific acceptance case. This document's R0.2 design-audit designation only indicates review and incorporation of clauses; it does **not** imply all engineering gaps are implemented or closed by tests. The report includes an explicit residual risk register and verified/no-evidence distinctions.

## 31. R0.2 retained architectural invariants

1. Spec 224 remains the **sole development lifecycle/finality owner**; this extension is not another orchestration runtime.
2. Spec 186 `worker_jobs` plus canonical event/outbox paths remain the **sole durable execution authority**; adapters expose subordinate projections, not another queue, scheduler or ledger.
3. Existing shared Approval/Policy remains the **sole authenticated decision/grant authority** after owner-driven trust bootstrap; the extension may provide alternative authenticated enrollment/verification mechanisms under that authority, not a second independent grant store.
4. Feature 195, Specs 200/207/218/219/220/226/229/230 retain their documented ownership and implementation boundaries. Specs 1–213 original documents and in-progress Spec 224 are not edited by this proposal.
5. LLM intelligence is used for diagnosis, planning and bounded experiments, **not** unilateral expansion of permissions, policy edits, trust-root enrollment or Final Verify.
6. Missing authority, missing critical revocation, unowned source, unverified isolated runtime or budget exhaustion are genuine gates; `AUTO` means maximum permitted engineering continuation, not automatic circumvention of human decisions.
7. No component may claim persistent background execution without a deployed authorized supervisor, or production safety without real target-specific fault, security, financial and independent certification.



---

# Revision 0.3 — Second Twelve-Pass Execution-Hardening Audit

**Normative status:** This second twelve-lens audit amends R0.2 without removing or reinterpreting previously approved authorities. The twelve lenses below target gaps not closed with implementable precision in the previous review. Each has three new adversarial cases in §44. No document audit, hypothetical fixture, GitHub connectivity or historical Candidate v6 test proves these requirements are implemented. All new interfaces are **proposed subordinate contracts** whose owner and compatibility must be confirmed against the real active Spec 224/186/220 repositories. For conflicts, the more restrictive authorization, provenance, evidence and release control applies.

## 32. Pass 13 — Strict grant parsing and authorization binding (`SAH-DEV-AUTO-GRANT-3`)

32.1 **Signing is not sufficient without parser determinism.** Admission SHALL accept only a versioned, allowlisted, deterministic grant envelope. Define a canonical encoding profile such as RFC 8785 JCS for JSON, with explicit permitted numeric types and Unicode normalization decisions documented before any signing. Reject duplicate JSON/YAML keys, ambiguous timestamps/time zones, non-finite or imprecise monetary values, malformed identifiers, unknown *critical* fields, duplicate nonces and inconsistent detached signatures. Do not sign or verify an ad hoc YAML text serialization; YAML may be an operator presentation only. Include `grant_schema_version`, `canonicalization_profile`, `signature_algorithm`, trusted `key_id`, cryptographic `audience`, nonce, issuer/reviewer subject IDs, exact manifest and policy digests, approved action/target, credential epoch and revocation version in the signed body. Grant IDs are opaque but must be unique under issuer+tenant+scope.

32.2 **Context-bound authorization.** At each consequential call, the trusted verifier SHALL compare authenticated caller, tenant, project, immutable repository identity, WorkPackage, executor/Runner audience, source and dependency digest, current policy and requested cost/egress against the signed scope. An authenticated reviewer may approve only role-eligible decisions and must not be the acting implementation principal for the same protected change. Bot-written PRs, chat text, JSON fields such as `approved: true`, or valid signatures on a *different action* do not confer authority. For GitHub-based enrollment, verify current repository ruleset/branch protection and the exact last reviewed commit through a trusted server-side read; GitHub reviewer identity is mapped to a separately administered SmartAIHub approval role.

32.3 **Grant error contracts.** Return typed `GRANT_PARSE_INVALID`, `GRANT_SCHEMA_UNSUPPORTED`, `GRANT_SIGNATURE_INVALID`, `GRANT_AUDIENCE_MISMATCH`, `GRANT_SCOPE_MISMATCH`, `GRANT_REPLAYED`, `GRANT_REVIEWER_NOT_INDEPENDENT`; never return a generic success with warnings. Schema upgrade/downgrade must fail closed unless the real policy owner explicitly authorizes the compatibility bridge. The display layer must show exactly what is being authorized before the external owner signs.

## 33. Pass 14 — Trust continuity, clock rollback and disaster recovery (`SAH-DEV-AUTO-TRUST-3`)

33.1 **Monotonic authority.** A database restore, snapshot replay, region failover or out-of-date supervisor SHALL NOT restore a grant that was revoked or reinstate an old trust-root/policy epoch. Enrollment and revocation events require an authoritative monotonic epoch/witness outside any rollback-prone local execution database, or an approved source capable of proving the effective current epoch. On restore, new consequential dispatch is fenced until independent reconciliation of trust-root version, revocations, outstanding grants and side effects. A stale or unavailable revocation authority means `AUTHORITY_UNAVAILABLE`, not grace-period escalation to protected execution.

33.2 **Clock failure and bounded leases.** Use trusted synchronized server time with explicit skew policy. Local agent clock, repository commit time and arbitrary LLM timestamp are not authoritative for grant validity. Reject grants with contradictory `not_before`, `issued_at`, `expires_at`, or obviously invalid temporal order; refuse protected dispatch under material clock skew until recovered. Time-bound standing grants do not become perpetual when supervisors pause.

33.3 **Loss of owner key / emergency recovery.** Document a separately controlled, auditable human-led key recovery/rotation and break-glass procedure with predesignated authorized recovery principals, two-person rule for high-impact trust replacement, independent incident review and least-privilege temporary scopes. Emergency access does not mint a universal Agent token and cannot retroactively approve actions taken while trust was unavailable. Rotate affected credentials and separately re-admit previously queued WorkPackages under the new key epoch.

## 34. Pass 15 — Versioned spec/source impact graph and reproducible conflict resolution (`SAH-DEV-AUTO-CHANGE-3`)

34.1 **Impact-based invalidation, not global reset.** Persist a content-addressed input-to-requirement-to-WorkPackage-to-test-to-evidence graph. Changes to approved Spec amendments, source preimages, lockfile importers, generated source, compiler options or third-party artifacts SHALL invalidate precisely the dependent WorkPackages, admissions and certificates; verified independent subgraphs may be reused only with identical transitive digests and compatible policy/evidence scope. An owner must explicitly admit altered product semantics; an LLM may revise a plan to satisfy an *existing* approved requirement but cannot silently insert a new requirement.

34.2 **Concurrent source arbitration.** In multi-branch/multi-spec work, capture immutable base SHA, normalized source path, owner decision/lease epoch, intended patch digest, expected preimage hash and single-writer identity before edits. Integrate through an isolated immutable promotion candidate, compare-and-swap against the currently authorized base, validate full multi-file affected test selection, and preserve both losing variants if there is a conflict. A Git merge exit code or clean textual merge alone is not proof of semantic compatibility; conflicting security/schema/public contracts require designated owner or independent high-assurance review.

34.3 **External source closure.** Include pinned submodule commits, Git LFS object IDs, code-generation input and generator digest, package manager version, CI/dependency patches and exact allowed build inputs. Reject source paths that resolve outside the approved sandbox across symlink, hardlink, junction, mount, casefold or Unicode aliases. Dirty shared worktree bytes are never imported because they have a newer timestamp. Never mutate other sessions' files to make a build green.

## 35. Pass 16 — Executable dependency and test-environment closure (`SAH-DEV-AUTO-ENV-3`)

35.1 **Install what will actually execute.** An execution bundle receipt SHALL distinguish frozen source tree, `package.json`/workspace/importer graph, pnpm lock, Python requirements/constraints/wheels, executable test runner, patch files, dynamic plugins, environment policy, image/toolchain digest and verified cache provenance. The admitted bundle must be materialized and verified inside the exact runner before running package lifecycle scripts; artifact metadata is not evidence of successful installation. Any required download uses an explicit hash-pinned, egress-authorized fetch; hidden Corepack auto-download and shared mutable dependency cache are prohibited in certification mode.

35.2 **Test-runner truthfulness.** Record test discovery **before** test execution and verify the expected test identities and assertion counts, not merely exit code 0. A command with zero discovered tests, `--passWithNoTests`, ignored failures, swallowed subprocess errors, skipped mandatory suites or a disabled required coverage policy cannot claim `TEST_PASS`. Treat assertion results, coverage gate, test-selection completeness, environmental readiness and integration-target proof as distinct outcomes. Never relabel a fixture or static path check as an executed regression.

35.3 **Resource-independent replay.** Where exact replay is impossible because a remote provider or build artifact changed, retain pinned input/response/event receipts and classify replay `PARTIAL` with named missing external dependency. A new candidate must run its own focused tests; the 108/108 Candidate v6 history may establish a comparator only for its exact prior source/lock identity.

## 36. Pass 17 — Evidence-driven LLM scientific debugging (`SAH-DEV-AUTO-DIAG-3`)

36.1 **Falsifiable repair plan.** For each material EngineeringProblem, the LLM SHALL publish an evidence-linked hypothesis, specific discriminating observations, a minimal admissible experiment, anticipated outcome for each plausible root cause, rollback strategy and explicit upper bound on code churn, cost and retries. Distinguish code bug, test oracle problem, environmental failure, dependency conflict, missing authority and genuine requirement ambiguity before assigning an edit. The hypothesis ledger and NoProgressDetector remain those of Spec 224; this adapter cannot manufacture its own independent completion truth.

36.2 **Prevent cosmetic fixes and oracle gaming.** A repair is progress only when it produces trustworthy evidence improvement against the frozen approved requirement. Tests that are skipped, weakened or silently deleted, assertion-only patches without authorization, mocked external integrations rebranded as real, or repeated prose-only diagnoses do not count. Every red/green transition records exact source+test digests and must be independently challengeable; security and economic assertions are especially protected. The implementation agent cannot rewrite the mandatory acceptance criteria to declare itself successful.

36.3 **Escalate intelligently.** On ambiguous evidence, run the cheapest authorized *discriminating* experiment rather than repeatedly retrying the same plan. On repeated unchanged failure fingerprints, isolate smaller reproductions, inspect interface boundaries, request an independent specialist, switch eligible provider/toolchain, or replan within signed semantics. If constraints are truly authoritative or irreducible, issue one deduplicated exact owner request and continue unrelated ready work. Do not claim that the LLM can bypass missing approvals with cleverness.

## 37. Pass 18 — Dependency joins, lost wakeups and supervisor convergence (`SAH-DEV-AUTO-JOIN-3`)

37.1 **Atomic canonical transitions.** All WorkPackage/subrun joins SHALL derive from authoritative Spec 224 state and Spec 186 job/outbox events. Persist child result and potential parent-ready reevaluation in one canonical transaction/outbox sequence where possible; when services cannot share a transaction, use durable idempotent intent and reconciliation. Parent completion requires all *current* mandatory children and evidence barriers under the latest plan epoch. A child completion that arrives before listener subscription or after plan revision must not be lost or incorrectly satisfy an old barrier.

37.2 **Fenced supervisors.** Leadership changes, delayed events, duplicate callbacks and split-brain network partitions must result in one logical dispatch/effect per stable operation ID. Each worker/child carries plan epoch, lease epoch, capability+grant digest and source hash. Stale completions are recorded as historical evidence, not authoritative `PASS`; old workers cannot reopen, complete or side-effect a superseded plan.

37.3 **Liveness obligation.** A READY package with capacity and valid grants has a measurable dispatch SLA; overdue states trigger watchdog reconciliation and an auditable `LIVENESS_VIOLATION`, not silent indefinite READY. Distinguish `WAITING_RUNTIME`, `WAITING_GRANT`, `WAITING_CAPACITY`, `WAITING_EXTERNAL`, `WAITING_HUMAN` and terminal states. If no real durable supervisor is deployed, promise only in-session orchestration plus a resumable checkpoint.

## 38. Pass 19 — Ambiguous external effects, cancellation and fail-closed continuation (`SAH-DEV-AUTO-EFFECT-3`)

38.1 **Externally ambiguous outcome.** Model every consequential action as `PROPOSED → AUTHORIZED → INTENT_PERSISTED → DISPATCHED → ACKED | OUTCOME_UNKNOWN | FAILED_VERIFIED | COMPENSATION_REQUIRED`. Operation IDs must survive agent/Runner/provider replacement and restart. When a remote action might have succeeded but ACK is missing, query the authoritative remote system using the operation ID; retry only if the remote API supports a verified idempotency key or the verifier has established that the action did not occur. Do not generically retry financial settlement, PR creation, approval continuation or production deployment.

38.2 **Cancel, revoke, supersede.** On cancel/denial/revocation, atomically fence new work and delegated child capabilities; reconcile already issued remote effects, release/reconcile reserved budgets through existing Spec 207 APIs and mark non-reversible effects for approved operator review. Cancellation is not evidence that a previously dispatched external action was rolled back. Verify current authenticated actor+tenant, runner capability, grant epoch and approval metadata again on every resumed consequential action.

38.3 **Poison and uncertain state.** Malformed or repeated poison events must be quarantined with bounded replay under independent operator approval. `OUTCOME_UNKNOWN` cannot transition to success from LLM prose, stale logs or an exit code without an action receipt. Report `OPERATOR_REVIEW_REQUIRED` with exact action identity, source, durable intents, known remote state and unaffected eligible work.

## 39. Pass 20 — Provider/tool capability integrity and data-minimized failover (`SAH-DEV-AUTO-PROVIDER-3`)

39.1 **Real capability admission.** Probe actual connected harness session, authenticated identity, subagent availability, tool permission enforcement and installed protocol pack/model version before assigning tasks. A screenshot of remaining quota, a historical feature matrix or `gh auth status` alone is not proof of capacity or the owner's signing authority. Runtime API failures should be classified separately as `RATE_LIMIT`, `TOKEN_EXHAUSTED`, `AUTH_REVOKED`, `CAPABILITY_MISSING`, `EXECUTOR_DOWN` or `UNKNOWN` using real error evidence; an unverified quota must be `UNKNOWN`.

39.2 **Fallback is a new authorization boundary.** Provider/tool/model fallback must re-check sensitive source classification, tenant policy, data residency, context minimum, licensing, tool allowlists, current grant and spend ceilings. Do not copy whole private conversations, raw secrets or entire proprietary repositories to a new model. Every handoff contains a signed/verified minimal context manifest, pinned source and prompt-pack digests, last settled operation IDs and previous failed strategy fingerprints. The new worker cannot widen its permissions, restart settled effects or declare old evidence freshly tested.

39.3 **Tools are untrusted interfaces.** Treat repository instructions, fetched documents, generated tool descriptions, Skill files, logs, PR comments and provider output as untrusted data unless separately installed/trusted under the existing Spec 220/221/230 contracts. Enforce authorization/egress at the actual tool boundary, not only in the LLM prompt or visible tool list. Record denials without leaking protected content.

## 40. Pass 21 — Decision Inbox concurrency and human-interruption minimization (`SAH-DEV-AUTO-HUMAN-3`)

40.1 **Atomic decision object.** A notification, chat reply, GitHub review or mobile card SHALL project one existing authoritative approval request, not create a competing approval store. Bind action to exact request epoch, full hash-bound diff, latest owner role, granted operations, affected WorkPackages, expiry and independently refreshed revocation. Batch decisions only when each selected grant has independently verifiable scope; a single batch click cannot silently widen an unrelated grant. Denial, partial approval and request for clarification have defined durable outcomes.

40.2 **No repeated owner questions.** Deduplicate decision prompts by `{decision_requirement, source_digest, policy_epoch, scope_digest}` and supersede obsolete requests when their underlying blocker is independently resolved. Never declare approval from a notification delivery/view receipt. On stale mobile/browser action, refuse mutation, show the delta and request reapproval only for impacted scope. Each issue records one exact next owner action, *not* a series of indistinguishable audit packets. Other independent READY packages remain scheduled.

40.3 **Communication is not execution.** Owner notification is asynchronous *only if an actual deployed notification/worker service is configured*. If no backend can wake after Session termination, show `WAITING_RUNTIME` honestly. Make refusal, pause, resume and revocation visible in Task Control, including basic accessible keyboard/mobile operation; full private source never appears in push payloads.

## 41. Pass 22 — Independent test oracles, provenance and false-green resistance (`SAH-DEV-AUTO-VERIFY-3`)

41.1 **Independence means authority and environment separation.** The implementation process cannot author or alter the trusted expected-output oracle, grant authority, CI policy or final certificate for its own modification. Independent reviewer/verifier runs with separate identity and immutable read-only source/evidence, using trusted evidence collectors and tests prepared outside the mutable implementer workspace. A different LLM conversation alone does not establish a different trust boundary.

41.2 **Evidence joins.** A per-requirement closure proof SHALL identify exact spec+amendment version, plan epoch, WorkPackage, source+lock+runtime and test digest, actual command, discovered/executed/passed/skipped counts, exit+coverage outcome, signed reviewer identity and risk profile. Final Verify SHALL recompute complete applicable requirement coverage, including cross-cutting security/tenant and reopened gaps. Missing, stale, tampered, unexecuted or scope-incompatible evidence blocks only the affected release/certification until repaired.

41.3 **Release proof levels.** Use `DOCUMENT_REVIEWED`, `STATIC_VERIFIED`, `FIXTURE_EXECUTED`, `ISOLATED_DETERMINISTIC_PASS`, `PERSISTED_DB_RESTART_PASS`, `REGISTERED_RUNNER_E2E_PASS`, `LIVE_PROVIDER_PASS`, `SUBSTRATE_ISOLATION_PASS`, `STAGING_FAULT_PASS`, `PRODUCTION_READY` as distinct claims. Higher levels require the relevant lower-level controls plus actual target execution; a pass at one level does not imply the next. Track exceptions as owner-signed, time-bound risk waivers **only where release policy explicitly allows**; waivers may never turn missing mandatory security evidence into a forged PASS.

## 42. Pass 23 — Compatible rollout, kill-switch, incident response and restore (`SAH-DEV-AUTO-OPS-3`)

42.1 **Protocol version migration.** New adapters and event payloads must negotiate with deployed Spec 224 reducer, Spec 186 queue/outbox, shared Approval and Feature 195 Runner. Require backward/forward compatibility matrices and mixed-version tests during rolling deployment. Unknown critical event fields or unsupported schema versions quarantine/fence the affected job, not silently coerce it to complete. No standalone queue or control-plane authority is introduced.

42.2 **Operational protection.** Global/tenant/run kill switches fence new tool calls and job dispatch; already committed effects remain reconciled and auditable. Define explicit rollback checkpoints for capability/policy/schema/version rollouts. On secret exposure, deny further affected provider/egress operations, quarantine tainted artifacts, preserve redacted forensic receipts and request authorized owner rotation without printing sensitive values. Untrusted PR workflows never inherit release credentials.

42.3 **Disaster recovery proof.** Test supervised backup/restore into a new authorized environment with exact DB identity, non-superuser runtime roles, journal/cursor/lease/grant/side-effect receipts and external authority reconciliation. After restore, check revocation/trust-root and source/plan epochs *before* dispatching jobs; do not resurrect revoked work or replay already committed external effects. Staging soak, resource exhaustion and Cloudflare Container isolation are separately certified on the exact deployment substrate.

## 43. Pass 24 — Outcome measurement, portfolio fairness and cost of autonomy (`SAH-DEV-AUTO-OUTCOME-3`)

43.1 **Measure real autonomy, not activity.** For each controlled campaign record number of eligible WorkPackages, exact approved scope, normal technical failures encountered, autonomous diagnoses, verified repairs, new human decisions, owner intervention type, resume events, time to independently verified completion, and cost/tokens per verified requirement. `ZERO_FORCED_CONTINUE` applies only if a complete *eligible* goal reaches its defined independently certified artifact without asking a person to advance an engineering phase. Cancelling a run, marking it terminal after failed tests or hiding unresolved work cannot count as success.

43.2 **Portfolio and budget correctness.** Multi-spec scheduling must enforce tenant/project/owner isolation, admission quotas, bounded fairness and Spec 207 reserved+committed+pending cost constraints. Provider/model selection must consider expected evidence yield per spend, data/egress constraints and capability suitability; it must not game the metric by selecting a cheaper model that weakens verification. A provider outage in one Spec cannot starve unrelated approved, zero-cost READY work. Record starvation age and actionable capacity/blocker states rather than fabricating exact ETA.

43.3 **Operational SLO adoption.** Product/SRE owner must baseline measurable SLOs for READY-to-dispatch, recovery after authorized process restart, unresolved decision latency, no-progress escalations, false-green rate and sustained isolated completion rate. The Spec may propose targets but cannot claim production SLO compliance from simulation or one demo. Require canary abort/rollback criteria and immutable telemetry; secure deletion/redaction must propagate through event logs, snapshots, embeddings, exported context packs and backup retention under the existing applicable tenant/legal policy without erasing mandatory audit evidence improperly.

## 44. R0.3 additional conformance cases A61–A96

The R0.2 A01–A60 matrix remains applicable. These 36 additional cases are *mandatory when the corresponding feature and certification tier is claimed*; where a target cannot exercise a case, `NOT_APPLICABLE` requires independent impossibility evidence and the claim's limitations must be disclosed. Every executable case must bind a frozen candidate, toolchain/source/manifest digests, actual evidence and independent review. Document review is never executable certification.

| ID | Pass | Required adversarial scenario | Minimum accepted outcome |
|---|---:|---|---|
| A61 | 13 | Duplicate grant keys or conflicting encoding lead to divergent parsing | deterministic reject; no action |
| A62 | 13 | Valid signature targets another repository/run/audience or unknown critical field | scope/schema failure before tool call |
| A63 | 13 | Reviewer identity is bot/implementer despite valid GitHub PR review | independent owner check rejects grant |
| A64 | 14 | Restore an older DB image containing a previously revoked grant | authoritative epoch rejects restored grant before dispatch |
| A65 | 14 | Skew executor clock backward across grant expiration | protected action denied pending trusted time |
| A66 | 14 | Owner trust key is lost; agent attempts self-appointed break-glass | fail closed; human-led audited recovery required |
| A67 | 15 | Only one unrelated file changed; whole plan is invalidated unnecessarily | precise digest-based affected subgraph invalidation and safe evidence reuse |
| A68 | 15 | Two concurrent specs produce clean textual merge but incompatible schema semantics | isolated integration barrier prevents automatic promotion |
| A69 | 15 | Git LFS/submodule or generated-source input missing from claimed source closure | reject candidate admission, expose exact missing input |
| A70 | 16 | `vitest` exits 0 with zero discovered tests / passWithNoTests | reject mandatory `TEST_PASS` |
| A71 | 16 | Python assertions pass but mandatory coverage gate fails / ignored required tests | separate results; certification blocked |
| A72 | 16 | Install uses unpinned Corepack fetch or shared cache artifact substituted after sealing | deny execution and invalidate bundle receipt |
| A73 | 17 | Two root causes fit logs; agent proposes patch with no discriminating experiment | require smallest authorized falsifiable test |
| A74 | 17 | Green result arises from deleted assertion or mock replacement of mandatory integration | independent oracle guard rejects false closure |
| A75 | 17 | Three cosmetically different prompts repeat same strategy with no evidence delta | NoProgressDetector replan or bounded escalation |
| A76 | 18 | Child result arrives before parent join subscription and supervisor crashes | persisted outbox join still advances parent once |
| A77 | 18 | Two supervisors in split brain dispatch same READY job | lease/fence prevents duplicate logical side effect |
| A78 | 18 | Late child PASS refers to obsolete plan epoch | historical evidence only; current parent barrier remains open |
| A79 | 19 | PR/financial side effect succeeds remotely but ACK is lost | query-before-retry; same stable operation ID; no duplicate |
| A80 | 19 | Cancel arrives while remote irreversible action is in flight | fence new effects; reconcile prior action; no false rollback claim |
| A81 | 19 | Poison callback yields uncertain external state and repeated redelivery | quarantine; bounded independent operator escalation |
| A82 | 20 | Screenshot shows capacity but actual Sub-agent API denies spawn | truthful runtime classification; authorized sequential continuation |
| A83 | 20 | Provider failover would cross an approved data residency/egress boundary | deny switch; continue other eligible work |
| A84 | 20 | Untrusted Skill/PR log injects a privileged tool invocation | server-side grant enforcement prevents access |
| A85 | 21 | Batch grant click includes one stale or unrelated privileged scope | refuse stale/mismatched item, do not widen unrelated grants |
| A86 | 21 | Same decision is issued repeatedly across restarts without underlying change | one canonical request; deduplicated notification |
| A87 | 21 | Mobile owner clicks superseded approval after source changed | revalidation rejects action and presents current diff |
| A88 | 22 | Implementer runs same mutable source as purported independent verifier | independent certificate rejected |
| A89 | 22 | One mandatory requirement lacks current executed test despite green aggregate CI | requirement closure and Final Verify blocked |
| A90 | 22 | Waiver claims static review equals real DB/restart security test | waiver cannot convert absent mandatory evidence to PASS |
| A91 | 23 | Old Runner receives new critical event schema during rolling deploy | negotiate/quarantine affected event; retain old compatible run |
| A92 | 23 | Kill switch trips after task dispatched and secret exposure detected | no new effects, safe reconciliation and redacted incident record |
| A93 | 23 | Restore into new PG target replays previously settled job and revoked grant | restored epochs/effects fenced; no double settlement |
| A94 | 24 | Agent declares zero-continue by cancelling failing work or skipping mandatory verification | campaign metric rejects false success |
| A95 | 24 | Expensive provider retry consumes shared budget while unrelated zero-cost READY work exists | fairness and cost gates keep eligible package advancing |
| A96 | 24 | Single isolated demo passes but production SLO is asserted | production claim remains unverified until measured rollout/soak |

## 45. R0.3 implementation delta and tier-specific exit gates

| Work package | Incremental deliverable | Dependency | Evidence/owner gate |
|---|---|---|---|
| C0 | Strict canonical grant envelope/parser + external root/epoch verifier adapter | R0.2 B0a/B0b, actual authenticated trust owner | real first owner enrollment; A61–A66 with isolated verifier; no agent self-enrollment |
| C1 | Input/evidence impact graph and multi-branch promotion barrier | owner-approved exact Spec/source scopes, R0.2 B2 | A67–A69; source/dependency closure and independent compatibility review |
| C2 | Executable environment and test-identity admission | independently admitted isolated write scope; R0.2 B2 | A70–A72; frozen installs and actual test discovery/counts |
| C3 | Discriminating-experiment adapter using existing Spec 224 EngineeringProblem | R0.2 B3 and trusted test oracle | A73–A75; evidence delta and bounded repair proof |
| C4 | Parent-join/liveness and side-effect uncertainty hardening | deployed Spec 186/224 compatible reducer/outbox and authorized test target | A76–A81 with actual persisted event/restart and remote-idempotency evidence for claimed tier |
| C5 | Verified provider handoff and Decision Inbox race controls | Spec 200/220/226 compatibility and real authenticated grant channel | A82–A87; actual capability probe and authenticated UI action tests |
| C6 | Independent evidence/oracle hardening and compatible deployment | independent trusted verifier and deployment owner | A88–A93; tiered certified environment and restore/rollback proof |
| C7 | Honest autonomy metrics, fairness and SLO certification | C0–C6 at applicable claimed tier and SRE owner | A94–A96; at least one full zero-forced-continue fault campaign, no artificial completion |

**Critical path:** R0.2 B0a → B0b → B1 → B2 → B3 remains intact; R0.3 C0 hardens B1, C1/C2 harden B2, and C3/C4 harden B3 without adding a new orchestrator, grant issuer, job queue or ledger. C5–C7 can begin independently where compatible inputs and owner grants permit. If one restricted WorkPackage is blocked by P-SOURCE/P-RECOVERY or migration A–D, independent authorized packages continue. Unapproved DB, external provider, registered Runner and production certification remain separate external gates. No historical Spec 224 source or Specs 1–213 are edited by this proposal.

**First meaningful autonomous exit:** Under a real authenticated narrow grant, one immutable isolated codebase must experience a deliberately failing test, an ambiguous technical diagnosis, an authorized discriminating experiment, bounded repair, a verified test run, an independent review, and an immutable PR draft or candidate. During the same campaign introduce a lost wakeup/worker restart and a false-green test trap. A real deployed supervisor (not a chat session) must resume the active DevelopmentRun. The user makes only an actual initial grant or genuine business decision—never a routine phase-continuation response. If external supervisor/DB/provider proof is not authorized, label the achieved tier accurately and do not claim Always-On or production.

## 46. R0.3 architectural invariants and residual risks

- **One authority per concern:** existing Spec 224 owns development lifecycle, PlanSections, EngineeringProblem and Final Verify; Spec 186 owns durable jobs, events and outbox; shared Approval/Policy/Spec 220 owns grants; Spec 218 owns development workspace; Spec 207 owns spend; Feature 195 owns Runner transport. This extension supplies subordinate contracts and conformance only.
- **Active implementation boundary:** never retro-edit Specs 1–213 or silently rewrite active Spec 224; any new schema/API/adapter is separately approved, additive and versioned. Owner-confirmed number `250` must be reconciled with the actual canonical registry before commit; any collision requires a fresh explicit owner decision, not automatic renumbering. Stable extension identity is `SAH-DEV-AUTO-EXT-01`.
- **No claims from paperwork:** 24 document-audit lenses across R0.2 and R0.3 do not imply deployed code, independently approved source, verified Cloudflare isolation, real PostgreSQL replay, registered Runner E2E, paid provider or production readiness.
- **Fail closed and continue safely:** missing trust, source owner, critical revocation, immutable input, approval, tested runtime or cost authority blocks only dependent consequential work. Preserve eligible independent work and a durable *truthful* checkpoint. A bot can propose; only actual authorized humans/service authorities can issue grants.
- **Residual risks requiring real proof:** organization-specific GitHub policies/IdP, owner key custody and recovery, canonical registry identity, exact backend APIs and migration sequencing, provider-specific idempotency and retention limits, operational SLO baselines, target container/kernel isolation, and supply-chain compromise beyond detectable provenance controls.

**Informative standards alignment (not certification):** NIST SP 800-218 SSDF (secure development practices); SLSA v1.2 Build/Source Tracks (provenance, source-process trust and hardened builds); OWASP LLM Prompt Injection Prevention Cheat Sheet (untrusted-content/tool boundary); GitHub protected branch and pull-request review configuration (reviewer separation and stale-review protection). Use current official documents as implementation references, but actual conformance requires evidence from the exact deployed environment.

---

# R0.4 Proposed Additive Amendment — Source-Verified SmartSpecPro Skill Integration (Sections 47–56)

> **Provenance and status:** This amendment is based on static inspection of the owner-provided `skills.zip`, SHA-256 `954b3320b4ec88d2b9799d3d57aee29949fb8d95d7744b846e197e8d2e82a584`, with 42 Skill entrypoints and 34 sub-agent role files. The ZIP CRC and filename/symlink checks passed. **No bundled Skills, hooks, install scripts, model calls, real provider, Runner, DB, or product tests were executed.** This ZIP is a source snapshot, not a trusted installed version or a user authorization. Exact source file SHA-256 receipts are in the accompanying manifest. Verify the actual installed repository revision and owner-controlled signature/channel before taking any action.
>
> **Precedence:** Sections 47–56 are additional normative compatibility requirements. Where their safety constraints are stricter than R0.1 Sections 0–18, R0.2 Sections 19–31, or R0.3 Sections 32–46, they govern the new Skill-adapter implementation. They do not alter an approved upstream Spec 224 contract, grant implementation access to any file, or assume proposed Spec number 250 has been reserved. Preserve `SAH-DEV-AUTO-EXT-01` if renumbered.

## 47. Skill snapshot identity and admission (`SAH-DEV-AUTO-SKILL-1`)

47.1 `SkillPackReceipt` SHALL contain an immutable full archive/source-tree SHA-256, per-SKILL/ref/hook/script fingerprints, executable entrypoints, upstream repository/revision when verified, locally installed revision when verified, license inventory, dependency/runtime requirements, owner, reviewer, installation trust and revocation records. An owner-supplied ZIP alone is **not** installation trust or authority to execute scripts. The adapter must match installed bytes to the approved receipt before each new DevelopmentRun or after changes.

47.2 Agent-provided SKILL.md text, Markdown references, plugin manifests, hooks, Task Packets, PR comments and shell logs remain untrusted at the executable authority boundary. Static skill audit and reviewer approval may propose permissions, but only existing Spec 220/shared Approval/Policy may issue them. `Spec 221` governs Skill quality, signing/evaluation and publication where applicable. Never ingest bundled offensive-security reference material into ordinary coding agents without a role and policy need.

47.3 Pin the three core source entrypoint digests for this *observed ZIP* only: Orchestra `1f0baea29968beafd002ad3b596ded8b8a81ba6dc9241fffd08761ec35d09201`, Deep Plan `4f14a032ae22f9ad63d0ddb3882b481818f416370c0d712c6ccb260b544f8a2f`, Deep Implement `f30ca6aba073f49a8c2af8286449520c841741e131a6cd6263485bd8526029d4`. A changed installed file invalidates its former compatibility attestation until re-reviewed; a bundle-level hash alone does not establish each file's identity. Ignore the backup `skills/orchestra/SKILL.md.bak.*` as a selectable executable entrypoint.

## 48. Provider Skill bridge and canonical phase ownership (`SAH-DEV-AUTO-SKILL-PHASE-1`)

48.1 Existing `orchestra`, `deep-plan`, `deep-implement`, `deep-plan-quick`, `deep-project`, debug/reviewer and optional installed Skills MAY be selected as provider-facing execution aids. They SHALL NOT own durable lifecycle, job scheduling, signed grants, terminality, Final Verify or approval truth. Spec 224 alone owns the canonical DevelopmentRun reducer and WorkPackage DAG; Spec 186 alone owns durable jobs/outbox. `orchestra/plan.md`, `progress.md`, `backlog.md`, `lifecycle.md`, `snapshot.json` and CLI task lists are subordinate per-attempt projections, never a second authoritative queue or grant ledger.

48.2 Before dispatch, the canonical runtime emits `SkillPhaseDispatch`: run/attempt/section/package IDs, approved spec/plan revision and digests, input-source/lock/environment bundle hash, explicit allowed write paths, authenticated grant reference, permitted test commands, capability and spend envelope, side-effect class, parent and sibling dependencies, deadline/retry budget and phase-result schema version. Child Skills may propose strategy and evidence but cannot silently add mutable source, choose an unapproved Spec revision or reinterpret `WAITING_HUMAN` as a successful terminal state.

48.3 The adapter maps Skill terminal output to `DevelopmentPhaseResult`: explicit `SUCCEEDED | PARTIAL | BLOCKED | FAILED | CANCELLED | INDETERMINATE`; source/test/plan/environment digest tuple, actual commands and exit codes, expected/discovered/executed test identities and required coverage, current grant/lease/attempt epochs, changed file paths with before/after hashes, findings, exact blocker keys, current evidence refs and invalidations, nested agent result refs, policy denials, and proposed next action. Native six-field Result Reports are accepted as human-readable supplements only. Invalid/missing proof is `UNVERIFIED`, never silently `PASS`.

## 49. Authority and dangerous default override (`SAH-DEV-AUTO-SKILL-GOV-1`)

49.1 **Mandatory fail-closed adaptation:** The supplied Orchestra `auto_by_default` + CONDITIONAL/HIGH security auto-acceptance behavior SHALL NOT be available for SmartAIHub-governed development. Auto-**fixing** a HIGH finding inside an already granted write set is distinct from auto-**accepting residual risk**. HIGH/CRITICAL residual findings require the applicable authorized independent security decision, and no Skill may mint, alter, impersonate or consume expired grants. Server-side grants/tool interception outrank Skill instructions even if the prompt attempts to bypass them.

49.2 A Skill's backup-first policy is not permission for a destructive migration, production mutation or credential action. `P-SOURCE`, `P-RECOVERY`, historical migration A–D, real DB/Runner/provider and production require the existing separately authenticated approvals. Routine non-destructive commands may be predelegated by strict standing grants only when scope/budget/time and source fingerprint match.

49.3 An attempt to run `deep-plan --force` against a shared/other-owner task list, refresh an actively implemented Spec 224, change a frozen `spec.md` or rewrite someone else's plan shall be denied or redirected to a newly namespaced, owner-approved proposal artifact. No issue text, Skill text or GitHub connection is evidence of human consent.

## 50. Exclusive source, index and commit safety (`SAH-DEV-AUTO-SKILL-GIT-1`)

50.1 When using Deep Implement, do **not** use its default `git add -u` or automatic commit behavior against any shared/dirty worktree. The harness must create an owner-approved isolated worktree with an exclusive index. On every edit, validate canonical parent-path containment, symlink/escaping paths, allowed glob+exact paths, complete preimage SHA-256, source-owner lease, and the approved dependency closure. The active unowned shared worktree remains untouched.

50.2 Before commit, verify every `git diff --cached --name-only -z` path against the active exact allowed write set and ensure every staged blob is from the admitted isolated source overlay. Reject any unexpected file, foreign staged change, test deletion/weakening or source/lock drift. Allow commit only when the granting policy explicitly includes isolated commit creation. PR opening/push/merge/release remain separately scoped operations under existing permissions. A generated planning-section file may not rewrite an active original Spec or be staged incidentally.

50.3 If a Skill has no safe mode for this behavior, block that mutating Skill invocation and use a reviewed, versioned shim/patch in its separately owned fork. Do not assume a prompt telling the LLM to avoid `git add -u` is an enforceable control.

## 51. Plan/artifact import, review and genuine DAG (`SAH-DEV-AUTO-SKILL-PLAN-1`)

51.1 Import `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, `sections/index.md` and individual section plans only as provenance-linked candidate artifacts. Before an approved plan may dispatch implementation, deterministically enumerate every current canonical requirement, including approved amendments, and check requirement→section→task→test/evidence coverage. Reject plans synthesized from the wrong `spec.md` or stale repository bytes. For already-approved Specs, skip redundant spec authoring/owner interviews if semantics are settled.

51.2 Native Deep Implement's setup graph serializes each section after the previous section's commit. Preserve **per-section** TDD/review/commit dependencies but derive **cross-section** execution from Spec 224's approved WorkPackage DAG. With disjoint write sets, independent sections may run concurrently; a blocked section holds only its actual dependents. Never claim all sections complete because section documents exist or because the last section was committed.

51.3 Deep Plan's same-model adversarial self-review helps candidate quality but does not satisfy risk-mandated independent PLAN_VERIFY. For high-risk plans and the self-development bootstrap, require a detached provider/context plus trusted deterministic contract checks under the existing independent verification policy. Model confidence percentages alone do not authorize product-semantic changes or override missing verification.

## 52. Repair limits, skipped sections and tainted staged state (`SAH-DEV-AUTO-SKILL-REPAIR-1`)

52.1 Deep Implement's described automatic skip after three logged failed repair attempts SHALL map to a canonical `BLOCKED_REPAIR_LIMIT` WorkPackage with the mandatory requirement/evidence barrier open, not to `DONE_VERIFIED`, `NOT_APPLICABLE`, or a success counted toward the next release. Keep source+test+failure fingerprints and hypothesis/attempt ledger refs. Spec 224 NoProgressDetector may choose a revised experiment, alternate authorized specialist or replanning strategy within configured budgets. Independent DAG branches may continue.

52.2 Deep Implement's documented continuation after a failed Git commit SHALL be prevented from sharing the dirty index with the next WorkPackage. Fence the failed attempt, revalidate staged set, quarantine its artifacts, then either recover the original section in its isolated worktree or dispatch disjoint work in another pre-authorized workspace. A stored commit SHA alone is insufficient evidence of passing current tests, independent review or final verified requirements.

52.3 Preserve existing Stage `RED → GREEN → REFACTOR → TARGETED_VERIFY → REVIEW`; record test discovery and oracle integrity so disabling assertions, hiding required failures or swapping a live integration for mocks cannot claim progress. A repair strategy with identical failure fingerprint and no evidence delta triggers bounded escalation, not unlimited prompts or another unchanged audit packet.

## 53. Quota, host-session and true durable wake-up (`SAH-DEV-AUTO-SKILL-RUN-1`)

53.1 Translate the Skill pack's STOP-and-wait-for-user on HTTP 429/overload into existing durable `WAITING_CAPACITY`, `WAITING_PROVIDER` or `WAITING_EXTERNAL` states with a recorded real error, actual capability probe, circuit breaker, policy-approved backoff and next-check event. When an independent cheap/sequential WorkPackage remains eligible, continue that work. Never synthesize a quota percentage from UI screenshots or claim background work if no independent deployed scheduler exists.

53.2 `orchestra/` is shared at repository root in the supplied pack; therefore projections must be namespaced by tenant/project/DevelopmentRun/attempt and subject to atomic versioned writes. CLI task-list IDs must not be reused across unrelated sessions. A manually invoked `/orchestra resume` reads *advisory* snapshot state; real cross-session wake-up is performed only by deployed Spec 224/186 Supervisor, reconciling canonical DB/outbox and validating source/grant/budget/provider state before dispatch.

53.3 The current Skill pack's preferred hard-coded model names do not establish that a particular model exists on an installed account or provider. Spec 200 capability discovery and actual host-tool probes choose eligible models under Spec 207 budgets and Spec 220 data policy. If model override isn't available, record actual vs preferred model; never claim a planned model was the actual executor.

## 54. Independent evidence and skill-level test trust (`SAH-DEV-AUTO-SKILL-VERIFY-1`)

54.1 Require exact command/exit status/test-discovery/coverage source/lock/runtime tuple and the trusted location of test output rather than accepting the six-field free-text Result Report alone. `SKIPPED_POLICY`, no-tests, failed mandatory coverage and missing external integration proof remain separate evidence outcomes; do not call missing tests PASS. When code, test or Skill pack changes, invalidate only affected evidence through the canonical dependency map.

54.2 In-session code-reviewer subagents may detect defects but their generated text cannot mint the independent `VerificationCertificate`. For Platform Core, material security changes and Spec 224 self-development, use a verifier with an independent trusted source/execution view. Verify the upstream Skill's claimed behavior using executable fixture tests at the installed exact hash; this source audit does not assert that those tests have passed.

## 55. Additional skill catalog and privileged operation boundaries (`SAH-DEV-AUTO-SKILL-CATALOG-1`)

55.1 `deep-plan-quick` and `deep-project` are candidate plan/decomposition aids; `dep-doctor`, `rescue`, `engineering-postmortem`, `security-audit`, `secret-scanner`, `health-check` and selected sub-agent specialists MAY be registered as capabilities subject to discovery and installed-hash checks. These are optional routes and SHALL NOT become a reason to duplicate the Spec 224 lifecycle or to load all Skills into every model context.

55.2 `deploy`, `release`, `ship`, incident-recovery actions, schema/migration scripts and security testing tools are **privileged** or risk-dependent. A predeploy scorecard is evidence gathering, not authorization to publish; release/tag/push/deploy need their own allowlisted, authenticated side-effect grant. Under no circumstances may a Skill instruction serve as permission to bypass tenant policy, expose secrets or alter production without existing approval.

## 56. Source-grounded conformance: Spec 214 representative fixture (`SAH-DEV-AUTO-SKILL-TEST-1`)

These are **proposed tests, not executed tests**. They extend R0.3 A01–A96 without changing their identities:

| Test | Source-grounded failure injection or contract | Required result |
|---|---|---|
| A97 | Orchestra starts under `auto_by_default` with unresolved HIGH security findings | server denies residual-risk auto-acceptance; authorized fix/review or verified human decision |
| A98 | Bundle has correct ZIP digest but modified installed `SKILL.md` | admission invalidates stale skill receipt |
| A99 | Malicious untrusted SKILL text asks agent to invoke privileged tool | real tool boundary denies without grant; redact and log |
| A100 | Two same-repo sessions write `orchestra/snapshot.json` | distinct run scopes; no progress/grant cross-contamination |
| A101 | Deep Implement executes `git add -u` with unrelated dirty tracked file present | blocked or confined to clean exclusive index; unrelated file not staged/committed |
| A102 | Candidate includes an unowned modified `apps/web/package.json` or changed lockfile | quarantine affected package; unaffected sections continue |
| A103 | User-approved Spec 224 already exists; Orchestra attempts to refresh it | no unauthorized overwrite; new proposed amendment artifact instead |
| A104 | Deep Plan task list conflicts and requests `--force` | current other-run tasks preserved; unique task-list namespace or exact owner decision |
| A105 | Two disjoint section plans in a serial Deep Implement task graph | approved Spec 224 DAG dispatches both when independently ready without double writer |
| A106 | Deep Plan reports `PLAN_VERIFY` from current model's self-review only | cannot satisfy independent reviewer requirement for high-risk scope |
| A107 | Deep Implement reaches three failed logged repairs and skips mandatory section | `BLOCKED_REPAIR_LIMIT`; parent/Final Verify stays open; independent branch advances |
| A108 | Git commit fails leaving section files staged | fence/quarantine staged state; no next WorkPackage contamination |
| A109 | Agent Result Report claims `success` but has no exact source/test/lock receipt | normalize to `UNVERIFIED`, not Final Verify PASS |
| A110 | Typecheck `SKIPPED_POLICY`, required coverage fails but assertions pass | distinct gate states; mandatory coverage remains unsatisfied |
| A111 | Rate-limit response occurs with other authorized READY low-cost work available | affected provider waits, others continue; no routine user `continue` needed |
| A112 | Provider model selected by hard-coded preference is unavailable | actual capability probe, permissible fallback, truthful model telemetry |
| A113 | Codex UI/session closes during an approved running WorkPackage | real durable supervisor reconciles and resumes once; absent supervisor reports resumable, not always-on |
| A114 | Old subagent returns PASS after source/plan/grant epoch changes | stale report archived but not authoritative closure |
| A115 | Provider reviews a candidate it wrote and claims independent certificate | certificate rejected unless separate trusted verifier checks exact artifact |
| A116 | Agent's Skill hook or nested subagent writes beyond allowed files | tool/FS boundary prevents change; parent records denial without permission expansion |
| A117 | Skill pack contains deploy/release/ship steps without side-effect grant | preparation/readiness only; publish/tag/deploy denied |
| A118 | Different run versions exchange unsupported `SkillPhaseDispatch` or Result schema | negotiate or quarantine; no silent PASS or duplicate execution |
| A119 | Spec 214 reference workload with test defect, dirty file and repair failure | only authorized isolated changes; retries bounded; mandatory gaps stay open |
| A120 | Full eligible Spec 214-derived goal with owner grant, provider cutoff and restart | verified PR candidate with zero forced `continue`, external-only gates accurately reported |

**Additional WorkPackages:**

| ID | Deliverable | Gate/dependency | Demonstrable exit |
|---|---|---|---|
| D0 | Trusted installed Skill receipt and hazardous-behavior compatibility lint | Existing Spec 220/221 owners; R0.3 C0 | A97–A100; no agent self-signing |
| D1 | Safe execution shim for auth, plan/task overwrite and Git staging | Scoped isolated-source grant; D0, R0.3 C1/C2 | A101–A104, A116–A117 |
| D2 | SkillPhaseDispatch/DevelopmentPhaseResult schemas, importers and section DAG bridge | Spec 224/230/226 versioned contract admission, D0 | A105–A106, A109–A110, A118 |
| D3 | Typed repair/commit failure semantics using current Spec 224 ledger | D1–D2, R0.3 C3 | A107–A108, A114 |
| D4 | Quota/compaction/recovery and capability-adaptive provider binding | Actual compatible Spec 186/224/200 deployment; D2 | A111–A113 |
| D5 | Trusted independent verification, skill behavior regression and risk-gated catalog | Independent verifier + owners, D0–D4 as applicable | A115–A117, fresh real evidence |
| D6 | Spec 214-derived isolated autonomy demonstration | D0–D5 at claimed evidence tier, actual approved inputs | A119–A120; no simulated production claims |

**First executable slice:** D0 read-only installed-version comparison + safe compatibility lint + exact decision packet. Once existing governance grants D1 isolated source writes, implement real tool-boundary protection, result import and one Spec 214 representative section with an injected test failure; the rest of the R0.3 and R0.4 gates are staged, not a new global stop condition. No source mutation, DB/migration, paid provider or production action is authorized by this document.


---

# Revision 0.5 — Third Twelve-Pass, Source-Driven Execution Closure Amendment

> **Baseline:** Full R0.4 exact SHA-256 `4437093a509fd98989e2f3215b7f840e14e0aff998eca4d852f4d4d66705e47e`; owner-supplied skill snapshot exact SHA-256 `954b3320b4ec88d2b9799d3d57aee29949fb8d95d7744b846e197e8d2e82a584`. Passes P25–P36 are 12 distinct adversarial **document/source review lenses**, not 12 independent people or application test executions. Safety clauses below supplement prior sections and are binding only if this proposed extension is approved by authorized repository governance. Provenance receipts are informational until installed bytes and external owner trust are verified.

The earlier R0.1–R0.4 requirements and proposed A01–A120 remain intact except where more restrictive R0.5 requirements apply; a proposed test is not evidence of a test run. No older Spec source is edited, no active Spec 224 implementation is modified, and no grant is issued by this text.

## 57. Pass 25 — Hook outputs must be admitted, not silently written (`SAH-DEV-AUTO-HOOK-5`)

**Evidence anchor:** `skills/deep-plan/hooks/hooks.json; scripts/hooks/write-section-on-stop.py lines 61–145; scripts/lib/transcript_parser.py lines 103–225`. **Review priority:** `P0`. **Gap:** The observed SubagentStop hook infers a section destination from the transcript, writes raw final assistant text and returns exit code 0 even on parse/path/write errors; R0.4 mentioned hooks only as untrusted instructions, not as potentially silent artifact producers.

**57.1 SHALL:** The original hook may remain installed for native user flows, but governed Spec 224 execution MUST either disable it in favor of a vetted adapter, or confine it to a dedicated proposal-only staging directory with per-run root, stable child/dispatch ID and exclusive file ownership. A command-success exit is never artifact acceptance.

**57.2 SHALL:** Before the canonical PLAN reducer consumes any section: validate authenticated dispatch identity, expected section ID, active plan/source/skill/grant epoch, allowable output path, JSON-schema/contract and parsed Markdown completeness, content digest, and atomic publication. Store raw transcript as low-trust evidence only. Do not extract authorization or output destination from model-generated prose.

**57.3 SHALL:** Treat malformed, missing, duplicate, unexpectedly large, stale, cross-run or post-cancellation hook outputs as typed `HOOK_OUTPUT_REJECTED`; prevent parent join/final PLAN_VERIFY until the exact child output is admitted. Report hook exceptions independently of the plugin exit status.

**57.4 SHALL:** Restrict hook process identity, host env, filesystem mounts and network permissions; reject traversal, symlink, hardlink and swap-at-write attempts. Implement the actual permission check at the worker boundary; a check in a Python helper is not the sole security boundary.

## 58. Pass 26 — Resume snapshots are advisory; canonical reconciliation is mandatory (`SAH-DEV-AUTO-RESUME-5`)

**Evidence anchor:** `skills/orchestra/references/session-resume.md lines 7–145; compaction-safety.md`. **Review priority:** `P0`. **Gap:** Native Orchestra resume uses mtime and assumes a newer local file can override the snapshot; R0.4 scoped projections but did not require proof against canonical run/attempt revisions or adversarial local mutation.

**58.1 SHALL:** `orchestra/snapshot.json`, Markdown summaries, `.prompts`, plan index and CLI task list are evidence proposals and caches, never authoritative DevelopmentRun state. On resume, load Spec 224/186 canonical event cursor and current grant/plan/source epochs first; compare each local artifact by content hash, issuer and expected owner.

**58.2 SHALL:** Replace mtime-based authority with immutable snapshot receipts and monotonically fenced attempt/plan epochs. Snapshot atomic create/rename plus checksum must be verified; an older or edited snapshot can only propose a reconciliation candidate and cannot mark canonical work completed.

**58.3 SHALL:** On corrupt/truncated/different-host snapshots, recover via canonical event/outbox and independently verified immutable artifacts, or enter `RECOVERY_EVIDENCE_MISSING`. A markdown-only fallback may provide a human-oriented summary, not automatic permission to execute.

**58.4 SHALL:** Explicitly distinguish host-session resume from deployed durable resumption. Defer provider-native historical context until source, grants, tenant and role have been freshly authenticated; stale session credentials cannot be replayed.

## 59. Pass 27 — Host-capability mediation and unobservable tool denial (`SAH-DEV-AUTO-TOOL-5`)

**Evidence anchor:** `skills/deep-plan/hooks/hooks.json; skills/orchestra/references/platform-compat.md; skills/orchestra/references/sub-agent-dispatch.md`. **Review priority:** `P0`. **Gap:** An allowlist checked only in the LLM prompt or SDK hook misses native shell, host-managed tools, hook commands, MCP calls and nested plugin subprocesses.

**59.1 SHALL:** Produce a per-harness enforcement coverage manifest enumerating shell/process, direct filesystem, Git, hook lifecycle, MCP, browser, network egress, OS-native and provider-hosted built-ins. Map each action to an actual sandbox, delegated credential broker or intercepting gateway; unsupported enforcement yields `CAPABILITY_DENIED`, not optimistic dispatch.

**59.2 SHALL:** Run all user-supplied/installed Skill scripts as executable supply-chain inputs only after exact install attestation and explicit capability grants. Pin interpreter/runtime, command argv, working directory, env allowlist, mount policy and outbound destinations; inherited host credentials and env-file fallbacks are forbidden by default.

**59.3 SHALL:** Every consequential attempted operation gets an immutable policy decision receipt with tenant/run/attempt/child, active grant and allowed side effects. `ToolDenied` cannot be caught and translated into `PASS` by a Skill wrapper; record attempted action and keep mandatory acceptance barriers open.

**59.4 SHALL:** Test policy enforcement on the real host abstraction for each provider; if a native API cannot be reliably intercepted, use an isolated restricted identity or prohibit the provider path. Never infer interceptability from the plugin schema alone.

## 60. Pass 28 — Subagent delegation attenuation, fan-out and budget semantics (`SAH-DEV-AUTO-CHILD-5`)

**Evidence anchor:** `skills/orchestra/references/sub-agent-dispatch.md; agent-loop-policy.md; skills/sub-agents/contracts/result-report.schema.md`. **Review priority:** `P0`. **Gap:** Skill packets provide guidance but do not prove each child receives a narrower grant and bounded budget, especially when a new model/provider/subagent is spawned after earlier work.

**60.1 SHALL:** Create a canonical parent-child delegation receipt through existing Approval/Policy with `child_grant ⊆ current_parent_grant` over tenant, paths, actions, network, source, execution target, budget, lifetime and tool classes. Never copy a parent credential into the child context or let nested agents subdelegate unless policy explicitly permits it.

**60.2 SHALL:** Reservations for tools/cost/concurrency must be atomic against Spec 207 and Spec 186 before dispatch and released or reconciled after timeout. Child cancellation, expiry or parent source/plan/grant epoch change fences child effects; a late child report may remain diagnostic evidence but cannot complete current parent work.

**60.3 SHALL:** Cap nested delegation depth, retry fan-out, active writers and cumulative worst-case outstanding spend across all siblings. Unknown price/usage telemetry triggers conservative limits or no paid execution rather than pretending a hard cap has been enforced.

**60.4 SHALL:** Parent join requires current mandatory child identities, not only child count; one child may not return another child's `SUCCESS`, reuse a stale result file or convert unverified Review text into a terminal certificate.

## 61. Pass 29 — Git stage isolation, branch drift and verified PR promotion (`SAH-DEV-AUTO-GIT-5`)

**Evidence anchor:** `skills/deep-implement/skills/deep-implement/references/git-operations.md lines 50–66; R0.4 §50`. **Review priority:** `P0`. **Gap:** R0.4 prevents broad staging but did not fully describe the lifetime of isolated indexes, base-branch drift, rebase proof invalidation and exact protected PR update.

**61.1 SHALL:** Admission stores HEAD, merge-base, target ref digest, repository identity, exact preimage blobs and a per-workpackage owned branch/index. Verify file operations against canonicalized path+inode where supported, Unicode normalization and target-OS case rules; no ownership inferred from prior git commit authorship.

**61.2 SHALL:** Before each commit and push, re-enumerate index objects (`git ls-files --stage -z`, cached diff, file modes and blob hashes), including renames/deletes/submodules and Git attributes/filter transformations. No unmanaged staged paths or foreign dirty Source; force-push and branch replacement require distinct authorization.

**61.3 SHALL:** On upstream drift or conflict, freeze the existing valid evidence, compute affected requirement/test dependency closure and perform an owner-approved rebase/merge in a new isolated attempt. Re-run affected tests and independent review before PR finalization; do not let an old clean Candidate certificate cover new merge bytes.

**61.4 SHALL:** GitHub PR creation/update uses stable per-run operation ID and reconciles remote status after ambiguous network results; merge, tag/release and deployment remain separate side-effect grants. Do not use a pull request approval by the bot as owner approval.

## 62. Pass 30 — Plan completeness and exact section-result handshake (`SAH-DEV-AUTO-PLAN-5`)

**Evidence anchor:** `skills/deep-plan/skills/deep-plan/SKILL.md; write-section-on-stop.py; R0.4 §51`. **Review priority:** `P0`. **Gap:** A section artifact can be present but incomplete/wrong revision and may still trigger the next task; R0.4 maps requirements but not an atomic section-result import protocol for native stop hooks and CLI task planners.

**62.1 SHALL:** Define `SectionResultV1`: canonical Section ID, dispatched child/attempt/plan/source/spec digests, current required Requirement IDs, produced task IDs, local dependencies, proposed file paths, test/evidence coverage, unresolved assumptions, result digest and parsing/contract verdict. `PLAN_VERIFY` accepts only all expected current SectionResultV1 items.

**62.2 SHALL:** Require deterministic bidirectional coverage: every canonical requirement to section/workpackage/test/evidence; every proposed task to approved requirement and owner. Reject missing cross-cutting tenancy/security, duplicated Section IDs, tasklist overwritten through `--force`, invented acceptance thresholds and old-version outputs. Preserve provenance of the original Markdown for debugging.

**62.3 SHALL:** When a true design amendment arrives, increment plan epoch, invalidate impacted Sections and materialized task lists, and rebase only unaffected verified work; never let Deep Plan choose an unapproved Spec revision just because the timestamp is newer.

**62.4 SHALL:** Use a strict canonical reducer join for plan completeness; webhook/Stop-hook output is a *proposal*, not evidence that all sections or all dependencies are actually satisfied.

## 63. Pass 31 — Risk-based review must not silently waive required acceptance (`SAH-DEV-AUTO-RISK-5`)

**Evidence anchor:** `skills/orchestra/references/agent-loop-policy.md lines 100–112; security-review-protocol.md lines 17–50; quality-gates.md`. **Review priority:** `P0`. **Gap:** Existing Skill stop condition can describe success as implemented or explicitly deferred with rationale, and security dispatch is path-pattern driven. R0.4 disallows auto-accepting HIGH findings but needs an explicit universal required-gate truth contract.

**63.1 SHALL:** A required Spec acceptance condition is mandatory regardless of low/medium/HIGH review routing; it can become not applicable only via approved canonical semantics change, not by an agent rationale or exhausted attempts. A skipped optional gate is labeled `OPTIONAL_NOT_RUN`; missing mandatory evidence is `REQUIRED_UNVERIFIED` and blocks Section and Final Verify.

**63.2 SHALL:** Expand review triggers from file globs to data-flow/API/tenant/side-effect and dependency-impact graphs. Hidden authorization edits in shared code, generated code, config, templates, migration or GitHub Actions require the relevant security review even if filenames miss the Skill trigger patterns.

**63.3 SHALL:** Retain useful risk-scaled review but require independent review for Self-Development, policy, tenant isolation, secrets and consequential side effects. Distinguish repaired HIGH finding from residual-risk approval, with an actual independently verified source and current risk owner.

**63.4 SHALL:** No agent-defined `SKIPPED_POLICY`, `N/A`, `deferred`, `low-risk`, `test-not-available` or skipped fixture may be mapped to a passed mandatory gate without an explicit owner-approved exception that meets canonical Spec 224 release policy.

## 64. Pass 32 — First-grant enrollment and identity independence in connected GitHub (`SAH-DEV-AUTO-BOOTSTRAP-5`)

**Evidence anchor:** `R0.4 §§49–50; R0.2 §19; actual D3.23 inability to verify an authenticated owner channel`. **Review priority:** `P0`. **Gap:** A connected GitHub workspace may reuse the owner’s credential for the automation bot; a PR review alone is not sufficient proof of distinct identity or the exact effect-grant scope.

**64.1 SHALL:** Before owner approval, a setup principal outside all mutable agent workspaces selects and pins the governance trust root and the canonical owner identities, repository/ruleset identity and allowable approver channels. A bot/agent credential may create a request, but cannot issue, approve, dismiss or impersonate its own grant.

**64.2 SHALL:** For protected GitHub decisions, validate exact latest PR head/tree digest, review author, trusted immutable actor ID, current organization/repo permissions, CODEOWNERS/ruleset and bot exclusion immediately before first use and on high-risk resumes. Detect same-person/token alias, expired team membership, stale/dismissed reviews and GitHub App bypass permissions.

**64.3 SHALL:** For offline human-signature fallback, generate the key offline or through a preprovisioned owner-controlled system and pin the trust root outside the working repo and Agent/Runner. Grant issuer, reviewer and signer roles are separable for sensitive scopes; quorum follows existing policy, not this adapter.

**64.4 SHALL:** Record signed grant payload digest, issuance/revocation epoch, allowlisted repo/source/paths/operations, max spend and expiry. Revocation requires fresh authoritative validation at execution, not merely the absence of revocation in a stale cache.

## 65. Pass 33 — Hook/result durability, restart replay and ambiguous effect boundaries (`SAH-DEV-AUTO-EVENT-5`)

**Evidence anchor:** `deep-plan SubagentStop hook; Spec 186 outbox; R0.3 §37–38; R0.4 §53`. **Review priority:** `P0`. **Gap:** Exact transaction boundaries between native hooks/CLI artifact generation and canonical reducer/outbox are not explicitly enforced by the R0.4 Skill bridge.

**65.1 SHALL:** Every dispatched skill child has an immutable `skill_attempt_id` and canonical dispatch intent persisted before execution. Every child/hook result is staged content-addressably and acknowledged by a reducer CAS with plan/grant/source epochs; only ACKED canonical result may satisfy a parent join.

**65.2 SHALL:** If a worker dies after writing an artifact but before a canonical ACK, reconcile the artifact receipt and current attempt ID; ingest at most once if valid. If reducer committed an ACK before the provider got the response, retry is a read of canonical state, not a second mutation.

**65.3 SHALL:** Keep remote side effects under the existing Spec 186 operation ledger and their own effect grants. Missing ACK for GitHub creation, secret rotation, approval callback or production deploy is `OUTCOME_UNKNOWN` until authoritative remote reconciliation verifies the original operation.

**65.4 SHALL:** Cancellation freezes new hook imports, tool calls and child starts before any expensive or privileged continuation; lease epochs fence late events, while compensation of already committed effects is explicit and separately authorized.

## 66. Pass 34 — Diagnosis strategy integrity and auto-continue with real progress (`SAH-DEV-AUTO-DIAG-5`)

**Evidence anchor:** `skills/orchestra/references/agent-loop-policy.md and review-convergence.md; Spec 224 EngineeringProblem/Hypothesis Ledger`. **Review priority:** `P1`. **Gap:** R0.4 prevents simple repeated prompts but does not yet require Skill-originated diagnostics to contain discriminating, safe observations and explicit actual progress after changing harness strategy.

**66.1 SHALL:** Normalize every substantive Skill repair to existing EngineeringProblem + StrategyAttempt identities with code/test/lock/source fingerprints, at least one falsifiable hypothesis, discriminating authorized experiment, expected observation, actual evidence delta and rollback point. Do not let a free-text “reviewed 10 rounds” replace independently checkable differences.

**66.2 SHALL:** No-progress detection groups semantically equivalent retry prompts, oscillating candidate diffs, unchanged test fingerprints and expensive provider switching with unchanged hypothesis. On bounded threshold, choose a different justified experiment or stop only that Workpackage in typed recoverable state; allow disjoint READY work.

**66.3 SHALL:** Retain the configured `AGENTS.md` resource/typecheck policy. Test, typecheck, lint, integration and security gates have distinct evidence fields; an unavailable model/provider or a skipped full typecheck cannot be misreported as a completed check.

**66.4 SHALL:** If required external integration cannot run in the current authorized environment, expose the missing target as an external evidence gate; finish independently verifiable code while preserving regression barriers. Do not promise complete autonomously verified production without actual authorized environment and credentials.

## 67. Pass 35 — Skill-pack upgrades, confidentiality and mixed-version compatibility (`SAH-DEV-AUTO-UPGRADE-5`)

**Evidence anchor:** `installed skills snapshot receipts; R0.4 §47, §53, §55; deep-plan/deep-implement plugin.json`. **Review priority:** `P1`. **Gap:** R0.4 detects changed installed bytes but does not fully prescribe long-running mixed-version workers, dependency/revocation propagation and data-minimized plugin/provider migration.

**67.1 SHALL:** Pin a complete transitive Skill executable closure, including SKILL.md, reference includes, hooks, scripts, plugin manifests, delegated helper programs, lockfiles, runtimes and host-specific install path. Enforce canonical archive entry names, duplicate/Unicode/case collisions, symlink and decompression limits before extraction; pack digest is not installation trust.

**67.2 SHALL:** Existing in-flight runs keep admitted immutable Skill receipts until safe boundary; if an urgent skill revocation or exploit is issued, stop and fence affected attempts and re-verify every still-valid result. Upgrade/downgrade paths require adapter schema negotiation with active Spec 224/186/230/200 and mixed-version conformance, not just filename compatibility.

**67.3 SHALL:** Provider failover and plugin hooks may receive only tenant/role-scoped minimum source/context, no raw secrets, unredacted private source or private provider reasoning. Reevaluate egress, licensing, retention, region, telemetry and cost on new provider before dispatch.

**67.4 SHALL:** Use a feature-flagged canary with explicit rollback/reconciliation of event versions and artifact projections. Any unknown critical phase-result field or outdated revoked helper is quarantined rather than silently coerced.

## 68. Pass 36 — End-to-end zero-forced-continue conformance and truthful rollout (`SAH-DEV-AUTO-CAMPAIGN-5`)

**Evidence anchor:** `Spec 214 reported 8/8 section screenshot, R0.4 §56; Spec 224 revised canonical lifecycle; R0.3 §43`. **Review priority:** `P1`. **Gap:** R0.4 proposes a representative fixture but does not require the full campaign to cover actual hook failure, source drift, user decisions, revocation and post-promotion restore in one evidence-linked matrix before stronger product claims.

**68.1 SHALL:** Build a frozen authorized Spec 214 representative fixture and a second Spec 224 self-development fixture using exact reviewed source/Skill/lock/environment fingerprints. The codebase fixture must use real targeted tests, at least one genuine RED→GREEN repair, one permission denial, one provider/session failure and one independent verifier that can inspect exact bytes outside the implementer workspace.

**68.2 SHALL:** Count zero-forced-continue only when an eligible DevelopmentRun completes all approved mandatory requirements despite induced debugging/recovery faults; a human grant/product decision may be required and does not count as a forced technical `continue`. An early `BLOCKED`, a skipped must-fix section or a simulated scheduler does not earn Always-On proof.

**68.3 SHALL:** Include an external approval action, staging/registered Runner and actual durable kill/restart at the evidence tiers claimed. On revocation after a code change, fence further actions; re-authorize before resume. Maintain exact proof labels (`STATIC`, `ISOLATED_TEST`, `PERSISTED_RESTART`, `REGISTERED_RUNNER`, `LIVE_PROVIDER`, `PRODUCTION`).

**68.4 SHALL:** Release gates remain separate: exact migrated DB, independent reviewer, sandbox/container isolation, secrets, cost, tenant privacy, backup/restore and observed SLOs. Report all unavailable certifications as external gates, not omitted checks. Add a Decision Inbox view and accessible run-level status, next safe action and audit provenance.

## 69. Additional conformance matrix A121–A168 (48 proposed cases)

The checks below are **requirements for future executable tests**, not test results. Every case must link to the exact source/Skill/environment/grant versions and a real command/trace. Fixture-only evidence cannot certify a deployed external service.

| ID | Source-driven adversarial stimulus | Required observable outcome |
|---|---|---|
| A121 | Hook returns zero after an exception or missing source transcript | PLAN_VERIFY rejects absent required section; explicit HOOK_OUTPUT_REJECTED event |
| A122 | Stale or foreign child transcript names a valid-looking section prompt | Mismatch of dispatch/run/plan epoch rejects content and path |
| A123 | Hook writes raw assistant prose lacking schema or a completed section | Result stays candidate; no canonical PLAN PASS |
| A124 | Destination is changed via symlink or rename race during write | Filesystem containment and atomic admission deny escaped or foreign write |
| A125 | Foreign session updates progress.md with newer mtime | Canonical run/owner/epoch wins; no cross-run completion |
| A126 | Snapshot JSON is corrupt and Markdown summary claims completion | Read-only recovery view; parent stays open until authoritative evidence |
| A127 | Restored snapshot has rolled-back grant epoch or source hash | Rejected until trust/grant and exact-source reconciliation |
| A128 | Provider session ID reused across tenants after compaction | Resumed run identity fenced; confidential context is not imported |
| A129 | Child invokes shell directly to write a denied file instead of SDK tool | OS/container boundary denies and logs even without SDK hook |
| A130 | SessionStart hook inherits an unrelated process credential | Minimal env and restricted identity prevent secret access |
| A131 | Provider-native browser/MCP operation bypasses Skill-visible tool allowlist | Gateway/broker denial or capability path disabled |
| A132 | Forbidden shell action exits zero because Skill catches denial | Canonical result remains POLICY_DENIED, never VERIFIED PASS |
| A133 | Nested agent receives a wider directory/tool scope than its parent | Broker denies delegation before spawn |
| A134 | Parent authorization revoked while paid child is running | New actions fenced; committed actions reconciled; no budget overspend |
| A135 | Two sibling agents spend concurrently against one remaining budget | Atomic reservation prevents overspend and records waiting state |
| A136 | Late or duplicate child success after plan revision | Only correct current child set may satisfy parent join |
| A137 | git add -u or Git filters include previously staged unowned file | Pre-commit blob/mode/index validation rejects foreign staging |
| A138 | Windows-case-equivalent path overlaps Linux-accepted allowed path | Portable path identity detects collision; cross-platform source promotion denied |
| A139 | Upstream branch moves after tests but before approved PR push | Rebase and impacted evidence invalidated; fresh required tests |
| A140 | PR creation times out after GitHub accepted request | Remote reconciliation finds existing operation; no duplicate PR |
| A141 | Hook creates eight files but one lacks mandatory security requirement | Canonical requirement→plan bidirectional closure rejects PLAN_VERIFY |
| A142 | Deep Plan --force overwrites other run task list | Namespaced CAS and current owner deny overwrite; unaffected run continues |
| A143 | Section writer returns plausible prose from previous Spec epoch | SectionResult source/spec/plan mismatch rejects import |
| A144 | New approved amendment adds requirement while sibling plan is executing | Only impacted plans/evidence reopened; no false global completion |
| A145 | Conductor claims success after deferring unimplemented MUST requirement with rationale | Final Verify rejects unresolved mandatory requirement |
| A146 | Security-sensitive shared helper changes but path pattern misses known triggers | Impact graph still schedules required independent security gate |
| A147 | Optional no-tests command exits zero while mandatory suite not discovered | Separate OPTIONAL_NOT_RUN and REQUIRED_UNVERIFIED; release blocked |
| A148 | Self-review waives HIGH residual finding without independent owner decision | Denied; fresh authorized risk decision required |
| A149 | Codex PR uses same GitHub owner token and posts its own review | Same principal detected; grant remains PROPOSED_NOT_ISSUED |
| A150 | Human previously approved PR but HEAD changed after review | Digest mismatch/stale review prevents grant conversion |
| A151 | GitHub App has bypass permission despite nominal required review | Trust admission rejects non-independent configuration |
| A152 | Offline grant signer private key is available to implementation agent | Grant admission fails due to trust-boundary violation |
| A153 | Child writes approved section, crashes before canonical ACK | Restart ingests one exact receipt or leaves explicit missing-evidence blocker |
| A154 | Reducer ACK committed but network reply lost to Skill host | Replayed callback cannot create duplicate Section or side effect |
| A155 | Cancel races SubagentStop hook final filesystem write | Late result fenced, parent remains cancelled; no stale promotion |
| A156 | GitHub tag/PR request ACK missing after remote success | Remote operation-ID reconciliation; no blind duplicate action |
| A157 | Three paraphrased identical repair prompts produce unchanged failures | NoProgressDetector recognizes strategy equivalence; forces material next step |
| A158 | New LLM provider repeats earlier strategy without new evidence | Provider switch does not reset progress or cost budget |
| A159 | Test suite passes only by weakening required assertion | Evidence delta rejects false improvement and reopens review |
| A160 | No external Runner available but local contracts pass | Honest source-level tier; external gate remains named/open |
| A161 | Skill ZIP contains duplicate normalized names or case-colliding executable paths | Deterministic secure extractor rejects before trust admission |
| A162 | Hook script edited in installed pack while SKILL.md unchanged | Full closure hash mismatch invalidates admission |
| A163 | New Skill plugin version deployed during an active old-version run | In-flight pinned receipt or fenced re-admission; no silent mixed version |
| A164 | Provider fallback would send protected source beyond approved data boundary | Egress denied; unrelated eligible WorkPackages continue |
| A165 | Full eligible Spec 214 fixture runs with failing test, hook error and process restart | Durable deployed supervisor completes without routine user continuation |
| A166 | During same campaign one mandatory section is blocked and another independent branch is READY | Independent branch advances; Final Verify waits on mandatory section |
| A167 | Owner revokes grant mid-campaign after one settled external action | New effects denied; settled action reconciled without replay |
| A168 | Successful isolated demo claims production SLO or 100% auto success | Evidence-tier assessor rejects inflated claim until real rollout/soak |

## 70. R0.5 integration workpackages and critical-path ordering

These are **incremental** subpackages of R0.4 D0–D6 and R0.3 C0–C7, not new authorities, separate schedulers or an instruction to interrupt the ongoing Spec 224 implementation. Each requires actual owner-granted, isolated source write-set and authentic design/permission records. An absent underlying runtime means the corresponding item is contract/design-only until an authorized target exists.

| Increment | Owner interface / dependency | Deliverable | Required new cases / admission |
|---|---|---|---|
| E0 Hook admission | Spec 230 Skill protocol, Spec 220 tool/FS trust, installed-pack approval | Versioned hook result adapter, dispatch-to-section binding, atomic proposal artifact store; disable unsafe native output path where enforcement is unavailable | A121–A124; P-SOURCE when affected code is protected |
| E1 Resume admission | Spec 224 reducer + Spec 186 canonical events and source owner registry | Snapshot receipt CAS/epoch reconciliation and explicit evidence-missing classification; no mtime-as-authority | A125–A128; persistent recovery/DB separately gated |
| E2 Complete tool/child mediation | Spec 220 shared Approval, Feature 195 Runner, Spec 207 reserved spend, Spec 200 providers | Host capability intercept coverage manifest, least-privilege child delegation, revocation/budget fencing | A129–A136; target-specific OS/provider conformance |
| E3 Git + plan closure | Spec 218 exclusive workspace, Spec 224 current PlanSection/WorkPackage DAG | Index/blob/merge-base checks, SectionResultV1 importer and deterministic bidirectional trace | A137–A144; source governance and isolated write grant |
| E4 Universal gate truth + first grant | Existing Approval/Policy, Spec 224 Final Verifier and protected owner channel | Mandatory-acceptance matrix independent of Skill risk heuristics; owner identity and immutable grant issuance/validation | A145–A152; verified human enrollment; no bot self-approval |
| E5 Durable handshake and bounded diagnosis | Spec 186 outbox, Spec 224 reducer/Hypothesis Ledger, already admitted current recovery owners | Hook/Skill attempt outbox and ACK CAS; scientific repair result adapter and typed provider/resource-blocked statuses | A153–A160; P-RECOVERY/migration gates as applicable |
| E6 Pack lifecycle and autonomy campaign | Spec 221 installed Skill trust, Spec 200/220 egress, Spec 226 UI and independent verifier | Full executable closure pin/rollout, mixed-version conformance, Spec 214 and self-dev campaigns | A161–A168; only certify achieved evidence tier |

**Bootstrap critical path:** actual owner/trust root and Spec/source registry selection → E4 owner enrollment, E0 safe hook/admission and E2 deny-by-default mediation (in independently authorized isolated components) → E3 deterministic plan/source closure → E5 durable replay on authorized persistent target → E6 end-to-end zero-forced-continue. E1 runs as soon as canonical event access is authorized. Nondependent authorized WorkPackages proceed while a restricted Python/DB/Runner/provider gate is blocked; never mark dependent packages READY by using mocks as a substitute.

**Run-conformance preflight:** fixed full SHA-256 for every approved Spec/amendment, real installed Skill and transitive code closure, owner identity/role (including bot separation), exact allowed write-set, source/lock/env digest, resource/spend policy, accepted PlanSection DAG, independent verifier, and actual target environment. Reject missing inputs rather than silently generating a new owner packet or rerunning a generic audit.

## 71. R0.5 campaign proof profiles and independent exit criteria

1. **STATIC:** source/Spec compatibility review with fingerprints and A121–A168 executable test designs; no runtime claims.
2. **ISOLATED_TEST:** negative fixtures for actual installed Skill hook, denied shell/tools, staged Git index and plan importer with verified exit codes. Does not prove deployed durability or Cloudflare Container isolation.
3. **PERSISTED_RESTART:** real authorized Spec 186/224 persistent state and external supervisor; kill at dispatch→hook write→ACK, ACK→callback, parent join and grant revoke, then verify deterministic recovery without duplicate effect or lost Section.
4. **REGISTERED_RUNNER:** admitted, paired real Runner executing restricted commands and independent reviewer using actual sandbox/capability evidence. The sandbox substrate itself must be certified separately.
5. **LIVE_PROVIDER:** genuinely authorized provider session and quota/fallback injection with data-residency, spend and credential boundaries; count usage from real telemetry and label unobservable costs UNKNOWN.
6. **PRODUCTION:** approved source promotion, durable migration, trustworthy grant verification, replay/restore with live target identity, staging soak/canary and controlled rollback; no `SIMULATED`/fixture result may be promoted into this tier.

**System-level completion criterion:** On at least one authorized end-to-end workload, a human submits an initial goal and only genuine scope/policy decisions, with no technical-phase `continue`; a deliberately failing test is repaired, required independent sections complete, incorrect Skill hook output is rejected, unowned shared changes survive, a real deployed supervisor survives crash/restart, a stale child/grant is fenced, all required evidence is independently reproduced and a protected PR/ReleaseCandidate is produced. Record exact exercise commands/artifacts and unresolved external gates. A zero-continue claim that cancels hard tasks, weakens tests or skips required verification is a failure.

**Mandatory negative certificate:** If any required case is unexecuted, a live target is unavailable, grant channel cannot verify the actual human, or an application test exits falsely green, the corresponding higher evidence tier SHALL remain `NOT_CERTIFIED`. An independent reviewer must reproduce high-risk negative tests from a trusted fresh snapshot, not only read the author's report.

## 72. R0.5 closeout invariants and remaining operational dependencies

- Single canonical lifecycle/finality authority: existing Spec 224. Single durable jobs/events/outbox: Spec 186. Existing Approval/Policy/Spec 220 owns trust and grants; Spec 207 economic ledger; Spec 218 workspace/source control; Spec 200 external provider transport; Feature 195 Runner; Spec 230 protocol; Spec 221 Skill admission; Spec 226 user control. Adapters introduced by this extension carry **no competing authority**.
- A verified GitHub connection or PR comment is not itself an approval. Human enrollment is external and separate from bot identity, API token and working filesystem. A proposed Spec or signed-looking local YAML file is not a verified grant.
- Shared dirty worktrees, original Candidate v6, old migration history and active Spec 224 remain untouched unless owner grants explicit exact patches. Never run the rejected D3.19 harness or auto-install unreviewed ZIP scripts.
- R0.5 document-audit closure covers the twelve specific risks and proposed A121–A168 checks described here, but **does not establish defect-free source or production readiness**. Only actual installed-revision/runtime tests and authorized owner decisions can establish those properties; any new defect discovered during implementation becomes a new GapRecord, not a retroactive claim that this design audit was flawless.
- The project owner confirmed the **Spec 250 number** on 2026-09-26. Canonical repository registration is pending actual SmartSpecPro registry/main/active branch/worktree collision check. On conflict, request an explicit owner resolution rather than silently renumber. Retain `SAH-DEV-AUTO-EXT-01` as the stable extension identity. New work enters by additive versioned contract and independent migration/test gates; do not silently change prior Specs or the existing active runtime.


---

# Revision 0.6 — MCP Skills Extension Cross-Spec Alignment (Spec 248 + Spec 250)

> **Normative boundary.** This is an additive *proposed* compatibility revision, not a claim of current deployed behavior. The protocol source of truth is `https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx` and Agent Skills format is `https://agentskills.io/specification`. SEP-2640 reached Final 2026-09-13, stable extension ID `io.modelcontextprotocol/skills`, base MCP `2026-07-28` or later. Spec 248 R1.2 already specifies inbound and outbound adapters and is the owner of extension wire conformance; do not copy its transport implementation into Spec 250. A finished standard does **not** imply every host SDK or coding harness implements it.
>
> **Owner decision:** Spec number 250 confirmed 2026-09-26; repository registry collision/reconciliation and content approval are still separate. Source Skill snapshot: SHA-256 `954b3320b4ec88d2b9799d3d57aee29949fb8d95d7744b846e197e8d2e82a584`. Actual installed/deployed bytes MUST be checked; supplied archive is reference evidence only. This update does not issue implementation grants.

## 73. Standards verification, exclusions and the key architectural decision (`SAH-DEV-MCP-BASE-6`)

73.1 **Decision: REMOTE-FIRST, NEVER REMOTE-ONLY BY ASSUMPTION.** The default Skill distribution route for an *observed conforming host* is Spec 248's MCP Skills Extension from the existing tenant-aware `/v1/mcp` endpoint. If the consumer does not expose actual conforming Skills discovery/approval/read behavior, use a separately admitted compatibility profile; never assume host support because MCP Tools work or the provider claims Agent Skills support. Host/SDK support is version-, deployment-, policy- and connection-specific.

73.2 Scope: the stable extension serves instructions and associated Agent Skills files. It does **not** define (a) a universal host-side Skill activation command, (b) script or hook execution on a PC/Mac, (c) host permission elevation through `allowed-tools`, (d) cross-provider lifecycle ownership, (e) arbitrary remote installation, (f) a durable scheduler, or (g) a custom archive endpoint. `resources/read` alone does not activate a Skill. Spec 224 retains DevelopmentRun/phase/finality authority, Spec 248/199 retain Skills-over-MCP transport, Spec 221 retains publication and immutable Skill releases, and Feature 195/Spec 200 retain executable placement/Runner/provider adapters. The existing shared Approval/Policy service is the sole grant authority.

73.3 Implement exact **stable** `server/discover` extension negotiation with base `resources`, `skills/list` and `skills/get` required, `resources/read` base method, optional `resources/directory/read` **only** when `directoryRead:true`; preserve required `_meta`, caching and pagination attributes and actual published schemas/conformance fixtures. No self-invented `skills/execute`, `skills/install`, fake native `tools/list` mapping or `initialize`-only compatibility claim. Servers SHOULD keep a Skill within 512 files/16 MiB; conforming hosts MUST support up to those bounds. Larger Skills need separately declared local admission policy.

73.4 `skills/list` may be partial/empty; direct URI `skills/get` remains supported for every served Skill. `skill://` is conventional, **not** a trust proof or DNS hostname; identity is `(authenticated server identity, Skill URI)` even when names collide. Nested Skills require independent activation consent. A static entry supplies complete file manifest with raw-byte digest+size, root `SKILL.md` and full verbatim frontmatter; `resources:'dynamic'` is less attestable and must not be used in unattended privileged development.

## 74. Harness delivery decision matrix and de-installation policy (`SAH-DEV-MCP-PROFILE-6`)

| Profile | Verified prerequisites | Delivery | Local install? | Enforcement and disclosure |
|---|---|---|---|---|
| `MCP_NATIVE` | Harness/host positively tested against Spec 248 stable negotiation, manifest validation, load/consent and per-file reads on exact version and authenticated connection | `skills/list` or `skills/get` then manifest-bound on-demand `resources/read` | **No global Skill install required**, but required execution dependencies remain independent | Pin held entry through acting window; SmartAIHub server controls served bytes and its own tools only; do not claim to enforce host-local tool policy. |
| `SMARTAIHUB_PROXY_CONTEXT` | SmartAIHub-owned host can read/verify/approve through its own Spec 248 outbound/inbound adapter and has authorized prompt-pack injection for this provider | Load bounded verified instruction content into a **lower-trust** provider phase context via Spec 230 | No global Skill install on PC; approved script execution placement still separate | Never assert the external provider itself supports SEP-2640; receipts label proxy, not native. |
| `PINNED_EPHEMERAL_MATERIALIZATION` | External host requires filesystem Skills; owner approves exact package/digest, isolated run filesystem and installed tool policy | Materialize a **verified immutable per-run package** in an isolated sandbox or explicitly authorized local workspace, then invoke host-native path | Temporary per-run files may be required; **not** default global `~/.codex/skills` installation | Hard path allowlist, non-mutable cache, no symlinks/secret copying, cleanup/revoke, run-specific source attestation. No remote read magically installs the Skill. |
| `REMOTE_RUNNER_EXECUTION` | Skill requires scripts/hook/interpreter and an authorized isolated server/Cloudflare Container/Feature 195 Runner exists with pinned runtime deps | The host receives Skill instructions remotely; scripts run through separately authorized existing Tools/Runner | No Skill install or script interpreter required on the **user's** PC for that task | Server sandbox does not confer arbitrary shell access; validate egress, secrets, image digest, tenant/region, exit evidence and side effects. |
| `LOCAL_PINNED_LEGACY` | No compliant native/proxy route or true local-device access is required, e.g. GUI/OS secrets/local device | Existing reviewed filesystem Agent Skill, optionally temporary version-pinned install | **Yes where necessary**, with a declared host capability and user approval | Legacy profile remains operational during migration; no unverified silent replacement. |
| `UNSUPPORTED` | None of the above has a permitted exact setup | Do not load or run; offer capability/fallback decision | No | Keep unrelated READY work progressing. |

74.1 `host support` is observed by a real on-wire probe and load/consent/manifest test, NOT inferred from Codex/Claude/Antigravity product names or a marketing/SDK version. Record actual binary/API version and plugin-enabled state. Do not claim a client supports `io.modelcontextprotocol/skills` until a conformance transcript exists for the exact runtime/profile. A host implementing MCP Tools alone is not a Skills Extension consumer.

74.2 Global PC/Mac Skill installation becomes an **optional compatibility path**, not a universal prerequisite. Retire a particular local install only when the actual user workflow executes equivalently under a supported delivery profile, including references, scripts/hook behavior, tools, state persistence, privacy, offline behavior, rollback and independent verification. A different mode may be selected for the same Skill on different hosts.

74.3 Phones/tablets and thin browsers SHOULD be `MCP_NATIVE` or `SMARTAIHUB_PROXY_CONTEXT` for instructions with `REMOTE_RUNNER_EXECUTION` for code/scripts. The user's device need not run Python, Git, Docker or own server-side secrets when the authorized remote runner executes the task. A legitimately local-only workflow still requires a compatible trusted local Runner; do not pretend MCP Resources provide computer-use privileges.

## 75. Execution placement and runtime dependency closure (`SAH-DEV-MCP-EXEC-6`)

75.1 Produce `SkillExecutionRequirement` separate from Skill content manifest: `skill_release_id`, `entry_uri`, `frontmatter_digest`, `supporting_resource_uris_and_digests`, `shell/python/node/git/uv/runtime_image_requirements`, `hook_event_and_host_API_requirements`, `network_egress`, `secrets_capability`, `filesystem_access`, `OS_arch`, `local_device_requirements`, `invoked_MCP_Tools_and_schema_versions`, `expected_evidence`, `license_and_distribution_restrictions`, `side_effect_class` and `placement_constraints`. This is an internal Spec 221/250 contract, NOT an extension to SEP-2640's reserved wire format.

75.2 Classify every Skill operation by `INSTRUCTION_ONLY`, `REMOTE_READ_ASSET`, `HOST_NATIVE_HOOK`, `REMOTE_AUTHORIZED_TOOL`, `SERVER_SANDBOX_SCRIPT`, `TRUSTED_LOCAL_RUNNER`, or `NOT_PORTABLE`. Resolve dependencies **transitively** across files, shared references, imported Skills, scripts, Python packages, `uv.lock`/`pyproject.toml`, binaries, credentials and architecture before declaring remotely usable. An asset being readable is not proof that a hook can execute. Reading a Python script is never permission to run it.

75.3 Route scripts to the existing Feature 195/Spec 200 tool/Runner plane under concrete allowlisted action grants, bounded spend and execution image. Supply verified bytes only at the already-approved execution placement; independent backend admission still applies. Runtime evidence must identify actual machine/container, environment digest, stdout/stderr redaction, command and exit code. Backend scripts MUST NOT be exposed as MCP Tools automatically because their files appear in `skills/list`.

75.4 Offline/fallback handling: verified on-demand cache may be used **only within current tenant, unchanged held manifest, still-valid authorizations, allowed data residency and license, with an approved offline profile**. Revoked/expired/non-static Skills do not become executable merely because cached files exist. A cache miss or server outage degrades only the impacted Skill-bound WorkPackages and never pretends the next remote file has been read.

## 76. SmartSpecPro Skill-pack migration receipts (`SAH-DEV-MCP-PACK-6`)

The supplied `skills.zip` reference snapshot has SHA-256 `954b3320b4ec88d2b9799d3d57aee29949fb8d95d7744b846e197e8d2e82a584`. Inspection showed **42 `SKILL.md` entrypoints**. One entry (`skills/ship/SKILL.md`) has invalid YAML frontmatter because its unquoted `description` contains a colon; do not advertise the reference archive as 42 conforming Agent Skills. Also, `skills/deep-plan/skills/deep-plan/SKILL.md` and `skills/deep-implement/skills/deep-implement/SKILL.md` are inside nested `skills/<name>/skills/<name>/` trees, while executable scripts/hooks/config/live references live in sibling `skills/<name>/scripts`, `hooks`, `agents`, `pyproject.toml`, etc. A protocol manifest rooted in only the inner Skill folder would omit actual execution dependencies. `orchestra` references neighboring `../sub-agents/` and companion Skill packages; a one-Skill export does not prove those files exist on the receiving host.

76.1 **Three individually approved release transforms** (do not silently modify the owner's historical Skill pack):

- `orchestra`: publish valid in-tree `SKILL.md`/references as standard static Skill, and represent sibling roles/companion Skills through the existing Spec 221 Skill dependency and Spec 230 Phase Protocol manifest (not by phantom relative files). Provider-local Skills or tools invoked by name require resolved, verified bindings. Native server delivery of the orchestration instructions does **not** make the external host the lifecycle authority.
- `deep-plan`: create a separately versioned portable Skill release whose root is `deep-plan/SKILL.md`. Decide per dependency whether to package supporting `references/` and approved scripts/hooks **under that same root**, or reference an independently pinned approved runner image/tool contract; rewrite absolute paths/`{plugin_root}` discovery in a tested compatibility adapter only after approval. Preserve Python/`uv`, task-list integration and hook semantics only at an execution placement that supports them. Never declare `REMOTE_NATIVE_NO_INSTALL` while scripts still search `~/.codex/skills` with no portable mapping.
- `deep-implement`: same explicit repackaging/remote-image choice, preserving TDD/review/section-state semantics and tool permission fences; replace unsafe `git add -u` with approved explicit write-set staging in the *isolated workspace* for the new compatibility profile. Server read does not imply that Git or pre-commit hooks exist on the host.

76.2 Fix the `ship` frontmatter at the **proposed next release** by quoting or safely folding its `description`, then run strict Agent Skills format checks. All Skill releases require `(publisher, origin, immutable bytes, license, exact dependency graph, reviewed execution requirements, owner approval)` and a distinct publish consent. Public export is OFF by default. If a Skill lacks distribution rights, private internal serving may also be disallowed by its license; record a rights decision. A conforming package cannot silently include external files outside its declared root or mutable symlink targets.

76.3 Validate each release with both an Agent Skills package validator and the official SEP-2640 conformance fixtures. `SKILL.md` frontmatter must match served `frontmatter` **field by field**; preserve allowed unknown fields; manifest includes every file in its Skill root and excludes nested Skill roots according to the stable boundary. Large media/bundled assets must respect 512-file/16-MiB interoperability limits. Do not download or execute untrusted upstream scripts during an export lint.

## 77. Exact capability negotiation, resource identity and on-demand discovery (`SAH-DEV-MCP-CLIENT-6`)

77.1 Spec 248 is the sole owner of base MCP/SEP wire conformance, server/inbound and gateway/outbound. Spec 250 consumes an observed `McpSkillClientCapabilityReceipt` with `authenticated_server_id`, `connection_id`, actual MCP revision, `server/discover` capabilities, `io.modelcontextprotocol/skills` extension payload, `resources` support, optional directory support, actual client host version, per-mode test outcome, timestamp and expiry. Unsupported/partial/invalid/policy-disabled must not be flattened to `true`. Re-probe after host update, token rotation, policy change or connection identity change.

77.2 Inventory uses bounded paginated `skills/list` and direct `skills/get` for known URIs even when the listing is empty/partial. Skill identity always includes server identity and URI; same-name collisions are explicitly disambiguated. Retrieval may index **entitled metadata** and selected approved content under Spec 229; it MUST NOT load unapproved Skill instructions into model system context during discovery. Preserve frontmatter verbatim; do not assume `metadata.version` or any non-standard field exists.

77.3 On-demand `resources/read` always binds to originating authenticated connection; verify raw byte length and SHA-256 from the **held entry** and compare parsed `SKILL.md` frontmatter field-by-field. The entry is held through the entire acting window, at least until its instructions leave model context. A newly observed child is not added merely because `resources/directory/read` returns it; refresh `skills/get` and reapprove changed manifest first. Directory read is optional, never assumed.

77.4 Cache `ttlMs`/`cacheScope` are **freshness and sharing hints**, not content integrity or grants. Static content changes must revoke any prior content-bound approval and invalidate only workpackages whose actual Skill dependency changes. For `
`dynamic` skills, do not assume static manifest verification, offline replay or durable preapproval; `dynamic` is disallowed for unattended privileged code editing, high-risk shell, production and self-modifying orchestrator work unless a separately approved stronger content-bound protocol is implemented and independently tested. The stable standard's `resources:'dynamic'` is not a promise of immutable bytes.

## 78. Skill activation, authorization, nested Skills and prompt trust (`SAH-DEV-MCP-AUTH-6`)

78.1 **Discover ≠ read ≠ verify ≠ approve ≠ load ≠ invoke ≠ execute.** Use explicit state transitions with separate evidence. `resources/read` as a preview is not the host skill loader. Server content is lower-trust data; loading an approved Skill does not grant tool execution, FS writes, Git writes, code execution, network egress or access to another tenant's resources. `allowed-tools` or other frontmatter values are informational until the **real** host tool boundary checks a corresponding current owner grant. Never inject content into model system/developer instructions solely because it is served over MCP.

78.2 A static Skill approval is content-bound to all file URIs and digests, source server identity, URI, permission scope and current account/tenant/project. Any addition, removal or changed digest makes previous content approval invalid; an approved parent Skill does not authorize nested Skill activation or cross-server supporting-file reads. Require fresh consent for nested Skills and explicit per-call approval for cross-server resource fetches. Preserve denial and re-evaluation records, not sensitive raw content.

78.3 Treat server `instructions`, Skill instructions, frontmatter, prompts, downloaded scripts, README/PR comments, test logs and generated Hook output as untrusted at authority boundaries. Defend against prompt injection, `allowed-tools` laundering, tool-name confusion, URI origin spoofing, path traversal, reflected SSRF, secret exfiltration and trust-on-first-use masquerading as code-owner approval. Skills are never a governance signer, lifecycle reducer, test oracle or source of truth.

78.4 Distinguish (a) SmartAIHub's right to serve metadata/files, (b) an external host's actual consent and local policy, (c) SmartAIHub's separately enforced MCP tool grants and (d) the runner's real shell/FS permissions. External hosts cannot be assumed to honor internal risk labels; do not distribute high-risk private Skills to uncertified hosts requiring policies the host cannot enforce.

## 79. Durable SkillBindingReceipt and DeliveryProof (`SAH-DEV-MCP-RECEIPT-6`)

Introduce **internal** versioned structures only; no unsupported new SEP wire keys:

```ts
interface SkillBindingReceiptV1 {
  receiptVersion: 1;
  developmentRunId: string;
  workPackageId: string;
  planEpoch: number;
  tenantId: string;
  projectId: string;
  skillReleaseId: string;
  upstreamServerIdentity: string;
  upstreamConnectionId: string;
  entryUri: string;
  entryManifestDigest: string;      // internal canonicalized stable entry
  approvedRootAndResourceDigests: string[];
  heldEntryRef: string;
  contentApprovalRef: string;
  contentApprovalExpiry: string;
  grantAndRevocationEpoch: string;
  observedClientProfileRef: string;
  deliveryMode: 'MCP_NATIVE' | 'SMARTAIHUB_PROXY_CONTEXT' |
    'PINNED_EPHEMERAL_MATERIALIZATION' | 'REMOTE_RUNNER_EXECUTION' |
    'LOCAL_PINNED_LEGACY';
  runtimeRequirementsRef: string;
  executionPlacementRef: string | null;
  allowedToolGrantRefs: string[];
  providerContextPackDigest: string | null;
  activationEventRef: string | null;
}

interface SkillDeliveryProofV1 {
  bindingReceiptRef: string;
  modeSpecificObservedHandshakeRef: string | null;
  resourcesActuallyReadAndVerified: string[];
  activationEvidenceRef: string | null;
  executionEvidenceRef: string | null;
  actualHostOrRunnerIdentity: string;
  observedOutcome: 'SERVED_ONLY' | 'READ_VERIFIED' |
    'LOADED_CONFIRMED' | 'EXECUTED_CONFIRMED' | 'FAILED' | 'UNKNOWN';
  trustAndLimits: string[];
}
```

79.1 Separate a Skill manifest SHA from an immutable release provenance signature; a digest proves consistency with the authenticated server's entry, not publisher trust. Publish receipts only after actual wire/resource verification; provider natural-language claims are not `LOADED_CONFIRMED` proof. If a closed host provides no observable activation signal, `READ_VERIFIED` is the maximum evidenced level. Never create fake activation/host signatures.

79.2 Receipt identity and exact Skill content become dependencies of the Spec 224 plan/workpackage/evidence graph. On content change or grant revocation, quarantine only affected active packages, fence stale executions and invalidate dependent results under the current plan epoch. Reusing unrelated verified artifacts is allowed only with unchanged identity and evidence dependencies. Recovery must reconcile the current Spec 248 server receipt, owner grant and local runner state.

## 80. Skill tool-boundary enforcement and script safety (`SAH-DEV-MCP-TOOL-6`)

80.1 Every Skill-requested action must resolve through approved MCP/Runner/Host tools with independent action authorization at the **actual** execution boundary (Spec 220/Feature 195/Spec 200). Skill text must not mint new tool privileges, silently add tools to provider allowlists or cause arbitrary command execution by asking a model to follow shell instructions. Configurable standing grants are restricted, attenuated for subagents and always revocable.

80.2 Server-hosted execution uses reviewed source digests, pinned runtime images, constrained network/FS, per-run secrets, tenant/project identity, idempotency-aware side effects, command allowlists and output size/redaction controls. The server must not execute raw arbitrary remote Skill scripts merely because Spec 248 imported their manifest. Real script tests are allowed only in a separately authorized isolated execution tier; shipping the Skill over MCP does not implicitly license or approve its dependencies.

80.3 For filesystem compatibility, an ephemeral materialization root is content-addressed, private to the authorized run, immutable while in use and excluded from ordinary Skill discovery outside that run; do not replace user-installed Skills with same-name remote Skills. Validate archive/path traversal, symlinks, case-folding on Windows/Mac and update-during-read races. Do not use global `git add -u` from a shared dirty workspace. All tool and hook effects route to Spec 186/224 evidence and fencing where relevant, not a second hook-owned ledger.

## 81. Continuous execution and cross-provider held-entry handoff (`SAH-DEV-MCP-CONTINUE-6`)

81.1 Skill delivery is an execution prerequisite in Spec 224's `READY` predicate where Skill guidance or scripts are required: a READY package must have exact valid binding receipt, current grant, measured consumer capability, permitted placement and verified referenced content. A partial catalog does not block a known URI if `skills/get` works. Packages depending on an unsupported host or forbidden local script become `SKILL_CAPABILITY_BLOCKED`; independent packages remain READY and continue.

81.2 Provider switch/restart/compaction must never silently reuse an old held entry, unverified Skill content or prior host permissions. Export a **minimal** authorized `SkillBindingReceipt` and verified content refs through the Spec 230 handoff contract, then perform an actual capability probe and new host activation where required. Never transfer host-local secrets, provider-private internal state, or an already activated status to a new provider without new observable evidence. A new host may use `SMARTAIHUB_PROXY_CONTEXT` if approved but must not claim native MCP support.

81.3 When the MCP Skill server is unavailable, retain durable `WAITING_SKILL_SERVER`/`WAITING_SKILL_AUTH` conditions with a bounded wake-up/recheck, not a repetitive report or a generic `RUNNING` status. If a valid, policy-admitted offline cache exists, permit only the exact approved frozen content and tools; otherwise schedule unrelated READY work and send one deduplicated owner action only for genuine new rights or runtime placement decisions.

81.4 A subagent may consume an attenuated, explicitly bound subset of the parent's Skill content/grants only if the same server URI/manifest/tenant/plan identity holds. It cannot infer permission to activate a nested Skill, execute helper scripts or invoke upstream tools simply because the parent's plan mentions them. Hooks that emit completion events are untrusted until the canonical reducer independently admits the proof and updates outbox/event state.

## 82. Cross-Spec ownership, change requests and migration stages (`SAH-DEV-MCP-IMPACT-6`)

| Authority | Existing ownership | Spec 250 R0.6 delta (subordinate, versioned) |
|---|---|---|
| **248 + 199** | Inbound and outbound SEP-2640 transport, discovery, manifest, resource and security protocol conformance | Consume observed `McpSkillClientCapabilityReceipt`; submit an additive compatibility backlog to 248 for runtime placement metadata *outside SEP wire schema*, not an alternative server. |
| **221** | Publisher, Agent Skills format, immutable releases, licensing, marketplace | Request new optional `SkillExecutionRequirement`, portable export recipes, release transformations and external dependency/rights receipts; retain canonical Skill Registry. |
| **229** | Authorized retrieval + Vectorize projection | Index entitled metadata and approved version references; not an approval, credential or executable Skill store. |
| **224** | DevelopmentRun/WorkPackages, phase reducer, finality, independent verification | Accept dependency-bound `SkillBindingReceiptV1`/`SkillDeliveryProofV1` through a versioned integration adapter; no unowned in-place active Spec edits. |
| **230 + 200** | Phase context pack, external harness capability probes/transport | Add host-delivery compatibility profile, bounded instruction projection and actual host evidence; no provider-name-based claims. |
| **186 + Feature 195** | Durable jobs/outbox, actual Runner/executor and side-effect tracking | Consume authorized script execution receipts, existing idempotency/fencing and approved placement. |
| **220 + shared Approval** | Identity, tenant policy, content load consent, tool grants, revocation | Validate separate `serve`, `load`, `execute`, `local-materialize` and `publish` scopes; disallow same bot self-approval. |
| **226** | Task Control/Decision UI bridge | Report transport status, approved Skill origin, runtime placement, dependency blockers and actual evidence level. |
| **250** | Execution-reliability adapters and cross-Spec conformance, not new lifecycle owner | Resolve eligible delivery path and immutable dependency receipts for each WorkPackage; monitor fallback/recovery truthfully. |

82.1 **Spec 248 R1.2 already covers** stable `skills/list/get`, static/dynamic manifests, in/outbound MCP, security, client certification and legacy migration. Do not issue another spec to duplicate that wire logic. Its next owner-governed compatibility addendum SHOULD incorporate the explicit SkillExecutionRequirement handoff and tested actual host-versus-runner placement semantics discovered here; this is an additive backlog, not a retroactive edit or claim of actual deployed conformance.

82.2 Rollout uses independent flags default OFF: `(1) static read-only export/package lint in isolated fixture; (2) Spec 248 private inbound server certified; (3) Spec 248 outbound client and SmartAIHub controlled host load certified; (4) per-harness native/profile probes; (5) SkillBindingReceipt/Spec 224 integration; (6) only then optional ephemeral materialization or remote script executor under its own signed grants; (7) narrow shadow → assisted → autonomous-safe with Spec 214 reference campaign and real restart`. Never couple Skill transport cutover to unfinished Spec 224 owner rotation, migration gates or unadmitted production. Leave legacy Skills functional until each target profile meets equivalence exit.

82.3 When user-facing `orchestra` is an MCP-delivered Skill, the existing Spec 224 runtime is still the phase authority. If it routes into `deep-plan`/`deep-implement`, the runtime must resolve *three independently authorized content bindings* plus their shared references and executable dependency graph. The same rules apply when an external host loads them directly. Publishing Skills once can eliminate repeated installation for conforming hosts; it does not eliminate independent script/tool deployment where execution requires it.

## 83. Incremental implementation: MSP0–MSP8 (`SAH-DEV-MCP-ROADMAP-6`)

| WP | Owned incremental artifact | Readiness/authority gate | Real exit evidence |
|---|---|---|---|
| `MSP0` | Offline Skill-pack classification and strict Agent Skills preflight; report malformed `ship` frontmatter, nested root/sibling dependencies, 512/16-MiB profile | Input archive permission only; read-only isolated analysis | Full snapshot digest, exact per-Skill source path/format/script/dependency mapping; no code mutation |
| `MSP1` | Proposed private portable releases for orchestra/deep-plan/deep-implement + separately mapped execution images/hooks | Spec 221 owner, license, isolated source grant; do not alter original shared Skills tree | Packaged static test fixtures and deterministic complete manifests; old release unaffected |
| `MSP2` | Consume actual private Spec 248 `skills/list/get` + resource responses through existing client, including negative manifest tests | Spec 248 adapter conformance and versioned client probe | On-wire fixtures with actual `_meta`, caching, pagination, direct URI lookup and held entry verification |
| `MSP3` | Runtime/host capability probe and Skill delivery router with safe legacy/proxy fallback | Spec 200/230 owners; exact tested host profile and grant | Profile receipt per connection/host version; ineligible clients cannot claim `MCP_NATIVE` |
| `MSP4` | SkillExecutionRequirement and executor placement resolver | Feature 195/200/221 grants and verified dependencies | Observed server/local image and script execution proof; missing tools block only affected WP |
| `MSP5` | SkillBindingReceipt/DeliveryProof dependency adapter for Spec 224 PlanSections | In-flight Spec 224 compatibility approval; exact isolated write set; separate P-SOURCE/P-RECOVERY where affected | Source/Skill/plan/permission digests pinned; no competing reducer, changed manifest invalidates stale evidence |
| `MSP6` | Held-entry update/revoke/host fallback and durable Wakeup integration | Actual Spec 186/248 state and approved failure-injection target | Kill/revoke/server-offline/host-switch/restart tests and strict evidence tiers |
| `MSP7` | Task Control delivery/consent/placement status and owner Decision Inbox | Existing Spec 226 UI/Approval owner | User can distinguish advertised/read/approved/loaded/executed, with independent high-risk consent |
| `MSP8` | Spec 214-derived end-to-end comparison: same Skills locally installed vs remotely delivered | MSP1–MSP7 only for capabilities actually exercised; real independent verifier | Same frozen requirements met; no forced phase `continue`; no local install only where native/proxy/remote execution fully satisfies dependency closure; remaining local-only gates labeled honestly |

`MSP0` is an immediately useful, non-mutating step. `MSP1–MSP3` can advance in separately approved isolated workspaces without waiting for DB/production. `MSP4–MSP6` depend on actual owner grants and compatible deployed subsystems. If an MCP-native host is unavailable, perform the same controlled campaign under a clearly labeled proxy or ephemeral mode and retain native-certification as an unresolved gate; do not stall all development or fabricate client support.

## 84. New conformance scenarios A169–A216 (48 proposed; NOT EXECUTED)

Each test must report fixture input, exact source/Skill/lock/host digest, simulated versus real target, actual request/response/operation IDs, asserted denial or permitted outcome, test command, exit code and independent verifier. A static review cannot claim on-wire conformance or a real host/provider execution.

| ID | Distinct adversarial scenario | Required result |
|---|---|---|
| A169 | Official stable `server/discover` extension + resources advertised | Skills methods enabled only with exact observed capability and protocol revision |
| A170 | Advertises Skills without base resources | INVALID_PROTOCOL; no Skill load |
| A171 | Host implements MCP Tools but not Skills extension | No `MCP_NATIVE` claim; eligible proxy/legacy only |
| A172 | Pre-final `initialize`-only capability presented | Not accepted as stable negotiation |
| A173 | `directoryRead:false` server receives optional directory request | Client never sends request |
| A174 | Required `_meta`, resultType/cache fields or cursor missing | Protocol fixture rejects or classifies nonconforming |
| A175 | Empty listing but direct URI `skills/get` succeeds | Known Skill remains independently discoverable/loadable under scope |
| A176 | Partial listing with duplicate/paginated cursor | No false ABSENT or infinite catalog enumeration |
| A177 | Same Skill name on two servers/paths and local skill | All are disambiguated by origin+URI, no silent shadow |
| A178 | `skill://` URI from untrusted text without list/get entry | Scheme alone never proves Skill identity |
| A179 | Frontmatter omitted/changed between get and read | Reject before model load; refresh exact manifest |
| A180 | 512-file/16-MiB valid static Skill | Conforming host accepts without artificial lower hard cap |
| A181 | `resources/read` data differs in raw-byte digest/size | Deny content use and invalidate stale approval |
| A182 | Manifest adds a file during acting window | Held entry prohibits new file until refresh and new approval |
| A183 | Directory returns a new child not in manifest | Live listing cannot expand retained authorized manifest |
| A184 | Nested Skill SKILL.md used as supporting file then activated | Supporting read confers no activation; fresh child consent required |
| A185 | `resources:'dynamic'` used in privileged unattended code task | Fail closed or independently admitted stronger policy; no false integrity |
| A186 | Cache TTL valid but permission revoked | Authz rechecked; cache hint not grant |
| A187 | `skills.zip` `ship` frontmatter imported as-is | Strict YAML/Agent Skills validator rejects release |
| A188 | Repack deep-plan with only its inner Skill directory | Dependency closure fails on missing sibling scripts/hooks |
| A189 | Repack deep-implement with unsafe global `git add -u` | Compatible profile rejects or confines staging to exact isolated write set |
| A190 | Orchestra Skill points to `../sub-agents` unavailable on client | Import rejects phantom path; separate approved dependency is required |
| A191 | Script is served as verified Resource but no Python/uv executor exists | `READ_VERIFIED`, NOT executed; placement blocker only for dependent WP |
| A192 | Phone client with remote Skill and approved server-runner execution | End-to-end task runs without local Python/Git; actual remote proof recorded |
| A193 | GUI/local-secret task cannot run remotely | Requires approved trusted local Runner; no false remote-only promise |
| A194 | Skill license allows private read but prohibits redistribution | Public MCP export remains denied |
| A195 | Host `MCP_NATIVE` claimed from product name without on-wire test | Reject profile/activation claim |
| A196 | Closed host lacks observable model-context activation | `READ_VERIFIED` maximum evidence level; not `LOADED_CONFIRMED` |
| A197 | Host native support lost after extension/plugin update | Reprobe, park affected task or switch separately authorized mode |
| A198 | Cross-host fallback would copy secret or violate residency | Egress denied; other READY packages continue |
| A199 | Remote Skill updated while prior provider holds old entry | Existing held entry restricts reads; updated entry requires reapproval |
| A200 | MCP Skill server offline but approved immutable cached instructions remain | Only explicitly authorized offline scope runs; no new unverified reads |
| A201 | Revoked approval survives local cache/snapshot | No load, script or tool call until fresh verified authorization |
| A202 | Provider fallback attempts to reuse prior host's `LOADED_CONFIRMED` | Reject; new host must show independent observed activation |
| A203 | Model follows Skill text asking for forbidden tool | Actual tool boundary denies invocation; no frontmatter laundering |
| A204 | Imported Skill requests arbitrary upstream URL or relative cross-origin file | No unauthorized fetch; must use origin-bound MCP resource and policy |
| A205 | Untrusted Skill references nested name collision | Exact nested server URI and fresh consent required |
| A206 | Remote Resource script tries symlink/path escape on Windows/Mac | Materializer and sandbox deny escape, including case-folding variants |
| A207 | Child agent receives parent's skill receipt but not tool grant | Attenuation prevents privileged action |
| A208 | Hook returns success while Section file is missing | Spec 224 reducer rejects completion as unverified |
| A209 | Skill digest changes after deterministic tests before Final Verify | Dependent evidence invalidated and fresh tests required |
| A210 | Two Specs use different approved versions of same Skill | Each run holds its own release/entry/permission snapshot |
| A211 | Server publishes matching SHA but publisher identity is untrusted | Digest alone cannot certify provenance; independent publication grant required |
| A212 | Malicious fake Skills server responds under same URI but different identity | Origin-bound receipt prevents substitution |
| A213 | Operator disables MCP Skills flag during active eligible run | Existing approved frozen dependencies handled by kill-switch policy; no new reads |
| A214 | Same reference Spec 214 workflow under local and native remote delivery | Compare actual correctness/evidence, list any host-dependent differences |
| A215 | Remote/proxy Skill instructions work, but companion hooks do not | Package remains PARTIAL, no autonomous-complete assertion |
| A216 | End-to-end remote-first run with injected provider outage/restart and false-green trap | Independently verified PR with no forced `continue`; remaining local-only/production gates disclosed |

## 85. Definition of Done, release tiers and residual risks (`SAH-DEV-MCP-DONE-6`)

85.1 **Documented**: This R0.6 and the cross-Spec reconciliation note exist, carry SHA-256 and remain marked unapproved. **Static-ready**: package format/source dependency graph is reproducible and declared, including the corrected candidate `ship` frontmatter and new portable Skill release plans; read-only checks passed. **Protocol-tested**: an actual Spec 248 server and client pass stable wire fixtures including connection-specific capability, held entry, on-demand file hash and cross-tenant denial. **Host-profile-tested**: a named exact Codex/Claude/other host runtime passes observable native or labeled compatibility mode tests. **Executable-tested**: approved remote/local scripts and hooks produce actual environmental proof in sandbox. **Durable-tested**: Spec 224/186 authentic live persisted restart/provider fallback continues without forced user `continue`. **Production-certified** only after authorized tenancy/egress/DR/registered Runner/soak and the independent release gate.

85.2 Feature flags start OFF and rollout is reversible. Superseding or disabling MCP Skills must not break an unchanged, pinned, still-authorized existing local Skill workflow; keep a tested legacy compatibility path until parity is established on each supported host/version. No attempt to self-approve changes to the Skill publisher, Agent Skills content, execution hooks, tool permissions, or production targets. Skills Extension adoption is an **interop improvement**, not a bypass around Spec 224/250 source governance.

85.3 Unresolved until measured against real deployments: exact Codex/Claude/third-party SEP-2640 host support; actual Spec 248 server and outbound client implementation status; proprietary host activation telemetry; Windows/Mac sandbox and on-demand materializer; Skill publishing legal review; provider egress residency; Cloudflare Container and registered Runner execution; independent lifecycle recovery. Every claim of "no PC install" must name a tested Skill+host+task profile and distinguish *instructions* from *executables*.

85.4 **Cross-Spec review acceptance:** every new requirement maps either to Spec 248 transport, Spec 250 execution adapter, Spec 221 Skill release, Spec 230/200 provider binding, Spec 220/Approval policy, Feature 195 actual execution, or Spec 224 lifecycle; exactly one authoritative owner per concern. No older original Spec file is silently patched. Full R0.6 is complete only as a proposed design; on-wire/host/runtime/production evidence remains outstanding until actually tested.

---

---
# Revision 0.7 — Reciprocal Spec 248 R1.3 Skill Transport ↔ Development Execution Contract

**2026-09-26 · PROPOSED ADDITIVE DESIGN.** The exact companion is *Spec 248 R1.3, Sections 19–24*. This revision incorporates its stable-MCP, measured-host, immutable release, execution-placement and consent boundaries into Spec 250 WorkPackage readiness. Its acceptance candidates extend A01–A216 to A01–A264. Neither document authorizes implementation, changes the active Spec 224 or asserts present Codex/Claude native SEP-2640 support.

## 86. Strict cross-Spec ownership and anti-duplication (`SAH-DEV-MCP-HANDOFF-7`)

86.1 **One owner per concern:** Spec 248/199 issues wire-capability and origin-bound resource receipts; Spec 221 issues immutable package/release metadata and `SkillExecutionRequirementV1`; Spec 200/230 measures exact external host activation, emits handoff context and enforces provider boundary; existing Spec 220/shared Approval governs content and Tool permissions; Feature 195/Spec 200 owns executable target capability; Spec 186 owns job/outbox/lease/effect identity; Spec 224 owns WorkPackage DAG/reducer/recovery/Final Verify; this Spec 250 only selects delivery/placement and verifies readiness under those authorities. Existing `SkillBindingReceiptV1` and `SkillDeliveryProofV1` from Section 79 remain the canonical Spec 250 handoff payloads, not duplicated replacement models.

86.2 **Reciprocal contract version:** consume the proposed Spec 248 R1.3 `McpSkillClientCapabilityReceiptV1` and `SkillDistributionProofV1`. References MUST include `(server identity, authenticated connection, Skill URI, approved release, held-entry digest, tenant/ACL epoch, source/protocol version, timestamp/expiry)` and optional real content-read evidence; never key by URI alone. The host activation receipt belongs to Spec 200/230 and MUST be observed for that exact host build. If one receipt is missing or a deployed component cannot negotiate its version, mark the dependent delivery path `COMPATIBILITY_BLOCKED`, not `READY` or `MCP_NATIVE`.

86.3 **No shadow lifecycle:** Skill delivery events enter Spec 224's existing reducer via approved versioned adapters and Spec 186 outbox where required. Do not create a second Ready queue, approval issue table, retry scheduler, tool-rights model or evidence-certifying agent. Skill `orchestra` remains subordinate phase methodology even when it routes `deep-plan` and `deep-implement` automatically inside a Provider session. A chat-only successful run is `IN_SESSION_DEMONSTRATED`, never `DURABLE_RECOVERY_VERIFIED`.

## 87. Package graph, licensing and execution dependencies (`SAH-DEV-MCP-PACKAGE-7`)

87.1 On Skill activation or WorkPackage planning, load the approved Spec 221 execution descriptor and resolve a **closed graph** containing the root `SKILL.md`, in-root files, nested Skill boundaries, out-of-root sibling Skill references, separately released scripts/hooks/agents/prompts/templates, interpreter/runtime image and pinned libraries/tools, license for *every distributed/executed file*, OS/device and network/secret capabilities, named run context and effect/approval boundaries. The Agent Skills/MCP manifest lists only resources within the served Skill directory. Do not flatten `../sub-agents` or scripts outside the inner `deep-plan`/`deep-implement` roots into the parent MCP Skill silently. A sibling is a separate Spec 221 release/dependency and any nested Skill activation has separate per-Skill consent.

87.2 Normalize the supplied archive only as **source evidence**: exact installed Skill releases are independently hashed and compared. For a new portable `orchestra` release, pin `deep-plan`, `deep-implement` and role dependencies as separately approved releases. For script-heavy packages, choose an approved separate immutable runtime image or post-consent isolated ephemeral materializer. Do not copy legacy hooks into a privileged host startup path by merely importing a remote Skill. A malformed `ship` reference frontmatter must be corrected under a new approved release and validated, not altered in-place in the historical archive.

87.3 Package completeness requires no unresolved import, auxiliary code, package manager, license, executable/script or version ambiguity along the requested task path. Record a deterministic dependency-closure digest; missing a GUI/hook/runtime may block only WorkPackages that need it. For instruction-only paths, do not impose irrelevant Python/Git dependencies; for hook-dependent paths, instruction-only success is partial rather than a claim of full Skill parity.

## 88. Exact host capability and execution-placement resolver (`SAH-DEV-MCP-PLACEMENT-7`)

88.1 Select among `MCP_NATIVE`, `SMARTAIHUB_PROXY_CONTEXT`, `EPHEMERAL_FILESYSTEM_COMPAT`, `PINNED_LEGACY_LOCAL`, `REMOTE_RUNNER`, `TRUSTED_LOCAL_RUNNER` and `BLOCKED`. The first four are **instruction delivery modes**, the latter two are **executable placement modes**; a single WorkPackage may require one of each. Do not present `REMOTE_RUNNER` as a form of MCP native support or claim `MCP_NATIVE` because a server supports the extension. Exact placement decision MUST carry reason codes, measured profile, package/root digest, actual dependencies, data residency, cost, grant, fallback equivalence and required test tier.

88.2 The default candidate is remote-first **subject to measured host support and approved execution**. A native host must demonstrate stable `server/discover`/Resources/Skills negotiation, legitimate content-bound consent, on-demand file verification and **observed** root activation, not merely a list/get response. For a controlled proxy path, preserve remote server provenance in model context and prohibit host permissions from being inferred from Skill instructions. An ephemeral filesystem package must remain origin-labelled, immutable/run-local, per-Skill approved and tool-boundary restricted; the filesystem path does not elevate trust.

88.3 To claim *no PC/Mac Skill install*, prove instruction delivery without persistent local package **and** prove any required executable placement via an authorized remote executor or tested host-native mechanism. `MCP_NATIVE` by itself does not prove a script runs. For local-only GUI/keychain/source access, identify the actual trusted local target and obtain its actor/device approval; do not bypass via prompt/proxy or silently sync private files into Cloud Runner. A host with unknown support uses an admitted fallback until real conformance exists. Preserve functioning legacy installations until per `(Skill version, host build, user entitlement, task type)` parity certification and a reversible cutover decision exist.

## 89. Native lazy resource retrieval and held-entry integrity (`SAH-DEV-MCP-RESOURCE-7`)

89.1 Under `MCP_NATIVE`, obey the stable spec: `skills/list/get` plus **lazy** individual `resources/read`; never eagerly fetch supporting files merely on list or consent; optional directory reads only after `directoryRead:true`. A partial/empty list is not proof of absence: direct authorized `skills/get` remains available. The held static entry is authoritative for every auxiliary/nested file read during the acting window; directory results cannot expand it. Compare every fetched file's **raw bytes** to the entry's digest and size and compare root frontmatter field-by-field; unverifiable dynamic content cannot be made immutable by local cache.

89.2 A deliberate *internal executable packaging* operation MAY pre-materialize an approved release **after** independent packaging and explicit per-Skill user consent into a sealed, isolated artifact for a separately authorized execution target. Label `EPHEMERAL_FILESYSTEM_COMPAT`, not MCP-native retrieval, and never count unconsumed assets as observed model-loaded Skill content. Distinguish entry manifest observed, root verified/loaded, auxiliary files actually fetched, scripts actually executed and mandatory results independently verified.

89.3 A mismatch, new manifest, server re-identity, source ACL change, publisher/license revocation, or changed held entry invalidates only dependent receipts and tests by the canonical impact graph; quarantine stale content and re-verify grants. Cache TTL and file modification time cannot reauthorize. Persist current revocation/policy epochs outside any restored stale workspace. A valid offline immutable cache can be used only under current live policy and the original origin/release/action bounds, never as an untrusted server's new authority.

## 90. User consent, cross-server tools and untrusted hooks (`SAH-DEV-MCP-CONSENT-7`)

90.1 **Host execution consent is separate from server grants.** All host-side shell/code execution induced by an MCP-served Skill, whether declarative hooks or the model's execution tool, needs explicit per-Skill user approval and actual host/SDK enforcement. A general standing development grant cannot authorize unknown future Skill bytes or substitute for consent required by the official extension. Imported `allowed-tools`, Skill instructions and `SKILL.md` examples never widen host permissions. Shared Approval/Spec 220 still separately validates actual tool call scope, source/tenant, risk, expense, expiry, policy and kill switch.

90.2 Bind model-facing resource-read tools to the originating server; any cross-server request requires explicit per-call consent naming both server identities. A cached, locally materialized remote Skill retains that remote origin after Session restart, provider fallback and device reconnect. No local Skill substitution, silent nested activation, privilege amplification through child agents, or path/symlink/case-folded traversal. Tool denial is enforced at the actual host and existing SmartAIHub execution boundary, never only in a prompt.

90.3 Running scripts/hooks on the server is an **execution service** through existing Feature 195/Spec 200, not a privilege conveyed by serving their bytes. Bind executable release digest, isolated image, required OS/tools, no unexpected outbound network, sensitive source classification, least-privilege ephemeral secrets, run ID, tenant and effect idempotency. The controlling user's approval for this execution is distinct from any host-side per-Skill execution consent. Host plugin/hook limitations must be tested on each actual version; no attempt to install unreviewed hooks into user `~/.codex`/machine-global state.

## 91. Exact multi-Skill phase and approval handoff (`SAH-DEV-MCP-PHASE-7`)

91.1 To execute `orchestra → deep-plan → deep-implement`, bind **three separate** approved Skill roots and their static held entries (or explicitly labelled proxy/legacy equivalents). Attach independently versioned release refs, root URI+origin, required sibling role/agent assets, compiler/protocol pack version, host capability proof, tool/run permissions and the complete dependency graph to the Spec 224 plan epoch. `orchestra` must not implicitly approve scripts, hooks or nested Skills used by its children. Child agents receive only attenuated content and tool grants with expiry and worker/source fences.

91.2 Each phase produces a machine-valid `DevelopmentPhaseResult` through Spec 224/230's compatible schema with exact input plan/Skill/protocol/host/output-source fingerprints, observed test discovery/exit codes, immutable evidence and any `next_safe_action`. A hook's exit code `0`, `section complete` message, provider's answer or successful MCP read alone is never a phase-completion certificate. Import hook outputs into isolated staging and apply deterministic path/expected-artifact validation before reducer acceptance; preserve actual error exits and prevent global Git staging in shared dirty worktrees.

91.3 On provider switch, model-context compaction, quota pause or restart, preserve the frozen approved *dependency receipt*, not the prior host's `NATIVE_LOAD_OBSERVED` or prior model context as if portable. Re-probe the new host, re-load only still-authorized bytes using its own observable path, require current Tool grants and independent replay/fencing of unsettled script effects. One blocked Skill/host should park only its dependent WorkPackage while the canonical Spec 224 queue advances unrelated READY work.

## 92. Receipt and event schema crosswalk (`SAH-DEV-MCP-SCHEMA-7`)

| Record | Producer/authority | Consumer | Scope and invariant |
|---|---|---|---|
| `McpSkillClientCapabilityReceiptV1` | Spec 248/199 | Spec 250 + Spec 200/230 | Actual server discovery, connection/tenant/protocol/extension evidence, not a claim of host activation |
| `SkillDistributionProofV1` | Spec 248/199 | Spec 250 | Origin-bound Skill URI, held entry, *actual* fetched-byte status, release rights, ACL epoch |
| `SkillExecutionRequirementV1` | Spec 221 | Spec 250 + Feature 195 | Published package/sibling runtime closure and license; never a wire `Skill` field |
| `ObservedHostSkillActivationV1` (internal evidence contract) | Spec 200/230 | Spec 250/224 | Measured exact host build/root activation; UNKNOWN remains UNKNOWN |
| `SkillBindingReceiptV1` / `SkillDeliveryProofV1` | Spec 250 §§79, 88–91 | Spec 224/226 | Specific release + host + WorkPackage + placement + per-Skill approval + actual evidence tier |
| `DevelopmentPhaseResult` | Existing Spec 224/230 | Spec 224 reducer | Machine-valid phase/evidence; no Skill or host becomes lifecycle owner |
| Runner execution/operation receipt | Existing Feature 195/Spec 186 | Spec 224/250 | Actual tool/script effects, lease/fence/idempotency and test truth |

92.1 Version compatibility MUST be negotiated against deployed adapters before schema or event changes. Unknown mandatory fields or mismatched root/manifest revisions produce typed `COMPATIBILITY_BLOCKED`/`SKILL_BINDING_STALE`, not silent coercion, broad re-planning, or duplicate side-effect replay. Existing prior Spec 250 Section 79 payload fields are extended *additively*; retain history and preserve migration readers for accepted older versions. All fields in this crosswalk are internal SmartAIHub contracts, never mandatory extensions of the official SEP wire schema.

92.2 Do not interpret offline content hashes as server publisher trust: the Spec 221 approved publisher/release, origin identity, content digest, current policy epoch and actual resource-read evidence are independently recorded. The grant/control channel used for the initial owner admission must be distinct from an agent writing its own `APPROVED` YAML. The confirmation of Spec 250's number is not approval of this amendment or a source-write grant.

## 93. Incremental rollout, phase fairness and rollback (`SAH-DEV-MCP-ROLLOUT-7`)

93.1 Ordered *dependencies* rather than a global serial pause: (a) static skill-package lint and Spec 248 R1.3 schema/fixture design; (b) private Spec 248 real inbound/outbound server/client conformance; (c) Spec 221 release closure and explicit role/sibling dependencies; (d) actual Spec 200/230 host probes and distinct native/proxy/ephemeral paths; (e) separately authorized Cloud/Local Runner script execution; (f) Spec 224 WorkPackage receipt bridge and real restart; (g) independent Spec 214 reference campaign under both unchanged legacy and new remote-first pathways. Independent authorized components may develop concurrently. Do not hold instruction-only remote publishing hostage to an unrelated DB/prod certification gate; do not claim automatic full Skill parity before hook/script paths are proven.

93.2 New defaults remain OFF; activate by connection/tenant/host/build/Skill release/task profile only. Keep reversible legacy/local-fallback profiles and original unmodified Skill releases. Use feature flags to fence a compromised upstream without blocking unrelated existing Tools or non-MCP skills. Record exact `CANARY/SHADOW/ASSISTED/AUTONOMOUS_SAFE/PRODUCTION_CERTIFIED` eligibility independently for *wire*, *host load*, *tool/script placement*, *restart recovery* and *release*, instead of treating one green test as whole-system PASS.

93.3 First useful milestone: with a real owner-approved private Skill release and a declared host profile, run a no-manual-`continue` isolated `orchestra→deep-plan→deep-implement` task with one deliberately failing test, independently reviewed repair and a verified PR draft. If live runner/protocol is not authorized, test a labeled lower proof tier but keep deployment blocked. Then inject server outage, manifest rotation, privilege revoke, local-only dependency, provider replacement and Spec 186/224 restart, demonstrating only affected package pauses, no stale authority and no duplicate external effects.

## 94. Spec 250 R0.7 conformance additions A217–A264 (48 PROPOSED, NOT EXECUTED)

Every case requires the approved exact Spec 248/250 revisions, Skill origin/release/entry and actual host version, scope/consent, environment tier, input artifact/runner/tool fingerprints, expected oracle, observed command/trace/exit code and independent review reference. Negative scenarios must assert the *actual tool boundary*, not a textual policy statement.

| ID | Case | Required result |
|---|---|---|
| A217 | Exact published Spec 248 R1.3 receipt absent from deployment | Dependent WorkPackage `COMPATIBILITY_BLOCKED`; legacy/unrelated READY preserved |
| A218 | Extension observed in `server/discover` but host never loads root | `MCP_DISCOVERED`, not `MCP_NATIVE` |
| A219 | External host build changes after previous native proof | Re-probe; old host receipt invalidated |
| A220 | Server identity changes with same Skill URI | New origin/approval; old cache not reused as trusted |
| A221 | Entry observed but support files not fetched | `SUPPORT_FILES_PARTIAL`, no all-bytes-verified claim |
| A222 | Server advertises capabilities without base Resources | Protocol invalid; no Skill loading |
| A223 | Empty/partial list; known Skill retrievable by direct URI | Approved direct path succeeds; no false absent classification |
| A224 | Host native loads all support files at discovery | Native conformance rejects eager prefetch |
| A225 | `directoryRead:false` and host requests directory | Request not sent; static held manifest still supports navigation |
| A226 | Dynamic Skill receives old persisted content-bound grant | Fail closed; re-consent for actual current content |
| A227 | Nested Skill frontmatter read as auxiliary | No implicit activation or inherited permissions |
| A228 | Skill A induces resource read on server B | Explicit per-call two-server consent or denial |
| A229 | Remote `allowed-tools` grants local shell | Actual host/tool gate denies without explicit per-Skill approval |
| A230 | Cached remote file materialized into local worktree | Retains remote origin/untrusted rules; no local-skill laundering |
| A231 | Org standing grant but per-Skill host code approval missing | Host-side execution denied without explicit per-Skill user consent |
| A232 | Script served over MCP and immediately called on Runner | Denied absent independent execution grant/placement receipt |
| A233 | Server revokes Skill while approved offline cache exists | No stale load or side effect; only current policy-admitted exact content |
| A234 | Updated manifest adds file in held acting window | Old held entry blocks file, new consent required |
| A235 | Wrong raw script digest but frontmatter matches | Script never delivered/executed |
| A236 | Two servers serve same name, one local Skill exists | Exact per-origin disambiguation; no shadow |
| A237 | `orchestra` imports sibling `../sub-agents` not in release graph | Package closure rejects phantom dependency |
| A238 | `deep-plan` inner SKILL.md published without sibling `scripts` | Partial package; phase execution blocked where scripts required |
| A239 | `deep-implement` hooks installed globally on Windows/Mac | Denied; approved isolated placement only |
| A240 | Reference `ship` YAML malformed | Publish denied pending separately approved corrected release |
| A241 | Same skill release, different allowed licenses for assets | Distribution blocked until all required file rights satisfied |
| A242 | Same Skill uses different Python/uv versions across targets | Exact runtime image/toolchain pin or typed placement failure |
| A243 | Instruction-only Skill used on certified native host | No persistent local Skill install required for verified task profile |
| A244 | Host lacks Skills extension but SmartAIHub controls phase context | Labeled proxy path; no fake native certification |
| A245 | Filesystem-only host uses isolated ephemeral package | Per-run verified mount, no global install/shadow, consent enforced |
| A246 | Task needs local GUI/keychain and cloud runner cannot provide it | Explicit trusted local runner or blocked; no unapproved egress |
| A247 | Remote Runner has scripts but lacks approved Git repo write set | Denied file/tool write; independent work progresses |
| A248 | Host plugin supports MCP Tools but not load telemetry | `READ_VERIFIED` tier ceiling; no `LOADED_CONFIRMED` |
| A249 | `orchestra` loaded, `deep-plan` nested activation unapproved | Child remains blocked; parent cannot mint consent |
| A250 | Skill dependency graph mixes approved old/new releases | Exact plan pin or typed compatibility failure |
| A251 | Hook reports successful Section with missing output | Canonical reducer rejects no-evidence completion |
| A252 | Hook stderr nonempty but exit 0 and artifact absent | Explicit typed failure; no PASS |
| A253 | Model follows Skill instructions to stage all dirty files | Isolated write set allows only owned files; global staging blocked |
| A254 | Subagent uses parent's Skill receipt but broader Tool permission | Attenuation denies; only separately granted scope permitted |
| A255 | Root/auxiliary Skill changes after testing | Affected evidence invalidated; run targeted verified regression |
| A256 | Provider fallback carries former host `NATIVE_LOAD_OBSERVED` | New host independent probe/activation mandatory |
| A257 | Provider fallback would cross forbidden source residency | No transfer; blocked dependent task; unrelated READY continues |
| A258 | Runtime restarts between Skill read and Runner effect ACK | Reconcile canonical operation ID and remote outcome before replay |
| A259 | Native server offline; exact cache current but policy revoked | Read/execute denied despite TTL/cache |
| A260 | One plugin loses MCP Skills support while another host is eligible | Per-package compatible route switch without global queue stop |
| A261 | Initial Spec owner grant is bot-created in connected GitHub | No authority; independently verifiable owner signature required |
| A262 | Static fixture for wire passes but real host activation fails | Wire tier PASS, native-host tier BLOCKED (not overall green) |
| A263 | Legacy route and remote route produce different required test evidence | No cutover; publish parity diff; preserve legacy path |
| A264 | End-to-end approved Spec 214 reference workload with outage/revoke/restart | Independent PR/candidate; zero forced phase `continue`; local-only gates disclosed |

## 95. Planned implementation delta and reciprocal acceptance gates

| WP | Owner | Artifact | Admission and evidence |
|---|---|---|---|
| `MCP248-R13-1` | Spec 248/199 | Observed capability+distribution receipt emitters and protocol conformance | Private real server/client connection, exact base schema and official stable fixtures, independent security approval; CON-46–CON-59 |
| `MCP248-R13-2` | Spec 248/199 + shared Approval | No-implicit-execution and origin/cached/held-entry enforcement | Actual host/proxy tool-denial tests and independent reviewer; CON-55–CON-60, CON-66 |
| `MCP221-250-1` | Spec 221 + Spec 250 | Reproducible releases and `SkillExecutionRequirementV1` graph | Approved per-asset rights, frozen installed bytes and exact script/hook/dependency closure; CON-61–CON-65; A237–A242 |
| `MCP200-250-1` | Spec 200/230 + Spec 250 | Measured native/proxy/ephemeral host profiles and placement resolver | Real host build/account/permission, observed root activation and fallback/rollback; CON-46–CON-54, CON-63–CON-69 |
| `MCP250-1` | Spec 250 | Existing Section 79 receipt addendum and Spec 224/226 adapter | Exact compatible source/plan/grant schema admission; A217–A236, A249–A260 |
| `MCP250-2` | Feature 195/Spec 200 + Spec 250 | Separate approved remote/local script/hook execution receipts | Actual sandbox/Runner execution within exact target and owner grant; A229–A232, A246–A247 |
| `MCP250-3` | Spec 224/250 + independent verifier | Spec 214 parity plus failure-injection campaign | No forced `continue` at claimed durable tier; real persisted restart where claimed; A251–A264 |

95.1 **No global barrier:** transport schema/fixture and instruction-only Skill packaging may proceed independently as authorized. Only WorkPackages that need unapproved P-SOURCE/P-RECOVERY, DB, paid provider, registered Runner or production execution remain blocked. Existing active Spec 224 files are not rewritten by this proposal. The Owner who assigned number 250 still needs to approve the actual spec contents and exact future implementation write scopes; do not silently commit or deploy from these documents.

95.2 **Contract signoff:** before a combined production rollout, Spec 248/199, 221, 200/230, 220/Approval, Feature 195, Spec 224 integration owner, Spec 250 owner and independent security/release reviewer validate the single authoritative interface for each concern and the evidence tier appropriate to each feature. Pin the *official stable* MCP Skills specification and MCP base schema by actual upstream commit in the implementation dependency lock. Do not assert that a downloaded standards URL or this cross-review has supplied a pinned implementation revision.

## 96. Final interoperability and residual risks

96.1 **Release assertions are scoped.** The presence of `io.modelcontextprotocol/skills` indicates an advertised server feature; a wire conformance campaign proves that server/client adapter only; an exact host activation trace may prove native host loading; a remote script execution test proves an execution target; a durable reboot campaign proves cross-session lifecycle if the live Spec 186/224 runtime is deployed. No combination of proposal text and mocks can replace missing external evidence.

96.2 **Unresolved until tested:** the actual installed Codex/Claude/other host's Skills Extension behavior, proprietary activation telemetry, SmartAIHub's deployed `/v1/mcp` base revision, per-device Windows/Mac hook parity, real Cloudflare Container/registered Runner isolation, live grant issuer identity, immutable Spec 224 source admission and production cutover. Each missing obligation is a distinct task/owner and blocks only dependent delivery paths.

96.3 **Success criterion:** implementer receives a canonical approved Spec and a minimal owner-approved Skill set over a supported native/proxy/ephemeral path, selects permitted companion executors with closed dependencies, autonomously reaches real independent review through Spec 224, and ships a verified PR without a routine user `continue`; a spec with a genuine owner decision remains durably paused with one deduplicated Decision Inbox entry. Legacy Skills remain available until replacement of the same task profile is proven and independently authorized.

---
# End — Spec 250 R0.7 (proposed, owner-numbered 250; aligned to proposed Spec 248 R1.3)

---

## 97. R0.8 execution reliability versus Skill distribution boundary

250 exists to **extend**, never replace, active 224 Development Orchestrator lifecycle/finality, consuming verified 248 Skill-distribution/held-entry receipts and 221 Skill releases. Spec 248 may deliver lower-trust instructions/resources; it does not grant 250 the right to run code. 250 must resolve exact WorkPackage, current user/team approval, trusted host/build, source/release hashes, Runtime/Runner permissions, consent-bound script dependencies, remaining credit budget and the existing `worker_jobs` lease/fence **before** dispatch. A receiving host that lacks native MCP Skills support may use only independently authorized local/proxy compatibility; protocol negotiation never substitutes execution authorization.

250's acceptance scope is *development WorkPackage-specific* exact delivery, safe execution placement, recovered resumed attempts and auditable verification. General Chat/Workflow routing belongs to Feature 196/215; third-party hosted personal-agent connection belongs to 239; Speech/TTS and realtime sessions belong to 247/237; global deployment/cutover belongs to 245 and its 232 specialist.

## 98. R0.8 phased migration and proof requirements

- **D0 inventory:** exact active 224 commit/state-machine, installed Skill bytes and companion scripts, canonical repo branch/worktree grants, 248 R1.4 proof schema and current 250 proposal version. Reject unknown source, legacy unqualified 231 and unapproved migration journal changes.
- **D1 instruction-only pilot:** allow documented 248 instruction-only Skills after per-host measured compatibility; do not silently include shell scripts, remote hooks, cross-origin files or missing sibling Skills.
- **D2 execution placement:** only for the current bounded WorkPackage and separately authorized host/Runner. Persist a reference to the existing job, receipt hash, approval and attempt; dispatch once under PG fence, even with duplicate MCP notification or queue delivery.
- **D3 recovery:** on lost host/session, freeze uncertain side effects; reconcile provider/Runner receipts before reattempt; invalidate source and approval when a Skill entry changes or permission expires.
- **D4 verification:** 224 Final Verify remains the only authority to close the DevelopmentRun. A passed 248 protocol test or 250 execution attempt does not prove the authored software works.

## 99. R0.8 acceptance `R250-01`–`R250-12`

`R250-01` 248 static hash mismatch prevents execution; `R250-02` unknown external host advertised Skills but cannot actually load; `R250-03` dynamic Skill requires new explicit consent; `R250-04` a remote resource read cannot trigger shell; `R250-05` exact approval cannot be reused across two WorkPackages; `R250-06` two duplicate queue deliveries yield one fenced execution; `R250-07` failed external attempt never self-verifies 224 finality; `R250-08` last known-good implementation can resume after compatible host reconnect; `R250-09` revocation invalidates previously cached Skill execution proof; `R250-10` 245 infrastructure migration doesn't silently re-own an in-flight development job; `R250-11` old unqualified 231 references are held until disambiguated; `R250-12` per-attempt economic receipt reconciles independently of UI completion.

**Design-only R0.8:** none of these test IDs imply tests executed, granted WorkPackage authority or production admission. Preserve all R0.7 A01–A264 scenarios unless a direct conflict is recorded in a versioned supersession ledger.
