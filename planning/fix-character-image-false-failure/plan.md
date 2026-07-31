# Fix: character image generation reports FAILED while the image actually succeeded

Date: 2026-07-31
Status: approved for implementation (owner-directed: "แก้ข้อ 1+2 ก่อนเลย แล้วค่อย deploy พร้อมกัน")

## Problem statement

User: "เหมือนมีหลุดว่าแจ้งล้มเหลวอยู่บ้าง แต่ใน media history กลับมีภาพสร้างเสร็จแล้ว"

Two distinct defects, ONE shared root cause:

> The system declares a generation FAILED based on **our inability to observe it**,
> rather than on an actual failure verdict from the provider.

The image keeps generating and completes — so it lands in Media History while the UI
shows a permanent failure. Credits are spent, the user re-runs, and a duplicate is made.

## Defect 1 (HIGH, active today) — transient poll error becomes a terminal failure

`apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx:2711-2718`
`pollPortraitCandidateTask`'s catch marks `status: "failed"` on ANY thrown error and stops polling.

A provider rate-limit on the STATUS QUERY (`Get task failed: 429`) throws through
`settlePortraitCandidate`, so a purely transient read error permanently kills a healthy job.

Evidence (journalctl, smartspec-web):
```
Jul 31 10:04:30 [tRPC] ERROR: verticalDramaCharacters.settlePortraitCandidate: Get task failed: 429
Jul 31 10:04:31 ... 429
Jul 31 10:04:33 ... 429
Jul 31 10:04:34 ... 429
```
8 occurrences in 2 days; 4 within 5 seconds today (4 candidates polling in parallel, rate-limited
as a group). No 429/backoff/transient handling exists anywhere in that panel (grep: 0 hits).

Sibling defect: `pollCharacterImageTask` (~:2380-2498) has NO catch at all, so the same 429 becomes
an unhandled rejection and the card sticks on "generating" forever. Same root cause, different symptom.

## Defect 2 (MEDIUM, same class) — hard timeout fails the task without asking the provider

`apps/web/server/services/mcpMediaAdapter.ts:1239-1283` (`refreshMcpMediaTaskStatus`)
writes terminal `status:"failed"` purely from `Date.now() - createdAt > hardTimeout`, and `return`s
**before** the real provider-status query that begins further down (~:1285+).

Critically, the code below the timeout block ALREADY implements the correct discipline — its own
comment states that a network/HTTP failure "must NOT be treated as terminal" and only a tool-level
provider rejection counts as definitive. The timeout block simply preempts that logic.

Proven case (DB): character 69, `vertical_drama_character_assets` id 154, task
`mcp_20e57ba1ceaa58fc2883fc5a20a883ca` (higgsfield/gpt_image_2). Its own stored `providerSummary`:
```json
{"status":"failed","isError":false,"hasContent":true,"hardTimeout":true}
```
`isError:false, hasContent:true` — the last real provider signal was NOT an error. The sibling
candidate from the same click succeeded and became the approved portrait.

## Affected files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- `apps/web/server/services/mcpMediaAdapter.ts`
- tests alongside each

These are independent layers with no shared contract change → may be implemented in parallel.

## Proposed changes

### A. Client — never fail a job because a status read failed

1. Classify poll errors: TRANSIENT (429/408, 5xx, network/fetch failure, timeout) vs TERMINAL
   (server explicitly returned `status === "failed"`).
2. On TRANSIENT: do NOT write `failed`. Retry with backoff, continuing the existing attempt budget.
3. On budget exhaustion after transient errors: land in a NON-DESTRUCTIVE state meaning
   "ยังไม่ทราบผล — ระบบเก็บงานไว้ให้" (task retained, re-checkable), never "ล้มเหลว".
4. Only a genuine server-reported `failed` may render as failed (existing behavior preserved).
5. Give `pollCharacterImageTask` the same treatment (it currently has no catch at all).

REUSE the existing shared helpers in `apps/web/client/src/lib/requestResilience.ts`
(`retryDelayMs`, `shouldRetryQuery`/`shouldRetryMutation`, `isNetworkFailure`,
`RETRYABLE_*_MAX_ATTEMPTS`) rather than writing a new retry/backoff implementation.

### B. Server — confirm with the provider before declaring a timeout failure

Reorder `refreshMcpMediaTaskStatus` so the hard-timeout branch performs ONE live provider status
query before writing terminal failure, reusing the existing query code and its existing
tool-level-error vs network-failure discipline:
- Provider says completed  -> settle as completed (self-heals the false failure).
- Provider definitively says failed / doesn't know the job -> fail as today.
- Provider unreachable (network/HTTP) -> do NOT write terminal failure this pass; leave the task
  for the next sweeper run. Add a bounded absolute give-up so a truly abandoned job cannot hang forever.

This also lets the existing hourly sweeper `reconcileStaleMcpMediaTasks` (~:1691-1755) self-heal
the exact DB case found above, instead of manufacturing it.

## Risk assessment

- Defect 1 fix: client-only, contained to two poll functions. Risk LOW. Worst case is a job stays
  "unknown/pending" slightly longer instead of being wrongly failed — strictly better than today.
- Defect 2 fix: `mcpMediaAdapter` is shared by other media flows. Risk MEDIUM. Mitigations: change
  ONLY the hard-timeout branch's ordering, do not alter the provider-query logic itself, do not
  change status semantics for any non-timeout path, and add regression tests for
  completed/failed/unreachable outcomes.
- No DB schema change, no migration. No new external calls in the happy path (the query already runs
  for non-timed-out tasks).
- Must not weaken the timeout escape hatch into an unbounded retry loop.

## Verification

1. Client tests: a thrown 429 during polling does NOT mark the candidate failed and polling continues;
   a server-reported `failed` still renders as failed; budget exhaustion yields the non-destructive
   state; `pollCharacterImageTask` no longer leaves an unhandled rejection.
2. Server tests: timed-out task where provider reports completed -> completed; reports failed -> failed;
   provider unreachable -> NOT terminal this pass; bounded give-up still terminates eventually.
3. Full affected suites green; `pnpm check` adds zero new errors (baseline: 60 project-wide, none in
   the touched files).

## Deploy (after both land, together with the Create-Series work)

```
cd apps/web && npm run build:deploy
sudo systemctl restart smartspec-web.service   # server/*.ts changed -> restart required
```
