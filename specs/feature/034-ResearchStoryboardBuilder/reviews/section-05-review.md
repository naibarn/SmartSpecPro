# Section 05 Review

## Scope reviewed

- `apps/web/server/services/agencyExperienceTemplateService.ts`
- `apps/web/server/services/agencyExperienceTemplateService.test.ts`
- `apps/web/server/routers/agency.ts`
- `apps/web/server/routers/__tests__/agency.test.ts`
- `apps/web/server/services/agencyBridge.ts`
- `python-backend/app/api/agencies.py`
- `python-backend/app/services/agency_service.py`

## Findings

- No blocking correctness or security findings in the Section 05 slice.

## Checks performed

- Verified built-in templates are seeded automatically before template listing and cloning.
- Verified cloned drafts inherit the template agent default tools.
- Verified resolved retrieval scope is propagated from Node to Python and persisted in run metadata.
- Verified the Python runtime appends the scoped retrieval instruction per run instead of mutating the stored template definition.

## Residual risk

- Built-in experience identity currently derives from the cloned agency slug prefix, so later slug edits can break automatic template-default scope resolution.
- Scope handling in this phase is backend-audited plus prompt-level guidance; it is not yet a deep tool-config or collection-level enforcement layer.
