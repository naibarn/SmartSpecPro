# SPEC-208 W2 engine guard review passes — 2026-10-10

Starting implementation SHA reviewed: `7aeaa0109912a74a89f268e177aea7eaf204fbff`; canonical merge SHA: `1c01e3fa80c8952d0903d4ddfbdfcf6619c3b65e`.

These are ten source-review passes over the integrated browser-engine guard, its call path, tests, and surrounding constraints. They are review dimensions, not ten test suites. The focused web and Runner test outcomes are recorded separately in `moli-w2-engine-guard-2026-10-10.md`.

1. **Engine allowlist:** TypeScript and Rust reject a present browser engine constraint other than `chromium`. PASS.
2. **Execution-kind binding:** The Rust check applies only to `computer_use.browser` plus `browser.v1`; other unsupported pairs are rejected by the existing adapter contract. PASS.
3. **Validation order:** The guard runs during command validation before command acceptance/execution. No browser launch occurs in this branch. PASS.
4. **Compatibility:** The current executor explicitly sends `chromium`; commands without an engine constraint remain compatible with the existing Chromium-only Runner behavior. PASS WITH LIMITATION: future engine additions must make the constraint mandatory or bind the engine through an equally strong capability contract.
5. **Cross-language parity:** TypeScript and Rust use the same exact `chromium` value and normalized error `RUNNER_BROWSER_ENGINE_UNSUPPORTED`. PASS.
6. **Malformed values:** Empty or non-Chromium strings fail; TypeScript `null` also fails the exact-match check. PASS.
7. **External-agent regression surface:** The engine check is scoped to browser commands and does not alter `codex.v1` or `claude.v1` command validation. PASS.
8. **Tenant/security authority:** Existing lease, fencing, execution binding, authorization, and secret-field validation remain in place. PASS FOR NON-REGRESSION ONLY; this patch adds no tenant isolation boundary.
9. **Moli dispatch containment:** There is no Moli route or flag enablement in this patch; Chromium remains the production default. PASS.
10. **Acceptance completeness:** Unit regressions cover TypeScript and Rust validation. No live Runner dispatch, process/profile isolation, protocol/network enforcement, cancellation, or receipt E2E was exercised. PASS FOR SCOPE; W2/W3 remain open.

Review conclusion: safe fail-closed guard checkpoint; not Runner isolation, Moli conformance, Phase 1 completion, or production readiness.
