# Section 09 — Security, credits and observability

## Goal

Protect tenant media and paid operations while making failures diagnosable.

## Implementation

- Validate managed asset ownership at submit, claim-time URL mint, refresh and
  publication. Signed URLs are short-lived execution metadata and never enter
  immutable hashes or logs. Worker paths are staged and confined.
- Reserve/refund credits exactly once for paid AI operations; show one clear
  confirmation at the owning action. Record provider/model/prompt revision,
  consent and cost provenance.
- Emit structured audit events for submit, claim, progress, adapter block,
  artifact verify, review/apply, cancel, retry and rollback. Redact tokens,
  signed URLs, prompts containing secrets and local paths.
- Dashboards cover queue latency, capability blocks, lease loss, artifact QC
  failures, upload aborts, Redis readiness/memory and per-operation success rate.
  Alerts link to runbooks and tenant/job trace IDs.

## Tests and proof

Authorization matrix, signed URL expiry/refresh, replay/idempotency, credit
reservation failure, log redaction and alert-fire tests. Run a security review
before enabling external adapters.

## UI/UX Contract

### Target User / JTBD
Editors need to complete the requested media task, understand whether it runs in the browser or Worker, and recover safely from a blocked or failed operation.

### Surface Inventory
The owning editor panel, Worker handoff state, Worker Jobs result/review state, and Dashboard deep link are the required surfaces for this section.

### Component Map
Reuse the existing Phase 3 editor shell and shared operation status components. Add a typed panel state, operation capability badge, progress/error banner and review action where this section owns a user action.

### State Matrix
`idle` → `editing` → `preflight` → `queued` → `running` → `review` → `applied`; `blocked`, `failed`, `canceled`, `stale` and `expired` are explicit recoverable states. No unavailable capability is shown as success.

### Responsive Matrix
Verify the surface at 390x844, 768x1024, 1280x800 and 1440x900. Horizontal timeline overflow is intentional and scrollable; dialogs must remain usable without clipping.

### Accessibility Acceptance
Every action has an accessible name, keyboard path, visible focus, disabled reason and status announcement. Errors identify the next recovery action without exposing tokens, paths or signed URLs.

### Copy Contract
Use `Worker Jobs` / `คิวงาน Worker` for the queue. Use `กำลังตรวจสอบความสามารถ Worker`, `ต้องติดตั้ง Worker adapter`, `รอตรวจสอบผลลัพธ์` and `ผลลัพธ์ล้าสมัย` for the corresponding states.

### Browser Evidence Required
Capture a focused browser trace or screenshot for the happy path and each blocked/error state. Record viewport, operation, capability manifest revision and whether the proof is local, staging or production.
