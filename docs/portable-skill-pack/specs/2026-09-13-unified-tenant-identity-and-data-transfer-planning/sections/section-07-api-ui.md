# Section 07 — API, authenticated workspace, and transfer UI

## Scope

Expose stable tRPC procedures and browser workflows for tenant identity, System Admin move, preview/approval, monitoring, conflict handling, and resume. The UI must be safe, bilingual, accessible, responsive, and explicit about what is excluded or killed.

## Server API ownership

Mount `tenantDataTransfer` from `apps/web/server/routers.ts`; service logic remains in `apps/web/server/services/tenantDataTransfer.ts`. Procedures:

- `preview({ sourceUserId, targetUserId, resourceSelections, clientRequestId? })` → preview ID/fingerprint, users/tenant, counts, first cursor page, queue actions, exclusions, timestamps.
- `listPreviewItems({ previewId, cursor?, classification?, resourceKind? })` → cursor-paginated redacted immutable preview items; read-only and fingerprint-neutral.
- `approve({ previewId, previewFingerprint, confirmation, actionIdempotencyKey })` → canonical operation job ID, operation projection state, accepted timestamp.
- `getOperation({ operationJobId })` → canonical job status, operation state, progress/counts, last safe error, resumable flag, audit summary.
- `listItems({ operationJobId, cursor?, state?, resourceKind? })` → cursor-paginated redacted items.
- `resume`, `retryItem`, `skipItem`, `resolveItem`, `cancel` → guarded original/new outcome with action idempotency key; `resolveItem` is limited to explicit retry-after-repair or skip and never overwrites/merges.

All procedures use protected Tenant Admin (`domain_admin`) scope and derive tenant from the account. Same-tenant source/target user validation is server-side. System Admin move remains a distinct admin procedure and cannot be triggered by transfer API.

## UI files and reuse

- `apps/web/client/src/contexts/AuthContext.tsx` and `TenantContext.tsx`: account workspace versus public branding.
- `apps/web/client/src/layouts/DashboardLayout.tsx` and `Dashboard.tsx`: `WorkspaceIdentityBadge`.
- `apps/web/client/src/pages/AdminUsers.tsx`: `TenantMoveDialog` with exact warning, checkbox, typed confirmation, and server result.
- `apps/web/client/src/pages/TenantDataTransfer.tsx` and `apps/web/client/src/components/tenant-transfer/`: selector, preview, monitor, conflict panel, resume action.
- Reuse `AdminUsers.tsx` privileged-action confirmation, existing async job surfaces, media/library/project selection patterns, existing toast/loading/error patterns, and `en`/`th` locale files. Diverge only for preview-first and per-item conflict/resume because no existing transfer UI exists.

## UI/UX Contract

### Target User / JTBD

- Role: Tenant Admin transferring selected completed work from one user to another in the current tenant; System Admin moving account tenant binding.
- Goal: see exactly what transfers, what is excluded/killed, approve safely, and continue a paused operation.
- Entry: tenant data-management transfer page; System Admin user detail.
- Success: target user receives allowed work, old authorship/billing remains truthful, and resume completes without duplicates.

### Surface Inventory

| Surface | File | Components/behavior |
|---|---|---|
| Workspace identity | Dashboard shell/context | `WorkspaceIdentityBadge`; show account workspace separately from host branding. |
| System Admin move | `AdminUsers.tsx` | `TenantMoveDialog`; target tenant, exact warning, typed confirmation, result. |
| Transfer wizard | `TenantDataTransfer.tsx` | `TransferResourceSelector`, preview, approval, monitor. |
| Transfer monitor | `components/tenant-transfer/` | progress, counts, event summary, `TransferConflictPanel`, `TransferResumeAction`. |

### Component Map

| Component | File/owner | Consumes |
|---|---|---|
| `WorkspaceIdentityBadge` | Dashboard shell/context | Account workspace and public branding projection. |
| `TenantMoveDialog` | `AdminUsers.tsx` | Target tenants and guarded move mutation. |
| `TransferResourceSelector` | `TenantDataTransfer.tsx` | Source/target users and resource handler metadata. |
| `TransferPreviewPanel` | tenant-transfer components | Immutable preview/fingerprint and categorized items. |
| `TransferOperationMonitor` | tenant-transfer components | Canonical job/operation progress and paginated items. |
| `TransferConflictPanel` | tenant-transfer components | Conflict, permanent, unsupported, and `queue_cancelled` records. |
| `TransferResumeAction` | tenant-transfer components | Guarded resume mutation and idempotency result. |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | Skeleton and disabled actions, no false completion | Vitest/browser. |
| empty | Explain no eligible selection | Component test. |
| preview success/error | Categorized counts or safe inline retry error | API/component test. |
| approval pending | Duplicate submit disabled | Idempotency/component test. |
| running | Progress, batch, safe event, allowed cancel | Browser test. |
| paused_on_error | Prominent `ดำเนินการต่อ`, reason, completed/retry/conflict counts | Browser test. |
| conflicts/partial | Completed retained; actionable conflict/permanent/unsupported rows; no overwrite | Browser/component test. |
| completed | Transferred/skipped/excluded/cancelled counts and truthful summary | Browser test. |
| disabled/focus/hover/selected | Accessible, reasoned action states | Accessibility test. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Single column; categories stack; item table becomes cards/scroll region; resume visible | Playwright screenshot. |
| tablet 768x1024 | Two-column summary where safe; readable item list | Playwright screenshot. |
| laptop 1024x768 | Split preview/monitor with actions visible | Playwright screenshot. |
| desktop 1440x900 | Dense summary and paginated item table without clipped actions | Playwright screenshot. |
| small-mobile 360x800 | Confirmation/action controls remain usable | Extended screenshot/manual. |
| wide-desktop 1280x800 | Dense table has no page overflow/clipping | Extended screenshot. |

### Accessibility Acceptance

- Keyboard order: selection → preview → confirmation → monitor → resume/conflict actions; dialogs trap and restore focus.
- Use semantic headings, labels, buttons, table headers/cards, live region for async state, visible focus, and status text not based on color alone.
- Preserve contrast in light/dark themes and honor `prefers-reduced-motion`.

### Copy Contract

- Calm, explicit Thai/English safety-first tone. Required Thai action: `ดำเนินการต่อ`.
- Explain “พื้นที่ทำงานปัจจุบัน”, “ตัวอย่างก่อนโอนย้าย”, “ยืนยันการโอนย้าย”, “งานในคิวจะถูกยกเลิก”, “ไม่โอนเครดิต/ประวัติธุรกรรม”, “ขัดแย้ง”, “ไม่รองรับ”, and completion-with-review.
- Use the exact System Admin warning from section 04. Distinguish invalid invite, tenant mismatch, stale preview, permission denial, active-job block, conflict, unsupported handler, and transient pause. Never display raw provider/database errors.

### Browser Evidence Required

Record evidence under `implementation/ui-browser-evidence.md` using the required viewport/check table from `ui-browser-verification.md`. Cover mismatched branding/workspace, preview, approval, paused-on-error, resume, conflict, completion, and System Admin warning with fake data/adapters only.

## Tests before implementation

- API authorization/idempotency tests for every procedure.
- Context/dashboard tests for authenticated workspace versus branding.
- Admin move warning and action tests.
- Component state/accessibility/copy tests.
- Playwright responsive/keyboard/no-overflow evidence at required viewports.
