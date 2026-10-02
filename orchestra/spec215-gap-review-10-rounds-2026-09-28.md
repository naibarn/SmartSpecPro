# Spec 215 implementation gap review — 10 rounds

Scope: targeted source review of Spec 215 runtime code, Feature 186/195 job gateway/schema, and the additive changes in this run. All rounds are separate checks with a recorded disposition. “Open” means implementation remains incomplete; these rounds do not convert external/runtime gates into proof.

## Round 1 — durable identity mapping
- Finding: planned node jobs used a hashed logical workflowRunId while the API persisted a random database run UUID. Node jobs and logical rows could not join reliably.
- Fix: force the logical runtime identity to the persisted run UUID and persist each nodeRunId taken from its planned canonical job payload.
- Proof: workflowStudioRuntime targeted test asserts workflowRunId equals run UUID; focused suite passes.

## Round 2 — tenant/run isolation
- Finding: tenantId fields alone did not prevent a child row from pairing a run ID with another tenant.
- Fix: add composite run/tenant unique key and composite foreign keys on node runs and attempts; attempts also reference node ID + tenant + run.
- Proof: migration and Drizzle schema declare matching constraints; durable schema test passes.

## Round 3 — eager downstream admission
- Finding: old planner exposed all selected node jobs as if ready, which allowed a downstream job to enter the physical queue before its inputs committed.
- Fix: preserve full `jobs` for plan projection but add `initialJobs` selected from dependency readiness; admission now creates only roots with committed predecessors. Persist all selected node rows, leaving non-ready nodes pending.
- Proof: runtime test verifies root-only initial set and next-node eligibility after predecessor completion.
- Open: job-result settlement does not yet atomically commit outputs and activate successors.

## Round 4 — selected-node missing inputs
- Finding: bounded `run_node`/`run_from` could select a node whose predecessor was excluded and not completed.
- Fix: readiness requires every predecessor to be in the committed set, regardless of selection; API rejects a plan with no initially ready node.
- Proof: pure readiness helper and runtime test; router test suite passes.

## Round 5 — silently ignored retry and timeout policy
- Finding: compiled workflow policies were retained in plan JSON but generated jobs always used hard-coded retry and timeout values.
- Fix: project node-targeted retry/timeout attachments to canonical job policy, keep defaults only when absent, and reject inconsistent ranges.
- Proof: runtime test checks custom values in generated jobs.
- Open: budget/cache/fallback/checkpoint and concurrency/effect policies still need executable handlers or explicit typed rejection.

## Round 6 — unconstrained durable state vocabulary
- Finding: free-form status strings could store values the scheduler and readers do not understand.
- Fix: add SQL and Drizzle check constraints for logical node and physical-linked attempt statuses, positive attempt number, and non-negative lease generation.
- Proof: migration structure assertions pass.

## Round 7 — plan lock persistence
- Finding: run rows did not store an immutable compiled plan snapshot or plan hash, so restart could not prove the exact compiled semantics used for admission.
- Fix: add nullable compatibility fields `executionPlanJson` and `planHash`; router writes the plan and SHA-256 digest at run creation.
- Proof: durable schema test verifies fields and route admission tests pass.
- Open: canonical serialization should be standardized before cross-language replay; current payload serialization is local Node JSON.

## Round 8 — duplicate job/attempt linkage
- Finding: retries/replayed admissions could create duplicate logical links or duplicate physical-job ownership.
- Fix: unique constraints cover node/attempt number, tenant/idempotency key, and one logical attempt per worker job; inserts use conflict-no-op on replay.
- Proof: migration declares unique indexes; schema test checks them.
- Open: physical `workerAttemptId` and authoritative fencing generation are populated only when a worker claims the job; no claim callback is wired here.

## Round 9 — migration metadata and schema verification
- Finding: Drizzle's check command cannot verify this schema because pre-existing `0146_snapshot.json` and `0147_snapshot.json` both point to the same parent snapshot. No snapshots exist for current migrations through 0352 in this checkout.
- Action: append migration 0353 to the journal; retain manual migration as canonical and do not rewrite ambiguous snapshots.
- Proof: journal entry is present; `drizzle-kit check` reproduces the snapshot-parent collision.
- Open: migration execution and DB constraint validation require a clean migration metadata chain and a database environment; neither was attempted.

## Round 10 — boundary and failure behavior
- Finding: there is no configured `WorkflowNodeTaskDispatcher`; the registered executor intentionally fails closed. Node output settlement, successor activation, checkpoints/resume, effect replay/recovery, placement/governance, economic limits, and full conformance are not complete in this patch.
- Action: retain fail-closed behavior, document these as incomplete implementation/external integration gates, and do not route through the old sequential `workflowStudioJobExecutor` or retired workflow engine.
- Proof: targeted source search confirms dispatcher configuration has no caller; focused tests prove current local contracts only.
- Status: open. Sections 05–12 remain in progress; deep implementation as a whole is not yet complete.

## Final convergence status
- Review rounds completed: 10/10.
- Confirmed local gaps fixed: identity mismatch, tenant/run FK isolation, eager downstream admission, missing-input readiness, retry/timeout policy projection, unconstrained state, plan snapshot/hash, duplicate linkage constraints.
- Remaining: dispatcher/adapters, fenced terminal callback and successor activation, policy families beyond retry/timeout, graph-control-flow expansion, human resume, effect/replay/recovery, authorization/placement, economics/fairness, migration-chain/production proof. These must remain explicit blockers rather than be represented as complete.

# Follow-up convergence after settlement implementation — rounds 11–20

These follow-up rounds review the new completion-to-successor path and corrections made after the original ten-round review.

## Round 11 — stable plan serialization
- Finding: hashing `JSON.stringify(plan)` before storing a `jsonb` plan can diverge after PostgreSQL key normalization.
- Fix: use the compiler's canonical stable digest for storage and settlement verification.

## Round 12 — incomplete output evidence
- Finding: hashing the result reference string would falsely label a reference digest as output-content integrity.
- Fix: require a valid adapter-provided SHA-256 content digest alongside the durable result reference; settlement fails closed otherwise.

## Round 13 — physical and logical attempt identity
- Finding: settlement originally compared logical run ID with the physical job's optional top-level `workflowRunId`, but canonical node jobs carry the run UUID in their input envelope.
- Fix: validate against `worker_jobs.inputJson.workflowRunId` and reject any conflicting top-level value.

## Round 14 — root node duplicate redispatch
- Finding: root logical node rows remained `ready` after the initial job/attempt was created, so a later dispatch pass could create another business attempt.
- Fix: initial admission transitions each root row to `admitted` after the attempt link is inserted.

## Round 15 — successor execution queue
- Finding: settling a predecessor only marked successor logical rows ready, leaving no canonical physical job.
- Fix: added `dispatchReadyWorkflowNodes`; it reconstructs a job from the pinned plan, uses deterministic idempotency, and admits it through `createControlPlaneJob`.

## Round 16 — missing dispatcher preflight
- Finding: `JobExecutorRegistry` contained the wrapper, which made registration look ready even though no node dispatcher was configured.
- Fix: expose dispatcher readiness and reject new workflow runs/successor admission when the dispatcher is absent.
- Limit: no manifest-bound production adapter implementation is configured in this repository path, so run admission is now correctly gated.

## Round 17 — hook initialization coverage
- Finding: importing the settlement hook only through the executor registry could omit registration in worker routes that initialize Job Control Plane directly.
- Fix: load Spec 215 settlement hook registration from Job Control Plane module initialization; dynamic gateway/registry imports avoid a static dependency cycle.

## Round 18 — run terminal guard
- Finding: a late success or post-commit hook retry could mutate a cancelled/failed logical run.
- Fix: settlement and ready dispatch reject failed/cancelled logical runs.

## Round 19 — control-plane compatibility
- Finding: some repository fakes do not implement `findJob`; unconditional lookup broke stale-lease tests before the lease fence was checked.
- Fix: make the hook's optional job-type lookup tolerant of repositories without that method while preserving production lookup when present.
- Proof: focused Job Control Plane suite passes 54/54.

## Round 20 — key length vs canonical physical schema
- Finding: readable concatenation of run, node, and attempt IDs can exceed the physical `worker_jobs.idempotencyKey` 128-character column.
- Fix: use a deterministic 48-hex digest suffix under the `workflow-node:` prefix; regression assertion caps keys at 128 characters.

## Follow-up convergence result
- Rounds 11–20 completed. Each confirmed local defect above was fixed.
- Newly explicit open gaps: settlement runs after the physical completion transaction and has no durable retry outbox/reconciler; output content digests and manifest-bound adapters must be supplied by a real configured dispatcher; control-flow branches/loops/subflows and sections 07–12 remain incomplete.
- No production or live-provider behavior is claimed.

# Follow-up convergence after pinned activation and adapter contracts — rounds 21–30

## Round 21 — activation selection persistence
- Finding: compiled plan storage alone did not pin the selected node subset/run mode.
- Fix: persist selectedNodeIdsJson and include selection/mode/target/checkpoint/input fingerprint in a stable hashed plan envelope.

## Round 22 — pinned envelope verification
- Finding: settlement checked only the compiler plan digest, not the activation envelope against the logical run columns.
- Fix: settlement validates stable hash, selected IDs, mode, input fingerprint, target node, and checkpoint before state changes.

## Round 23 — tenant isolation in dispatch
- Finding: successor dispatch loaded a workflow run by global ID without an explicit tenant predicate.
- Fix: dispatch now requires the tenant ID and queries by both run and tenant; caller derives tenant from the physical canonical job.

## Round 24 — logical vs physical run identity
- Finding: worker_jobs may not populate its top-level workflowRunId for this job contract.
- Fix: settlement reads the canonical run ID from the job payload and treats a conflicting top-level value as invalid.

## Round 25 — attempt key column bound
- Finding: concatenated node/run/attempt identity could exceed the canonical 128-character job idempotency field.
- Fix: switched to a deterministic bounded digest key and added a runtime assertion.

## Round 26 — retry jitter vocabulary
- Finding: Spec compiler accepted `full` jitter, while Feature 195 JobDefinition accepts `none`, `bounded`, or `recorded`.
- Fix: align compiler schema/types/tests to Feature 195 and cap max attempts at 20.

## Round 27 — overlapping policy ambiguity
- Finding: multiple retry or timeout attachments targeting one node silently selected the first.
- Fix: reject overlapping same-kind attachments with a typed compile/runtime policy error.

## Round 28 — adapter resolver contract
- Finding: fail-closed wrapper had no exact manifest/version adapter registry contract to implement against.
- Fix: added an exact `(typeId, version, manifestDigest)` registry, explicit missing-adapter preflight, lease checks, pinned identity checks, and required result-ref/content-digest validation in its dispatcher factory.
- Open: registry is not populated or configured by a production adapter bootstrap in this codebase.

## Round 29 — module initialization / lease completion regression
- Finding: settlement hook registration needed to load on the real control-plane completion path, and repository fakes omitted the lookup method.
- Fix: register hook from Job Control Plane module initialization; optional lookup remains safe. Focused control-plane test suite passes.

## Round 30 — diff scope and proof boundary
- Finding: default Prettier options created hundreds of formatting-only changes. Also, the Drizzle check failure is a pre-existing snapshot-chain collision rather than proof of migration validity.
- Fix: restored the initially clean tracked files to HEAD content and reapplied only semantic changes; focused diff is now 226 insertions/14 deletions across the five pre-existing tracked code files. Keep migration application and production proof as explicit gates.

## Convergence result
- 30 gap-review passes recorded in three groups of ten.
- Latest focused suite after these fixes: 6 files, 70 tests passed; `git diff --check` passed.
- Still open: configured provider/node adapters, a durable retry outbox for post-completion settlement, control-flow branching/loops/subflows, checkpoints/human resume, effect/replay recovery, authorization/placement, economics/operations, and release/production proof.

# Follow-up convergence for checkpoint/resume and retry/cancel projection — rounds 31–40

## Round 31 — checkpoint source integrity
- Finding: resume accepted a ready checkpoint by ownership/version/input only; it did not verify the per-node artifact mapping.
- Fix: resume requires a pinned source plan hash, per-node refs and SHA-256 digests, and validates the canonical checkpoint digest before planning.
- Compatibility: older checkpoints without this shape fail closed for canonical run-from.

## Round 32 — per-node output mapping integrity
- Finding: hashing only the flattened reference list would allow refs to be reassigned between node IDs without changing the digest.
- Fix: checkpoint digest covers sorted node ID, sorted refs, and per-node content digest records.

## Round 33 — resume input hydration
- Finding: `run_from` marked ancestors completed but newly selected node jobs did not receive those ancestors' artifact refs.
- Fix: compiler accepts completed output refs, job envelopes carry `inputArtifactRefs`, and run creation persists the refs for each selected node.
- Proof: runtime test verifies resumed target receives predecessor output ref.

## Round 34 — activation input pinning
- Finding: checkpoint refs and selected activation inputs were not part of the saved run plan hash.
- Fix: pinned run-plan envelope hashes selected IDs, mode, checkpoint/target, input fingerprint, and per-node input refs.

## Round 35 — retry state projection
- Finding: Feature 195 retry-scheduled/terminal outcomes did not update Spec 215 node/run state.
- Fix: Job Control Plane failure invokes the job-type settlement hook; retry-scheduled maps to logical waiting/retry state, permanent failure/cancel/expiry maps to terminal logical state.

## Round 36 — retry hook idempotency
- Finding: replaying the post-failure hook could increment node revision repeatedly.
- Fix: already-projected retry/failure states return without another transition.

## Round 37 — cancellation projection
- Finding: canonical cancellation did not notify the Spec 215 logical projector.
- Fix: successful cancellation now invokes the registered job settlement hook; logical cancellation is tenant/run-scoped.

## Round 38 — test-double compatibility
- Finding: repository fakes omit `findJob`, so optional post-settlement lookups broke otherwise valid control-plane transition tests.
- Fix: hook lookup is conditional; actual database repository still provides `findJob`.

## Round 39 — checkpoint uniqueness under duplicate settlement
- Finding: repeated success settlement could emit repeated identical checkpoints.
- Fix: settlement locks the run, checks an existing checkpoint by run/tenant/digest, and only inserts once.

## Round 40 — focused regression and migration checks
- Proof: 6 focused test files, 70 tests passed; `drizzle-kit check` passes from repository root; `git diff --check` passes.
- Open: post-commit hook recovery still has no durable retry outbox, and owner sections 07–12 remain incomplete.

# Follow-up convergence for compiler admission and control boundaries — rounds 41–50

## Round 41 — attachment enforcement boundary
- Finding: compiler validated and retained cache/budget/fallback/checkpoint, scope and instrumentation declarations without execution handlers.
- Fix: valid-but-unimplemented declarations now produce typed compile errors.
- Proof: compiler contract tests.

## Round 42 — graph activation semantics
- Finding: control/error/event edges were projected into the same dependency scheduler as data edges.
- Fix: reject non-data channels until their durable activation handlers exist.
- Proof: three channel cases assert typed rejection.

## Round 43 — required workflow inputs
- Finding: run admission accepted empty or malformed input even when the definition declared required typed inputs.
- Fix: validate each supplied input against the pinned schema and reject missing required inputs.
- Proof: runtime test covers missing and schema-invalid values.

## Round 44 — defaults and input authority
- Finding: workflow defaults were validated at compile time but not applied at run activation; unknown keys were also accepted.
- Fix: resolve defaults into the pinned run input and reject undeclared keys.
- Proof: runtime test covers default application and unknown-key rejection.

## Round 45 — semantic input fingerprint
- Finding: JSON.stringify-based fingerprint varied with object key insertion order.
- Fix: use canonical stable digest for normalized workflow inputs.
- Proof: equivalent input maps produce identical node input snapshot references.

## Round 46 — empty graph crash path
- Finding: an empty graph could flow into job projection, where first-job policy access was undefined.
- Fix: compiler rejects empty graphs with `WORKFLOW_GRAPH_EMPTY`.
- Proof: compiler contract test.

## Round 47 — successor dispatch race
- Finding: concurrent dispatchers could both observe a ready successor and both proceed before either logical status update.
- Fix: compare-and-set the tenant/run-scoped logical row to durable `dispatching` before job creation; require one returned row to proceed.
- Proof: code-path review and schema/migration status assertion; DB concurrency proof remains open.

## Round 48 — interrupted successor admission
- Finding: a process stop after claiming a successor but before logical attempt linkage could strand it.
- Fix: dispatcher revisits `dispatching` rows and uses deterministic attempt identity so Feature 195 idempotency returns the same canonical job.
- Proof: code-path review; restart/fault-injection test remains open.

## Round 49 — human and retry controls
- Finding: generic worker resume could be invoked as approval/input, and run-level retry/resume targeted only the first physical job rather than the failed logical node.
- Fix: those actions fail closed until the Spec 225 attention bridge and logical-node retry path are wired.
- Proof: action-boundary tests; route-level integration proof remains open.

## Round 50 — partial run cancellation
- Finding: cancellation targeted only the first canonical job reference in a multi-node run.
- Fix: inspect every tenant-authorized job ref, fail closed if status cannot be verified, and request idempotent cancellation for every non-terminal job.
- Proof: source review; database-backed multi-job control test remains open.

## Convergence result
- Review rounds completed: 50 total. The latest cross-section suite passes 7 focused files / 86 tests; Drizzle metadata check and diff whitespace check pass.
- Rounds 47–50 retain explicit integration gaps; local tests do not establish concurrent DB execution or Spec 225 production integration.

## Round 51 — defaulted input persistence
- Finding: compiled input defaults affected node snapshot refs, but the router persisted/fingerprinted the pre-default request, so replay and stored run inputs disagreed with the pinned plan.
- Fix: router now uses resolved plan inputs for persisted JSON and input fingerprint; replay lookup occurs after schema/default normalization.
- Proof: runtime input-default tests and route/runtime focused tests.

## Round 52 — full intent idempotency
- Finding: an existing tenant idempotency key compared content/version/input only and could replay a different mode, checkpoint, target, selection, or pinned plan.
- Fix: compare normalized input hash, mode, target, checkpoint, selected node IDs, and stable plan hash before returning a replay.
- Proof: `workflowRunIntentMatches` contract covers mode/checkpoint/plan mismatches; route/runtime tests pass.
- Residual: the router's real DB idempotency race still needs an integration test with concurrent admissions.
