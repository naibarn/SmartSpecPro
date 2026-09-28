# Section 01 — Production Target and Auth Writer Inventory

## Objective and boundary

Establish a current, independently reviewed inventory for the exact G2 recovery target before backup, writer fencing, import, deploy, or reopening. This is a read-only planning/verification stage. Keep Web, Python Backend, and Web watchdog masked. Do not infer the Production target or release from local `.env`, hostname, old snapshots, or current checkout. Do not stop Redis globally; Voice, Pub/Sub, and G3–G6 remain separate.

Unknown target, instance, origin, writer, scheduler, or direct ingress means `BLOCKED_SAFE`. No action in this section authorizes a service change.

## Inputs and work

1. Assign named system owner, DB operator, Redis/auth operator, application/release operator, and independent reviewer.
2. Verify PostgreSQL and token-Redis identities through approved read-only operator channels. Record credential-free fingerprints, environment, collection time, application revision, and migration head. Never record URLs, secrets, raw keys, or environment dumps.
3. Inventory every serving Web/Backend instance and its revision/auth mode, relevant systemd/container supervisors and watchdogs, Cloudflare/tunnel/proxy/LB paths, host ports, public and direct-origin ingress, workers, schedulers, cleanup jobs, and manual/external writers.
4. For JTI, login lockout, device authorization, Runner pairing, and Worker pairing, identify every reader and writer and its exact future fence control. Separately classify non-G2 Redis consumers.
5. Record unresolved origins/writers explicitly; an aggregate assertion such as “all writers covered” does not replace instance-scoped evidence.

Evidence bundle metadata: schema/version, target fingerprints, source revision, timestamps, named collector/reviewer, immutable private evidence references and checksums. Store private evidence outside Git/public application paths. Reject or redact raw JTIs, user identifiers, credentials, pairing/device codes, secret bytes, and credential-bearing URLs.

## Implementation and verification plan

- Start with a read-only inventory and blocker list in `ops/feature-232/g1-g2-production-readiness-runbook.md`; preserve dated observations as history.
- If a machine-readable evidence validator is implemented, keep it pure/local: validate supplied evidence only, never query Production, Redis, PostgreSQL, Cloudflare, or systemd. Structural `PASS` must always retain `productionReady: false`.
- Add focused tests only for any validator/parser introduced: unknown writer/origin blocks; target/revision mismatch blocks; stale/missing approvals block; secrets are not echoed; non-G2 Redis consumers are not included in the stop list.
- Do not add a broad evidence platform or new production discovery mechanism as part of this recovery unless the existing runbook/evidence flow proves inadequate.

## Acceptance and handoff

Section 01 passes only when the target, revision, all serving instances/origins, complete G2 reader/writer set, non-G2 consumers, owners, and exact stop controls are current and independently reviewed. Output: a target/writer map, stop list, evidence references, and explicit unresolved items. Section 02 cannot start with unresolved target identity. `PASS` here is not Production readiness or permission to unmask.

## External gates

Current Production access, owner approval, complete origin/replica/writer evidence, and independent review are external. Missing any leaves the system fenced at `BLOCKED_SAFE`.

## Implementation outcome

- Updated `ops/feature-232/g1-g2-production-readiness-runbook.md` with the read-only per-target, per-instance, ingress, service-control, and G2 writer inventory requirements.
- No Production inventory was gathered in this implementation pass; the external evidence gate remains `BLOCKED_SAFE`.
- Documentation-only section; no test was added or run.
