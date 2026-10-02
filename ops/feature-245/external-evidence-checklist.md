# Spec 245 — Owner Evidence Collection Packet

**Purpose:** Collect the external facts required to safely finish Spec 245. This is a read-only evidence request. Do not enable routes, run migrations, stop services, change keys, delete Redis data, or power off hosts while collecting it.

## Handling rules

- Return sanitized evidence only. Never include `.env` contents, database URLs, passwords, API tokens, private keys, session cookies, signed URLs, or user payloads.
- For secrets, report only the variable/binding name, whether it is present, and which secret manager owns it.
- Every observation must state environment (`Staging`, `Beta`, or `Production`), account/host identity, timestamp with timezone, source/command, collector, and evidence location.
- Keep Local evidence separate from target evidence. A local test or static code match is not a production observation.
- If a fact cannot be verified, mark it `unknown` and identify the owner needed to close it. Do not infer that a component is unused from a zero count without a defined observation window and attribution method.

## Evidence record template

Copy one record per observation:

```yaml
id: "245-EVIDENCE-..."
environment: "Staging | Beta | Production | Local"
account_or_host_identity: "non-secret stable identifier"
observed_at: "YYYY-MM-DDTHH:MM:SS+TZ"
collector: "name or team"
owner: "accountable person or team"
source: "read-only command, dashboard, migration journal, or trace"
claim: "one verifiable statement"
result: "pass | fail | unknown"
evidence_reference: "sanitized artifact path or internal link"
redactions: ["secret values", "personal data"]
```

## Required evidence by owner

### Web/API ingress owner — P0

- Identify the intended Cloudflare target for `smartaihub.app`, `www.smartaihub.app`, and `api.smartaihub.app`, plus the route/DNS owner and rollback control.
- Provide the deployable artifact/revision, required data/service bindings, auth/session architecture, health endpoints, and one representative authenticated journey.
- Current read-only evidence shows these Tunnel origins still target host ports 3000/8000 with no listeners, and public `/healthz` returns 502. The separate `runtime.smartaihub.app` Worker is not the Web/API application.
- Confirm how traffic can move to the approved target while keeping `smartspec-web.service`, `smartspec-backend.service`, and their watchdog masked. Do not provide secret values.

### Cloudflare/runtime owner

- Account/environment identity, Worker name, deployed version or commit, route, and deploy timestamp.
- Binding names and presence only: Hyperdrive, Queue, Workflow, Containers, Worker App, R2, Vectorize, and KV. Do not send binding IDs if policy treats them as sensitive, and never send values or credentials.
- `CLOUDFLARE_ACTIVATION` value and approved change owner; current readiness response and sanitized reason if not ready.
- For each Queue consumer: queue identity, consumer binding, batch size, max retries, retry delay, DLQ destination, configured concurrency, and alert owner.
- Current Worker logs/metrics for accepted, duplicate, retry, quarantine, and terminal settlement counts over an agreed interval. Include sanitized trace IDs and no payloads.
- Confirm whether the current deployment is cache-only or processes canonical jobs. If it processes jobs, provide the exact approved job-type allowlist and rollback route.

### Database/Hyperdrive owner

- Target database identity (non-secret), migration journal head, schema snapshot/checksum for `worker_jobs`, `worker_job_attempts`, `worker_job_events`, and `worker_job_outbox`, plus pending migrations.
- Required PostgreSQL extensions and versions, grants for the Worker identity, and restore/PITR rehearsal result.
- Driver and Hyperdrive configuration facts: package/version, compatibility date/flags, prepare mode, pool limits, timeout values, and sanitized connection probe result. Do not include the connection string.
- Inventory and target disposition for advisory locks, `LISTEN`/`NOTIFY`, session state, temp tables, and other connection/session features. Hyperdrive support must be demonstrated for each used feature.
- Transaction/ambiguous-commit and idempotency rehearsal: exact sanitized steps, result, timestamp, and rollback evidence.

### Application/job-family owners

Provide one record per queue/job family:

| Field | Required value |
|---|---|
| Family and `jobType` allowlist | Exact names; no wildcard |
| Current producers and consumers | Service/unit/package and accountable owner |
| Canonical record | `worker_jobs`/outbox fields and event identifiers used |
| Trigger | API, callback, schedule, listener, operator action, or recovery loop |
| Runtime target | Existing worker, Cloudflare Queue/Workflow/Container, Runner, or approved exception |
| Side-effect idempotency | Durable key and destination-side enforcement |
| Retry/cancel semantics | Business attempt vs transport retry; max attempts, backoff, terminal/DLQ behavior |
| Resource envelope | Duration, memory/CPU/GPU, filesystem, outbound hosts, storage, and capacity |
| Acceptance and rollback | Representative journey, stop threshold, rollback owner, proof |

Also identify callbacks, webhooks, recurring schedules, startup reconciliation, detached async tasks, and manual/operator triggers. Every trigger must have exactly one active owner and create/advance the durable job intent before business side effects.

### Redis-family owners (Spec 232 G1–G6)

For each family, provide a separate record with: active callers, keyspace/operation types, TTL and atomicity requirements, current traffic attribution, target owner, migration/import/replay method, old/new comparison, canary interval, stop threshold, rollback, retention decision, and evidence that legacy reads/writes have closed.

Special gates:

- **G1:** Fresh Beta Responses API cache miss then hit; tenant/user isolation; fail-open trace; proof that Redis search-cache callers are closed.
- **G2:** Revocation/session/device/worker-pairing state reconciliation, keyring owner and recovery test. Report counts/digests only; never include key material or token values.
- **G3/G4:** Cross-process quota/lease/fencing tests against the target database and allowed connection path.
- **G5:** Realtime/WebSocket ownership, reconnect/replay behavior, consent/revocation delivery, and any Durable Object lifecycle owner.
- **G6:** Each BullMQ/Celery/Beat queue and schedule mapped to one canonical job family, producer, consumer, retry policy, and cutover owner.

### Operations/host owner

- Current service/unit/container/process/scheduler inventory with host identity and observation timestamp. Provide names, ownership, and sanitized start command shape; remove command-line arguments or environment values that may contain secrets.
- Ingress, DNS/tunnel, callback/webhook, outbound network, filesystem/native dependency, backup, and R2/Vectorize destination inventory.
- Approved network-deny procedure, tested rollback command/owner, observation period, health journey, and separate power-off checkpoint.
- Proof that all rare/long-period schedules and callback paths were exercised or safely simulated before retirement.

### Security/key owner

- G2 keyring/revocation authority, secret-manager names and key-version metadata only, rotation/recovery sequence, old-key compatibility result, and rollback owner.
- Confirm that migration evidence contains no raw secret, credential, token, or personal data.

## Wave 1 inventory closeout checklist

- [ ] All 931 source candidates in the 2026-09-28 follow-up local scan are reconciled to source owner, caller, responsibility, trigger, target, and evidence, or explicitly remain blockers. Regenerate this count after source changes.
- [ ] All 109 PostgreSQL session-feature candidates in that scan are individually classified and checked against the selected connection path.
- [ ] Source scan has no unreadable/oversized/symlink gaps; the current local scan reports zero scan problems.
- [ ] Every external service/process/schedule/callback/worker is tied to an environment-specific owner and evidence reference.
- [ ] The manifest is complete enough for `smartaihub-migrate verify`; no `unknown` is converted to a pass by allowlisting.
- [ ] Approved Cloudflare job families have a non-wildcard allowlist and canonical retry/settlement contract.

## Current known blockers from repository evidence

- Spec 232 inventory explicitly lists runtime Redis command/connection telemetry, process/schedule-to-caller mapping, production keyspaces/TTL/rates, and target-account bindings/probes as gaps.
- Prior target observations are dated 2026-09-26 and must be refreshed before cutover claims.
- Cloudflare auth was unavailable in the recorded execution context; no current account/runtime proof can be inferred.
- Worker queue runtime remains intentionally fail-closed until the allowed job families, production handlers, and target readiness are proven.

This checklist does not certify any gate as complete. Attach sanitized evidence, then update the compatibility manifest and section status from those records.
