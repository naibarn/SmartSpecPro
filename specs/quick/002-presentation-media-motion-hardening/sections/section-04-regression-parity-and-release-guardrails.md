# Section 04: Regression Parity And Release Guardrails

## Goal

ปิดงานด้วย guardrails ที่กันการพังซ้ำ ทั้ง semantic drift, slideshow timing regressions, และ export UX omissions

## Scope

- Re-run/update targeted suite across shared/client/server layers
- Add any missing fixture/parity tests discovered during sections 01-03
- Document residual risks if a full browser-level visual regression is still deferred

## Likely Files

- `apps/web/shared/presentation/mediaMotion.test.ts`
- `apps/web/shared/presentation/contracts.test.ts`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/components/presentation/ExportDialog.test.tsx`
- `apps/web/server/routes/slideRender.test.ts`
- `apps/web/server/services/presentationExportDegradation.test.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`

## Release Guardrails

- Any new preset must be present in:
  - shared contract
  - shared helper tests
  - property panel preset list
  - route runtime parity checks
- Any static export warning code added for motion must have:
  - shared category mapping
  - backend generation test
  - user-visible message coverage

## Verification Checklist

- Shared helper outputs are deterministic
- Route runtime includes updated motion semantics
- Slideshow pause/resume tests pass reliably
- Export UI warning tests pass
- Targeted suite passes in an environment where route tests can bind local ports
