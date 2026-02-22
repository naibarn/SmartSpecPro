# Feature 018 Operations Runbook

## Rollout Guardrails

### Feature Flags
- `PRESENTATION_EDITOR_ENABLED`
  - Purpose: global presentation editor read/write gate.
  - Safe default: `true` in dev, controlled rollout in production.
- `PRESENTATION_EXPORTS_ENABLED`
  - Purpose: export write gate (`triggerExport`) while preserving read-only slideshow/status paths.
  - Emergency action: set to `false` to stop new export writes immediately.

### Cohort Rollout Sequence
1. Enable `PRESENTATION_EDITOR_ENABLED` for internal tenants only.
2. Validate baseline conflict/conversion/export metrics for 24h.
3. Enable `PRESENTATION_EXPORTS_ENABLED` for pilot cohort.
4. Expand by tenant cohorts after alert checks remain below thresholds.
5. Pause rollout and investigate if any alert threshold is breached.

## Alert Thresholds (MVP)
- `conflict_rate_exceeded`: conflict rate > `5%`
- `conversion_failure_rate_exceeded`: conversion failures > `3%`
- `queue_latency_p95_exceeded`: queue p95 latency > `120000ms`
- `export_failure_rate_exceeded`: export failures > `4%`
- `throttle_rejection_rate_exceeded`: throttle rejections > `20%`
- `duplicate_suppression_too_low`: duplicate suppression < `1%`

## Rollback Triggers
- Sustained conflict alert breach for 15+ minutes.
- Export failure rate breach for 15+ minutes.
- Conversion failure rate breach after a rollout expansion.
- Confirmed tenant isolation/security regression.
- Queue latency alert combined with elevated export retries.

## Rollback Checklist
1. Set `PRESENTATION_EXPORTS_ENABLED=false` to stop new export writes.
2. If issue is broader, set `PRESENTATION_EDITOR_ENABLED=false`.
3. Verify read safety:
   - existing deck reads still respond deterministically
   - slideshow/status reads remain available for diagnostics
4. Verify no new export jobs are accepted after disable.
5. Capture incident metrics/log snapshot for postmortem.
6. Communicate status and ETA to on-call owners/stakeholders.

## Verification Steps Post-Rollback
- Conflict/error rates trend back to baseline.
- No ongoing queue growth from presentation exports.
- Conversion path health restored before re-enable.
- Smoke checks pass for editor guard, deck reads, and export deny path.

## Launch-Week Ownership
- Conflict/Concurrency incidents: Backend API owner.
- Conversion fidelity/incidents: Import/compatibility owner.
- Export queue/throttle incidents: Media/export pipeline owner.
- Feature-flag and rollout operations: On-call release manager.
