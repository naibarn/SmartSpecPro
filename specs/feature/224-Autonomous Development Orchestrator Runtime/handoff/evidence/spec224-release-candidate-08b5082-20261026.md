# SPEC-224 Immutable Release Candidate — 2026-10-26T07:00:26Z

## Candidate

- Exact origin/main source SHA: `08b508284eabe621292ab95a5b1cc6a63bca5fd1`.
- Previous production authorization for `28c6a13f…` is not applicable to this SHA.
- This SHA descends from required execution-authority floor `d7f19629ac99faf2d51a0491859a243863b3f706` and includes the later worker dispatch, publication-receipt and workspace-binding fixes.
- The previously built `db7d4d2…` is below the required security floor and is rejected.
- Release policy allows explicit immutable candidates with required ancestors. This candidate matched main at build and preparation; no moving-HEAD exception was used.

## Exact artifact identities

- Build receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/08b508284eabe621292ab95a5b1cc6a63bca5fd1-29bb0bda-4db0-4c0d-9eec-3f04b664a51a.json` (`BUILD_PASSED`, source verified).
- Web immutable release: `smartspec-web-08b508284eabe621292ab95a5b1cc6a63bca5fd1-d37bc62741b4`; release digest `sha256:d37bc62741b41ac616f780e1ea5ed193e84dc8aa8aab17167575644220d9b9f9`.
- Web public artifact digest: `sha256:5d2cf6f5998e6411b0a75bce8fa3dde4b56f76076738d2a9ba052dd71d51e1a0`; source dependency digest `108d265bb041fb17459e0b77170657fce71e68f0a59ea65226c0ddb66b90b81a`; source tree SHA `556c0085e65725fef8b5ffaa47f9fd90f4c7aeb2`.
- Python immutable release: `smartspec-python-08b508284eabe621292ab95a5b1cc6a63bca5fd1-c77fa0f70924`; artifact digest `sha256:c77fa0f709249628426a676d78eaba95ecf5215320a7782d9d042f2c9bdaf5d9`.
- Cloudflare Worker dry-run bundle digest: `sha256:f9d90e75e891dcfe9190132741167963ace701130675156a2857174d4b8e96b0` (2 modules, 1595 assets). Artifact published and read-back verified; Worker was not deployed.

## Verification and current production

- Canonical source focused tests: 44/44 passed, including published receipt ancestry validation in the isolated Git workspace.
- Web/Python release controller tests: 34/34 passed.
- Cloudflare local readiness workflow: run `40282304012` passed on this SHA.
- CI run `40282303999` was still in progress at observation: SPEC-224 PostgreSQL acceptance, control-plane, skill-pack, marketplace and API-generator jobs passed; Python, desktop, local-AI, turbo-build and SmartSpecWeb jobs were still running. No full CI pass is claimed.
- Production Web/Node service was active on source `d7f19629ac99faf2d51a0491859a243863b3f706`, generation 125; Python was active on source `9e10df363c7082c8d5af31a5fcdadcb3f28657bf`. Local `/healthz`, `/api/health`, Python `/health` and `/api/v1/health/ready` returned healthy/ready.
- Prior Web and Python release directories exist for controller rollback. The controller's automatic rollback path was reviewed and its focused tests passed; a rollback was not simulated.
- No database migration, Cloudflare deployment, production release or SPEC-224 DevelopmentRun was performed.
- Latest durable Runner evidence is from 2026-10-26T02:09:34Z: version 0.2.41 and Codex probe passed then, but the task-probe authorization expired at 02:13:44Z. No live DevelopmentRun, protected dispatch, settlement, recovery or independent Final Verify exists in this evidence.

## Approval and continuation

- Production approval: **NOT GRANTED for this exact candidate yet**.
- Exact requested operation after approval: promote Python release above first; then run `pnpm run release:web:linux -- --build-result /mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/08b508284eabe621292ab95a5b1cc6a63bca5fd1-29bb0bda-4db0-4c0d-9eec-3f04b664a51a.json` so the controller reuses this receipt without rebuilding. No migrations and no Cloudflare deploy.
- After both runtime source SHAs and health are verified, refresh Runner readiness through normal owner authentication, reconcile workspace to canonical only if the registered SHA is a clean ancestor, then use SmartAIHub Chat → SPEC-224 workspace → existing Runner/workspace → reversible task → USD 1.00 cap → Start. Capture protected dispatch, tool, usage, settlement and recovery receipts, then run independent Final Verify.
- SPEC-224 remains partial until genuine live receipts and Final Verify are recorded.
