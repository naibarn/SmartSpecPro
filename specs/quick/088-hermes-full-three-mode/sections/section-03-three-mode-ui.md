# Section 03: Three-Mode UI

## Ownership

- `apps/web/client/src/components/settings/HermesConnectPanel.tsx`
- `apps/web/client/src/components/settings/__tests__/HermesConnectPanel.test.tsx`

## UI/UX Contract

- Target user: tenant admin or member connecting Grok.
- Surfaces: readiness summary, central account, personal-on-server,
  personal-on-device, consent, device code, Worker App setup.
- States: loading, ready, scope disabled, worker offline, no app, pending,
  authorized, failed, reconnect required.
- Responsive: one column on narrow screens, two-column readiness where space
  permits; actions remain visible without horizontal scrolling.
- Accessibility: labeled controls, disabled reason adjacent to the action,
  status conveyed with text as well as color.
- Copy: Thai/English selected from current language; clearly state account
  owner, quota owner, processing location, and data-sharing implications.
- Browser evidence: desktop and narrow viewport screenshots plus functional
  connect-flow interaction.

## Acceptance

- No button appears actionable when its scope/worker is unavailable.
- Central account meaning is explicit.
- Personal server and private-device modes cannot be confused.
- Worker App install/setup action is discoverable.
