# SPEC-308 canonical build evidence — 2026-10-12

- Build outcome: `BUILD_PASSED` for exact canonical source `757a5750f00e916ed84801c6024bebdc814e60f9`.
- Command: `VITE_ASSISTANT_MASCOT_GLOBAL_ALLOW=true python3 scripts/development-lifecycle/canonical_source.py build --repository . --required-integrated-revision 757a5750f00e916ed84801c6024bebdc814e60f9`.
- Artifact directory: `/home/dev/.cache/codex/canonical-sources/f29801373bfd4154c0d8/757a5750f00e916ed84801c6024bebdc814e60f9-build/apps/web/dist`.
- Artifact digest: `sha256:8ed6ea0e8c0cf492ad0218cb5997ce1fcdcfdf5749f57a5cdc618803e152cb8f`.
- Build-time global mascot allow flag was `true`; tenant `tenant-ZCSKEM9s` had `livingMascotDualSurface=true` by explicit user opt-in. Shared tenant defaults remain false.
- The artifact was served only through local Vite preview at `127.0.0.1:4173`; it displayed the app shell but could not authenticate because no backend/session was connected. Preview is stopped.
- Runtime inspection found `smartspec-web.service` on port 3000 running `NODE_ENV=production` from the dirty primary checkout; its served chat bundle remains `assets/index-DOKZ_hLb.js`. No verified non-production SmartAIHub route or authorized synthetic identity was available, so the production-mode service was not changed and UI visibility is not claimed.
- Next: register/provide the tenant-aware non-production route and authorized identity, then publish/use the exact artifact through that route and verify the visible UI and source revision.
