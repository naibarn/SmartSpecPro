# SPEC-308 static deployment evidence — 2026-10-12

- User authorization: user explicitly authorized deploying SPEC-308 to `smartaihub.app` despite the service running production mode. Deployment was limited to static frontend assets; no service restart or database migration was performed.
- Source: canonical `origin/main` SHA `3b6b5b356f7e2b71c2e845f175d3aa5fa88eb50d`.
- Build: `BUILD_PASSED`; command was run through the certified canonical deploy lease with `VITE_ASSISTANT_MASCOT_GLOBAL_ALLOW=true`.
- Artifact digest: `sha256:8ed6ea0e8c0cf492ad0218cb5997ce1fcdcfdf5749f57a5cdc618803e152cb8f`; 1,574 files in dist, 1,573 published assets.
- Published static target: `/mnt/SmartSpecDev/projects/SmartSpecPro/apps/web/dist/public` (the active `smartspec-web.service` public directory).
- Rollback backup: `/home/dev/.cache/codex/deploy-backups/smartspec-web-main-20261012T115741.000756Z`.
- Published index SHA-256: `6ac95b953865f582c1a5bbcbfcb72be95310c519f90da18be6d51b88907179f4`.
- The application domain `https://smartaihub.app` served the new content-addressed JS `assets/index-C3x1OBq4.js` and CSS `assets/index-CBzndOrl.css` with HTTP 200. Compiled JS contains the mascot UI and five styles (`droplet`, `star`, `shield`, `chat`, `orbit`). Tenant `tenant-ZCSKEM9s` has explicit `livingMascotDualSurface` opt-in; shared defaults remain disabled.
- Post-deploy smoke: 12 routes checked, all 12 reachable, zero server errors. Existing notes: `/404-test-page` resolves through SPA fallback (200); `/api/health` lacks CORS header. These are unrelated to this static publication.
- Playwright Chromium was installed. Desktop (1440×960) and mobile (390×844) checks through the domain reached `/login` in a fresh unauthenticated browser profile; assets loaded with no page errors, failed requests, or horizontal overflow on the login screen. This does not verify the authenticated dashboard, tenant-specific visibility, style selection, chat handoff, or reminder behavior.
- Remaining acceptance: refresh the existing authenticated dashboard session and confirm the tenant-visible UI; then verify bell preservation, launcher, five styles, AI Chat & Feedback handoff, reminder balloon routing, and mobile dashboard layout. Do not mark all 66 requirements complete based on build/deploy/smoke evidence.
