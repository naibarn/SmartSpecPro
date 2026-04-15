# Section 05 - Localization, Help, and Rollout

## Ownership

Add bilingual help content, Settings help entry points, and rollout-safe feature gating for the new worker access plane.

## Target files

- `apps/web/docs/help/en/worker-access-management.md`
- `apps/web/docs/help/th/worker-access-management.md`
- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/components/help/*`
- `apps/web/client/src/locales/en/settings.json`
- `apps/web/client/src/locales/th/settings.json`
- `apps/web/client/src/components/settings/__tests__/...`

## TDD expectations

- Add tests that the help topic loads in English and Thai.
- Add tests that the Settings tab links to the correct help page.
- Add tests for any rollout flag that gates the feature.

## Acceptance checks

- The help text explains create, redeem, revoke, permissions, and quotas in both languages.
- The feature can be gated if the tenant or product rollout policy requires it.
- Operators can discover the workflow without reading source code.

## Risks

- Keep the user-facing terminology consistent between the help content and the Settings tab.
- Ensure the rollout gate fails closed if the feature is not yet enabled.
