# SPEC-224 execution source size recovery

Observed: 2026-11-04. User reported `EXECUTION_SOURCE_TOO_LARGE` while submitting a prepared Goal in Task Control.

## Root cause

`scripts/development-lifecycle/workspace_authority.py::_execution_source_facts` fingerprints modified and untracked Git source and rejects totals above 512 MiB. The configured workspace had 578.20 MiB across 1,759 dirty files. Generated Playwright output at `apps/web/test-results/smarthub-uat/` accounted for 558.25 MiB across 1,712 files, pushing otherwise valid workspace source over the limit.

## Repair and focused verification

- Added `apps/web/test-results/smarthub-uat/` to the root `.gitignore`. Existing UAT artifacts were preserved on disk; only generated output is excluded from the source fingerprint.
- The runtime-configured workspace resolves to the same canonical checkout. `git check-ignore` confirms the UAT trace path is ignored there.
- Called `_execution_source_facts` against that configured workspace after the change: PASS, 49 dirty source paths, 20,934,640 bytes (19.96 MiB), fingerprint produced. The UAT artifact directory still exists.
- The focused source-fingerprint check is not a live authenticated Goal dispatch and does not claim provider execution.

## Integration and deployment

- Integrated commit: `9d192c9c85c64bfc03ae62d6413afdaf39b604d9` on `origin/main`.
- Deployed through the Linux immutable controller to `legacy-debian-dev` (`smartaihub.app`, `smartspec-web.service`, port 3000), generation 357.
- Release: `smartspec-web-9d192c9c85c64bfc03ae62d6413afdaf39b604d9-e898539f2f3d`; artifact digest `sha256:562baba107fb029561c44ca7df76e5db85d60ca78db835ec003f929b8098f72d`.
- Web and Node Worker report the integrated SHA; controller result is `DEPLOYED_VERIFIED`, runtime health HTTP 200, anonymous diagnostics HTTP 403.
- Public health check: HTTP 200 in 190 ms; TLS valid. API smoke: 12/12 routes reachable, zero server errors. Existing findings remain: `/api/health` has no CORS header, and the SPA returns 200 for `/404-test-page`.

No authenticated browser retry or live Goal execution was performed. After refreshing Task Control, retry the prepared Goal; if the source-size error remains, capture the new receipt and workspace dirty-source summary. Overall SPEC-224 acceptance remains open.
