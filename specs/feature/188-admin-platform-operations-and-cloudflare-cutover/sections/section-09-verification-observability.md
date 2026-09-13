# Section 09 — Verification, Observability, and Security
+## UI/UX Contract

### Target User / JTBD

- N/A — observability, security, and evidence tooling only; section-06 presents safe results.

### Existing Pattern Reference

- N/A — no browser component is implemented here.

### Surface Inventory

- N/A — logs, alerts, scripts, and evidence schemas only.

### Component Map

- N/A — no client component is introduced.

### State Matrix

- N/A — operational conditions are verified by audit and failure-injection tests.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — alert/runbook wording is separate from the in-product copy contract.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and final integration.

## Scope

Define the cross-cutting evidence, metrics, alerts, redaction, static/runtime/
network audits, failure injection, and verification commands that prove the
implementation rather than only proving a local build.

## Ownership paths

- apps/web/server/scripts/__tests__/feature188EvidenceBundle.test.ts:
  aggregate evidence, redaction, and proof-surface tests. Verification and
  legacy-audit scripts are owned by sections 03 and 05 and consumed here.
- apps/web/server/services/legacyRuntimeAudit.ts:
  runtime observation/rejection and audit event policy.
- ops/feature-188/evidence/:
  manifest schema, redaction policy, runbook evidence references.
- .github/workflows/feature-188-gates.yml:
  CI invocation and evidence artifact publication.

## Required observability

Logs and metrics include job_id, attempt_id, environment, promotion_id,
batch_id, release SHA, target identity class, adapter, gate, source/target
watermark, lag, action-key hash, and correlation ID. Never log tokens,
passwords, connection strings, signed URLs, raw provider responses, or
unbounded payloads.

Alerts cover unknown/expired gates, target/Hyperdrive mismatch, sync lag,
quarantined batches, checksum/FK/sequence drift, stale jobs/outbox and
unresolved settlements, duplicate/legacy calls, Cloudflare-to-Dev attempts,
post-cutover sync attempts, and missing/expired rollback artifacts.

The evidence bundle separately identifies schema migration, source/target data
promotion, release/build identity, Cloudflare bindings, worker connectivity,
target synthetic tests, activation, recovery, and permanent separation.

## Security controls

Use existing authentication, authorization, CSRF/rate-limit, audit, and admin
boundaries. Enforce environment and tenant scope. Production target and
Hyperdrive binding are server/runtime-derived. Secrets and signed URLs are
redacted at persistence and API boundaries. Source-to-target credentials are
least privilege, time-bounded where possible, and revoked after separation.

The runtime/network audit must prove Cloudflare cannot reach Dev and that
post-cutover promotion credentials cannot write either direction. Unauthenticated
or cross-tenant callbacks are bounded security observations only.

## Failure-injection matrix

Exercise:

- new target unavailable or wrong identity;
- source/target/Hyperdrive connection loss;
- CDC/watermark feed loss, delete loss, reorder, duplicate, and lag;
- snapshot interruption and ambiguous target commit;
- Queue duplicate/lost publish acknowledgement/DLQ;
- Workflow replay/pause/resume and Container restart/timeout;
- stale worker lease and late provider callback;
- gate probe timeout and concurrent Admin action;
- Cloudflare activation response loss;
- legacy producer invocation in activated scope;
- post-cutover synchronization attempt.

Each case must preserve canonical evidence, avoid duplicate paid side effects,
return a truthful blocked/unknown/quarantined result, and be resumable.

## Verification commands

Run package-relative commands from the matching workspace:

- npm --workspace apps/web test -- focused Feature 188 tests;
- npm --workspace apps/web run test:db-integration against isolated DB only;
- npm --workspace apps/web run typecheck;
- npm --workspace apps/web run audit:feature-186-call-sites;
- npm --workspace apps/web run verify:feature-186;
- Feature 188 inventory/promotion/verification/audit scripts in dry-run or
  isolated target mode;
- Cloudflare package typecheck/build/tests with mocked bindings;
- Playwright admin test with canonical viewports;
- YAML and manifest schema validation without deployment.

Record command, commit, environment, target identity class, result, artifact
path, reviewer, and correlation ID. Distinguish local/mock proof from live
production proof.

## TDD stubs

- Structured log redaction and required-field tests.
- Alert condition tests for every stale/mismatch/legacy/separation condition.
- Static/generated/runtime/network audit tests.
- Failure-injection tests for each external dependency and race.
- Evidence schema completeness and tamper/digest tests.
- Verification command safety tests that refuse production side effects.

## Acceptance

Every cutover gate has independently reviewable evidence, failures fail closed,
security boundaries are tested in both directions, and operational alerts
describe canonical state rather than queue length alone.
