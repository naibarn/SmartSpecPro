# Section 02 — Admin UI

## Ownership

- `apps/web/client/src/components/admin/HermesInfrastructureSettingsCard.tsx`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`
- related UI tests

## UI/UX Contract

- Target user: platform administrator enabling Grok generation safely.
- Job: enable the supported private-worker setup without understanding internal
  keys, while retaining advanced operator access.
- Surfaces: primary enablement summary, setup guide, collapsed advanced section.
- Components: card, labelled switch, status badge/callout, native disclosure,
  existing advanced fields.
- States: off, saving, enabled, save error, advanced collapsed/expanded.
- Responsive: single column on narrow screens; switch remains aligned and
  reachable; advanced fields keep existing one/two-column behavior.
- Accessibility: switch has localized accessible name; disclosure is keyboard
  operable; state uses text and icon, not color alone.
- Tokens: reuse current card, muted, border, success, warning, and spacing
  tokens/classes; add no raw color values or dependency.
- Copy: English by default, Thai when active locale starts with `th`; technical
  keys remain unchanged; errors keep server detail.
- Browser evidence: capture off/on and collapsed/expanded states at desktop and
  narrow viewport.

## TDD and acceptance

- Enabling calls the preset mutation once.
- Advanced controls are collapsed initially.
- Tenant description names it as a rollout gate.
