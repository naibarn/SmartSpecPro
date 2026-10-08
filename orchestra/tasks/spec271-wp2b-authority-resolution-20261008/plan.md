# SPEC-271 WP2B Authority Resolution Workunits

## Purpose

Resolve the existing authority dependencies needed to run WP2B receipt acceptance once, without creating a new authority, persistence adapter, queue, registry, ledger, or specification. This packet is an Orchestra task plan; it does not grant execution authority or represent an accepted owner assignment.

Baseline: `origin/main` `203f72646cadd38c9037ca6830b6d57084828c75`.

## Workunits

All four workunits currently have status `OWNER_ASSIGNMENT_REQUIRED`. No session, SPEC label, or active lane is presumed to own the required decision. A named owner with delegated authority must accept each unit before its implementation action is started.

### WU-271-WP2B-A — Run identity and settlement

- **Owner:** `OWNER_ASSIGNMENT_REQUIRED` — authority decision needed from the owner of SPEC-224 DevelopmentRun/job-control settlement.
- **Existing interface:** `apps/web/server/services/spec224DevelopmentRunContracts.ts` (`runId`, `phaseAttempt`, `workerJobId`, event sequence and idempotency keys); `apps/web/server/services/spec224DevelopmentRunPersistence.ts`; canonical `worker_jobs` / `worker_job_events` / outbox path.
- **Allowed environment:** read-only contract review until owner accepts; then an approved isolated non-production profile only.
- **Permission/scope required:** permission to read the exact tenant-scoped run and attempt, validate its event sequence, and bind receipt settlement to the same job; no production dispatch or mutation.
- **Blocking dependency:** WP2B cannot bind exact `uatRunId`/attempt or claim authoritative acceptance without the existing run's settlement event.
- **Acceptance:** tests prove the receipt resolves the approved run/attempt, worker job and settlement event at the exact source SHA; reject mismatched tenant, attempt, event sequence, stale revision, and replay conflict.
- **Evidence expected:** owner approval reference, run/job/event IDs (non-production), exact source SHA, focused test output, and independently readable settlement evidence.
- **Resume condition:** owner-backed binding contract and a registered predicate adapter can verify a fresh non-production settlement event.

### WU-271-WP2B-B — Tenant/project access and retention

- **Owner:** `OWNER_ASSIGNMENT_REQUIRED` — one authorized owner must identify the existing tenant/project policy and retention policy owners; SPEC ownership alone does not grant either permission.
- **Existing interface:** `apps/web/server/services/spec271DurableEvidenceReceiptStore.ts` injects `authorizeScope(READ|WRITE)` and `resolveRetention`; receipt scope is tenant/project/run-bound. No concrete production factory wiring was found.
- **Allowed environment:** approved non-production tenant/project and immutable test storage only.
- **Permission/scope required:** explicit READ and WRITE authorization for the named tenant and project; an existing retention grant that confirms policy reference, immutable storage and retention period. No cross-tenant access and no retention-policy changes.
- **Blocking dependency:** adapter callbacks currently have no owner-approved policy binding; receipt persistence must fail closed without one.
- **Acceptance:** tests reject unauthorized READ/WRITE, tenant/project mismatch, missing/revoked/stale retention grant, policy change and non-immutable storage; accepted grant permits persist plus read-back under the same scope.
- **Evidence expected:** authority/policy reference, non-production scope, grant scope and expiry/revision, retention decision, focused test output, object digest and read-back result.
- **Resume condition:** current scope-bound grants and a registered predicate adapter revalidate both access and retention authority.

### WU-271-WP2B-C — Oracle, approval and acceptance event

- **Owner:** `OWNER_ASSIGNMENT_REQUIRED` — authority decision needed from the SPEC-271 oracle/approval contract owner and the owner of the canonical acceptance event.
- **Existing interface:** `apps/web/server/services/spec271PortableEvidenceReceipt.ts` requires an independent `ACCEPTED` outcome with tenant/project and provenance checks; durable object persistence alone is not acceptance.
- **Allowed environment:** approved non-production UAT only; no fabricated approval or production acceptance.
- **Permission/scope required:** permission to read the approved oracle revision and scoped approval decision, and to verify that the acceptance event references the exact source/run/attempt. No permission to grant acceptance.
- **Blocking dependency:** no verified owner-backed path was found that connects approval/oracle decision to SPEC-224 settlement and a canonical acceptance event.
- **Acceptance:** reject missing, stale, unauthorized, self-referential or scope-mismatched oracle/approval; verify the persisted receipt references independently inspectable decision and settlement evidence; separate test PASS from acceptance.
- **Evidence expected:** oracle ID/revision, approval actor/reference and scope, source SHA, run/attempt, event identity, verifier output, and immutable receipt reference.
- **Resume condition:** owner-approved event binding is present and a registered predicate adapter can independently recheck decision validity and revocation.

### WU-271-WP2B-D — Registered Runner and non-production target

- **Owner:** `OWNER_ASSIGNMENT_REQUIRED` — a Runner/deployment authority must name the registered capability owner and approve the target. Lane 1 and Runner worktrees remain protected.
- **Existing evidence/interfaces:** `apps/web/server/services/profiles/spec224-recovery-registered-runner-nonprod.v1.json` describes a test profile, not a live grant; `orchestra/programs/autonomous-mini-app-factory/program.json` records existing waits for trusted Runner authority and a registered non-production target.
- **Allowed environment:** only the named isolated non-production target and registered Runner with current capability snapshot; no production deploy/migration.
- **Permission/scope required:** `agent.external_task` (or the exact capability required by the accepted profile), same-tenant run grant, current Runner session/capability snapshot, isolated DB, target runtime identity and explicit non-production execution approval.
- **Blocking dependency:** repository profile is tied to an older source commit and does not prove a current endpoint, registered Runner, target, or permission.
- **Acceptance:** profile validates against the exact candidate SHA; target and Runner are revalidated immediately before the test; the end-to-end run produces inspectable non-production dispatch and receipt evidence without production side effects.
- **Evidence expected:** target ID/environment, Runner ID and capability snapshot revision/expiry, permission/approval references, isolated DB identity, run ID, exact SHA and execution logs.
- **Resume condition:** all registrations/grants are current and a registered predicate adapter can recheck them; then schedule the bounded non-production acceptance run.

## Durable wait and continuation

WP2B is semantically blocked on external authority. The repository lifecycle supports durable `worker_jobs`/outbox waits and reconciliation in `developmentLifecycleDependencyWatcher.ts`, but no SPEC-271 authority predicate adapter is registered in `developmentLifecyclePredicateRegistry.ts`, and the current SPEC-271 handoff has no durable waiting predicate or continuation owner. Therefore this packet records `WAITING_EXTERNAL_AUTHORITY` as the work status, but **does not claim runtime durable wait or automatic wakeup is active**. Do not create a fake predicate. Once the four owners accept the workunits, bind a recheck predicate to the existing lifecycle watcher and worker-job continuation before declaring the durable wait operational.

## Next executable sequence

1. Obtain named owner/delegation decisions for WU-A through WU-D; record the authority reference for each.
2. Implement only the owner-owned adapter binding(s) that have explicit non-production scope and permission.
3. Register authority-backed satisfaction predicates with the existing lifecycle predicate registry; verify durable evidence wake and periodic recheck through the existing worker-job/outbox path.
4. Run the non-production receipt acceptance matrix once all predicates pass; persist and read back from a separate process, then repeat after process restart.
5. Update SPEC-271 canonical handoff with exact source SHA and evidence; keep implementation/verification/deployment/acceptance states separate.

No SPEC-224, Runner, tenant policy, retention policy, or shared projection files are owned by this packet.
