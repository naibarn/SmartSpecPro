# SPEC-308 continuation — wave 18 (2026-10-10)

## Exact latest candidate

- Latest PR #399 head: `724d52d0a3242265866494576cf368682158a6ed`; base/canonical: `2b497268f5a5c76c45d277cb162f59d10137f97d`.
- Browser Simulation run [38013533419](https://github.com/naibarn/SmartSpecPro/actions/runs/38013533419) passed 23/23 mocked Chromium tests on the exact head. Artifact ID `11654682578`. Together with the prior code candidate run 38013182833, this confirms the documentation/handoff checkpoint did not disturb browser behavior. Evidence remains simulated UI against mocked identity/APIs and UI-only Vite, not live authenticated acceptance.
- MCP Compatibility run [38013533460](https://github.com/naibarn/SmartSpecPro/actions/runs/38013533460) on the exact same head failed at focused tests (76 passed / 44 failed across 11 files). The focused fixture/import defects are canonical-main baseline and are already repaired in PR #403's separate candidate, whose focused suite/check/security passed on `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; mandatory audit did not run in this #399 job because focused tests stopped the sequence. Live MCP evidence is still unavailable: no authorized endpoint/token. This is not a SPEC-308 product regression and does not justify duplicate PR work.
- Exact workflow evidence JSON: `evidence/pr-ci-38013533419.json` and `evidence/pr-ci-38013533460.json`.

## Gates and ledger

- PR #405 is still OPEN+DRAFT at `868a5600ff770be91885666b7f584835e03fc690`. Compatibility run `38004111980` passed 18 files / 238 tests; mandatory production audit failed on Moderate `sprintf-js@1.1.3` via `hyperframes > onnxruntime-node > global-agent > roarr`. Reachability remains unknown and no patch exists. Security and Media/Runtime owners must authorize isolated ONNX 1.30 WSL2 compatibility validation or a scoped, expiring risk acceptance. No suppression/policy change.
- PR #403 remains OPEN+DRAFT at `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; its dependency audit/live endpoint remain outstanding. Keep its merge/reconciliation after #405.
- Read-only GitHub authority check found only a `production` environment, no MCP smoke secret names, and `staging` returned 404. No secret values were read.
- Requirement ledger remains 66/66 OPEN (63 PARTIAL, 3 UNVERIFIED); integration SHA is unset, production flags OFF, no deployment. Simulation closes no requirement.

## Next

1. Get the actual Security and Media/Runtime owner decision on `sprintf-js`; refresh and rerun #405 mandatory gates on a reconciled head.
2. Then reconcile #403 and obtain an approved MCP non-production endpoint plus scoped test identity.
3. Complete consolidated SPEC-308 verification and live authenticated acceptance on the exact integrated SHA before closing any ledger row.
