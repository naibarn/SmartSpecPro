# SPEC-224 Development/Production Isolation and Dev Release

- Observed at: `2026-10-30T10:38:22Z`.
- Status: development delivery verified; SPEC-224 live execution remains `FEATURE_DEPLOYED / LIVE_GOAL_PENDING`.
- Integrated source: `f9cb31483b6fa409a86cc86ed4e4dedb5979baf5` on `origin/main`.

## Service and environment boundary

- Development web: user unit `smartspec-dev-web.service`, running from `/mnt/SmartSpecDev/projects/SmartSpecPro/apps/web` on loopback port `3100`; the application env is `/home/dev/.config/smartspec-dev/web.env`.
- Development ingress: user unit `smartspec-dev-tunnel.service` reads `/home/dev/.config/smartspec-dev/cloudflared.yml`, whose only application hostname is `aimarkethubs.com` → `http://127.0.0.1:3100`.
- Production web: system unit `smartspec-web.service`, running from the immutable production release pointer `/home/dev/production-releases/smartspec-web-current` on port `3000`; the application env is `/home/dev/projects/SmartSpecPro/apps/web/.env`.
- Production ingress: system Cloudflare Tunnel `/etc/cloudflared/config.yml` routes `smartaihub.app` and `www.smartaihub.app` to port `3000`; it is separate from the development tunnel.
- Production Node job worker is the separate system unit `smartspec-node-worker.service`.
- Both units inherit host Node runtime/PATH settings. Application DB selection and deployment activation are service-specific; the development release script does not change the production unit, production worker, production tunnel, or production symlink.

## Database selection

The development env validator reports `SMARTSPEC_ENVIRONMENT=development`, mode `shared-tenant`, `APP_URL` and tenant domain `aimarkethubs.com`, database host `localhost`, database name `smartspec`, and a separate database login ending in `_dev`. No credentials are recorded here. `release:dev:web` rejects production database access modes. This is tenant-scoped access to the shared database, not a claim that the development database is a separate physical PostgreSQL database.

## Development release proof

- Release command: `pnpm run release:dev:web`.
- Build receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/f9cb31483b6fa409a86cc86ed4e4dedb5979baf5-036daa1d-3895-4c17-95f3-d2d6a43b6067.json` (`BUILD_PASSED`, canonical `refs/heads/main`).
- Source SHA: `f9cb31483b6fa409a86cc86ed4e4dedb5979baf5`.
- Immutable artifact digest: `sha256:86acf83cb6ddb6380af88fe95693c075f62548b57f0d6973689b553aa1080f7a`.
- Artifact path: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/f29801373bfd4154c0d8/f9cb31483b6fa409a86cc86ed4e4dedb5979baf5-build/apps/web/dist`.
- Runtime identity: dev launcher reports `f9cb31483b6fa409a86cc86ed4e4dedb5979baf5-dirty`, port `3100`, database mode `shared-tenant`. The commit identity matches the artifact source; `-dirty` identifies other pre-existing shared-checkout edits that this task preserved.
- Runtime health: local web `http://127.0.0.1:3100/healthz` and development API `http://127.0.0.1:8100/health/ready` returned HTTP 200; `https://aimarkethubs.com/healthz` returned HTTP 200.
- Public UI: `GET https://aimarkethubs.com/chat` returned HTTP 200. Its HTML has no `/@vite/client` and references `/assets/index-DU1CNC1c.js`. The public asset SHA-256 `c7d27fb21b718c77e365f3d88d44a9cc51ef9019ae36a6f042ef0bbed5d28b38` exactly matches the artifact file.
- The built artifact contains the Guided First Run panel chunk. First Run/Unified Workspace and release-config focused tests passed 60/60 across five files.
- Non-secret runtime deployment record: `/home/dev/.local/state/smartspec-dev-web/last-deployment.json`.

## Production preservation

Before/after fingerprints for `smartspec-web.service`, `smartspec-node-worker.service`, and the production release pointer were identical: `f1aed6fad0627b16ccfd2552a65eb5a65083424aa0515687a2b575116822e75b`. Production units remained active. The active pointer remained `/home/dev/production-releases/smartspec-web-e301b10804724e365de43ad91948b92d9f402e88-46dc5e91fc47-g251` (generation 251). This task did not run the production release command or alter production.

## Release-procedure repair and remaining acceptance

The first attempt exposed two release-tool defects: Python's default HTTP client received Cloudflare HTTP 403 for the public chat page, and rollback to the previous `e8884d66…` receipt made the current launcher fail closed because the checked-out runtime was already at a newer commit. The procedure now uses browser-style `curl` headers for the public edge proof, allows recovery of an inactive enabled dev unit, and preserves a locally healthy new dev runtime if only the public edge probe later fails. The final release completed with the evidence above.

The Admin First Run implementation and same-run recovery path are preserved. No authenticated owner Start/Approval was performed; no Goal, Approval, DevelopmentRun, Job, Attempt, or simulated receipt was created. Owner visual UAT and a genuine SPEC-224 execution with Child 1/2 settlement and Independent Final Verify remain outstanding. Keep status `FEATURE_DEPLOYED / LIVE_GOAL_PENDING`.
