# TDD Guidance

1. Extend service tests first: a disabled response distinguishes platform and
   tenant gates while remaining fail-closed.
2. Update admin card tests: primary enable calls the preset mutation; advanced
   controls are absent until the disclosure is opened.
3. Update user panel tests: disabled states name the exact missing gate, and
   English/Thai locale changes select matching copy.
4. Retain regression tests for consent, private worker selection, device code,
   probing, quota, and disconnect.
5. Run focused Vitest files, TypeScript checking for the web package, and
   formatting/diff checks.
