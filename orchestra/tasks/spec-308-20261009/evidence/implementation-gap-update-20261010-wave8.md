# SPEC-308 implementation/evidence update — wave 8

## Exact PR and CI state

- PR #399 head is `d06a310f13f92c518d1185b3f9f32152b3fe8325`; canonical `origin/main` remains `6dcd7934332db7929904f8da642915751a6bb79`.
- Browser workflow `38004846321` passed on the exact PR head: 8 component-test files / 144 tests, and Chromium simulation 18/18. This uses mocked identity/APIs and a UI-only Vite server; it is simulated evidence, not live authenticated acceptance.
- The exact-head test pass includes deterministic setup for the drag scenario (`installMockEventSource` and notification-baseline readiness) and retains the 24px alignment assertion. An intermediate run exposed the missing setup and then a 56px post-drag alignment difference; the follow-up exact-head run passed with the setup synchronized and captured failure geometry diagnostics.
- No requirement closes from this evidence. All 66 remain OPEN (63 PARTIAL, 3 UNVERIFIED) pending canonical integration and the broader contract/live acceptance.

## Remaining gates

- MCP workflow `38004846369` failed on the canonical baseline: MCP session fixture/database configuration and stale imports of retired `agencyMcpService`; live smoke fails closed because approved `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN` are unavailable. These are not SPEC-308 UI-source regressions.
- PR #405 workflow-dispatch `38004111980` passed the 18-file / 238-test dependency compatibility suite and failed the mandatory full production audit on the single Moderate `sprintf-js@1.1.3` advisory. Reachability remains unknown; the full audit remains FAIL pending named Security and media/runtime owner approval for isolated ONNX 1.30.0/WSL2 compatibility testing or a scoped, expiring disposition.
- SPEC-308 live acceptance still needs an approved non-production authenticated runtime/test identity and Feature-049 tenant plus grouped-occurrence revision authority. Production feature flags remain OFF.

## Next workunit

Continue `WP_SECURITY_BASELINE_DEPENDENCY_REMEDIATION` first when the required Security and media/runtime owner authority is recorded. Then reconcile PR #403 and its baseline MCP fixture repair, and only after those mandatory gates reconcile PR #399 against the integrated SHA. Keep all requirement rows open until fresh implementation, exact integrated-SHA evidence, and required live acceptance are complete.
