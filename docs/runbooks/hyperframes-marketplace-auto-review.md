# Runbook: HyperFrames Marketplace Auto Review

## Normal Rollout

1. Keep all flags off.
2. Run dependency audit and doctor. `hyperframes:doctor` must report
   `official_runtime_ready` before user-facing HyperFrames completion is
   allowed. `diagnostic_ready` is useful for plumbing checks only and must not
   unlock render completion, Library save, or credit charging.
   Use a Node >=22.22 worker runtime for official HyperFrames execution because
   the pinned HyperFrames packages require Node 22+.
3. Run `hyperframes:fixture-render` and `hyperframes:official-compatibility`
   with the Node >=22.22 worker image. The fixture command must produce a
   manifest with `renderer: "hyperframes_cli_official"` or
   `renderer: "hyperframes_producer_official"` and `officialRuntime: true`.
   The worker stages a Thai-capable font as
   `assets/fonts/smartspec-thai-runtime.ttf`; generated composition HTML must
   lint cleanly with the official HyperFrames CLI, not just SmartSpecPro smoke
   tooling.
4. Run `hyperframes:snapshot-test`, `hyperframes:rollback-drill`, then
   `hyperframes:production-rollout-gate`. The rollout gate reads the generated
   evidence artifacts and must remain blocked until all package/runtime/browser/
   fixture/golden/rollback checks are current and explicitly proven.
   - `runtimeMode: "official_runtime_blocked"` allows only diagnostics and
     disabled/blocked projections.
   - `runtimeMode: "official_cli_ready"` allows the dedicated worker to render
     with the pinned HyperFrames CLI.
   - `runtimeMode: "official_producer_ready"` allows the dedicated worker to
     render with `@hyperframes/producer` or producer server.
   - `installCommandAllowed: false` means do not enable official runtime in the
     worker.
   - `requiredEvidence` is the current checklist of missing production proof.
   - Seeded route E2E evidence must be current. The default freshness window is
     24 hours and can be tightened with
     `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS`.
   - Do not use manual env flags to bypass evidence; the CLI gate requires the
     current evidence JSON files and referenced screenshots/fixtures.
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
5. Keep `marketplaceHyperframesWorkerEnabled` off until Node >=22.22, Chrome,
   FFmpeg/FFprobe, fonts,
   storage, and temp workspace checks pass in the worker image.
   `MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true` must be set explicitly after
   that evidence is captured; the rollout gate treats a missing value as
   `ffmpeg_not_ready`.
6. Enable `marketplaceHyperframesWorkerEnabled` only in internal environments
   after `hyperframes:doctor` reports `official_runtime_ready` for the worker
   image.
   `MARKETPLACE_HYPERFRAMES_RUNTIME_READY` remains a global runtime-readiness
   guard for official runtime execution and should not be used as the tenant rollout
   switch.
7. Confirm Auto Storyboard Review appears on the internal tenant Product Detail
   page. The default Auto path must start from one primary CTA without opening
   Advanced Auto. The collapsed Advanced Auto area may expose only optional
   add-ons: platform format, quality, image model, audio policy, text policy,
   shot count, and frame evidence strategy.
8. Confirm Storyboard Review final composite opens with the HyperFrames prompt
   and payload preview visible before final render, and that edits to the style
   brief/text/subtitle/audio controls are reflected in the submitted
   `HyperframesFinalCompositeConfig`.
9. Enable `marketplaceHyperframesLibrarySaveEnabled` after QA and duplicate
   finalize gates pass.
10. Enable `marketplaceHyperframesOperatorEnabled` only for tenants whose
   owner/operator/support roles may use delegated diagnostics.
11. Enable production official runtime execution only after
    `hyperframes:production-rollout-gate` passes with
    `installCommandAllowed: true`. Start with `HYPERFRAMES_RUNTIME_MODE=cli`
    and `HYPERFRAMES_OFFICIAL_RUNTIME_READY=1`; promote to
    `HYPERFRAMES_RUNTIME_MODE=producer` only after canary metrics and rollback
    proof are accepted. Never set them while the rollout gate is blocked.

## Production Evidence Checklist

Close each rollout blocker with dated evidence before enabling the worker:

| Blocker | Evidence required | Artifact |
| --- | --- | --- |
| `package_install_deferred` | pinned `hyperframes` and `@hyperframes/producer` versions installed only in the dedicated worker image | `dependency-audit-report.json` |
| `pinned_versions_missing` | package versions and lockfile diff reviewed | `dependency-audit-report.json` |
| `license_not_reviewed` | direct package license/no-declared-license review recorded | `dependency-audit-report.json` |
| `native_postinstall_not_reviewed` | native binaries and postinstall scripts reviewed | `dependency-audit-report.json` |
| `provenance_not_reviewed` | registry source and integrity checks recorded | `dependency-audit-report.json` |
| `worker_image_not_reviewed` | worker runtime proof for Node, Chrome, FFmpeg, fonts, temp dirs, and storage | `doctor-report.json` |
| `fonts_not_reviewed` | Thai-capable production fonts verified in the worker image | `doctor-report.json` |
| `chrome_not_ready` | Chrome/headless browser version verified | `doctor-report.json` |
| `ffmpeg_not_ready` | FFmpeg/FFprobe versions verified | `doctor-report.json` |
| `official_cli_not_ready` | HyperFrames CLI compatibility fixture passes in Node >=22.22 | `official-compatibility-report.json` plus `fixture-render-manifest.json` |
| `rollback_not_verified` | runtime disable/rollback drill preserves completed artifacts and Standard fallback | `rollback-evidence.json` |
| `golden_snapshots_missing` | official fixture golden baseline, safe area, duration, audio/video, and required cases approved | `snapshot-test-manifest.json` |

Do not set env flags from diagnostic evidence alone. Production rollout requires
fresh worker-image, official runtime, supply-chain, route, golden, compatibility,
and rollback evidence captured in the target deployment environment.

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
