# Section 03: Sharing Policy, Budgets, Approvals, Usage, and Retention

## Goal

Implement safe group sharing for MCP connections, including owner acknowledgement, active membership checks, budgets, concurrency, shared video approvals, usage events, audit logging, and retention.

## Depends On

- Section 01 schema.
- Section 02 connection service/router.

## Files

Create:

- `apps/web/server/services/mcpConnectionSharingService.ts`
- `apps/web/server/services/mcpUsageRetentionService.ts`
- `apps/web/server/jobs/mcpUsageRetentionJob.ts`
- `apps/web/server/services/__tests__/mcpConnectionSharingService.test.ts`
- `apps/web/server/services/__tests__/mcpUsageRetentionService.test.ts`

Modify:

- `apps/web/server/routers/mcpConnections.ts` to wire full share/usage behavior.

## Sharing Policy

Owner use:

- connection owner may use connected own account without a share.

Shared use requires:

- same tenant;
- connection status `connected`;
- enabled share;
- actor active membership in `group_members.status = "active"`;
- requested asset type/tool/model allowed by share policy;
- budget and concurrency allow the job;
- owner approval for shared video jobs in v1.

Tenant admin force-disable:

- uses existing Tenant Settings/feature-flag UI in v1; do not require env-file edits;
- blocks new MCP/group-sharing jobs immediately;
- preserves connection records and audit history;
- preserves owner personal connections when only group sharing is disabled;
- lets already-running jobs finish/fail through normal task rules.

## Budgets And Concurrency

Budget reservation must be atomic with job creation. Daily windows resolve in this order:

1. share `dailyWindowTimezone`;
2. tenant timezone;
3. owner timezone;
4. UTC.

Rules:

- queued cancel releases reservation;
- processing cancel remains counted;
- failed jobs count unless provider execution never started;
- concurrency counts queued and processing jobs and releases on terminal state.

## Shared Video Approval

V1 shared video requires owner approval per job by default.

Approval must bind to:

- tenant;
- connection;
- share;
- group;
- owner;
- actor;
- prompt/request hash;
- redacted request summary;
- expiry.

Approval can be consumed once only, atomically with job creation.

## Usage Events

Record redacted usage events for:

- connect/reconnect/disconnect;
- share create/update/disable/delete;
- approval pending/approved/denied/expired/used;
- generation start/completion/failure/cancel;
- policy deny;
- fallback approval;
- rate limit.

Do not store raw prompts, raw reference URLs, tokens, session IDs, or full provider responses.

## UI/UX Contract

### Target User / JTBD
N/A for this backend service section. User-facing share/usage UI is implemented in Section 05.

### Surface Inventory
N/A. No browser-visible surface is modified here.

### Component Map
N/A. No frontend components are created or modified.

### State Matrix
N/A. Backend policy states are exposed to UI later as safe statuses.

### Responsive Matrix
N/A. No browser layout changes.

### Accessibility Acceptance
N/A. No interactive UI changes.

### Copy Contract
N/A. Backend error codes must remain safe; final copy is handled by UI sections.

### Browser Evidence Required
Skipped for this backend-only section.

## Retention

Implement service logic first, then schedule:

- usage events follow tenant audit policy with beta minimum of 180 days;
- redacted provider summaries compact/purge after 30 days;
- schema snapshots keep 90 days or latest 10 hashes;
- OAuth states expire after 10 minutes and are consumed after callback.

Retention must not delete media tasks, output files, or tenant-required audit events.
Retention must also avoid orphaning audit trails: connection/share rows referenced by usage events should be soft-deleted or preserved with safe labels until tenant audit retention allows compaction.

## Tests First

- Test: owner can use own connection.
- Test: non-owner cannot use unshared connection.
- Test: active group member can use enabled share.
- Test: pending/removed member denied.
- Test: cross-tenant group denied.
- Test: asset/tool/model allowlist enforced.
- Test: budget reservation is atomic under concurrent jobs.
- Test: queued cancel releases budget and concurrency.
- Test: processing cancel remains counted.
- Test: shared video requires owner approval.
- Test: approval expires and cannot be reused.
- Test: admin force-disable blocks new shared jobs.
- Test: disabling group sharing preserves owner connection records and personal eligibility.
- Test: usage event redaction removes secrets/raw prompts/raw URLs.
- Test: retention compacts summaries without deleting media tasks.
- Test: retention does not orphan usage events from connection/share audit records.

Test file targets:

- `apps/web/server/services/__tests__/mcpConnectionSharingService.test.ts`
- `apps/web/server/services/__tests__/mcpUsageRetentionService.test.ts`

Verification commands:

- `cd apps/web && npm test -- server/services/__tests__/mcpConnectionSharingService.test.ts server/services/__tests__/mcpUsageRetentionService.test.ts`
- `cd apps/web && npm run check`

## Acceptance Criteria

- Sharing fails closed.
- Usage/audit trail captures owner and actor.
- Budget/concurrency behavior is deterministic.
- Shared video approval is one-time-use and auditable.
- Retention is idempotent and safe to schedule.
