# SPEC-224 Ledger Configuration Recovery Deployment

- Observed at: `2026-11-01T16:54:39Z`
- Source SHA: `ce6fda44c74996204deb86957e4bab3ce19c227d`
- Target: `legacy-debian-dev` / `https://smartaihub.app`
- Runtime: Debian `smartspec-web.service` and `smartspec-node-worker.service`
- Artifact digest: `sha256:91c26099c2afa1abd4466bb8db92daf202d3c346d67c2d689214db15ac69ddb8`
- Deployment receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/development-deployments/smartspec-web-ce6fda44c74996204deb86957e4bab3ce19c227d-b67a5043e7c6-304.json`

The tenant-scoped SPEC-224 reserve-ledger configuration UI and API were promoted through the immutable Debian development release controller. The controller verified both web and Node worker at the source SHA above. Internal `/healthz` returned 200; public `https://smartaihub.app` returned 200 with valid TLS; API smoke reached 12/12 routes with zero server errors. The smoke tool also reported two advisory findings: `/api/health` has no CORS header (not required for same-origin use), and an unknown client-side route falls back to the SPA with HTTP 200.

This was an out-of-band repair because the Task Control Start path was failing with `ECONOMIC_LEDGER_ACCOUNTS_NOT_CONFIGURED`. No database migration was required. No account balance, budget cap, or funding was changed by this deployment. The new admin flow can create two tenant-scoped USD accounts with zero opening balance or select existing open accounts, then persist their mapping. This deployment evidence does not prove a user configured the mapping, approved a Goal Grant, or completed any Codex/Runner work; no trustworthy Run receipt was available in this repair.

Next action: an Admin opens the prepared Goal in Task Control, configures the tenant's reserve account pair in the preparation result, then resumes that same Goal through the UI. Verify the resulting Goal Grant, DevelopmentRun, Runner receipts, settlement, and Mission Control projection before claiming execution or acceptance.
