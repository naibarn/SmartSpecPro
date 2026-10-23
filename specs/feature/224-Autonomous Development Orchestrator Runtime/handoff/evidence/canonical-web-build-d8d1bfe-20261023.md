# Canonical SmartSpec Web Build — 2026-10-23

- Result: `BUILD_PASSED` from the canonical build controller.
- Source SHA: `d8d1bfe8606fb063f4829c6291a797fcb9757038` (`refs/heads/main`); the canonical tip was unchanged at completion.
- Profile and target: scoped `package` build, target `smartspec-web`.
- Invoking command: `pnpm run release:web:linux -- --required-integrated-revision 864ae1a35db580277ab19768e041a13de5b6235e --required-integrated-revision d8d1bfe8606fb063f4829c6291a797fcb9757038`.
- Canonical build command: `bash scripts/development-lifecycle/build_web.sh`.
- Output: `/mnt/ExpansionHD/.codex/smartspecpro/canonical-sources/f29801373bfd4154c0d8/d8d1bfe8606fb063f4829c6291a797fcb9757038-build/apps/web/dist`.
- Artifact digest: `sha256:498974bd106f206294774f927584a83b3b1f7599958813dc3b58bb0d652985f8` (128,170 files).
- Duration: 296.16 seconds (2026-10-23 00:12:47–00:17:43 UTC).
- Build log: `/mnt/ExpansionHD/smartspec-tmp/smartspec-build-logs/build-1792714385-2696501.log`.
- Canonical receipt: `/mnt/ExpansionHD/.codex/smartspecpro/canonical-sources/.development-build-results/f29801373bfd4154c0d8/d8d1bfe8606fb063f4829c6291a797fcb9757038-d9956b38-5592-4154-8d1b-5ab65f3bdbb3.json`.
- Cloudflare staging artifact: `PUBLISHED`, digest `sha256:6a53b87e3fee22e20ef5122a82cefece229a8b4d1b08f7eb1331ce9d1340b965`, 1,593 assets and 2 modules, bound to the same source SHA. This is staging publication evidence.
- Relevant phases: main Vite build, widget Vite build, MapLibre worker verification, backend runtime packaging, and Cloudflare Wrangler dry-run all completed successfully.
- Warning: the main minified JavaScript bundle is 2,959.24 kB (855.46 kB gzip), above Vite's 2,000 kB advisory threshold.
- Workspace synchronization: `BLOCKED_WRONG_BRANCH`; the primary workspace was on `fix/cloudflare-queue-only-activation-20261023`. It was left unchanged.
- Deployment/acceptance: this receipt does not establish service promotion, production deployment, browser acceptance, or SPEC-224 end-to-end acceptance.
