# Section 02: Contextual Help Buttons

## Goal

Expose the new topics from every Grok via Hermes setup and monitoring surface.

## Files

- `apps/web/client/src/components/settings/HermesConnectPanel.tsx`
- `apps/web/client/src/components/admin/HermesInfrastructureSettingsCard.tsx`
- `apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx`
- `apps/web/client/src/pages/WorkerAppConnect.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- Corresponding focused component/page tests

## UI/UX contract

- Existing pattern: reuse the shared `HelpButton` used on Settings and
  AdminMonitoring pages; do not introduce a new dialog or visual system.
- States: Help is visible when enabled, disabled, disconnected, offline, or not
  configured. The shared panel owns loading, missing-topic, and locale states.
- Responsive: existing flex wrapping must keep labels usable at 390px, 768px,
  and 1440px widths.
- Accessibility: use visible localized labels and the shared button's keyboard
  and accessible-name behavior.
- Copy:
  - Connections: `Grok via Hermes Help` / `คู่มือ Grok via Hermes`
  - Admin: `Setup Help` / `คู่มือการตั้งค่า`
  - Worker App: `Worker App Help` / `คู่มือ Worker App`
  - Monitoring: `Grok Media Help` / `คู่มือ Grok Media`
- Browser evidence: confirm each authenticated route opens the intended topic
  when a suitable local session is available; otherwise record focused
  component tests as the non-browser proof and state the blocker.

## Verification

Focused tests assert the `page`, `topic`, and localized label for each
integration. Review the rendered header/trailing layouts for wrapping.

## Implemented

- Added localized Help buttons to all five target surfaces.
- Kept the connections guide reachable in both enabled and disabled states.
- Used flex wrapping in every new button container.
- Updated focused tests and current AdminMonitoring fixtures.
- Final focused suite: 6 files, 72 tests passing.
- Authenticated browser evidence was not captured in this session; component
  rendering and Help content routing provide automated proof for every target.

