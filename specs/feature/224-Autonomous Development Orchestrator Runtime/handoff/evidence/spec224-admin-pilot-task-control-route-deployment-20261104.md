# Admin Pilot Task Control route deployment

- Observed at: 2026-11-04T09:47:32Z
- Integrated source SHA: `921b4c7c5809c7876c55569c0828747502e3e7fd`
- Target: `legacy-debian-dev` (`https://smartaihub.app`), Debian `smartspec-web.service` on port 3000
- Release: `smartspec-web-921b4c7c5809c7876c55569c0828747502e3e7fd-18a079e798b1`, generation `g352`
- Artifact digest: `sha256:f3d979456619030ec3c7d9390b3121e969cb5f3b33bf55f792f69d2861957114`

## Change and focused verification

The Admin First Run Pilot action now opens the standard Task Control Goal review. Pilot configuration, prompt, exact write scope, Runner readiness requirements, approval queue, and duplicate-run guard remain bound to that standard flow. The former separate Pilot dialog entry was removed from the Goal panel.

Focused route and panel tests passed: 2 files, 61 tests. Command:

```bash
pnpm --dir apps/web exec vitest run client/src/pages/UnifiedWorkspace.test.tsx client/src/components/chat/Spec224WorkspacePanel.test.tsx
```

## Deployment verification

- Release controller result: `DEPLOYED_VERIFIED` on `legacy-debian-dev`.
- `smartspec-web.service` and `smartspec-node-worker.service` both run the exact integrated source SHA from generation `g352` on Node `v22.23.4`.
- Local health probe returned HTTP 200; anonymous admin diagnostics returned HTTP 403.
- Public `https://smartaihub.app` health check passed: HTTP 200, valid TLS, 133 ms response, and no reported issues.
- Public `GET /healthz` and `GET /chat` returned HTTP 200. All eight JavaScript assets referenced by `/chat` returned HTTP 200.
- No database migration was required for this UI routing change. No Cloudflare artifact or Worker was built or deployed.

This is exact-SHA implementation, focused-test, and development-deployment evidence. It does not claim overall SPEC-224 completion or acceptance.
