# section-12-production-wizard-guided-workflow

## Goal

Add a guided Production Wizard to the Vertical Drama episode workspace so series
and episode generation follow one clear order:

```text
series setup
  -> episode script (dialogue-complete, density-validated — spec §7.7.2)
  -> 9-shot storyboard
  -> script quality QC + auto-improve (spec §16.1, section-14 — scores
     script + storyboard together, before any paid image/video credits)
  -> approved start frames
  -> whole-episode dialogue/audio plan
  -> dialogue & density QC gate (spec §7.7/§14.1, section-13)
  -> video motion prompt pack
  -> shot-level review/repair
  -> video clip generation
  -> final assembly + memory checkpoint
```

Ordering note (2026-07-07): the script-quality step sits AFTER the storyboard
because the shipped `vertical-drama-episode-quality-review` skill scores a
finished script + storyboard together (spec §6.8.1) and its tie-in checks
count storyboard shots (§13.1) — and BEFORE start frames because that is the
first paid stage (the Phase 3B intent: review before credits are spent). The
script step itself still carries its own deterministic density validation
(underfilled script blocks storyboard, §7.7.2) which needs no storyboard.

The wizard must prevent the user from accidentally jumping into video prompt or
video generation before the upstream story, frame, dialogue, and QC layers are
ready. Expert users may still open any stage for inspection or targeted repair,
but the primary CTA always points to the next safe production step.

## Depends On

- section-03-dashboard-routes-feature-flags
- section-04-series-memory-and-episode-pipeline
- section-05-character-stock-and-start-frames
- section-07-audio-dialogue-subtitles
- section-08-provider-qc-product-tie-in
- section-10-ui-redesign-genre-presets-story-generation
- section-11-user-and-admin-preset-ownership
- section-13-story-dialogue-density-reform (density gate inputs)
- section-14-script-quality-qc-auto-improve (script QC step + policy floors)

Feature flag: `verticalDramaSeriesProductionWizard` (requires
`verticalDramaSeriesQualityLoopV2` for the gate steps). Spec anchor: §8.8.

## Product Problem

The current episode workspace exposes many powerful actions at once. That is
useful for debugging, but it lets users:

- generate a single shot video prompt before the whole episode has coherent
  dialogue;
- regenerate prompts from stale or fallback dialogue;
- create long 6-8 second clips with only 1-2 seconds of spoken content;
- confuse repair actions with the main production path;
- spend image/video credits before story pacing, approved frames, and dialogue
  timing have passed basic QC.

Vertical drama needs continuity. The system must think in whole-episode story
beats first, then slice those beats into shots. Per-shot repair remains
available, but it must be clearly labeled as a repair tool, not the default way
to build the episode.

## Wizard Shape

### Navigation Model

The wizard is a stepper embedded in `VerticalDramaEpisodeWorkspace`, above the
existing focused-stage detail panel.

Each step has:

- `stepId`
- display label in Thai and English
- source pipeline stage(s)
- status: `locked`, `ready`, `running`, `passed`, `needs_repair`, `optional`,
  `skipped`, `blocked`
- primary CTA label
- secondary actions
- credit-spend indicator
- current evidence summary
- blocking reason codes
- repair target when blocked

The existing stage-card grid may remain available as an expert/detail surface,
but it must not compete with the wizard's primary CTA.

### Required Steps

| Wizard step | Pipeline stage(s) | Primary outcome |
|---|---|---|
| 1. Series setup | series bible, characters, presets | Series has title, premise, episode count, genre preset, and required characters |
| 2. Episode script | `plan_episode_script` | Episode script is dialogue-complete (spec §7.7.2) with enough story/dialogue material for target duration |
| 3. Storyboard shots | `storyboard_shotgrid` | 9-shot structure exists, follows the episode script, persists `sourceBeatIndexes` + per-shot speech budgets |
| 4. Script quality QC | `episode_quality_review` artifacts + section-14 loop | Scorecard v2 (scores script + storyboard, §6.8.1) meets policy floors, or the bounded auto-improve loop ran and passed/escalated with evidence; tie-in naturalness (§13.1, needs storyboard shot data) passes when tie-in enabled |
| 5. Start frames | `start_frame_render_plan`, `render_or_import_start_frames`, `approve_start_frames` | Every required shot has an approved main start frame |
| 6. Dialogue/audio plan | `dialogue_audio_plan` | Dialogue distributed/enriched from the script at whole-episode level, then assigned to shots/clips |
| 7. Dialogue & density QC | deterministic dialogue quality (spec §7.7.1/§14.1) | Whole-episode spoken content and per-shot density pass thresholds |
| 8. Video prompts | `video_motion_prompt_pack` | Provider-ready motion prompts generated from approved frames + passing dialogue plan (duration/budget-aware first pass) |
| 9. Shot repair | stage-specific repair procedures | Only failing shots/prompts/frames/dialogue are repaired |
| 10. Video clips | `render_or_import_video_clips` | Paid clip generation/import completes for every required clip |
| 11. Final episode | `assemble_episode_manifest`, `summarize_episode_to_series_memory` | Final assembled episode and memory checkpoint are created; arc drift check runs (§7.7.3) |

## Gating Rules

### Main Flow Gates

0. `storyboard_shotgrid` must be locked until:
   - the episode script exists and is dialogue-complete;
   - the script is not `VD_DIALOGUE_EPISODE_UNDERFILLED` at error level (spec
     §7.7.2). (Deterministic check only — the LLM scorecard needs the
     storyboard and therefore cannot gate this step; see Gate 0b.)

0b. `start_frame_render_plan` / `render_or_import_start_frames` (the first
   PAID stage) must be locked until:
   - the script-quality scorecard v2 exists (scores script + storyboard,
     spec §6.8.1) and meets policy floors, or the auto-improve loop has
     passed, or an expert-mode override is recorded (spec §16.1);
   - when tie-in is enabled: the tie-in naturalness report passes or the
     tie-in is repaired/deferred/overridden (spec §13.1).

1. `video_motion_prompt_pack` must be locked until:
   - storyboard exists;
   - all required start frames are approved;
   - `dialogue_audio_plan` exists;
   - dialogue QC has no blocking `error` issues.

2. `render_or_import_video_clips` must be locked until:
   - video prompt pack exists;
   - every clip has a prompt;
   - every required clip has a model/provider route;
   - no blocking provider/QC/product tie-in issue remains.

3. `assemble_episode_manifest` must be locked until:
   - every required video clip is complete or intentionally imported;
   - clip durations align with the duration profile;
   - audio/subtitle strategy is resolved.

4. Per-shot actions are always secondary. They may be available in the focused
   detail panel, but their copy must say "repair" or "regenerate this shot",
   never imply they are the main build path.

### Script Quality QC Gate (step 4 — spec §16.1, section-14)

- runs the quality-review scorecard (v2) against the policy floors once the
  script AND storyboard exist (the skill scores them together, §6.8.1); in
  guided mode `autoRunReviewAfterStoryboard` triggers it automatically;
- the primary unblock CTA is the bounded auto-improve loop ("ปรับอัตโนมัติ
  สูงสุด {n} รอบ"); escalations (`escalated_max_rounds`,
  `escalated_regression`) surface both reports and switch the CTA to manual
  repair;
- expert mode may proceed below floor only via a recorded override;
- when tie-in is enabled the step also shows the §13.1 naturalness verdict
  with repair/defer/override actions.

### Dialogue & Density QC Gate (step 7)

The wizard must treat dialogue as whole-episode state. All thresholds come
from the canonical module `shared/verticalDramaSeries/dialogueQuality.ts`
(spec §7.7.1) — the gate re-uses `analyzeVerticalDramaEpisodeDialogueQuality`
/ `analyzeVerticalDramaClipDialogueQuality`, never local numbers:

- 60-second episodes target roughly 35-50 seconds of spoken content
  (`MIN_EPISODE_COVERAGE_RATIO` warning floor, `ERROR_EPISODE_COVERAGE_RATIO`
  blocking floor) unless the user explicitly marks the episode as
  visual/silent.
- 6-8 second speaking shots target `targetVerticalDramaSpeechSeconds(d)`;
  below `MIN_CLIP_COVERAGE_RATIO` warns, below `ERROR_CLIP_COVERAGE_RATIO`
  blocks; continuous silence > 2.5s inside a speaking clip is flagged with
  its position (spec §14.1).
- visual-only shots require explicit `silenceIntent` and are capped (max 2
  of 9) unless the episode is visual-first.
- duplicate dialogue across unrelated shots is an error
  (`VD_DIALOGUE_DUPLICATE`).
- stage directions or sound cues inside dialogue are errors
  (`VD_DIALOGUE_STAGE_DIRECTION`).
- dialogue from `script_fallback` is a warning until reviewed or regenerated
  (`VD_DIALOGUE_SCRIPT_FALLBACK`).

If dialogue QC fails:

- block video prompt pack generation;
- show the total estimated speech seconds and target range;
- recommend "Repair whole episode dialogue plan" first;
- offer "Repair only this shot" only for isolated shot-level failures.

## Repair Model

The wizard separates main production from repair.

### Repair Levels

| Repair level | Trigger | Action |
|---|---|---|
| Script repair | Episode has too little story/dialogue source material | Repair/regenerate `plan_episode_script`, then mark downstream stages stale |
| Whole dialogue repair | Script has enough story but dialogue timing/density fails | Regenerate `dialogue_audio_plan` for the whole episode, then sync to clips |
| Shot dialogue repair | One or two shots have bad/stale/duplicate dialogue | Regenerate `clip.dialogue` for those shots with duration-aware target |
| Start-frame repair | Shot image does not match story/dialogue | Repair or replace start frame for that shot, then mark affected prompt/clip stale |
| Video prompt repair | Dialogue/frame is good but prompt is wrong | Regenerate only affected prompt(s) |
| Clip repair | Prompt is good but rendered video failed | Regenerate/import only affected clip(s) |

### Stale Propagation

Every repair must mark downstream outputs stale without deleting them:

- script repair stales storyboard, start frames, dialogue plan, video prompts,
  video clips, assembly;
- storyboard repair stales affected start frames, dialogue mapping, video
  prompts, clips, assembly;
- start-frame repair stales affected video prompts, clips, assembly;
- whole dialogue repair stales video prompts, clips, assembly;
- shot dialogue repair stales that shot's video prompt, video clip, assembly;
- video prompt repair stales that clip's rendered video and assembly.

The UI must show stale-but-preserved artifacts so users can compare old vs new.

## Recommended Implementation

### Shared Contracts

Create a wizard state contract under `apps/web/shared/verticalDramaSeries`, for
example:

```ts
type VerticalDramaProductionWizardStep = {
  stepId:
    | "series_setup"
    | "episode_script"
    | "storyboard_shots"
    | "script_qc"        // added 2026-07-07 (spec §16.1) — after storyboard: the review scores script + storyboard
    | "start_frames"
    | "dialogue_audio"
    | "dialogue_qc"
    | "video_prompts"
    | "shot_repair"
    | "video_clips"
    | "final_episode";
  status: "locked" | "ready" | "running" | "passed" | "needs_repair" | "optional" | "skipped" | "blocked";
  primaryAction:
    | "complete_series_setup"
    | "generate_script"
    | "run_quality_review"      // added 2026-07-07
    | "run_quality_improve_loop" // added 2026-07-07
    | "generate_storyboard"
    | "approve_start_frames"
    | "generate_dialogue_plan"
    | "repair_dialogue"
    | "generate_video_prompts"
    | "repair_shots"
    | "generate_video_clips"
    | "assemble_episode"
    | "none";
  sourceStages: VerticalDramaPipelineStage[];
  blockingReasons: string[];
  repairable: boolean;
  creditSpending: "none" | "llm" | "image" | "video" | "tts";
  evidence: Array<{ label: string; value: string; severity?: "info" | "warning" | "error" }>;
};
```

Add a pure resolver:

```ts
deriveVerticalDramaProductionWizardState(input): {
  activeStepId: VerticalDramaProductionWizardStep["stepId"];
  steps: VerticalDramaProductionWizardStep[];
  primaryCta: VerticalDramaProductionWizardStep["primaryAction"];
};
```

This resolver should be unit-tested independently and reused by server and UI.

### Server

- Add wizard state to `verticalDramaEpisodes.getEpisodeDetail`.
- Reuse existing run/stage status, approval checkpoints, artifact ledger,
  start-frame plan, motion prompt pack, provider routing, and dialogue quality.
- Do not create a separate wizard table for v1. The state is derivable from
  existing episode artifacts and run rows.
- Add stable blocking reason codes:
  - `VD_WIZARD_SCRIPT_MISSING`
  - `VD_WIZARD_SCRIPT_UNDERFILLED` (2026-07-07 — dialogue-complete script below episode coverage floor, spec §7.7.2)
  - `VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR` (2026-07-07 — scorecard below policy floors, spec §16.1)
  - `VD_WIZARD_QUALITY_LOOP_ESCALATED` (2026-07-07 — loop ended `escalated_max_rounds`/`escalated_regression`)
  - `VD_WIZARD_TIE_IN_BELOW_FLOOR` (2026-07-07 — tie-in naturalness failing, spec §13.1)
  - `VD_WIZARD_ARC_REPLAN_PENDING` (2026-07-07 — unresolved `arc_replan_proposal` on this episode's series, spec §7.7.3)
  - `VD_WIZARD_STORYBOARD_MISSING`
  - `VD_WIZARD_START_FRAMES_NOT_APPROVED`
  - `VD_WIZARD_DIALOGUE_PLAN_MISSING`
  - `VD_WIZARD_DIALOGUE_UNDERFILLED`
  - `VD_WIZARD_VIDEO_PROMPTS_STALE`
  - `VD_WIZARD_VIDEO_CLIPS_INCOMPLETE`
  - `VD_WIZARD_ASSEMBLY_BLOCKED`

### Client

Add `VerticalDramaProductionWizard` as a focused component inside the episode
workspace:

- horizontal stepper on desktop;
- compact vertical accordion on mobile;
- one primary CTA;
- secondary "view details" and "repair" actions;
- per-step evidence summary;
- visible credit-spend labels;
- "expert stage grid" remains below or behind a disclosure.

The main CTA must call the same existing mutations on the SHIPPED router
`verticalDramaEpisodes` (the wizard adds no new generation paths — it
sequences the developed system):

- `runStage` / `regenerateStage` / `runEpisode` for pipeline stages
- `approveCheckpoint` where a checkpoint gate applies
- `runEpisodeQualityReview` / `applyQualityReviewSuggestions` (+ the
  section-14 loop mode) for the script QC step
- `repairStageOutput`, `regenerateClipDialogue`, and existing per-shot repair
  mutations for spot fixes
- `generateStartFrameImage`, `generateShotVideoPrompt`, `generateVideoClip`,
  `assembleEpisodeVideo`, `summarizeEpisodeToMemory` for their steps

(Spec §15's planned names `runEpisodeStage`/`approveStageOutput` map to the
shipped `runStage`/`approveCheckpoint` — the wizard binds to the shipped
names.)

### Copy Contract

Thai copy must be direct and operational:

- "ขั้นต่อไป"
- "ต้องซ่อมก่อน"
- "ผ่านแล้ว"
- "ใช้เครดิต"
- "ซ่อมบททั้งตอน"
- "ซ่อมเฉพาะช็อตนี้"
- "สร้างพรอมต์วิดีโอทั้งตอน"
- "สร้างวิดีโอจริง"

Avoid explanatory paragraphs in the main UI. Put details in tooltips, evidence
rows, and repair dialogs.

## UI/UX Contract

### Target User / JTBD

- Role: creator producing an episode end-to-end without memorizing the
  pipeline order.
- Goal: always know the next safe step, why a step is blocked, and how to fix
  exactly one broken piece without redoing the rest.
- Entry point: episode workspace (`VerticalDramaEpisodeWorkspace`).
- Success outcome: episode reaches assembly through the wizard path with all
  gates passed; spot repairs re-enter at the earliest stale step.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Production wizard stepper | `VerticalDramaProductionWizard` in `VerticalDramaEpisodeWorkspace` | new stepper (desktop horizontal / mobile accordion), one primary CTA |
| Step evidence rows | wizard step detail | scorecard/coverage/tie-in/arc-replan evidence with severity |
| Expert stage surface | existing stage grid / `VerticalDramaStoryboardPanel` | moved behind "Advanced stages" disclosure |
| Repair dialogs | existing repair components | reached from wizard secondary actions, prefilled targets |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `deriveVerticalDramaProductionWizardState` | `apps/web/shared/verticalDramaSeries` (pure resolver) | step statuses, active step, primary CTA | episode artifacts/runs/checkpoints, QC + policy + tie-in + arc-replan state |
| `VerticalDramaProductionWizard` | new UI component | stepper rendering, CTA dispatch | resolver output via `getEpisodeDetail` |
| Step evidence renderer | wizard component | evidence rows + blocking reasons | resolver `evidence[]` + reason codes |
| Advanced-stages disclosure | episode workspace | expert surface toggle | existing stage grid |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | stepper skeleton | UI test |
| step ready | primary CTA enabled with credit-spend label | UI test |
| step running | CTA busy, non-reentrant | UI test |
| step blocked | one-sentence reason + repair CTA (reason codes) | unit/UI test |
| step needs_repair | repair CTA primary, evidence rows visible | UI test |
| step passed | check state, step still clickable for view/edit | UI test |
| gate escalated | escalation banner + link to scorecard evidence | UI/service test |
| flag off | no wizard rendered; shipped stage-grid UX unchanged | UI test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | vertical accordion, same active step + CTA as desktop | screenshot |
| tablet 768x1024 | condensed horizontal stepper, evidence collapses | screenshot |
| desktop 1440x900 | horizontal stepper above detail panel | screenshot |

### Accessibility Acceptance

- Stepper is keyboard navigable; active step announced; status not color-only
  (each status has a text label).
- Blocking reasons are text-visible and localized.
- Mobile accordion is keyboard accessible (already in Test Plan).
- Under `prefers-reduced-motion`, running-step animation is a static label.

### Browser Evidence Required

Capture: empty episode (step 2 active), script + storyboard below quality
floor (step 4 active with loop CTA, start frames locked), frames missing,
dialogue underfilled, all-passed with video prompts ready, flag off (no
wizard), mobile 390x844, desktop 1440x900.

## Pass Semantics — Content Completeness (added 2026-07-08, owner directive)

"ผ่านแล้ว" on any step means THE CONTENT IS ACTUALLY COMPLETE AND VERIFIABLE,
readable by a non-technical person (มัธยมปลายอ่านรู้เรื่อง). Rules:

1. Every step exposes a plain-language CHECKLIST of concrete criteria with
   per-item ✓/⚠/✗ and real numbers/artifacts — never an abstract aggregate
   alone. A step may not show "ผ่านแล้ว" while any completeness criterion is
   unmet; artifacts produced by LATER pipeline actions appear as unmet
   items with an explicit pointer ("จะสร้างในขั้น X"), and the step shows a
   partial state (e.g. "ยังไม่ครบ — รอ prompt วิดีโอ") instead of passed.
2. Canonical checklists (minimum):
   - **บทตอน (script)**: เนื้อเรื่องครบ (hook/บีต/cliffhanger); บทพูดครบทุกช็อต
     (เมื่อ storyboard มีแล้ว: ทุกช็อตต้องมีบทพูดที่ map ถึง, ไม่มีช็อตเงียบทั้งช็อต);
     ไม่มีช่วงเงียบยาวเกินกำหนดและไม่มีบทยาวเกินความยาวคลิป; ทุกบรรทัดพูดได้จริง
     (speakability §14.1 rule 6b). The step detail SHOWS the actual dialogue
     lines per shot (concrete evidence), not only second totals.
   - **สตอรีบอร์ด (storyboard)**: ครบ 9 ช็อต + ผูกบีตครบ + **ทุกช็อตมี image
     prompt และ video prompt ครบ** จึงจะผ่าน — ก่อนหน้านั้นแสดง "ยังไม่ครบ"
     พร้อมชี้ขั้นที่จะสร้างของที่ขาด.
   - **ตรวจคุณภาพบท (script QC)**: คะแนนถึงเกณฑ์ AND ไม่มีรายการซ่อมแนะนำ
     ที่ยังไม่ถูกจัดการ จึงผ่าน.
3. Pass-with-warnings is a DISTINCT visible state (amber check + text),
   never rendered as a plain pass.
4. Copy register: short sentences, no jargon, no raw enums/English — a
   high-schooler can read every step title, criterion, and reason.

## UX Rules

- There is exactly one primary CTA at any time.
- Blocking steps explain the reason in one sentence and provide the repair CTA.
- Users can inspect later stages, but locked stages cannot run.
- Paid actions always show credit-spend confirmation.
- The wizard must distinguish "view/edit existing artifact" from "generate new
  paid artifact".
- Per-shot regenerate buttons must be visually secondary and labeled as repair.
- Wizard state must survive refresh because it is derived from persisted
  artifacts.

## Acceptance Criteria

- A new episode with no script shows step 2 as the next action.
- An underfilled (density-error) script locks the storyboard step and offers
  whole-episode script repair (deterministic gate, no storyboard needed).
- An episode with script + storyboard below quality-policy floors shows the
  script QC step as the next action, offers the bounded auto-improve loop as
  the primary CTA, and locks the paid start-frame steps in guided mode.
- A quality-loop escalation (max rounds / regression) surfaces both reports
  and keeps the better version active; the wizard switches to manual repair.
- Enabling the wizard/gate flags on a series with in-flight episodes never
  retro-locks work: completed stages/artifacts stay valid, gates apply only
  to stage runs STARTED after enablement (grandfathering rule, spec §17).
- An episode with storyboard but no approved start frames shows start frames as
  the next action and locks video prompts.
- An episode with approved frames but missing dialogue plan shows dialogue/audio
  plan as the next action.
- An episode whose dialogue quality is underfilled blocks video prompt pack
  generation and offers whole-episode dialogue repair.
- A tie-in episode below the naturalness floor blocks paid tie-in generation
  until repair/defer/override (spec §13.1).
- An unresolved arc re-plan proposal on the series surfaces as a blocking
  reason on the affected future episode with a link to the Memory review
  surface (spec §7.7.3).
- An episode with passing dialogue and approved frames can generate the full
  video prompt pack.
- Per-shot video prompt generation is still available only as a repair action
  from the shot detail panel.
- A shot-level dialogue repair marks only affected prompt/clip/assembly stale.
- A whole-episode dialogue repair marks video prompts, clips, and assembly stale.
- A spot repair never forces re-running unaffected stages: the wizard
  re-enters at the earliest stale step and everything upstream stays passed.
- Mobile and desktop layouts show the same active step and primary CTA.
- Browser refresh does not reset wizard progress.

## Test Plan

### Unit

- `deriveVerticalDramaProductionWizardState`:
  - missing script;
  - script underfilled (episode coverage below floor) → storyboard locked;
  - missing storyboard → `script_qc` locked (review needs script + storyboard);
  - script quality below policy floors → `script_qc` active with loop CTA,
    paid start-frame steps locked;
  - quality loop escalated (both variants);
  - tie-in below naturalness floor (evaluated post-storyboard);
  - arc re-plan proposal pending;
  - flags enabled mid-episode → previously completed stages stay valid
    (grandfathering);
  - frames not approved;
  - dialogue missing;
  - dialogue underfilled;
  - video prompts stale;
  - clips incomplete;
  - assembly ready.
- dialogue QC reason codes map to the dialogue wizard step.
- script quality / tie-in / arc-replan reason codes map to the `script_qc`
  step (tie-in and re-plan evidence rows included).
- stale propagation produces the expected downstream locks.
- with `verticalDramaSeriesProductionWizard` off, no wizard state is derived
  and the shipped stage-grid UX is unchanged.

### Server

- `getEpisodeDetail` returns wizard state for legacy and newly generated
  episodes.
- `runEpisodeStage(video_motion_prompt_pack)` rejects/blocks when dialogue QC
  has blocking underfill.
- repair mutations update wizard state through derived artifacts.

### Client

- wizard renders one primary CTA.
- locked video prompt step cannot run.
- dialogue underfill shows whole-episode repair CTA.
- per-shot repair buttons remain secondary.
- mobile accordion is keyboard accessible.

### Browser Evidence

Capture:

- empty episode;
- storyboard ready but frames missing;
- frames ready but dialogue underfilled;
- video prompts ready;
- clip generation ready;
- mobile 390x844;
- desktop 1440x900.

## Rollout

1. Ship the pure wizard state resolver behind existing Vertical Drama feature
   flag.
2. Render wizard read-only alongside current controls.
3. Switch primary CTA to wizard-derived action.
4. Move expert stage grid under an "Advanced stages" disclosure.
5. Enforce server-side stage gates for video prompts and video clips.
6. Monitor repair frequency and user drop-off by wizard step.

## Non-Goals

- Do not remove existing stage-card detail panels.
- Do not create a new persistence table unless derived state proves too slow.
- Do not hide repair history or superseded artifacts.
- Do not make per-shot repair the default production path.
