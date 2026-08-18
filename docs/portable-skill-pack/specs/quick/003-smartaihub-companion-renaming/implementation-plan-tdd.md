# TDD Plan

1. Add failing release-selection and route-alias tests for mixed old/new filenames and canonical/legacy URLs.
2. Implement the dual-pattern resolver and route handlers.
3. Extend failing extension tests for canonical update routes and dual token-message acceptance boundaries; implement the shared constants/service-worker integration.
4. Add failing connect-delivery tests for canonical success, no-receiver fallback, and explicit rejection without fallback; implement a pure delivery helper and integrate it.
5. Add configuration precedence and Dashboard canonical-route/copy assertions; implement focused changes.
6. Synchronize `0.1.138`, package the canonical ZIP, and run focused regression/build/ZIP/diff gates.

Mocks must model `chrome.runtime.lastError` distinctly from an `{ ok: false }` response. No new dependency is required.
