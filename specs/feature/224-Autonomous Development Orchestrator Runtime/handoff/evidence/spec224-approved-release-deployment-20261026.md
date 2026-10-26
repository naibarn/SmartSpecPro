# SPEC-224 approved release deployment evidence

Captured at `2026-10-26T07:27:03Z` for the approved immutable candidate.

## Release identity

- Source SHA: `08b508284eabe621292ab95a5b1cc6a63bca5fd1` (ancestor of `origin/main` at `228652314b76708ef343b5bfd1c79a2ec40a592d`).
- Required security ancestor: `d7f19629ac99faf2d51a0491859a243863b3f706`.
- Python artifact: `sha256:c77fa0f709249628426a676d78eaba95ecf5215320a7782d9d042f2c9bdaf5d9`.
- Web release artifact: `sha256:d37bc62741b41ac616f780e1ea5ed193e84dc8aa8aab17167575644220d9b9f9`.
- Web canonical build artifact: `sha256:28d351bdf2932a9f45f34c5867e9b666b906e6ab6579117c04e7875f3c655b91`.
- Web public artifact / Node Worker bundle: `sha256:5d2cf6f5998e6411b0a75bce8fa3dde4b56f76076738d2a9ba052dd71d51e1a0`.
- No database migration or Cloudflare deployment was run.

## Production deployment

- Python promotion receipt: `/home/dev/production-releases/smartspec-python-releases/production-deployments/python-08b508284eabe621292ab95a5b1cc6a63bca5fd1-1dcab9479eaf.json`.
- Python service: `smartspec-backend.service`, status `DEPLOYED_VERIFIED`, runtime revision `08b508284eabe621292ab95a5b1cc6a63bca5fd1`; `/health` and `/api/v1/health/ready` returned HTTP 200. Previous release `9e10df363c7082c8d5af31a5fcdadcb3f28657bf-8ec8230482df` remains available for controller recovery.
- Web promotion receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/production-deployments/smartspec-web-08b508284eabe621292ab95a5b1cc6a63bca5fd1-d37bc62741b4-128.json`.
- Web release: `smartspec-web-08b508284eabe621292ab95a5b1cc6a63bca5fd1-d37bc62741b4-g128`, generation 128, status `DEPLOYED_VERIFIED`.
- `smartspec-web.service` and `smartspec-node-worker.service` both report runtime revision `08b508284eabe621292ab95a5b1cc6a63bca5fd1`. The Web controller receipt verifies health HTTP 200 and anonymous diagnostics denial HTTP 403.
- Public smoke checks after promotion: `/` HTTP 200, `/healthz` `ok`, `/api/health` `ok`, `/api/v1/health/ready` `ready`.
- A missing writable `logs/audit` runtime directory prevented AuditLogger startup. Created only that previously absent directory as `dev:dev` mode `0750`, verified it writable by the service, and restarted the Web and Node Worker services. The logger then created `audit-2026-10-26.jsonl`; no existing user or audit files were modified. Audit event delivery itself was not exercised with an authenticated request.
- The initial `release:web:linux -- --build-result ...` re-prepare check stopped before traffic changes because the pinned build workspace `dist/` no longer matched its ledger digest. The immutable published artifact was separately verified against the approved `d37...` digest and its pinned receipt, then promoted by the existing `linux_backend_release.py promote` controller. No rebuild occurred.

## CI and focused verification

- Exact-SHA CI run `40282303999` completed with failures in `python`, `turbo_build`, and `smartspecweb`; `spec224_postgres_acceptance` passed.
- Comparison against baseline run `40279343767` at security-floor SHA `d7f19629...`: the same three jobs failed; SmartSpecWeb reported 390 failed / 2417 passed / 55 skipped in both runs with 383 identical failed-test signatures and no new or resolved signature. Turbo typecheck annotations match the baseline, and no Python source path changed since that baseline. GitHub reports no `main` branch protection or repository ruleset requiring these checks. These are recorded as existing baseline failures, not passing CI.
- Focused checks at the candidate: 44 canonical source tests passed; 34 Python release-controller tests passed; 188 focused Vitest tests passed. SPEC-224 disposable PostgreSQL acceptance passed in CI.

## Remaining live acceptance

- No DevelopmentRun was started, and no protected dispatch, usage/credit settlement, interruption recovery, or independent Final Verify receipt exists.
- Latest Runner evidence is stale: Runner 0.2.41 / Codex 0.161.0 task probe passed at `2026-10-26T02:09:34Z`, but the probe authorization expired at `02:13:44Z`. The workspace was clean at SHA `fbd7fd1bd8324973540664d7f7de2bd9e5844757`, fingerprint `0f2eeb70d5767268e5170defcaaf8e4f7182ce6de91a4d21019b0d0ade0cbce1`; source binding to the deployed candidate SHA is not established. Its recorded policy decision was `pending`.
- This environment has no legitimately authenticated SmartAIHub owner browser session, so it cannot set the owner-scoped USD 1.00 budget or submit the authenticated Start Goal. The owner action is: sign in at `https://smartaihub.app/chat`, open the existing SPEC-224 Workspace for the already-enrolled `SmartSpecPro` Runner, set/confirm the cap at USD 1.00, and press **Start Goal**. This creates the real DevelopmentRun and returns its ID; do not repeat the already-passed Codex probe unless the fresh readiness check says it expired or is required.
- After that authenticated Start, resume the same run and capture dispatch, tool, usage/settlement, reconnect/recovery, and independent Final Verify evidence. SPEC-224 remains `PARTIAL` until those receipts exist.
