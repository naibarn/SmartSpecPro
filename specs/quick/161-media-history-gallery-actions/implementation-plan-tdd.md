# TDD Guidance

## Tests first

1. Add or extend a small pure eligibility helper test for Media History gallery
   publish visibility: exact Admin + completed + result URL; reject all other
   combinations.
2. Add a server delete contract test covering Admin authorization and tenant
   condition construction/forwarding.
3. Add a Gallery module compile regression so the new accessible Admin action
   remains importable; use the existing page test harness for interaction tests
   when it is available.

## Expected initial failures

- The new eligibility/render assertion should fail before the visible card
  action is added.
- Tenant delete test should fail until the helper/router carries tenant scope.

## Regression commands

- `npm --workspace apps/web test -- <focused test paths> --run`
- `git diff --check`
- `npm --workspace apps/web run typecheck` if the checkout can complete it;
  separate baseline diagnostics from changed-file failures.
