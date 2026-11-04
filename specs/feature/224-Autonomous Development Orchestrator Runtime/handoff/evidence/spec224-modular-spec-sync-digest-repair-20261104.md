# Modular Core canonical Spec sync repair

Captured: 2026-11-04T13:25:17Z

## Root cause

The modular project descriptor still pinned R1.4 digests for all 13 canonical Specs and their handoff manifests/ledgers after the Specs were updated in source revision `21b6f80c8c86bcfc67593e1c019b06c67417a690`. Its two initial WorkPackages also referenced requirement IDs removed from the current R1.5 ledgers. The server correctly rejected the stale descriptor with `MODULAR_PROJECT_SOURCE_DIGEST_MISMATCH`.

## Repair

- Refreshed each Spec, manifest, and requirement-ledger SHA-256 from the current canonical files, preserving strict digest validation.
- Updated the descriptor source revision to the exact R1.5 source commit.
- Rebound the canonical-catalog and Core P1 WorkPackages to requirement IDs present in the current SPEC-312 and SPEC-313 ledgers.
- Added a regression test that loads the complete current 13-Spec project catalog and its package references.

## Verification and deployment

- Exact integrated source SHA: `39c7ab726e4d3e6a79b40810893b23fbb867bdf1`.
- Focused command: `pnpm --dir apps/web exec vitest run server/services/__tests__/spec224FeatureSpecCatalog.test.ts` — 8/8 tests passed.
- Re-ran the catalog loader against the deployed immutable release root; it returned 13 Specs, 13 canonical spec files, and both WorkPackages.
- Deployed with the Linux immutable release controller to `legacy-debian-dev` (`https://smartaihub.app`, `smartspec-web.service`, port 3000), generation 356, release `smartspec-web-39c7ab726e4d3e6a79b40810893b23fbb867bdf1-a0c3d8ef3afc`, artifact digest `sha256:ab43947c9c9e5ab4cadc987037113d86a0f04b9b862d242014a3db212f1568cc`.
- Runtime web and Node Worker source SHAs match the integrated SHA; release status is `DEPLOYED_VERIFIED`, and health returned HTTP 200. Public health check passed with valid TLS. API smoke reached 12/12 routes with zero server errors; its existing CORS warning for `/api/health` and SPA 200 on `/404-test-page` are unrelated to this change.

## Live interaction boundary

The authenticated Task Control sync click was not performed, so this evidence does not claim the user's conversation advanced to a newer Spec Set revision. The local GUI provider exited with `accessibility_error` before exposing a browser session. The user can reload `smartaihub.app` and retry the sync action against the deployed catalog. Overall SPEC-224 acceptance remains open.
