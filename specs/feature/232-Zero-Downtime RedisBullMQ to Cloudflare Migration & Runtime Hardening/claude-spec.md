# Initial Planning Spec — G2 Auth / Revocation Recovery

## 1. Objective

Create an implementation-ready, evidence-driven plan for recovering the G2 Auth/revocation boundary that entered production maintenance after Redis and PostgreSQL revocation state diverged. The plan must describe the gated path to restore normal Web/Backend service safely and map its results into the existing Spec 245 master plan.

The immediate recovery is separate from promoting G2 to Cloudflare Durable Objects. Recovery may restore the current PostgreSQL-backed authorization path with its explicitly approved temporary compatibility bridge; DO promotion is a later, separately gated phase.

## 2. Current evidence and uncertainty

- Spec 232 owns the Redis/BullMQ migration subsystem; G2 is auth/revocation, with fresh PostgreSQL authorization authority and Durable Objects coordination. Spec 245 owns full-system sequencing and cutover coordination. Spec 231 LLM routing is separate.
- The current source uses PostgreSQL as the runtime JTI revocation authority. An opt-in `JTI_REDIS_ROLLBACK_MIRROR` bridge writes Redis before PostgreSQL and checks the PG store before the Redis mirror; store failures fail closed.
- JTI and login-counter importers default to dry-run and require explicit maintenance/writer-fence variables for apply. Raw token identifiers and secret material must never appear in logs or planning artifacts.
- Production migrations 0345–0349 were documented as already applied. Never rerun them as part of recovery without fresh target-specific evidence; the plan must require migration/hash verification.
- Last documented G2 state found active Redis JTIs missing from PostgreSQL and a PostgreSQL-only revocation. Those counts are historical snapshots, not current import quantities or proof of a maintenance-fenced state.
- The current workspace observed Web, Backend and Web watchdog as masked/inactive; Node worker is a separate service. Local status does not prove all public origins, replicas or auth writers are fenced.
- Backup restore proof, complete writer inventory, keyring parity and current post-fence state reconciliation remain unproven in the available evidence.

## 3. In-scope plan work

1. Re-establish the actual Production target, deployed revisions, all service instances/origins, auth writers and maintenance ownership using read-only evidence.
2. Specify an approved, encrypted, durable backup and isolated restore validation before any Production data reconciliation. Restore proof must match the live schema/migration state and include a documented recovery point.
3. Specify an explicit stop-writers protocol across token issue/revoke, login failure counters, device authorization and Runner/Worker pairing; prove the fence before refreshing any data snapshots.
4. Specify fresh dry-run inventory and safe reconciliation for each G2 state family. Preserve PostgreSQL-only revocations; import eligible Redis-only active revocations idempotently; verify expiries and require a second stable scan with zero unresolved active Redis-only revocations. Do not delete Redis data or use Redis-only rollback.
5. Specify production secret/keyring readiness and cross-instance parity without exposing key bytes. Define where the temporary mirror is enabled, validated, monitored and eventually removed.
6. Define staged negative/positive security smoke checks, failure-mode behavior, evidence capture, stop conditions, and the exact owner approval required before unmasking/reopening traffic.
7. Reconcile the resulting dependency order and evidence gates with Spec 245 R8 while preserving its existing planning files and independent G1/G3–G6 work.

## 4. Out of scope

- Executing systemd unmask/start/restart, opening public routes, or changing the current maintenance fence.
- Production imports, DDL, deletion, Redis-wide shutdown, secret rotation, Cloudflare deployment/configuration, or external-origin changes.
- Rewriting Spec 245's existing master plan or claiming its R8 proposal is implemented/certified.
- Full G2 Durable Objects implementation/promotion in this recovery plan. A future phase must separately prove per-session/user/tenant-wide revoke semantics, cross-object coordination, restart/eviction recovery, fail-closed behavior, and cross-region behavior.
- Full six-group Spec 232 migration, G3–G6 retirement, or Debian retirement.

## 5. Required safety properties

- A revoked token is never accepted because a store, replica, bridge, DO or environment setting is unavailable or stale.
- No active revocation, lockout, device grant or pairing state is silently dropped during migration or recovery.
- The PostgreSQL-only JTI remains enforced; its digest cannot be reversed into a Redis key.
- Reconciliation is repeatable/idempotent and has a before/after audit trail containing aggregate/digest-level evidence only.
- Recovery failure keeps maintenance active. Only fresh production evidence and explicit system-owner approval can authorize reopening.
- `worker_jobs` remains the canonical job authority; this auth recovery cannot disable unrelated Redis responsibilities needed by Voice, Pub/Sub or G3–G6.

## 6. Acceptance outcome

The plan is complete only when the execution order, owners, evidence formats, exact dry-run/apply gates, security tests, service reopening gate, stop/recovery paths, and Spec 245 crosswalk are self-contained and internally consistent. Plan completion itself does not mean Production readiness or authorize service reopening.
