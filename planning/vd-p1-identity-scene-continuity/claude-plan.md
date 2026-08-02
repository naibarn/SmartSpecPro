# Implementation Plan — VD visual consistency P1

Date: 2026-08-01
Target: `apps/web`
Status: ready for implementation review; no implementation code has started
Specs: Features 137 v1.3.0, 138 v1.3.0, 139 v1.1.0

This document replaces the stale ordering in the first deep-plan pass. Detailed
section files remain the implementation packets, but their current-worktree
override blocks and `sections/index.md` take precedence over historical claims.

## 1. Outcome and implementation order

The release goal is to keep one Vertical Drama series visually coherent at three
levels:

- Feature 139 locks the broad series look.
- Feature 137 protects character identity during motion.
- Feature 138 locks concrete scene facts; its neighbor-anchor optimization ships
  later as a separate canary.

Order:

1. Recapture current baselines.
2. Shared foundation.
3. Feature 139.
4. Feature 137.
5. Feature 138 P1a.
6. Joint P1 verification and rollout.
7. Feature 138 P1b neighbor-anchor canary.

139 precedes 138 because scene-state authoring receives the effective series look
and may not contradict it. 137 follows 139 because they touch shared prompt/skill
surfaces but remain independently flaggable. P1b is last because it changes
scheduling and reference attachments and has a separate latency/capacity risk.

## 2. Wave 0 — baseline recapture

The historical `basePlan` prerequisite is obsolete: current code already
initializes the plan. Do not make a speculative router fix.

Before editing code:

- capture exact focused file lists and fail sets for video-prompt and start-frame
  suites;
- record current typecheck errors by file/message, not only a count;
- record the known focused failure where the current video-prompt fallback makes
  four executions while one stale test expects two;
- store commands, commit SHA and results under `baselines/`.

Every later gate compares fail-set identity against this refreshed baseline. A raw
pass-count comparison is insufficient.

## 3. Wave 1 — shared foundation

### 3.1 Flags

Register default-off tenant flags in interface, allowed-key list, defaults and
admin grouping:

- `verticalDramaSeriesLookLock`
- `verticalDramaMotionContracts`
- `verticalDramaSceneContinuity`
- `verticalDramaSceneNeighborAnchors`

Keep the shipped `verticalDramaSeriesPresetMixV2` flag independent. The neighbor
flag is an AND-gated child of scene continuity; child-on/parent-off behaves fully
off except for one bounded configuration warning.

Resolve flags once per request and thread booleans into services. With all relevant
flags off, DB reads, prompts, provider payloads, scheduling and persisted shapes
must match the refreshed baseline.

### 3.2 Selected-model prompt budget

Extract the existing media-model prompt-cap resolver into a shared server service.
DB `configJson` wins, then the static registry, then the existing VD default. Keep
an absolute bounded ceiling. Every affected counter and runtime guard uses the
selected model's effective budget; never mechanically truncate a lock.

### 3.3 Pure modules

- `seriesLookLock.ts`: catalog, bounded validation and source-aware effective-look
  resolver.
- `motionProfile.ts`: lenient closed enums, explicit output status, risk floor and
  advice. Missing/invalid data never becomes low-risk.
- `sceneContinuity.ts`: scene grouping, stable membership hash, stale detection,
  compact lock rendering and anchor selection.

All are deterministic and importable by focused tests without I/O.

## 4. Wave 2 — Feature 139 Series Look Lock

### 4.1 Storage and resolver

Keep `bible.presetVisualIdentity` as the only effective identity. Add
`bible.lookLockControl` with mode `inherit_source|genre|manual|none`, inherited
snapshot/source/governance, revision and timestamp.

Every generation reader uses
`resolveEffectiveSeriesVisualIdentity({ bible, presetMixEnabled, lookLockEnabled })`.
Direct `bible.presetVisualIdentity` readers are removed or wrapped. Genre/manual
data becomes inert when the look flag is off; legacy preset behavior remains solely
under the preset-mix flag. Lineage copies safe source/governance metadata and starts
a fresh revision.

### 4.2 Mutation and concurrency

`setSeriesLookLock` is tenant/owner scoped, feature-gated and accepts
`expectedRevision`. It locks and reloads the fresh series row, server-resolves
catalog entries, validates bounded manual fields, merges the fresh bible and writes
control + effective identity atomically. Stale writes return `CONFLICT`; invalid
mode/patch returns `BAD_REQUEST`; missing base returns `PRECONDITION_FAILED`.

Creation persists the chosen look before background storyboard/start-frame work can
race ahead. AI-mix candidates are strictly validated and cannot supply reference
asset authorization.

### 4.3 Prompt ownership

Authoring LLMs receive a compact visual-register fact containing no raw fragment
arrays. One shared final image-prompt assembler resolves the current authorized look
immediately before provider submission, appends normalized positive fragments once,
and merges negatives idempotently. All image-producing paths use it: batch,
per-shot modes, reference frame, paid render, repair, grid, portraits and locations.

Prompt precedence is fixed:

`policy/safety → identity/shot facts → series look → scene state → shot direction → motion`

### 4.4 UI/UX contract

- Target user/JTBD: series creator chooses or changes one look and can see whether
  it is active before generating or repairing frames.
- Existing patterns: reuse CreateSeriesWizard cards, current settings save/error
  behavior and StoryboardPanel chips; verify current symbols before implementation.
- Surfaces: create wizard, series settings, storyboard chip/dialog.
- States: loading, inherited, none, selected, disabled, conflict/reload, save error,
  success and empty.
- Responsive: verify 390x844, 768x1024 and 1440x900; avoid horizontal card overflow.
- Accessibility: keyboard card selection, visible focus, labeled controls/dialog,
  error announcement and contrast.
- Visual direction: Astryx components/tokens only after CLI discovery; no raw
  color/spacing values.
- Copy: Thai-first with explicit inherited/none semantics.
- Evidence: component tests plus browser screenshots/workflow at the three required
  viewports.

## 5. Wave 3 — Feature 137 Motion Contracts

### 5.1 Contract and persistence

Under `verticalDramaMotionContracts`, per-shot and sub-shot skill output gains an
optional categorical `motion_profile`; the bulk pack stays schema-identical and
receives conditional prose only. Persist profile, `effectiveRisk` and
`motionContractStatus: emitted|missing|invalid` on each clip branch.

Candidates with missing/invalid profiles are non-compliant in the existing judged
loop. If all bounded candidates lack valid output, keep the selected legacy prompt,
persist status only, emit an event and do not add another retry.

### 5.2 Observability and activation

Extend existing `frame_analysis` with bounded face-observability fields. With the
flag on, widen its request threshold from two character refs to one in every runner
and router gate. With the flag off, retain today's threshold and byte-identical
behavior.

Every skill section, including bulk and drafting guidance, requires an explicit
runner-supplied activation fact such as `motion_contracts: enabled`. Image presence
alone must never activate it.

### 5.3 Motion rules and cost

Use skill judgment plus a deterministic enum-based risk floor. The judge sees risk
and observability facts; P1 does not add language-dependent prose matching. P1 adds
no LLM call and no render, only bounded token/credit overhead within the existing
call loop.

## 6. Wave 4 — Feature 138 Scene Continuity P1a

### 6.1 State authoring

Create one metered `SceneVisualState` per eligible multi-shot scene. Inputs are
location data/image, member-shot facts, wardrobe facts and the effective Feature
139 look. Store `membershipHash`, member shots, revision, planned metadata,
`manualEdit` and `stale`. Feature 140 remains the only future prop ledger owner.

Planning uses a deterministic idempotency key and fresh-row checks before and after
the external call. Concurrent calls persist/charge once. Membership changes discard
the stale result. Automatic planning never overwrites manual state without force +
expected revision.

### 6.2 Required-state behavior

A mismatched state is marked stale and is never injected. Eligible multi-shot batch
or lazy generation must successfully author/replan its state before paid image
rendering; failure stops before image credit with a retry CTA. Explicit single-shot
generation may continue unlocked with a bounded warning. This distinction replaces
the historical blanket fail-open rule.

### 6.3 Injection and APIs

Inject the compact state into both start-frame authoring modes, batch render plan and
video shot context. Scene concrete lighting/set facts outrank the broad look while
remaining within its register. Add owner-scoped `planSceneVisualState` and
`updateSceneVisualState` with row locking and `expectedRevision` conflicts.

### 6.4 UI/UX contract

- Target/JTBD: creator can see, plan and edit the active scene lock without leaving
  the storyboard workflow.
- Existing patterns: reuse StoryboardPanel grouping/chips and existing owner-scoped
  edit dialog patterns after Astryx discovery.
- Surfaces: scene header, edit/replan dialog, shot provenance/status surface.
- States: loading, absent, stale/replan, manual, conflict, disabled, save error and
  success.
- Responsive/accessibility/evidence: same canonical viewports and keyboard/focus/
  label requirements as Wave 2; browser evidence required.

## 7. Wave 5 — P1 verification and rollout

Run a pure truth table over the legacy preset flag plus four P1 flags, then focused
integration cases for each flag alone, neighbor dependency, all-off parity and
all-on precedence. Confirm every JSONB write uses a locked fresh merge or expected
revision and every new tRPC mutation has tenant/owner validation.

Quality gates:

- refreshed Gate A/B fail-set identity;
- focused Vitest suites per section;
- TypeScript error delta, not a false repo-wide-clean claim;
- skill real-file dormancy and real-LLM opt-in gates;
- UI component tests and three-viewport browser evidence;
- fixed offline/manual GA rubrics and audit-event validation;
- no full prompts, signed URLs or unbounded prose in audit events.

Roll out internal tenant in order: 139, 137, 138 P1a. Each flag remains independently
reversible.

## 8. Wave 6 — Feature 138 P1b Neighbor Anchor

Only after Wave 5 is green, enable the child flag for an internal canary. Resolve and
persist one same-scene anchor id before prompt authoring. Approved wins; otherwise
use the most recent successful same-plan/revision generated frame. Prompt and render
must use that same id. Revalidate ownership and availability before paid render;
failure stops before image credit and never substitutes another asset.

Serialize shots only within a scene; scenes may remain parallel. Model caps come
from selected-model metadata and drop the neighbor before identity/location refs.
Canary gates include p95 batch latency, ≥95% eligible anchor provenance, zero
prompt/render id mismatch, capacity-drop metrics and fresh-episode behavior.

## 9. Explicit deferrals

- Feature 137 video-safe frames, angle packs, standalone post-render observability
  and clip identity QC.
- Feature 138 continuity QC and location coverage packs.
- Duplicate prop storage, automatic re-render cascades, automatic model switching,
  automatic paid regeneration and language-dependent motion prose parsing.
- Regenerate-in-place neighbor anchoring unless focused tests prove it safe.
