# Cloudflare migration-preparation implementation review

Date: 2026-09-14
Scope: the ten local Cloudflare migration-preparation recommendations from
Feature 186/187/188. This review is local contract evidence only; it does not
claim a Cloudflare account, Hyperdrive, deployment, provider recovery, or PITR
proof.

## Ten-round convergence ledger

| Round | Review surface | Result / action |
|---:|---|---|
| 01 | Canonical envelope and stable dispatch identity | PASS — envelope fields are bounded and carry the canonical job, attempt, contract, outbox, dispatch, and dedupe identity. |
| 02 | Publication ambiguity and duplicate delivery | PASS — Queues remains unknown without evidence; Workflows/Containers use deterministic references; Worker App exposes a dedupe lookup seam; duplicate delivery test proves one side effect. |
| 03 | Secret, URL, payload-depth, and size safety | PASS — routing keys, secret-like fields, URL/data values, nesting, array size, string size, and envelope size are bounded and tested. |
| 04 | Server-derived tenant authority and capability routing | FIXED — Cron tenant authority was moved to the adapter/server boundary; R2 object keys and Vectorize records now require tenant scope; cross-tenant tests pass. |
| 05 | Artifact and vector durability | FIXED — immutable R2 writes now fail closed when existing-object checksum evidence is missing or conflicts; tenant/job scope segments reject path/control characters; vector upsert requires an expected tenant and rejects mixed scope. |
| 06 | Target-account evidence validator | FIXED — target evidence now rejects sensitive connection/credential values and unknown top-level fields, in addition to sensitive field names; local/target fail-closed tests pass. |
| 07 | Package, Wrangler, CI, and lockfile boundary | PASS — `npm ci --dry-run`, package check, and CI shape pass; activation is disabled, bindings are injected-only, and no deploy/auth step exists. |
| 08 | Manifest and evidence completeness | FIXED — local PITR/checkpoint harness status is separated from external PITR proof; recovery harness, tests, README, and target schema are required evidence. |
| 09 | Legacy compatibility and migration ownership | PASS — audit reports 0 direct BullMQ/Celery producers, 47 adapter-owned submissions, 3 explicit legacy transport calls, and 7 rollback-only status readers; retirement remains an external drain gate. |
| 10 | Integrated local proof and patch hygiene | PASS — Cloudflare package check/test/build, web adapter/target tests (14), local readiness, target-local fail-closed preflight, and `git diff --check` pass. |

## Local evidence

- Provider-neutral runtime package: `apps/cloudflare/`.
- Hyperdrive connection/transaction policy: `apps/cloudflare/src/hyperdrive.ts`.
- Queue consumer with bounded ack/retry/quarantine: `apps/cloudflare/src/queueConsumer.ts`.
- Queues, Workflows, Containers, Cron, Worker App seams:
  `apps/cloudflare/src/nativeAdapters.ts`.
- Artifact/vector tenant and immutability checks:
  `apps/cloudflare/src/artifacts.ts`.
- Snapshot/restore, outbox, callback, settlement, and checkpoint harness:
  `apps/cloudflare/src/recoveryHarness.ts`.
- Local and target evidence validators:
  `apps/web/scripts/verify-cloudflare-local-readiness.ts` and
  `apps/web/scripts/verify-cloudflare-target-readiness.ts`.

## Remaining gates

The following are intentionally not fabricated by local implementation:

- target account bindings and capability probe;
- Hyperdrive origin reachability, cache behavior, TLS, transaction latency, and
  pool-capacity evidence;
- deployment/restart/rollback evidence;
- live provider recovery and backup/PITR restore rehearsal;
- Feature 187 accepted cutover candidate;
- Feature 186 legacy transport drain, compatibility-reader retirement, and
  domain projection/checkpoint evidence.

`productionProof` and `targetAccountProof` therefore remain false in local
mode, and the Wrangler template remains activation-disabled.

## Post-round hardening

The final cross-check after Round 10 identified a defense-in-depth issue in
artifact/vector scope validation: relying only on a string prefix allowed a
malformed tenant or job identifier containing a path separator. The validator
now rejects path/control characters and the Cloudflare package check, test
(13/13), and build were rerun successfully.
