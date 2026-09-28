# Section 03 — User readiness

## Ownership

- `apps/web/client/src/components/settings/HermesConnectPanel.tsx`
- related UI tests

## UI/UX Contract

- Target user: tenant member connecting a personal Grok account.
- Job: understand exactly what is ready, what is missing, and the next action.
- Surfaces: disabled explanation, readiness checklist, existing connection flow.
- Components: card, checklist rows, localized status labels, existing buttons.
- States: loading, tenant disabled, platform disabled, private scope disabled,
  no worker, no account, ready/authorized, request error.
- Responsive: checklist and actions stack on narrow screens; no horizontal
  overflow.
- Accessibility: textual Ready/Action required status and semantic list; no
  color-only meaning.
- Tokens: reuse current dashboard card and semantic muted/success/warning styles.
- Copy: English for English UI, Thai for Thai UI; no mixed-language generic
  fallback except stable product/technical names.
- Browser evidence: disabled platform, enabled/no worker, and authorized states
  in both languages.

## TDD and acceptance

- Disabled explanation names platform and/or tenant gate.
- Enabled panel shows worker and Grok account readiness.
- Existing consent and device authorization behavior is unchanged.
