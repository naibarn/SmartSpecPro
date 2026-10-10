# SPEC-308 implementation and verification update — wave 9

## Exact candidate

- PR #399 implementation candidate: `a7765811ef0f6a21b5a1297090f5754d845b30c0`; evidence-only handoff head: `a87a991d082c3c72ad3768e03a0b244d963a1cf1`
- Canonical base merged into the candidate: `36fe5811a65b9c5a705f9ded6152607069077de4`
- Browser workflow: [run 38006779631](https://github.com/naibarn/SmartSpecPro/actions/runs/38006779631)
- Result: 8 focused component test files, 144 tests passed; mocked Chromium simulation, 18/18 passed. Evidence: `evidence/pr-ci-38006779631.json`, `evidence/pr-ci-38007259981.json`, `evidence/pr-ci-38007574644.json` and downloaded artifacts under `evidence/ci-artifacts/`.

## Change

`FeedbackButton.tsx` now treats drag completion as a positioning lifecycle event and performs a final hint measurement after the launcher and remounted balloon have had two animation frames to settle. The previous failure on `d248a3f0ac25729a214b30ef14caf09fa354f342` showed the existing 24px alignment assertion at 56px after the test advanced only 32ms of its controlled clock. The browser test now advances 64ms for the two-frame completion path; it still requires alignment within 24px and remains inside the 390×844 viewport. No acceptance threshold was relaxed.

The successful run is simulated authenticated browser evidence using deterministic fixtures and mock APIs. It does not establish live authenticated acceptance or tenant-runtime authority.

## Requirement and gate status

- The canonical 66-row requirement ledger remains 63 `PARTIAL`, 3 `UNVERIFIED`, all 66 `OPEN`; no row is closed by this simulation.
- Production feature flags remain off; no deployment occurred.
- PR #405 still fails mandatory production audit on Moderate `sprintf-js@1.1.3`; a named Security Owner and Media/Runtime Owner decision is required for approved ONNX/WSL2 compatibility remediation or a policy-valid scoped and expiring risk disposition.
- Exact PR #399 contract run `38006779712` fails on the canonical baseline before reaching the audit step: 44 MCP failures / 76 passed across 11 files, caused by missing DB-backed session fixtures and tests importing the retired `agencyMcpService`; the audit checks are skipped after the test failure. The live smoke fails closed because approved MCP endpoint/token are unset. PR #403 owns the fixture repair and its refreshed focused suite passed 118/118 with MCP checks passing; its audit/live blockers remain.
- Live SPEC-308 acceptance still needs an approved non-production application runtime, authorized test identity, and Feature-049 tenant-scoped notification authority.

## Next action

Continue `WP_SECURITY_BASELINE_DEPENDENCY_REMEDIATION` with the required named owner decision. In parallel, reconcile PR #403 and PR #399 against the newest canonical SHA and rerun required gates once the security candidate is eligible. Keep the 66 requirement rows open until each has current integrated-SHA implementation and verification evidence, and keep live acceptance separate from this simulation.
