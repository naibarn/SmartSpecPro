# Section 02 - Connection history UI

Ownership: `HermesConnectPanel.tsx` and its focused tests.

## UI/UX Contract

- Target: a user connecting Grok who needs the current action without old rows
  dominating Settings.
- Components: active connection list, controlled history disclosure, history
  count, five-row slice, show-more action, central-only admin list.
- States: empty, collapsed history, expanded history, more-than-five,
  connect-error retry, active authorized/pending.
- Responsive: stacked actions on narrow screens; no horizontal overflow.
- Accessibility: real button disclosure with `aria-expanded`,
  `aria-controls`, keyboard activation, and descriptive bilingual labels.
- Copy: Thai when the page is Thai and English when English is active.
- Browser evidence: Settings screenshot at desktop and narrow viewport plus
  interaction proof for expand/show-more.

