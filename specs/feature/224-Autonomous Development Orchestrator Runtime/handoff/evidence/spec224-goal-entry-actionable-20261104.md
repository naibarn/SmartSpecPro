# Goal entry usability deployment

- Observed at: 2026-11-04T12:12:58Z
- Integrated source SHA: `f0978ccc4a092071654cb19a5b62b59452707611`
- Target: `legacy-debian-dev` (`https://smartaihub.app`), Debian `smartspec-web.service` on port 3000
- Release: `smartspec-web-f0978ccc4a092071654cb19a5b62b59452707611-24334e432222`, generation `g353`
- Artifact digest: `sha256:706f388fac4cf7061e727fbd701aba905538eec61ecd04830f9fc5e521c2ee03`
- Public artifact digest: `sha256:cffe9e6636c6b437e03bf8a0fbb4b1078c34e15676d6e049a9a2e88ff7cf1a12`

## Change and focused verification

The Developer header action now creates a fresh Chat session for normal command entry. A new Goal review starts in Prompt mode instead of restoring an old SPEC selection that may not exist in the selected Workspace; users can still choose SPEC mode explicitly. Existing Pilot behavior remains available through Mission Control's Pilot entry.

Focused tests passed: 2 files, 62 tests. Command:

```bash
pnpm --dir apps/web exec vitest run client/src/pages/UnifiedWorkspace.test.tsx client/src/components/chat/Spec224WorkspacePanel.test.tsx
```

## Deployment verification

- Release controller returned `DEPLOYED_VERIFIED` for `legacy-debian-dev`.
- `smartspec-web.service` and `smartspec-node-worker.service` both report source revision `f0978ccc4a092071654cb19a5b62b59452707611`; web health returned HTTP 200.
- Public health check passed: HTTP 200 in 220 ms, valid TLS, and no missing security headers.
- Public `GET /healthz` returned JSON HTTP 200; `GET /chat` returned HTML HTTP 200; all 9 referenced JavaScript/CSS assets returned HTTP 200.
- Environment validation passed in manifest mode. Migration journal static configuration is valid; no database migration was required for this UI change. Authenticated browser interaction and live Goal execution were not exercised.
- No Cloudflare artifact or Worker was built or deployed.

This records exact-SHA implementation, focused-test and development-deployment evidence only. It does not claim overall SPEC-224 completion or acceptance.
