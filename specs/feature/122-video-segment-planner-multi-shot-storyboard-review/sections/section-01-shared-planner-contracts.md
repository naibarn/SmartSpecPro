# Section 01: Shared Planner Contracts

## Goal

Create the framework-independent `apps/web/shared/videoSegmentPlanner/` module. This section establishes the contracts, model capability profiles, deterministic segment planning, and legacy per-shot synthesis helpers that all later sections consume.

## Files To Create

- `apps/web/shared/videoSegmentPlanner/contracts.ts`
- `apps/web/shared/videoSegmentPlanner/capabilityProfiles.ts`
- `apps/web/shared/videoSegmentPlanner/planner.ts`
- `apps/web/shared/videoSegmentPlanner/legacySynthesis.ts`
- `apps/web/shared/videoSegmentPlanner/index.ts`
- `apps/web/shared/videoSegmentPlanner/__tests__/contracts.test.ts`
- `apps/web/shared/videoSegmentPlanner/__tests__/capabilityProfiles.test.ts`
- `apps/web/shared/videoSegmentPlanner/__tests__/planner.test.ts`

## Contracts

Define zod schemas and exported types for:

- `VideoSegmentStructureMode`: `per_shot`, `adaptive_multi_shot`, `compact_multi_shot`, `manual_group_size`
- `VideoSegmentPlannerInput`
- `VideoSegmentPlannerShot`
- `VideoModelSegmentCapability`
- `VideoSegmentPlan`
- `VideoSegment`
- `VideoSegmentSubShot`
- `VideoSegmentWarning`
- `VideoSegmentPlanWarning`

The contracts must include `sourceSurface`, `mode`, `effectiveMode`, `videoModelId`, `provider`, `transport`, `audioStrategy`, `referenceMode`, `creativeBrief`, `creativePresets`, `segments`, `fallbackReason`, and deterministic warnings.

`VideoSegmentPlanWarning` should be the API-facing union used by preview/regeneration responses. It must cover planner warnings, creative-brief warnings, access warnings, credit warnings, and fallback warnings without requiring client pages to inspect provider-specific error payloads.

## Capability Profiles

Implement:

- `UNKNOWN_VIDEO_SEGMENT_CAPABILITY`
- `resolveVideoModelSegmentCapability(input)`
- `capabilityFromMediaModelConfig(config)`

Capability data may be read from media model config metadata, but generation must not enable multi-shot from display-name heuristics alone. Unknown models fallback to per-shot.

Source priority:

1. `capabilities.videoSegment` on media model config metadata.
2. conservative provider-template hints for reviewed MCP providers.
3. display-name heuristics for warnings/suggestions only.

Paid multi-shot generation must not be enabled by display-name heuristics alone.

## Planner Rules

Implement `planVideoSegments(input)`:

- `per_shot` creates one segment per shot.
- unsupported capability returns per-shot with fallback reason.
- adaptive mode groups adjacent natural product-review beats within capability duration/reference limits.
- compact mode groups more aggressively but still respects capability.
- manual group size clamps to capability limits.
- segment IDs are stable and deterministic.
- all outputs preserve shot order and lineage.

## Test First

Add tests before implementation:

- valid/invalid contract parsing;
- unknown capability fallback;
- media model config capability wins over heuristics;
- `capabilities.videoSegment` is parsed as the primary structured capability source;
- provider-template hints enable only conservative reviewed defaults;
- per-shot parity;
- adaptive grouping under Veo/Kling/Seedance-like capabilities;
- manual group clamping;
- deterministic segment IDs and warnings.

## Verification

```text
npm --prefix apps/web test -- --run shared/videoSegmentPlanner/__tests__/contracts.test.ts shared/videoSegmentPlanner/__tests__/capabilityProfiles.test.ts shared/videoSegmentPlanner/__tests__/planner.test.ts
```

## UI/UX Contract

### Target User / JTBD

N/A for direct UI. This section creates shared contracts and planner logic used by later Marketplace Capture and Storyboard Review surfaces.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Shared planner module | `apps/web/shared/videoSegmentPlanner/` | no direct UI; provides typed planner output for downstream UI |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| N/A | N/A | no component changes in this section | sections 04 and 05 consume planner contracts |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| default per-shot | downstream UI receives one segment per shot | shared planner tests |
| fallback | downstream UI receives deterministic warning/fallback data | shared planner tests |
| unsupported model | downstream UI can safely render per-shot fallback | shared planner tests |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | no direct UI impact | section 04/05 evidence later |
| tablet 768x1024 | no direct UI impact | section 04/05 evidence later |
| desktop 1440x900 | no direct UI impact | section 04/05 evidence later |

### Accessibility Acceptance

N/A. No controls or visible content are added in this section.

### Copy Contract

Planner warning codes and fallback reasons must be concise, localizable, and safe to surface. They must not include provider secrets, raw provider payloads, or internal stack traces.

### Browser Evidence Required

N/A for this section. Browser evidence is required when the contracts are rendered in sections 04 and 05.

## Implementation Notes

- Implemented shared module in `apps/web/shared/videoSegmentPlanner/` with zod contracts, capability profile resolution, deterministic segment planning, and legacy per-shot synthesis.
- Planner defaults to per-shot unless structured capability config allows grouping; display-name heuristics do not enable paid multi-shot by themselves.
- Verification passed:
  - `npm --prefix apps/web test -- --run shared/videoSegmentPlanner/__tests__/contracts.test.ts shared/videoSegmentPlanner/__tests__/capabilityProfiles.test.ts shared/videoSegmentPlanner/__tests__/planner.test.ts`
