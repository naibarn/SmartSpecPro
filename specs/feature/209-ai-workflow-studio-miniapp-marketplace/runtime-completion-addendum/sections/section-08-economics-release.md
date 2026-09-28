# Section 08 — Economics, release gates and production evidence

## Objective

Connect Workflow/Mini App invocation to Spec 207 economics and finish the
release evidence chain without claiming local mocks as production proof.

## Dependencies and ownership

- Depends on Sections 01–07 and upstream Feature 195/207/210 contracts.
- Owns workflow economic correlation, release gates, failure drills and parent
  Spec 209 documentation synchronization.
- Does not create a wallet, ledger or provider runtime.

## Planned changes

1. Correlate estimate, authorization, reservation, capture, release and
   reconciliation-required outcomes with run/Job/attempt/event IDs.
2. Emit creator/funder/provider/platform allocation facts to Spec 207.
3. Add audit fields linking exact version, run, Job, attempt, event, artifact
   and economic receipt while redacting secrets.
4. Add release checks for migrations, feature flags, contract versions, i18n,
   browser evidence, readiness and rollback behavior.
5. Run failure drills for duplicate invoke, ambiguous effect, artifact failure,
   approval expiry, cancel race, retry budget and settlement mismatch.
6. Synchronize parent Spec 209 completion/release gate/acceptance checklist and
   package manifest only according to existing package convention.

## Rollout and rollback contract

Use an additive expand/migrate/contract sequence. Deploy schema and projection
compatibility before enabling run admission, canary the feature flag by tenant,
and drain or fence active runs before rollback. Rollback must preserve every
record referenced by a canonical Job, attempt, artifact or economic receipt;
rebuild/reconciliation steps are required for each projection before the flag
can be re-enabled.

## TDD-first verification

- Economic replay/idempotency, reservation release/capture and ambiguous
  receipt tests.
- No success-only creator fee on failed/unverified effect.
- Cross-tenant audit/redaction correlation.
- Migration, feature flag, release gate and browser evidence checks.

## Acceptance

The release gate can demonstrate exact version → run intent → canonical Job and
attempt → event/effect → artifact/output → economic receipt/settlement, or a
durable reconciliation-required stop. No unresolved external certification is
silently marked as complete.

## UI/UX Contract

### Target User / JTBD

Release operators and product owners need a compact, truthful readiness view
that exposes missing evidence without turning test doubles into production
success.

### Surface Inventory

- Existing admin/release readiness and feature-flag surfaces.
- Existing run detail cost/economic correlation and audit timeline.
- Existing failure-drill evidence links and rollback checklist.

### Component Map

- Reuse current readiness cards, status badges, timeline, evidence links and
  confirmation patterns.
- Add gate-by-gate evidence rows and reconciliation-required warnings; do not
  add a second billing or settlement UI.

### State Matrix

| State | Required UI | User action |
|---|---|---|
| not-ready | Missing gate and owner | Resolve or keep disabled |
| ready-for-canary | Evidence links and scope | Enable approved flag |
| blocked | Security/economics/release reason | Inspect and remediate |
| rollback-required | Incident and rollback status | Execute approved rollback |
| reconciled | Correlated run/effect/artifact/receipt chain | Archive evidence |

### Responsive Matrix

Keep the release gate readable at 390x844, 768x1024, 1280x800 and 1440x900;
gate rows may stack on mobile, while blocked/reconciliation-required status and
the responsible action remain visible without horizontal scrolling.

### Accessibility Acceptance

Expose gate state, evidence links and ownership as text, preserve keyboard
navigation through all rows, announce flag/rollback state changes, and never
use color as the sole readiness indicator.

### Copy Contract

Use “ยังไม่พร้อมเปิดใช้งาน”, “พร้อม Canary ตามขอบเขต”, “หยุดเพื่อ
ตรวจสอบการกระทบยอด” and “หลักฐานยังไม่ครบ”; never use “Production ready” when
browser, provider, settlement or rollback evidence is missing.

### Browser Evidence Required

Capture the release/readiness view and run-to-receipt evidence links at the four
responsive sizes, plus a negative proof that blocked gates keep Run/Marketplace
invoke unavailable.
