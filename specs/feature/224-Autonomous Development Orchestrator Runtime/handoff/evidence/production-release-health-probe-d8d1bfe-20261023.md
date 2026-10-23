# Linux Release and Public HTTPS Health Probe — 2026-10-23

- Release source: `d8d1bfe8606fb063f4829c6291a797fcb9757038` on `refs/heads/main`.
- Release ID: `smartspec-web-d8d1bfe8606fb063f4829c6291a797fcb9757038-069b233fc740`.
- Canonical build artifact: `sha256:498974bd106f206294774f927584a83b3b1f7599958813dc3b58bb0d652985f8`.
- Release package digest: `sha256:069b233fc7401255227bdd4fac8813e1ec9d7c94a757394f16f9938c79238638`.
- Public artifact digest: `sha256:a18eeda508df167c52120ce76d7cfb4a5c5dea724077442f08d1b139b7bd9bc2`.
- Deployment manifest: `/home/dev/production-releases/smartspec-web-current/release-manifest.json`; it records `deployed_at=2026-10-23T00:38:57.157079+00:00`, generation 42, and the exact source/artifact digests above.
- Runtime link resolved to `/home/dev/production-releases/smartspec-web-d8d1bfe8606fb063f4829c6291a797fcb9757038-069b233fc740-g42`.
- Observed service state: `smartspec-web.service` active/running; process start time 2026-10-23 07:39 +07:00.
- Public HTTPS probe at 2026-10-23 00:42:56 UTC: `GET https://smartaihub.app/api/health` returned `200` and `{"status":"ok","service":"smartaihub-web","uptimeSeconds":247}`; `HEAD https://smartaihub.app/` returned `200`.
- This verifies release promotion and basic public health only. Authenticated UI behavior, exact DevelopmentRun authorization, protected Windows Runner execution, crash/restart recovery, and SPEC-224 end-to-end acceptance remain unverified.
- The release was performed by a separate active session through the repository's existing sudo-gated release workflow; this record reports observed deployment evidence.
