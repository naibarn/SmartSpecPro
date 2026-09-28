# TDD Guidance

1. Add a failing assertion to the sequential UI wiring test that locates the five-hook Feature 136 block and verifies it occurs before the `product.isLoading` guard.
2. Run the focused test and capture the expected failure against the current ordering.
3. Move the hook block above the guards without changing its implementation.
4. Re-run the focused sequential UI and auto-review polling tests.
5. Run TypeScript and production build verification.

No mocks or database fixtures are required because the regression is a static component-structure invariant.
