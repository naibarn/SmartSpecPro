# Section 06 — Admin Summary, Detail Tabs, and Responsive UI

## Objective

Keep the approved Hybrid information architecture and make the summary directly
answer the Admin's four questions: current status, numbers used, emerging
problems, and next action.

## Scope and ownership

Split `CapacityAdvisorPanel.tsx` into summary, system/storage, workload, and
history responsibilities plus pure formatting/status helpers. Consume server DTOs
only; do not recompute thresholds/forecasts in React.

Summary shows overall verdict, coverage/freshness/namespace banners, exact
current value/threshold/unit/time/source, detected risks, deterministic action
class, LLM explanation, confidence/limits, and the next human action. Details
show temp mounts, Docker/root storage, CPU/RAM/service data, queues/workers/
concurrency/long-running jobs/duration/retries/errors/throughput, and history.
Unavailable thresholds must say unavailable, never display zero.

Implement explicit no-assessment, loading, running, success, watch/action/critical,
insufficient, stale, partial, failed, query-error, and disabled states. Manual
run requires confirmation, disables duplicate action, shows progress, and keeps
the last successful result on failure. Preserve menu entry and Admin-only route.

## UI/UX Contract

### Target User / JTBD

Admin/operator deciding whether to continue Home Server, optimize,
scale up, or begin Cloud review.

### Surface Inventory

Dashboard Admin menu; Admin Monitoring Capacity Advisor default
summary; System; Workload; History; manual run action.

### Component Map

Summary owns interpretation and action copy; detail tabs own
evidence tables; DTO/server owns truth; helpers own formatting/localization.

### State Matrix

Loading skeleton; no assessment call-to-action; running phase;
healthy/watch/action/critical verdict; insufficient/stale/partial banners;
failed safe error with retry; query error distinct from no data; focus/selected
tabs visible and keyboard usable.

### Responsive Matrix

390px stacks cards and scrolls bounded tables; 768px uses
two-column cards; 1280px keeps summary compact and details wide; 1440px constrains
line length and avoids empty spread.

### Accessibility Acceptance

Semantic tabs/tabpanels, labeled buttons, text plus color/icon
for severity, table headers, visible focus, contrast consistent with app tokens,
reduced-motion support, and no information conveyed by color alone.

### Copy Contract

Concise Thai primary labels (`สถานะปัจจุบัน`, `ตัวเลขอ้างอิง`,
`จุดที่ต้องเฝ้าระวัง`, `ควรทำอะไรต่อ`, `ข้อมูลไม่เพียงพอ`, `ข้อมูลล้าสมัย`) with
stable English metric names as secondary text. Never show raw internal errors.

### Browser Evidence Required

Authenticated screenshots at 390/768/1280/1440 for empty,
healthy, warning/critical, insufficient/stale, running, failed, and detail-tab
states; verify menu, confirmation, keyboard tabs, table overflow, and DOM secret
absence.

## TDD first

Test DTO rendering, exact numbers/thresholds, temp/workload details, unavailable
threshold copy, every state, confirmation/duplicate-run behavior, tab semantics,
responsive layout, focus, and error preservation.

## Acceptance

An Admin can understand the verdict from the first tab without opening details,
while all deep evidence is available in other tabs and clearly labeled.

## Dependencies

Sections 01–05, especially the final DTO and run lifecycle.
