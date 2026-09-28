# Implementation Plan

## Objective

Make `SmartAIHub Companion` the canonical product and release identity while keeping old installed extensions and operational configuration compatible.

## Approach

1. Refactor public release discovery around a dual-pattern Companion resolver. Add canonical latest/download routes and retain legacy aliases. Test mixed filenames, ordering, and both route families.
2. Rename extension product/package identity, switch update awareness to canonical routes, accept both external token messages, and update package verification. Synchronize version `0.1.138` without broad lockfile churn.
3. Update Dashboard release consumers/copy and the Marketplace connect page. Add a pure canonical-first token-delivery helper with legacy fallback only for transport incompatibility. Add the canonical origin allowlist variable with legacy fallback.
4. Run focused web and extension tests, build/package the canonical ZIP, inspect its content, confirm both API route contracts in tests, and preserve `0.1.137`.

## Affected modules

- Public release route and focused tests under `apps/web/server/routes/`.
- Dashboard release panel, locale copy, tests, Marketplace connect page/helper/tests, `.env.example`, and Marketplace capture config/tests.
- Extension manifest, panel, README, package/lock metadata, update helpers/tests, service worker, verifier, and generated release ZIP.

## Risks and mitigations

- Old extensions stranded: legacy endpoint scans both filename patterns and remains supported.
- Auth downgrade: fallback only on missing receiver, never on explicit rejection.
- Product/domain naming confusion: keep Marketplace-specific schemas and protocols unchanged.
- Dirty lockfile/worktree: use focused patches and inspect explicit hunks.
- Release mismatch: verify package, manifest, panel bundle, service worker protocol, ZIP name, and rollback artifact.

## Acceptance criteria

- All user-facing product surfaces say `SmartAIHub Companion` where the extension product is meant.
- Marketplace capability actions and routes retain Marketplace naming.
- Canonical and legacy release APIs select `0.1.138` from the canonical ZIP.
- Old token message and allowlist variable continue working.
- Canonical token message and allowlist variable work without weakening validation.
- Extension tests/build and focused web tests pass.
- `smartaihub-companion-extension-0.1.138.zip` is verified in the existing releases directory; `0.1.137` remains.
- No deployment, store publication, commit, or push occurs.
