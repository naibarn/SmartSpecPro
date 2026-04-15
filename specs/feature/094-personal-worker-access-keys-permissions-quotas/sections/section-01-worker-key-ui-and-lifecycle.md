# Section 01 - Worker Key UI and Lifecycle

## Ownership

Build the user-facing `Workers` tab in Settings and the create/list/revoke lifecycle for personal worker access keys.

## Target files

- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/components/settings/WorkerAccessPanel.tsx` or a similarly named new panel
- `apps/web/client/src/locales/en/settings.json`
- `apps/web/client/src/locales/th/settings.json`
- `apps/web/client/src/components/settings/__tests__/...`

## TDD expectations

- Add a failing component test for the missing `Workers` tab.
- Add a failing component test for one-time secret display.
- Add a failing component test for revoke/update states.

## Acceptance checks

- The tab appears in Settings with a clear user-facing label.
- The create flow captures runtime family, optional expiry, and an optional friendly label.
- The raw key is shown once and then hidden forever.
- The list shows key status, expiry, last used time, and revocation state.

## Risks

- The panel must stay readable on desktop and tablet widths.
- The panel should not expose admin-only controls to the wrong role.
