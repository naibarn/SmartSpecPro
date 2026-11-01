# SPEC-224 Ledger Resume Readiness Deployment

- Observed at: `2026-11-01T17:12:37Z`
- Source SHA: `22e6f344ca965ccef8bd9d57babd94cb251e0000`
- Target: `legacy-debian-dev` / `https://smartaihub.app`
- Runtime: Debian `smartspec-web.service` and `smartspec-node-worker.service`
- Artifact digest: `sha256:34b6d5ebe0e6b749b06fe181db562a3deec5cba6a4ec469061f57edd8273d368`
- Release: `smartspec-web-22e6f344ca965ccef8bd9d57babd94cb251e0000-b263782827cf` (generation 305)
- Deployment receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/development-deployments/smartspec-web-22e6f344ca965ccef8bd9d57babd94cb251e0000-b263782827cf-305.json`

The admin Ledger configuration is now shown in Task Control before plan preparation and while a development run is resumable, including when the selected request type is Mini App. Resume and new-run actions wait until the admin's tenant Ledger configuration query succeeds and confirms a configured pair. Pilot and regular development paths use the same readiness. The panel reports missing accounts and exposes the existing zero-balance account setup flow; this change does not create accounts, increase a budget, or alter balances automatically.

Focused verification passed: Task Control resume/readiness tests 3/3 and preparation blocker helper tests 4/4. The broader existing Task Control panel suite was attempted and remains red (13 passed, 21 failed, with stale UI assumptions and a jsdom `scrollIntoView` error); those failures were not acceptance evidence for this scoped repair. The canonical Vite build completed. The Debian release controller verified web and Node worker at the exact source SHA, and `release:status` confirmed it is current canonical. Public `https://smartaihub.app/healthz` and `/` both returned 200. The public `Spec224WorkspacePanel-D4E3ad-G.js` SHA-256 (`cff6249e252fd61bb3499864756892c7c92240c1705d323899048e22f6b420db`) matches the immutable artifact and contains the Ledger setup and resume labels.

No successful Ledger configuration, Goal Grant, DevelopmentRun execution, or Runner receipt is claimed. Next: hard-refresh Task Control, open the existing Goal, configure/select the tenant's USD Ledger accounts in the now-visible Ledger section, save the pair, then resume that same Run. Confirm the real Run receipts in Task Control and Mission Control.
