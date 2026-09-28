# Implementation plan: Vertical Drama start/stop frame generation

## 1. Objective and boundaries

Implement Feature 167 in the existing Vertical Drama episode storyboard. The
required start-frame flow remains behaviorally unchanged, but every new start
prompt must be authored as an opening visual beat. Add an optional stop-frame
prompt/image flow per shot. Stop creation is never automatic, never required
for start-only video readiness, and never included in the existing nine-shot
bulk response.

The implementation is TypeScript-only and reuses the existing tRPC, Redis/
BullMQ prompt-job, media-task, JSONB episode-plan, protected `media_assets`,
credit admission, and provider capability boundaries. No SQL migration is
planned for MVP. All edits must be additive and preserve unrelated dirty
worktree changes.

## 2. Existing call path and constraints

The current start flow is: `generateShotStartFramePrompt` enqueues a durable
prompt job; the worker runs `generateStartFrameShotPrompt` with canonical shot,
character/reference, composition, prompt-mode, and policy facts; the result is
persisted into `startFramePlan.frames[].imagePrompt`; image admission creates a
durable provider task; completion links through `setApprovedStartFrameAsset`;
and motion prompt generation later syncs canonical start assets into clips.
`resolveEpisodePlanAssetUrls` serves authorized media IDs for display/video.

The stop flow must use the same lifecycle with a role discriminator. It must
not use `videoStartMediaAssetId`, generic character references, or the old
`repairStageOutput` path as a shortcut. Existing start test IDs, labels, and
start callbacks remain stable.

## 3. Architecture decision

Use one shared role-aware per-shot prompt-authoring adapter over the existing
resolved prompt-mode skills, with two invocations:

- Start: the current start procedure/job passes `frame_role: "start"` and
  opening-beat instructions. The nine-shot planner stays on its existing v1
  envelope and remains start-only.
- Stop: a new role-explicit procedure/job passes `frame_role: "stop"`, the
  authoritative synopsis, current start prompt/negative prompt, start semantic
  handoff, and start prompt hash. It returns exactly one v2 prompt object.

Do not create a second independent story interpretation. Both roles share
reference ordering, identity locks, shot composition, safety pass, prompt mode,
and source precedence. Only the temporal selection rule differs.

## 4. Section 1 — Shared role-aware prompt contract and skills

### Files

- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- `apps/web/skills/vertical-drama-shot-start-frame-prompt/SKILL.md`
- `apps/web/skills/vertical-drama-shot-start-frame-prompt/skill.md`
- `apps/web/skills/vertical-drama-cinematic-narrative-image-prompt/SKILL.md`
- `apps/web/skills/vertical-drama-cinematic-narrative-image-prompt/skill.md`
- `apps/web/skills/vertical-drama-shot-synopsis-image-prompt/SKILL.md`
- `apps/web/skills/vertical-drama-shot-synopsis-image-prompt/skill.md`
- role-aware schema/fixture files beside existing skill fixtures as required

### Implementation

1. Define an internal `start | stop` role union and normalized v2 single-shot
   output with required `contract_version`, `frame_role`, `prompt`, and
   `negative_prompt`, plus bounded analysis/quality fields.
2. Keep the existing nine-shot render-plan schema and legacy start skill
   readable. Legacy single-shot responses without a role remain accepted only
   for old start callers; new stop responses require the stop role.
3. Add role instructions: start chooses the earliest useful frozen beat before
   the irreversible action/decision; stop chooses the terminal frozen beat or
   immediate aftermath while preserving visual grammar.
4. Keep `policy_safe_rewrite` synopsis-only and run it before final visual
   authoring; never treat `rewritten_synopsis` as an image prompt.
5. Resolve source precedence as current canonical summary, persisted snapshot,
   then legacy current start prompt compatibility source. Mark legacy fallback.
6. Persist a bounded start semantic handoff (opening moment, story meaning,
   continuity locks, source revision) for stop reuse. Legacy frames may omit it.
7. Validate role, version, non-empty prompt, and schema before persistence or
   image admission. Truncation/malformed JSON is retryable with no partial write.
8. Enforce model input limits without silently truncating user/current prompts;
   do not log raw prompt text or full stop context.

### TDD requirements

- Thanwa fixture proves start excludes the phone-hiding terminal action and stop
  selects it as the terminal action.
- Role mismatch, v1 legacy, v2 role-aware, malformed, and truncated responses.
- 6,000-character start prompt survives the stop input boundary byte-for-byte.
- Safety rewrite preserves non-policy wording and event order.

## 5. Section 2 — Shared contract, hashing, JSONB merge, and server API

### Files

- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- `apps/web/server/services/verticalDramaShotPromptJobs.ts`
- `apps/web/server/_core/index.ts` (queue/worker registration only if the shared
  queue payload requires a new role field)
- `apps/web/server/services/verticalDramaRouteAssurance.ts` (register the new
  worker-only stop execution route beside the existing start route)
- focused server tests beside existing Vertical Drama task tests

### Data model

Extend `VerticalDramaStartFramePlan.frames[]` additively with stop prompt,
negative prompt, prompt mode/analysis/origin, approved stop asset,
inspection-only stale asset, stop task marker, prompt/start hashes, stale
reason/time, start semantic handoff, pair metadata, and pair QC.

Use exact UTF-8 persisted prompt hashes in `sha256:<lowercase-hex>` form. Build
source revision from stable canonical JSON with sorted keys containing the
authoritative synopsis, shot context, continuity locks, reference mapping, and
current start prompt hash. Never include provider URLs.

### Writer and concurrency rules

1. Full start-plan regeneration, start prompt save, generic JSONB update, and
   reset merge stop fields by `shotNumber`; only an explicit confirmed full
   reset may clear both roles.
2. Start prompt/source/continuity/reference changes clear the active stop asset
   into `staleStopFrameAssetId`, set reason/time, and prevent video attachment.
   A start-image-only replacement invalidates pair/video evidence but not the
   stop prompt.
3. Stop prompt changes invalidate its image and pair QC. Selecting a new stop
   asset clears stale markers and invalidates pair QC before activation.
4. Stop prompt completion uses `expectedStartPromptHash` and a fresh locked row;
   a changed start hash rejects the result without overwriting current state.
5. Stop image completion carries both hashes; a stale provider result may stay
   in history but cannot become approved.
6. Owner/shot/role/prompt hash/idempotency deduplication prevents duplicate
   prompt jobs or image charges across retry, reload, and navigation.

### API surface

Add these concrete role-specific procedures beside the existing start
procedures: `generateShotStopFramePrompt`, `getShotStopFramePromptJob`,
`getActiveShotStopFramePromptJob`, `executeShotStopFramePromptJob`,
`saveShotStopFramePrompt`, `submitShotStopFrameImage`,
`persistShotStopFrameImageTask`, `setApprovedStopFrameAsset`,
`replaceApprovedStopFrameAsset`, and `clearApprovedStopFrameAsset`.
`verticalDramaShotPromptJobs.ts` receives a `frameRole: "start" | "stop"`
payload, but the existing start enqueue/status behavior remains compatible.
Inputs include owned `seriesId`, `episodeId`, positive `shotNumber`, operation
hashes, `expectedStartPromptHash` where applicable, and an idempotency key.

Every procedure uses the authenticated Vertical Drama procedure and owned-episode
check. The browser never supplies a trusted provider URL or cross-tenant asset.

### Compatibility

No migration/backfill is needed. Missing stop keys render empty; old episodes
never call stop LLM/image paths on load. Start readiness counts approved start
assets only; stop fields cannot block the production wizard.

## 6. Section 3 — Canonical media and video/provider integration

### Files

- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaVideoPromptFormatter.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/shared/verticalDramaSeries/providerRouting.ts` or actual resolver
- focused motion/provider/media URL tests

### Canonical mapping

1. Add pure `syncStopFramesOntoMotionPromptClips` parallel to start sync.
2. For each clip, use the first and last ordered `sourceShotNumbers`; do not
   fall back from missing last stop to an earlier shot or from stop to start.
3. When a selected canonical asset exists, overwrite all LLM start/end IDs.
4. Include frame-level approved stop IDs and clip end IDs in the authorized
   `media_assets` URL batch resolver.
5. Treat stale, expired, deleted, or unauthorized stop selections as absent.

### Capability and grounding

Run canonical sync before effective `motionMode` calculation. Evaluate the
selected model/request for same-request first/last support, reference limits,
and mutual exclusions. Reuse the existing
`verticalDramaSeriesFirstLastFrameBridge` tenant flag for provider attachment
and bridge-mode admission; do not add a second stop-control flag. The Stop
prompt/image controls remain user-selectable even when bridge attachment is
disabled, so users can prepare or inspect a stop frame without an unwanted
credit spend or a hidden control. Use bridge mode only with valid current start
and stop assets; otherwise use the existing start-only/reference mode with
notice.

Formatter adds last-image grounding only when a stop asset is actually attached;
start-only prompts retain current first-image grounding and never mention a
nonexistent last image. Tests cover single/multi-shot order, conflicting LLM
IDs, post-sync mode, stale assets, bridge support, and fallback.

## 7. Section 4 — Storyboard UI and client state

### Files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardReviewPanel.tsx`
- existing locale files used by these surfaces
- focused component/page tests

### Ownership and layout

Keep current start props/callbacks/labels/test IDs. Add role-aware stop props
without inferring role from URLs. The page owns stop jobs/tasks, picker target,
authorized URLs, and errors; the panel renders role states and emits
shot+role actions. Picker target is `{ type: "startFrame" | "stopFrame";
shotNumber }` or equivalent.

Inside each shot card add “ภาพสำหรับวิดีโอ” with equal 9:16 Start/Stop previews
and subtle directional connector. Start remains primary/required; Stop is
complete/optional. Reuse current preview/lightbox/drop/history/library/
confirmation/editor primitives, semantic tokens, and no icon-only primary.

### UI/UX Contract

#### Target User / JTBD

- Role: Vertical Drama creator/editor.
- Goal: Choose start-only or start+stop without wasting credits.
- Entry point: authenticated episode storyboard shot card.
- Success: creator sees independent role state and knows what video receives.

#### Existing Pattern Reference

- Search: targeted `rg` for start-frame drop/upload, Media History/Library
  picker, lightbox, prompt editor, task polling, and `imageSwapTarget`.
- Found: existing start slot/picker in `VerticalDramaStoryboardPanel.tsx` and
  `VerticalDramaEpisodePage.tsx`, plus start task-resume tests.
- Decision: reuse interaction/authorization/task states; diverge only with an
  explicit role discriminator and paired second slot.

#### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Shot card | episode storyboard route | Add frame-pair surface |
| Prompt editor | storyboard panel | Add independent stop editor |
| Media picker | episode page/shared picker | Add stop target |
| Review panel | storyboard review component | Display stop state |

#### State Matrix

| State | Start | Stop | Verification |
| --- | --- | --- | --- |
| empty | existing | empty copy, prompt/picker affordances | component |
| prompt ready | unchanged | AI render enabled; picker available | component |
| loading | existing | independent loading/no duplicate | page/component |
| success | unchanged | thumbnail/prompt/replace/clear/notice | component |
| error | existing | role-specific retry; start usable | failure |
| stale/expired | unchanged | old evidence separate; no attach | mapping |
| unsupported | unchanged | notice only; start enabled | provider UI |
| focus/hover/selected | existing | visible role+shot selection | browser |

#### Responsive Matrix

| Viewport | Behavior |
| --- | --- |
| mobile 390x844 | Stack slots; readable actions; no overflow |
| tablet 768x1024 | Stack or compact columns only when readable |
| desktop 1440x900 | Balanced adjacent 9:16 slots and connector |
| small-mobile 360x800 | Extended dense-layout check |
| laptop 1024x768 | Extended multi-panel squeeze check |
| wide-desktop 1280x800 | Extended storyboard density check |

#### Accessibility Acceptance

Keyboard order is start preview/actions, stop preview/actions, then shared shot
actions. Every preview/action/status/picker has role+shot accessible naming; no
icon-only primary. Disabled explanations distinguish missing start prompt from
missing stop prompt. Existing focus rings, contrast, dark/light, and reduced
motion primitives remain in force.

#### Copy Contract

Thai is primary with English fallback. Required labels include `Start Frame`,
`Stop Frame`, `สร้าง prompt Stop Frame`, `สร้างภาพ Stop Frame`, `เปลี่ยนภาพ
Stop Frame`, and `Stop Frame ไม่บังคับ — ใช้เมื่อเครื่องมือวิดีโอรองรับ`.
Required disabled copy is `สร้าง start prompt ก่อน เพื่อใช้เป็นหลักยึดความต่อเนื่อง`.
Errors distinguish prompt, admission, provider, sync, stale, and expired.
New strings use existing i18n keys and deterministic fallback.

#### Browser Evidence Required

Record evidence in
`specs/feature/167-vertical-drama-start-stop-frame-generation/implementation/ui-browser-evidence.md`
using mobile/tablet/desktop plus extended viewports. Verify console, overflow,
keyboard path, labels, state visibility, and dark/light readability. Mark
unavailable browser/auth checks skipped with blockers, never pass.

## 8. Section 5 — Tests and verification

Write focused tests before implementation changes and retain all existing
start-frame suites. Cover skill/schema semantics; hash/source revision; JSONB
merge/legacy/stale/reset; stop prompt ownership/idempotency/CAS/no-image side
effect; stop image admission/task/poll/sync/retry/no-double-charge; media
authorization; motion mapping/capability/formatter; and UI role isolation,
states, i18n, keyboard/focus, and overflow.

Run from repo root:

```bash
npm --workspace apps/web test -- --environment jsdom <focused-test-files>
npm --workspace apps/web run check
git diff --check
```

Name actual focused files in the section docs. Report unrelated baseline
failures separately. Do not claim live provider, production, browser, or paid
generation proof without corresponding evidence.

## 9. Section 6 — Rollout, observability, and recovery

Reuse `verticalDramaSeriesFirstLastFrameBridge` as the attachment/rollout gate;
there is no new feature flag or migration in MVP. Emit only bounded metadata:
role, pair/source revision, hashes, skill/model version,
job/task ID, credit transaction, capability decision, and final asset ID. Track
prompt generated, image submitted/completed, unsupported-unused, stale, CAS
rejection, and sync failure.

Rollback hides stop controls and removes stop attachment from future video
requests without deleting stored stop prompts/assets. Reconciliation remains
idempotent and distinguishes prompt, admission, provider, import/sync, and
shot-link failures.

## 10. Execution order and ownership

1. Shared types, hash/merge helpers, and role-aware skill/schema contract.
2. Durable stop prompt job and prompt persistence/CAS.
3. Stop image admission/task, asset selection, and URL projection.
4. Motion canonical sync, capability gate, and formatter grounding.
5. Client page/panel/picker wiring and i18n.
6. Focused tests, browser evidence, telemetry, and integration verification.

Sections are sequential because shared contracts/server persistence precede client
and video consumers. Pure-helper tests can be developed with their owner, but
no two writers edit one source file in parallel.

## 11. Completion criteria

The implementation is ready only when start behavior remains compatible; Thanwa
semantic fixtures pass; stop is independently optional with no unwanted credit;
handoff/hash/CAS/stale isolation/durable recovery pass; provider mapping and
fallback pass; legacy episodes load without work; desktop/tablet/mobile evidence
exists or is explicitly blocked; focused tests/typecheck are reported; and at
least five post-implementation gap-review rounds repair every safe must-fix.
