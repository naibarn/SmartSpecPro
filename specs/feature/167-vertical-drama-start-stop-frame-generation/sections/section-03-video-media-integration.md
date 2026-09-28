# Section 03 — Canonical media and video integration

## Goal

Make approved start/stop assets authoritative for motion prompts and provider
requests, while keeping start-only behavior valid and avoiding stale or
unauthorized media attachment.

## Owned files

- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaVideoPromptFormatter.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- actual provider-routing resolver and focused mapping/provider/media tests

## Canonical mapping

## Implementation status

Complete. Approved Start/Stop assets are canonical for motion-pack mapping;
Stop maps to the last ordered source shot and never falls back to Start.

Implement pure `syncStopFramesOntoMotionPromptClips` beside the existing start
sync. For each ordered clip, map the first and last `sourceShotNumbers`; the
last shot's current `approvedStopFrameAssetId` is the only stop source. Never
fall back to an earlier shot, a start asset, raw LLM IDs, or provider URLs.
When an approved current asset exists, overwrite conflicting LLM claims.
Stale, expired, deleted, or unauthorized selections are absent.

Run both sync functions before calculating effective `motionMode`. Use
`verticalDramaSeriesFirstLastFrameBridge` only as the provider attachment and
bridge-mode gate. If the selected provider does not support same-request
first/last frames, or reference limits/mutual exclusions fail, keep existing
start-only/reference mode and show a notice; do not block start readiness.

Extend `resolveEpisodePlanAssetUrls` batch resolution to approved stop IDs with
the same tenant/user authorization and protected cache/Range behavior.

## Formatter contract

Add last-image grounding only when a valid stop asset is attached. Start-only
motion prompts retain their current first-image grounding and must not mention
an absent last image. The provider payload carries canonical IDs/URLs only
after authorization and capability admission.

## Test-first stubs

Single/multi-shot order, conflicting LLM IDs, missing/stale/unauthorized stop,
post-sync mode, bridge flag, provider capability/reference limits, formatter
start-only/first-last wording, and protected URL projection.

## Dependencies and outputs

Consumes Section 02 approved/stale stop fields and exposes canonical clip
contracts for Section 04 UI and Section 05 proof. No changes to start-only
motion behavior outside canonical override and post-sync mode calculation.

## UI/UX Contract

### Target User / JTBD

No UI owned here; the creator needs the storyboard to show whether a selected
stop asset is actually eligible for the video request.

### Surface Inventory

No direct surface. Section 04 renders capability, stale, and attachment
notices from this contract.

### Component Map

No components. Canonical clip/media projections are the integration boundary.

### State Matrix

Expose attached, absent, stale, unauthorized, unsupported, and start-only
fallback outcomes without silently presenting a rejected stop as active.

### Responsive Matrix

Not applicable; no layout changes.

### Accessibility Acceptance

No direct accessibility surface; notices must be actionable text for Section 04.

### Copy Contract

Return reason codes; do not embed locale-specific copy in provider formatting.

### Browser Evidence Required

No browser evidence owned here; UI attachment notices are verified in Section 04.
