# Spec 232 Implementation Audit — 10 Rounds

**Date:** 2026-09-27
**Scope:** Compare repository implementation and available evidence with Spec 232 R2, including the focused G2 recovery work already recorded under `sections/`.
**Result:** `PARTIAL / BLOCKED`; the six G2 documentation/implementation sections are locally recorded complete, but the full Spec 232 migration and its production acceptance gates are not complete.
**Safety boundary:** This audit made no Production/API/database/service changes and did not unmask or start any service. Runbook observations are dated 2026-09-26 and must be refreshed before operational action.

## Round ledger

### Round 1 — Spec identity and ownership

- **Evidence:** `spec.md` §0.1/§23 assigns migration to 232 and keeps LLM routing in Spec 231; the local document is at `specs/feature/232-Zero-Downtime RedisBullMQ to Cloudflare Migration & Runtime Hardening/spec.md`, while §23 names a different lowercase target path.
- **Finding:** Cross-spec boundaries are documented, but live registry uniqueness and canonical-path reconciliation are not proven. Do not move or duplicate the spec until the live registry is checked.
- **Status:** `PARTIAL / EXTERNAL GATE` (A01, C01).

### Round 2 — P232.0 runtime inventory

- **Evidence:** `ops/feature-232/redis-migration-inventory.yaml` declares `preliminary_static_scan`, `runtime_traffic_verified: false`, and lists missing runtime command telemetry, deployment/scheduled-task mapping, full call-site inventory, keyspace metrics, and Cloudflare capability probes.
- **Finding:** The inventory is useful repository evidence, not a complete runtime inventory. Its observations are time-bound and cannot establish today's production state.
- **Status:** `INCOMPLETE` (P232.0, A01).

### Round 3 — Canonical persistence and job ownership

- **Evidence:** Spec §§2–3 require PostgreSQL `worker_jobs` plus events/outbox as canonical state and Cloudflare Queues as transport. The repository has Feature 186/195 control-plane/outbox modules, but this audit found no Spec 232 final manifest proving every existing producer, family, claim, settlement, and route-generation invariant is migrated and certified.
- **Finding:** Shared primitives exist; full Spec 232 conformance and caller closure are unproven. No competing queue or schema should be introduced to fill the evidence gap.
- **Status:** `PARTIAL / UNPROVEN` (P232.1, A02–A05, C02–C09).

### Round 4 — Cloudflare transport and staging

- **Evidence:** `apps/cloudflare/src/queueConsumer.ts`, Web outbox publisher/runner, and deployment evidence show implementation surfaces and local tests. The evidence artifact does not establish current target bindings, deployed source SHA, real Queue/DLQ synthetic fault run, or current account limits.
- **Finding:** Code and adapter coverage do not satisfy the real staging transport gate.
- **Status:** `PARTIAL / BLOCKED` (P232.2, A04–A06, C05–C09).

### Round 5 — G1 cache migration

- **Evidence:** `cloudflareSearchResultCache.ts` and focused tests exist. `ops/feature-232/g1-g2-production-readiness-runbook.md` records no authorized Beta/Admin browser evidence, production trace correlation, or caller-level proof that Redis SearchResultCache operations are zero; its recorded Worker revision/source and fault state are also not fully verified.
- **Finding:** Local cache implementation exists; per-keyspace production promotion and Redis-caller retirement are not proven.
- **Status:** `PARTIAL / BLOCKED` (P232.3, A07–A08, A15–A16).

### Round 6 — G2 authentication and revocation

- **Evidence:** PostgreSQL JTI, device authorization, login-counter and encrypted-session code/tests exist. Sections 01–06 document recovery requirements and explicitly leave target inventory, durable backup/restore, complete writer fencing, reconciliation, all-instance keyring parity, security owner review and reopen as external gates. The latest runbook evidence dated 2026-09-26 records a JTI state mismatch (272 Redis-only digests and one PostgreSQL-only digest), no approved durable backup proof, and HTTP maintenance.
- **Finding:** Local G2 recovery code is substantially implemented, but the recorded Production state is `BLOCKED_SAFE`; counts and service observations are historical and require fresh read-only verification.
- **Status:** `LOCAL PARTIAL / PRODUCTION BLOCKED` (P232.5, A12, C11–C14).

### Round 7 — G3 rate limiting and G4 locks

- **Evidence:** Web still contains Redis-backed rate-limit and semaphore modules. Spec §§6–7 require policy-class migration, DO/resource fencing, target-side monotonic epochs, and restart/expiry/cross-tenant tests. The current implementation sections do not cover or certify these migrations.
- **Finding:** Existing components are not proof of the specified Cloudflare/PG ownership transition; no family certification or removal evidence was found.
- **Status:** `NOT COMPLETE / UNPROVEN` (P232.4, A09–A10, C12, C15).

### Round 8 — G5 realtime and G6 jobs/schedules

- **Evidence:** `apps/web/server/_core/index.ts` still initializes multiple BullMQ queues, and runtime code retains BullMQ services. Python inventory still identifies Celery/Redis responsibilities. Spec §§8–9 and A17–A19 require per-family ownership transfer, schedule occurrence/DST handling, DLQ/reconciliation, and zero legacy queue duty only after safe retirement.
- **Finding:** G5/G6 migration is incomplete. Removing these callers or Redis dependencies now would strand active work and violate the ordered migration contract.
- **Status:** `NOT COMPLETE` (P232.3–P232.6, A08, A11, A17–A19, C05–C10, C15–C18).

### Round 9 — Admin, observability, security, DR, and cost

- **Evidence:** Spec §§10–12 and §§14–15 require reviewed RBAC/approval/audit surfaces, per-family SLO and spend baselines, alerts, backpressure, restore/DR proof, residency review, and controlled recovery. Existing runbooks/evidence cover some G1/G2 risks but report missing owners, current target proof, durable backup/restore and production observations.
- **Finding:** Operational foundation is partial; the acceptance matrix for all groups/families is not present as a signed, current evidence packet.
- **Status:** `PARTIAL / BLOCKED` (P232.3–P232.7, A15–A16, C16–C20).

### Round 10 — Acceptance, dependencies, and final verification

- **Evidence:** Spec §§16, 22, 29 require A01–A20 and C01–C20 to map to named tests, staging experiments and redacted evidence, then an independent verifier and zero unresolved blockers. The current section config marks six G2 recovery sections complete, but Section 06 itself says this is not a target-specific packet and the reopen decision remains `BLOCKED_SAFE`. The inventory and deployment evidence also say Production cutover was not approved/performed.
- **Finding:** Completing the six G2 sections is not completion of the full migration. A17–A20 and many C-gates cannot pass while legacy callers remain and live staging/Production evidence is absent.
- **Status:** `FINAL_VERIFY BLOCKED`; `resume_from: P232.0` for full migration inventory, while G2 operational recovery resumes at Section 01 with fresh target evidence.

## Post-audit convergence checks

### Round 11 — Focused local regression proof

Ran:

```text
npm --workspace apps/web exec -- vitest run server/services/g2AuthStateSnapshot.test.ts server/services/jtiRevocationImporter.test.ts server/services/loginFailureCounterImporter.test.ts server/_core/revocation.test.ts server/services/__tests__/cloudflareSearchResultCache.test.ts server/services/__tests__/jobOutboxPublisher.test.ts server/services/__tests__/jobOutboxRunner.test.ts
```

Result: **7 test files passed, 28 tests passed**. These tests prove only focused local contracts; they do not prove deployment, real Cloudflare transport, all producer closure, Production reconciliation, or safe service reopening.

### Round 12 — Safe repair review

- Rechecked the G2 apply scripts and audit code: they retain explicit maintenance guards, fresh rescans, malformed-state blocking, and sanitized errors. The guards themselves are not evidence that a real writer fence exists; the runbook correctly requires independent operator evidence.
- No safe code mutation was justified by the source review. The confirmed gaps require complete runtime inventory, owner-approved backup/fencing/reconciliation, staged Cloudflare proof, or per-family migration work. Changing routes, Redis callers, dependencies, credentials, or masked service state before those gates would increase data/authentication risk.
- This audit report is the only file added by this audit. No application code, data, service state, credentials, or `.env` was changed. No repository-wide typecheck was run.

## Completion matrix

| Spec area | Local code/doc state | External/runtime proof | Overall |
|---|---|---|---|
| P232.0 inventory/identity | Preliminary static inventory; identity/crosswalk documented | Registry, all runtimes, callers, owners and live metrics missing/stale | `PARTIAL` |
| P232.1 canonical PG/outbox contract | Shared Feature 186/195 primitives exist | Full migration conformance/producer map not demonstrated | `PARTIAL` |
| P232.2 Cloudflare transport | Worker/Queue adapter code exists | Real staging bindings, Queue/DLQ and fault evidence absent | `BLOCKED` |
| P232.3 G1 + first low-risk family | Cache code/tests exist | Authenticated traces, canary, Redis caller zero absent | `BLOCKED` |
| P232.4 G3/G4/G5 + remaining G6 | Legacy Redis/BullMQ/Celery code remains | No per-family cutover proof | `NOT COMPLETE` |
| P232.5 G2/economic paths | Local auth recovery pieces exist | G2 recovery and financial-family certification blocked | `BLOCKED` |
| P232.6 Redis retirement | Legacy queue initializers/dependencies still present | Redis-deny smoke and complete drain absent | `NOT COMPLETE` |
| P232.7 final verification | G2-focused sections/reviews exist | Signed A/C matrix and independent verifier absent | `BLOCKED` |

**Immediate next safe action:** refresh P232.0 using authorized read-only inventory and registry evidence, then reconcile G2 Section 01 against current target/revision. Do not unmask/start Web, Backend, or watchdog; do not run importer `--apply`, change auth traffic, or retire Redis/BullMQ based on this local audit.
