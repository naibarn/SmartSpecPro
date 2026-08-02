# Client restart resilience — quiet retry-through instead of scary errors

Date: 2026-07-28
Origin: User request after feedback ticket #150 (`mcpConnections.listConnections`
502 during the 16:16 smartspec-web restart): "อยากให้ปลดล็อก เรื่องที่เวลา restart
แล้วระบบสร้าง error แสดงให้ user เห็น ... ให้ loop รออีกนิด ระบบทำงานได้ต่ออยู่แล้ว
ไม่ควรสร้าง error ขึ้นมา แต่ให้ระบบรอระบบ restart แล้วกลับมา"

## Problem statement

A `smartspec-web` restart produces a ~20-30s window where nginx cannot reach
the Node upstream; Cloudflare then substitutes its own 502 HTML error page.
The client resilience layer (`requestResilience.ts`, shipped earlier as the
system-wide policy) already retries transient errors, but two gaps let the
restart still surface as a scary error:

1. **Retry window < restart window.** Queries retry at most 4 times with
   capped backoff 1+2+4+5 = ~12s of cumulative delay — all attempts land
   inside the ~25s outage, retries exhaust, and the error surfaces (ticket
   #150 was exactly this: a read-only `listConnections` query).
2. **Wrong toast class for gateway-502 HTML.** `systemErrorMonitor.handleError`
   shows the soft "กำลังเชื่อมต่อใหม่..." toast only for a pure network
   `TypeError` (`isNetworkFailure`). A Cloudflare 502/503/504 HTML response
   (fetch succeeded, gateway failed) is the same "server restarting"
   situation but falls into the scary generic "ระบบขัดข้องชั่วคราว" toast,
   which prompts users to file tickets.

The old policy header says "do not widen without explicit re-approval" —
this user request IS that re-approval (2026-07-28).

## Changes

1. `apps/web/client/src/lib/requestResilience.ts`
   - `RETRYABLE_QUERY_MAX_ATTEMPTS` 4 → 14 (cumulative delay 1+2+4+5×11 ≈
     62s, plus per-attempt request time — comfortably covers a restart).
   - `RETRYABLE_MUTATION_MAX_ATTEMPTS` 5 → 10 (network-failure-only retries;
     a connection-refused during restart fails instantly, so the old 5
     attempts ≈ 17s of delay also sat inside the outage). Mutations still
     NEVER retry 5xx/TIMEOUT (double-charge invariant unchanged).
   - Update the policy doc comment: record the 2026-07-28 re-approval and
     the ≥60s target.
2. `apps/web/client/src/lib/systemErrorMonitor.ts`
   - Treat `isLostUpstreamApiErrorMessage(message)` (already exported by
     `apiResponseDiagnostics.ts`) the same as `isNetworkFailure` for toast
     selection: soft reconnect copy instead of the scary generic copy.
   - Soft copy stays honest for the mutation case (the write may have
     landed): tell the user the server is coming back and to
     refresh/verify before re-clicking.
3. Tests
   - `apps/web/client/src/lib/__tests__/requestResilience.test.ts` — update
     attempt-count expectations; add a case proving a ~25s simulated outage
     is absorbed by the new query schedule.
   - Add/extend coverage that a gateway-502-HTML error message selects the
     soft toast branch (systemErrorMonitor).

## Out of scope

- Auto-retrying mutations on 5xx (unsafe — double-charge).
- Server-side auto-filed `[Auto]` tRPC failure tickets (separate server
  mechanism; restart-window suppression there can be a follow-up).
- nginx/Cloudflare-level changes.

## Risk assessment

- Longer quiet retries on genuinely-down backend: user sees loading states
  for up to ~1 min before the error toast — acceptable per explicit user
  request ("ให้ loop รอ").
- Mutation network-failure retries extended: still gated on
  `TypeError`-class failures (request never reached the server), same
  invariant as the shipped policy.
- Files touched are NOT part of other sessions' in-flight working-tree
  changes (`requestResilience.ts`, `systemErrorMonitor.ts` are clean);
  `apiResponseDiagnostics.ts` is reused read-only.

## Verification

1. `cd apps/web && npx vitest run client/src/lib/__tests__/requestResilience.test.ts client/src/lib/apiResponseDiagnostics.test.ts` (+ any new suite) — green.
2. `npm run build:deploy` (frontend-only, atomic swap, NO service restart —
   deploying this must not itself create a new 502 window).
3. Live check: next service restart should produce no user-visible error
   toast for idle/open pages (queries absorb it silently).
