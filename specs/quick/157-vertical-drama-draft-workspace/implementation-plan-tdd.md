# TDD Guidance

1. Add route helper tests for new, existing draft, and series Planning URLs.
2. Add server service/router tests for workspace ownership, max snapshot size,
   expected-version conflict, and successful version increment.
3. Add UI tests proving page mode renders without a modal overlay and modal mode
   remains unchanged.
4. Add recovery tests proving a workspace snapshot hydrates form/step and that a
   generated draft ledger still hydrates through the existing path.
5. Add Planning tab tests for direct query deep-link, status cards, and canonical
   tab links.
6. Run focused tests first, then filtered typecheck and browser checks.
