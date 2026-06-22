# Section 10: Admin Worker Monitor UI

## Goal

Build admin visibility and controls for connected workers, readiness, sharing
scope, current job, queue state, diagnostics, and pause/drain/revoke actions.

## Dependencies

- section-01-contracts-and-flags
- section-02-worker-queue-scheduler
- section-03-lease-attempt-watchdog
- section-04-artifact-verification
- section-06-worker-connect-auth

## In Scope

- Admin list/detail APIs.
- Worker fleet table.
- Queue/job visibility.
- Admin actions: pause, drain, revoke, update sharing policy.
- Diagnostics display with safe redaction.
- Operational metrics and audit-event visibility.

## Files To Review

- existing admin routes/components
- `apps/web/client/src/pages/AdminMarketplaceCapture.tsx`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/routers/__tests__/monitoring.workerFleet.test.ts`

## Files To Change

- admin worker router/procedures
- admin client route/component
- worker fleet/policy services if needed
- tests for admin APIs and UI

## Test First

- Test: non-admin cannot list tenant worker fleet.
- Test: admin sees worker owner, sharing scope, status, readiness, current job.
- Test: pause/drain prevents new claims.
- Test: revoke invalidates worker connection/tokens.
- Test: diagnostics redact tokens/signed URLs/local sensitive paths.
- Test: queue view shows queued/running/stalled/completed jobs.
- Test: worker state filters work.
- Test: admin monitor shows queue depth, oldest waiting job, verification
  failure count, stale upload rejection count, reassignment count, and runtime
  version distribution.
- Test: admin monitor shows safe security warning counts for token replay,
  device proof mismatch, refresh-token reuse, and auto-blocked worker
  connections without exposing tokens or raw device secrets.
- Test: audit trail shows connect, claim, stall, reassign, upload, verification,
  token replay/device proof mismatch, cancel, fail, and complete events with
  redaction.

## Implementation Steps

1. Add admin procedures for workers and worker jobs.
2. Extend worker projection with owner, sharing, readiness, heartbeat, current
   job, and warning fields.
3. Add worker fleet table and detail drawer/page.
4. Add queue/recent jobs tab.
5. Add pause/drain/revoke/update policy actions with confirmation and disabled
   reasons.
6. Show diagnostics safely and avoid raw secrets.
7. Add metrics cards/filters for queue depth, oldest waiting job, runtime
   versions, verification failures, stale upload rejections, reassignment count,
   and worker cooldown/block state.
8. Add safe audit trail access for worker/job transitions.

## UI/UX Contract

### Target User / JTBD

- Role: tenant admin/operator.
- Goal: understand worker fleet health and unblock render queue issues.
- Entry point: admin worker monitor.
- Success outcome: admin sees connected workers, current jobs, readiness, and
  can pause/drain/revoke safely.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Admin worker monitor | new/admin route | fleet, jobs, actions |

### Component Map

| Component | File | Owns | Consumes |
| --- | --- | --- | --- |
| Worker table | admin route | fleet rows/filtering | admin API |
| Worker detail | admin route | readiness, diagnostics, current job | admin API |
| Admin actions | admin route | pause/drain/revoke | action APIs |
| Queue tab | admin route | queue/recent job table | admin API |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | table skeleton | UI test |
| empty | no workers connected | UI test |
| online/offline | status badges | UI test |
| unhealthy | warning detail | UI test |
| disabled/draining | no new claims copy | UI test |
| action error | safe admin error | UI test |
| disabled/focus/hover | clear disabled reasons and focus rings | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | admin table becomes card/list if route allows mobile | screenshot/manual |
| tablet 768x1024 | table scrolls inside content, no page overflow | screenshot/manual |
| desktop 1440x900 | dense table + detail panel | screenshot/manual |
| small-mobile 360x800 | extended if mobile admin supported | screenshot/manual |
| laptop 1024x768 | table columns remain usable | screenshot/manual |
| wide-desktop 1280x800 | fleet and queue panes fit cleanly | screenshot/manual |

### Accessibility Acceptance

- Keyboard path: filter, open detail, actions, confirmations.
- Focus visibility: action/menu/focus states visible.
- Labels/semantics: table headers and icon buttons labeled.
- Contrast: status/warning colors readable.
- Reduced motion: no required animation.

### Copy Contract

- Tone: operator-focused, concise Thai/English.
- Required labels: Online, Offline, Unhealthy, Disabled, Draining, Runtime ready,
  Runtime blocked, Current job, Pause, Drain, Revoke.
- Error copy: safe but actionable, with diagnostics link for admin.
- Empty/loading/success copy: operational, not marketing.

### Browser Evidence Required

- Capture or manually record desktop/laptop/wide desktop; tablet if admin route
  is available at tablet width.

## Acceptance Criteria

- Admin can see which worker is doing which job.
- Admin can identify no-worker/runtime-blocked/stalled conditions.
- Admin actions are audited and respect permissions.
- Admin can observe rollout health without reading server logs.

## Implemented Notes

- Added `getWorkerQueueOverview` to `apps/web/server/services/workerFleetService.ts`.
- Added `monitoring.getWorkerQueueOverview` admin procedure in
  `apps/web/server/routers/monitoring.ts`.
- Extended `apps/web/client/src/pages/AdminMonitoring.tsx` with a render worker
  queue card showing queued/active/stalled/reassignable jobs, verification
  failures, stale upload rejection count, security warning counters, recent
  jobs, and runtime version distribution.
- Added coverage in
  `apps/web/server/services/__tests__/workerFleetService.test.ts` and
  `apps/web/server/routers/__tests__/monitoring.workerFleet.test.ts`.
