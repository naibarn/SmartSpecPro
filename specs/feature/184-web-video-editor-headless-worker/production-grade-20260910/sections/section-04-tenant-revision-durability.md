# Section 04 — Project tenant isolation, revision CAS and recovery

## Goal

Ensure every editor mutation and Worker output is owned by the right tenant and
cannot overwrite a newer revision.

## Implementation

- Add/derive a project tenant invariant. If a direct tenant column is added,
  backfill and enforce it; otherwise every query joins the authenticated user's
  tenant membership and project ownership in one transaction.
- Persist immutable revision documents with canonical asset refs, timeline
  version, plan hash, mutation ID and source fingerprints. Use optimistic CAS
  for autosave, apply, retry and replay; return a typed conflict with current
  revision metadata.
- Review/apply is explicit. Analysis, subtitles, reframe, privacy and render
  outputs are private until review; stale results remain inspectable but cannot
  become current.
- Add cleanup/tombstones for removed assets, orphan upload sessions, failed
  artifacts and expired leases.

## Tests and proof

Two-tab mutation race, stale Worker result, tenant cross-read, replay exact vs
equivalent, duplicate callback and recovery-after-restart tests. Run migration
dry-run and rollback rehearsal on a database copy.

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
