# TDD Plan

1. Add failing pure tests for version parsing/comparison, origin-scoped cache freshness, release payload validation and same-origin fallback, native metadata, dismissal, and precedence.
2. Implement only enough shared logic to pass those tests.
3. Wire the service worker and panel to the tested state contracts.
4. Run `npm run test:update`, `npm run typecheck`, and `npm run build` from `apps/extension`.
5. Bump all version sources, run `npm run package:web-dashboard`, inspect the ZIP manifest and bundle, confirm `0.1.136` remains, and run focused `git diff --check`.

Chrome runtime behavior is verified through pure state boundaries plus a production bundle. Authenticated browser installation and production deployment remain explicit external checks.
