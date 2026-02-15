# Text Clip Rollout Runbook (T1)

## Rollout Controls

- Default state: enabled.
- Environment gate: `VITE_ENABLE_TEXT_CLIP_T1`.
  - Disable values: `0`, `false`, `off`, `disabled`, `no`.
- Runtime canary override: `window.__SMARTSPEC_FEATURES__.textClipT1` (`true`/`false`).
- Server admission gate:
  - `TEXT_CLIP_T1_ENABLED` (default `true`)
  - `TEXT_CLIP_T1_ENABLED_TENANTS` (optional comma-separated tenant allowlist)
  - When allowlist is configured, missing tenant context fails closed for text-bearing jobs.

When disabled:
- Add Text entry points are hidden from toolbar/sidebar.
- Existing non-text editing and export flows remain unchanged.
- Direct media job submission with text semantics is rejected server-side.

## Required Telemetry Fields

Render result `derived.textRender` must include:
- `jobId`
- `strategy` (`drawtext` or `ass`)
- `assApplied` (`true` when ASS path is used)
- `fastPathEligible`
- `fastPathReason`
- `fontFallbackCount`
- `fontResolution[]` (`clipId`, `requested`, `resolved`, `fallback`)
- `textClipCount`
- `versionPolicyOutcome`

## Alert Triggers (15-Min Window)

- `text_render_failure_rate_above_slo` when failure rate `> 0.5%`.
- `text_render_parity_budget_exceeded` when parity error rate `> 0.5%`.
- `text_render_fast_path_misclassification_spike` when misclassification count `>= 3`.

## Incident Triage Checklist

1. Capture failing `jobId` and timestamp window.
2. Inspect `derived.textRender` values (`strategy`, `fastPathReason`, `versionPolicyOutcome`).
3. Verify font resolution outcomes and fallback counts.
4. Confirm whether failures are drawtext-only or affect canonical ASS path.
5. Classify impact:
   - parity-only mismatch,
   - render failure,
   - compatibility-policy rejection.

## Rollback Procedure

1. Disable text rollout gate (`window.__SMARTSPEC_FEATURES__.textClipT1=false` and/or `VITE_ENABLE_TEXT_CLIP_T1=false`).
2. Keep project payloads intact; do not mutate existing timeline JSON.
3. Re-run baseline health checks.

## Post-Rollback Verification

- `legacyProjectsLoadSaveOk` is `true`.
- `nonTextRenderSuccessRateOk` is `true`.
- `textFeatureDisabled` is `true`.
