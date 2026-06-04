# Runbook: HyperFrames Marketplace Auto Review

## Normal Rollout

1. Keep all flags off.
2. Run dependency audit and doctor.
3. Run `hyperframes:production-rollout-gate`; it must remain blocked until all
   production package/runtime checks are explicitly approved.
4. Enable `MARKETPLACE_HYPERFRAMES_ENABLED` for internal environment only.
5. Add internal tenant to `MARKETPLACE_HYPERFRAMES_TENANT_ALLOWLIST`.
6. Keep worker disabled until Chrome, FFmpeg, fonts, storage, and temp workspace
   checks pass in the worker image.
7. Enable `MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED` with
   `MARKETPLACE_HYPERFRAMES_RUNTIME_READY` only in internal smoke environments
   after `hyperframes:doctor` reports `mvp_smoke_ready`.
8. Enable Auto Storyboard Review preview for internal tenant.
9. Enable `MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE` after QA and duplicate
   finalize gates pass.

## Rollback

1. Disable `MARKETPLACE_HYPERFRAMES_ENABLED`.
2. Disable `MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED`.
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
owner/operator/support roles require `MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED`.
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
