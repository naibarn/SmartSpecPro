# Runbook: HyperFrames Marketplace Auto Review

## Normal Rollout

1. Keep all flags off.
2. Run dependency audit and doctor. `hyperframes:doctor` must report
   `mvp_smoke_ready`; if it exits non-zero, fix Node engine, browser,
   FFmpeg/FFprobe, temp workspace, storage, or render font readiness before
   enabling worker execution.
   Use the repo-pinned Node runtime first (`nvm use`, `fnm use`, `mise install`,
   `asdf install`, or `PATH=/home/dev/.nvm/versions/node/v20.20.0/bin:$PATH`)
   so doctor output reflects the intended `>=20.20.0 <21 || >=22.22.0`
   runtime instead of an older shell default.
3. Run `hyperframes:production-rollout-gate`; it must remain blocked until all
   production package/runtime checks are explicitly approved.
   - `runtimeMode: "smoke_only"` allows only the MVP smoke renderer.
   - `installCommandAllowed: false` means do not install `@hyperframes/*`.
   - `requiredEvidence` is the current checklist of missing production proof.
   - Seeded route E2E evidence must be current. The default freshness window is
     24 hours and can be tightened with
     `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS`.
   - Do not use manual env flags to bypass seeded route evidence; the CLI gate
     requires the current `route-evidence.json` and referenced screenshots.
   - When refreshing route UI evidence locally, use a dedicated Playwright port
     instead of touching a shared dev server:
     `PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes`.
     The Playwright web server starts `dev:no-watch` on that port and captures
     current source evidence without stopping port 3000.
   - To validate against an already-running server, pass the exact target:
     `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port> npm --prefix apps/web run e2e:marketplace-hyperframes`.
     Do not stop or kill port 3000 when another session owns it.
4. In Admin, open `Tenants -> Edit Tenant -> Feature Flags -> Media Production
   & HyperFrames`, then enable `marketplaceHyperframesEnabled` for the internal
   tenant.
5. Keep `marketplaceHyperframesWorkerEnabled` off until Node engine, Chrome,
   FFmpeg/FFprobe, fonts,
   storage, and temp workspace checks pass in the worker image.
   `MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true` must be set explicitly after
   that evidence is captured; the rollout gate treats a missing value as
   `ffmpeg_not_ready`.
6. Enable `marketplaceHyperframesWorkerEnabled` only in internal smoke
   environments after `hyperframes:doctor` reports `mvp_smoke_ready`.
   `MARKETPLACE_HYPERFRAMES_RUNTIME_READY` remains a global runtime-readiness
   guard for producer execution and should not be used as the tenant rollout
   switch.
7. Confirm Auto Storyboard Review appears on the internal tenant Product Detail
   page. The default Auto path must start from one primary CTA without opening
   Advanced Auto. The collapsed Advanced Auto area may expose only optional
   add-ons: platform format, quality, image model, audio policy, text policy,
   shot count, and frame evidence strategy.
8. Enable `marketplaceHyperframesLibrarySaveEnabled` after QA and duplicate
   finalize gates pass.
9. Enable `marketplaceHyperframesOperatorEnabled` only for tenants whose
   owner/operator/support roles may use delegated diagnostics.
10. Enable production producer execution only after
    `hyperframes:production-rollout-gate` passes with
    `installCommandAllowed: true`. Set `HYPERFRAMES_RUNTIME_MODE=producer` and
    `HYPERFRAMES_PRODUCTION_RUNTIME_READY=1` together with the worker runtime
    flags; never set them while the rollout gate is blocked.

## Production Evidence Checklist

Close each rollout blocker with dated evidence before setting its matching
environment flag:

| Blocker | Evidence required | Env flag |
| --- | --- | --- |
| `package_install_deferred` | pinned `@hyperframes/producer` and `@hyperframes/cli` versions installed only in the dedicated worker image | `MARKETPLACE_HYPERFRAMES_PACKAGES_READY=true` |
| `pinned_versions_missing` | package versions and lockfile diff reviewed | `MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED=true` |
| `license_not_reviewed` | direct and transitive license review approved | `MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED=true` |
| `native_postinstall_not_reviewed` | native binaries and postinstall scripts reviewed | `MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED=true` |
| `provenance_not_reviewed` | package provenance, registry source, and integrity checks recorded | `MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED=true` |
| `worker_image_not_reviewed` | worker container proof for CPU/memory/duration caps, sandboxing, temp dirs, and no web-thread rendering | `MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED=true` |
| `fonts_not_reviewed` | Thai-capable production fonts verified in the worker image | `MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED=true` |
| `chrome_not_ready` | production Chrome/headless browser version and sandbox mode verified | `MARKETPLACE_HYPERFRAMES_CHROME_READY=true` |
| `ffmpeg_not_ready` | production FFmpeg/FFprobe versions verified with fixture render output | `MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true` |
| `golden_snapshots_missing` | approved golden-frame baseline set for seeded fixtures, including long Thai text and 9:16 safe area | `MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED=true` |

Do not set these flags from local smoke evidence alone. Local doctor can prove
`mvp_smoke_ready`; production rollout requires worker-image and supply-chain
evidence captured in the target deployment environment.

## Rollback

1. Disable `marketplaceHyperframesEnabled` in Admin Tenant Feature Flags.
2. Disable `marketplaceHyperframesWorkerEnabled`.
3. Stop new preview/final jobs.
4. Cancel queued/running jobs where safe.
5. Preserve completed Library items.
6. Purge preview/transient artifacts through retention dry-run then purge.
7. Disable affected templates if rollback is template-specific.
8. Confirm Standard Order still starts `storyboard_images` and `full_video`.
9. Review failed/dead-letter metrics and sanitized diagnostics.

## Operator Controls

Operator actions must be permission-gated and audited:

- inspect sanitized diagnostics through
  `marketplaceCapture.inspectHyperframesRenderDiagnostics`;
- cancel queued/running render job through
  `marketplaceCapture.cancelHyperframesRenderJobAsOperator`;
- replay dead-letter job through `marketplaceCapture.replayHyperframesDeadLetter`
  only when input hash, replay token, template, feature access, and operator
  reason are current;
- disable template through `marketplaceCapture.disableHyperframesTemplate`;
- enable template through `marketplaceCapture.enableHyperframesTemplate`;
- dry-run retention purge.

Admin/system-agent roles can use the operator procedures directly. Delegated
owner/operator/support roles require `marketplaceHyperframesOperatorEnabled`.
All operator actions write sanitized `hyperframes_operator_action` audit events
through the audit logger and `api_audit_events` when DB persistence is
available.

Never expose signed URLs, local paths, raw HTML, storage keys, stack traces, or
secrets in normal user UI.

Admin UI mounts `HyperframesOperatorDiagnosticsPanel` on
`/admin/marketplace-capture`. The panel can load by render job ID, auto-fills
the current composition input hash from sanitized diagnostics, receives the
operator replay token from the diagnostics procedure, and renders sanitized
diagnostics only.

## Retention Defaults

- input JSON: 30 days for review, retained with Library provenance when finalized;
- composition HTML: 7 days for preview, raw body purged before long retention;
- snapshots: 7 days for preview unless golden fixture;
- preview MP4/WebM: 7 days unless saved to Library;
- subtitles: same as paired render;
- manifest: 90 days, sanitized;
- sanitized logs: 30 days, 90 days for dead-letter/operator replay.

Preview cleanup must never delete Library-owned copies.
