# Section 02 — Stop persistence and durable jobs

## Goal

Persist optional stop prompt/image state additively and provide durable,
tenant-safe prompt and image lifecycle operations with hash/CAS protection.

## Owned files

- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/server/services/verticalDramaShotPromptJobs.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaRouteAssurance.ts`
- related start-frame image task helpers and focused router/service tests

## Additive frame fields

## Implementation status

Complete. Stop prompt/image fields, role-scoped Redis jobs, tenant ownership,
row-locked merges, prompt hashes, and stale task guards are implemented.

Add optional fields to `startFramePlan.frames[]`: stop prompt, negative prompt,
prompt mode/origin/analysis, `approvedStopFrameAssetId`,
`staleStopFrameAssetId`, stale reason/time, stop task marker, start/stop prompt
hashes, expected-start hash, bounded semantic handoff/source revision, and pair
QC metadata. Missing fields mean legacy start-only state.

Use lowercase UTF-8 SHA-256 values as `sha256:<hex>`. Build source revision from
stable sorted-key JSON containing authoritative synopsis, shot context,
continuity locks, reference mapping, and current start hash. Never hash or log
provider URLs.

## Job contract

Extend the existing `vertical_drama_shot_prompt_jobs` payload with
`frameRole: "start" | "stop"`, preserving start defaults and idempotency. Stop
enqueue/status uses concrete router procedures:
`generateShotStopFramePrompt`, `getShotStopFramePromptJob`,
`getActiveShotStopFramePromptJob`, `executeShotStopFramePromptJob`.
Stop execution receives full current start prompt/negative prompt, start hash,
semantic handoff, authoritative synopsis, and the same canonical reference
manifest. A changed start hash causes a retryable stale/CAS rejection with no
overwrite.

Image procedures are `saveShotStopFramePrompt`, `submitShotStopFrameImage`,
`persistShotStopFrameImageTask`, `setApprovedStopFrameAsset`,
`replaceApprovedStopFrameAsset`, and `clearApprovedStopFrameAsset`. They mirror
the start image admission/task boundary, require explicit user action and
credit confirmation, and never accept a trusted provider URL from the browser.

## Merge/invalidation rules

- Whole start-plan regeneration and every existing frame writer preserve stop
  fields by shot number.
- Start prompt/source/continuity/reference changes move the active stop asset to
  stale inspection state, clear the approved pointer, and block video attach.
- Start image-only replacement invalidates pair evidence but keeps stop prompt.
- Stop prompt edit or stop asset selection invalidates pair evidence.
- Only an explicit confirmed full reset clears both roles.
- Late provider results remain in history but cannot become approved when hash,
  owner, shot, role, or idempotency does not match.

## Test-first stubs

Hash/source revision, JSONB merge, legacy rows, stale separation, reset,
ownership, deduplication, CAS, worker authorization, no-double-charge, task
resume, and authorized asset selection.

## Dependencies and outputs

Consumes Section 01 normalized result/handoff. Exposes stable frame fields,
procedures, job status, and approved stop asset IDs to Sections 03–05.

## UI/UX Contract

### Target User / JTBD

No UI owned here; durable state must let the creator resume the same role after
reload.

### Surface Inventory

No direct surface. Section 04 consumes status, errors, and authorized URLs.

### Component Map

No components. Router contracts are the UI boundary.

### State Matrix

Server states exposed to UI: empty, queued, processing, completed, failed,
stale, expired, and unauthorized; role is always explicit.

### Responsive Matrix

Not applicable; no layout changes.

### Accessibility Acceptance

No direct accessibility surface; errors must be distinguishable for Section 04
status text.

### Copy Contract

Return stable error codes/details; client owns Thai/English copy.

### Browser Evidence Required

No browser evidence owned here; verify through the authenticated storyboard flow.
