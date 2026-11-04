# SPEC-224 Pilot Readiness Consistency

- Source SHA: `f8da82dc2c63f0777f23c72570d2380932c80167`
- Canonical ref: `refs/heads/main`
- Deployment target: `legacy-debian-dev` (`smartaihub.app`, Debian `smartspec-web.service`, port 3000)
- Release generation: `g351`
- Release ID: `smartspec-web-f8da82dc2c63f0777f23c72570d2380932c80167-68a13232da6b`
- Artifact digest: `sha256:d8da61731852446af737b989ee132474deb385609794c2fad41546e414ba4ba6`
- Deployment receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/development-deployments/smartspec-web-f8da82dc2c63f0777f23c72570d2380932c80167-68a13232da6b-351.json`

## Change

The Admin First Run Pilot now reports execution readiness only when the selected Runner is trusted, online with a heartbeat under five minutes old, bound to the selected Platform Engineering workspace, and the selected workspace readiness query passes. A stale Runner is shown as not ready with its heartbeat timestamp and reason; the prepare/start actions stay disabled. The dialog includes a refresh action for Runner, Workspace, binding, and readiness data. A sole authorized Runner remains visibly selectable instead of looking locked.

## Verification

- TypeScript TSX syntax parse: PASS.
- `git diff --check`: PASS.
- Full immutable canonical Linux artifact build, including web, widget, and backend packaging: PASS for the exact source SHA above.
- Release status: target `legacy-debian-dev`; frontend, backend, web service, and Node worker all report the exact source SHA; target matches release.
- Release runtime health: `smartspec-web.service` and `smartspec-node-worker.service` active; `/healthz` HTTP 200; Node runtime `v22.23.4`.
- Public checks: `/chat` HTTP 200; the deployed `Spec224WorkspacePanel-BpFnbf5W.js` asset HTTP 200 and contains `RUNNER_HEARTBEAT_STALE` and `โหลดรายการใหม่`; health check reports valid SSL and no missing security headers.
- API smoke: 12/12 routes reachable and zero server errors. The tool also reported existing low-severity missing CORS on `/api/health` and medium-severity soft-404 behavior; these are unrelated to this UI change and were not changed.
- Focused Vitest and authenticated Admin browser interaction were not run. The owner should verify the Pilot dialog and the stale-heartbeat disabled state in an authenticated browser. No Goal, Approval, or DevelopmentRun was started by this release.

## Rollback

The previous verified release was generation `g350` from source `2898ae8dfd213ed6614facc31dfb42842d048f6a`. The Linux release controller retains the immutable artifact and deployment history and performs an automatic rollback if activation or readiness fails.
