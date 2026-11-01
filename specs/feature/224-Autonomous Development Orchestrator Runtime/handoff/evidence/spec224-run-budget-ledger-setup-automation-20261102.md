# SPEC-224 Run Budget Ledger Setup Automation

- Date: 2026-11-02 (Asia/Bangkok)
- Canonical implementation SHA: `56a47c23da011b3d52a09e7be2dfc336cc882def`
- Deployment target: `legacy-debian-dev` (`https://smartaihub.app`)
- Runtime source revision: `56a47c23da011b3d52a09e7be2dfc336cc882def`
- Release ID: `smartspec-web-56a47c23da011b3d52a09e7be2dfc336cc882def-8b925ba62d9e`
- Artifact digest: `sha256:06c25f559d31bc66565698ee3365ccbe9a50caca1a3a9a7eba3ae32e468d30cc`
- Deployment receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/development-deployments/smartspec-web-56a47c23da011b3d52a09e7be2dfc336cc882def-8b925ba62d9e-306.json`

## Change

Task Control no longer asks an administrator to choose internal Debit/Credit
accounts. A single admin-only action provisions the stable tenant-scoped,
zero-balance SPEC-224 reservation accounts idempotently and binds them for
run-budget journal entries. Existing valid pairs are reused. The UI explicitly
states that these accounts and the USD budget cap are not the user's credit
wallet and that this setup itself does not add or deduct user credits.

The real user-credit settlement path remains governed by canonical usage
receipts and SmartAIHub billing. This change does not invent a USD-to-credit
conversion, charge a user, or claim that actual Codex/provider settlement is
complete. SPEC-321 still records the credit-unit v2 conversion as
`PROPOSED_ADDITIVE_NOT_IMPLEMENTED`.

## Verification

- Focused Vitest: 3 files passed; 8 tests passed, 33 skipped by the name filter.
- Canonical frontend/backend build: passed for the exact SHA above.
- Linux immutable release controller: `DEPLOYED_VERIFIED`; both web and Node
  worker report the exact source revision and healthy runtime.
- Public HTTPS health: `https://smartaihub.app` returned HTTP 200, valid TLS,
  and no missing configured security headers.
- API smoke: 12 routes reachable, zero server errors. Existing low/medium
  findings were missing CORS headers on `/api/health` and SPA fallback returning
  200 for an unknown URL; neither is related to this change.
- HTML-referenced JavaScript and CSS assets returned HTTP 200.
- Environment validation passed. Static migration configuration is valid; the
  checker does not query the database. No schema or migration was changed.
- Bundle tracker measured no size increase relative to its previous report.
- Repository-wide SEO/static performance scans report broad existing findings
  across unrelated generated artifacts and old files. Secret/dependency scans
  were stopped after exceeding one minute while scanning the monorepo; this
  focused change adds no credentials or dependencies.

## Remaining work

Verify the signed/authoritative usage-receipt path for actual billable provider
work and complete canonical credit-unit migration before claiming user-balance
charging for Development Runs. Manual account selection is no longer a user
step; the internal reservation journal must not be described as a wallet.
