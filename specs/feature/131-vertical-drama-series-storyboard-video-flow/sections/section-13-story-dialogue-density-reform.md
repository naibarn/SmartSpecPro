# section-13-story-dialogue-density-reform

## Goal

Make story/dialogue density a MANDATORY planning input at every layer (series
bible → episode script → storyboard shots → dialogue plan → video prompts)
instead of a post-hoc analyzer, and manage the season-level consequences of
denser episodes through explicit arc re-plan proposals. Implements spec §7.7,
§14.1, and the §7.6 memory-kind additions (`arc_replan_proposal`,
`arc_replan_applied`).

Problem being fixed (production feedback 2026-07-07): each 8-second shot
carries only 1-2 seconds of speech, leaving long silent stretches. Per-shot
dialogue repair cannot fix it — with 9 fixed shots and 60 fixed seconds, more
speech per shot requires more STORY per episode, and more story per episode
shifts the season arc. Today the speech budget in
`shared/verticalDramaSeries/dialogueQuality.ts` is only consulted AFTER
generation (gate + regeneration path); first-pass script and video prompts are
not duration-sized, and shot→scene dialogue attribution is a positional guess.

## Depends On

- section-01-skill-packages
- section-02-contracts-persistence-assets
- section-04-series-memory-and-episode-pipeline
- section-07-audio-dialogue-subtitles

Feature flags: `verticalDramaSeriesSpeechBudget` (layers 1-4),
`verticalDramaSeriesArcReplan` (drift + re-plan). Both default OFF; flags-off
behavior is byte-identical to today's shipped flow.

## Files

Create:

- `apps/web/shared/verticalDramaSeries/contentBudget.ts` — `VerticalDramaEpisodeContentBudget`, `VerticalDramaPerShotSpeechBudget`, drift-reason codes, breakdown-version types
- `apps/web/server/services/verticalDramaArcReplan.ts` — deterministic drift detection + proposal construction + version activation
- `apps/web/server/services/__tests__/verticalDramaArcReplan.test.ts`
- `apps/web/shared/verticalDramaSeries/__tests__/contentBudget.test.ts`

Modify:

- `apps/web/shared/verticalDramaSeries/dialogueQuality.ts` — export silent-gap analysis (max continuous silence per clip, 2.5s rule); NO constant changes — it stays the single canonical estimator (spec §7.7.1)
- `apps/web/server/services/verticalDramaStoryBible.ts` — `episodeBreakdownItemSchema` gains optional `contentBudget`; generation prompt states per-episode speech budget; `breakdownVersions[]` + `activeBreakdownVersionId` read/write helpers on the series `bible` jsonb
- `apps/web/server/services/verticalDramaScriptGeneration.ts` — `scriptBuilderOutputSchema` gains per-beat `dialogue_lines[]` + `estimated_speech_seconds` (superset); prompt receives speech budget + active breakdown `contentBudget`; post-validation computes episode coverage and ends `needs_repair` when below `MIN_EPISODE_COVERAGE_RATIO`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts` — `buildShotVideoPromptUserPrompt` receives `shotDurationSeconds` + `targetSpeechSeconds` (first-pass duration awareness, not only the regeneration path)
- `apps/web/server/routers/verticalDramaEpisodes.ts` — `resolveShotDialogueLines` prefers persisted `sourceBeatIndexes` mapping over positional fallback; drift check invocation after script approval, after `summarizeEpisodeToMemory`, and on re-approval of a repaired script (spec §7.7.3)
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` — (task #31, added 2026-07-09) `resolveEpisodeTieInPlacement(bible, episodeNumber, flagOn)` is the ACTUAL `plan_episode_script` consumer of the `tieIn` field spec §7.7.3 describes at the contract level: it reads the episode's ACTIVE breakdown item's `tieIn` (never the legacy top-level `bible.episodeBreakdown`, which can be stale after an approved arc re-plan moved a placement) and returns `undefined` when the flag is off or no season plan exists (grandfathered to the pre-#31 reactive `evaluateFatigue` behavior in `generateEpisodeScript`). The router threads a `tieInReplanFlagOn` boolean into `RunStageOptions` at all 3 script-generation call sites; the repair path deliberately keeps this `false` (repair follows `repairContext`, not a fresh tie-in placement lookup) — this is the exact wiring point a future reader looking for "where does spec §7.7.3's `plan_episode_script` behavior actually live in code" should start.
- `apps/web/server/routers/verticalDramaSeries.ts` — `approveArcReplanProposal` / `rejectArcReplanProposal` (series-scoped, so they live beside the retcon procedures they mirror — same ownership/flag/authz/audit/idempotency rules)
- `apps/web/server/services/verticalDramaSeriesMemory.ts` — bundle includes active breakdown version + drift warnings (bundle order item 9)
- `apps/web/skills/vertical-drama-script-builder/` — SKILL.md + schemas superset: dialogue-complete beats, speech-budget inputs
- `apps/web/skills/vertical-drama-storyboard-shotgrid/` — SKILL.md + schemas superset: per-shot `source_beat_indexes[]`, `silence_intent`, per-shot speech budget echo
- `apps/web/skills/vertical-drama-dialogue-audio-planner/` — SKILL.md: script lines are source of truth; distribute/enrich, never invent
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` — density meter (episode + per-shot), silence-gap badges
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts` — Thai copy for density/coverage/arc-replan states
- Memory tab surface (series detail) — arc re-plan proposal review card (reuses the retcon review pattern from section-04)

## Contracts

Pinned in spec §7.7; summarized here for implementers:

```ts
type VerticalDramaEpisodeContentBudget = {
  beatCount: number;                 // default 5-7 per 60s episode
  estimatedSpeechSeconds: number;    // must satisfy MIN_EPISODE_COVERAGE_RATIO
  conflictLevel: 1 | 2 | 3 | 4 | 5;  // escalation curve position
  reversalTarget: number;            // default >= 2
  arcThreads: string[];
};

type VerticalDramaPerShotSpeechBudget = {
  shotNumber: number;
  clipDurationSeconds: number;
  targetSpeechSeconds: number;       // targetVerticalDramaSpeechSeconds(duration)
  minSpeechSeconds: number;          // MIN_CLIP_COVERAGE_RATIO * duration
  sourceBeatIndexes: number[];       // persisted beat attribution (replaces positional guess)
  silenceIntent?: "dramatic_pause" | "action_visual" | "montage" | "establishing";
};

type VerticalDramaArcReplanProposal = {
  proposalId: string;
  seriesId: string;
  triggeredByEpisodeNumber: number;
  driftReasons: string[];            // stable codes below
  affectedEpisodeNumbers: number[];  // FUTURE, non-produced episodes only
  proposedBreakdown: VerticalDramaEpisodeBreakdownItem[];
  rationale: string;
  status: "proposed" | "approved" | "rejected";
};
```

Stable drift-reason codes:

- `VD_ARC_BEATS_CONSUMED_EARLY` — episode used beats the active breakdown assigned to later episodes
- `VD_ARC_HOOK_RESOLVED_EARLY` — hook resolved ahead of plan
- `VD_ARC_HOOK_UNPLANNED` — new hook not present in the plan
- `VD_ARC_CONTENT_BUDGET_EXCEEDED` — realized beats/speech > 25% over `contentBudget`
- `VD_ARC_ESCALATION_ORDER_BROKEN` — realized `conflictLevel` out of curve order
- `VD_ARC_TIE_IN_DEFERRED` (task #31, added 2026-07-09) — DELIBERATE, not
  detected: raised by `deferEpisodeTieIn` (spec §13.1) moving a planned tie-in
  placement to a future episode, never by `detectArcDrift`. Every
  `proposedBreakdown` item on a proposal carrying this code must be
  byte-identical to the active version except `tieIn`
  (`applyApprovedArcReplan`'s guard rejects a proposal that changes anything
  else) — see `VerticalDramaEpisodeTieInPlacement` in §7.7.2.

Hard rules (spec §7.7.2-§7.7.3):

1. `dialogueQuality.ts` is the ONLY estimator. New code imports
   `estimateVerticalDramaSpeechSeconds` / `targetVerticalDramaSpeechSeconds`;
   introducing a second speech-rate model is a review-blocking defect.
2. Dialogue is authored at SCRIPT stage, sized to the budget. The
   dialogue/audio plan and `resolveShotDialogueLines` distribute and enrich —
   `script_fallback` parsing becomes legacy-with-warning.
3. Visual-only shots require explicit `silenceIntent`; max 2 of 9 unless the
   episode is marked visual-first; excluded from per-clip gates, counted in
   the episode floor.
4. Breakdown versions are append-only; approving an `arc_replan_proposal`
   appends a version + `arc_replan_applied` memory event and moves
   `activeBreakdownVersionId`. Produced episodes are NEVER rewritten.
5. Drift detection is deterministic (no LLM) and runs after script approval,
   after `summarize_episode_to_series_memory`, and again on re-approval of a
   repaired/regenerated script of an already-approved episode (late edits
   cannot bypass the check).
6. Legacy series without `contentBudget` derive defaults at read time; no
   backfill migration of bible jsonb is required or allowed to mutate
   existing rows silently. A legacy series adopts Layer-1 planning by
   re-running "Generate story"/"Regenerate" (§8.3), which appends a
   `contentBudget`-bearing breakdown as a new approval-gated version
   (spec §7.7.2) — produced episodes untouched.
7. New persistence contracts (`contentBudget`, `breakdownVersions[]`,
   `activeBreakdownVersionId`, the two new memory kinds) are pinned in
   section-02 — this section implements them, section-02 owns the shape.

## UI/UX Contract

### Target User / JTBD

- Role: creator checking whether an episode has enough story/speech before
  spending credits, and deciding how a dense episode reshapes the season.
- Entry: episode workspace (density meter), Memory tab (arc re-plan review).
- Success: user sees coverage vs target at a glance, repairs upstream when
  underfilled, and approves/rejects season re-plans explicitly.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Episode density meter | `VerticalDramaStoryboardPanel.tsx` | episode coverage bar (est. speech s / target band) + per-shot chips with silence-gap badges |
| Script stage warnings | episode workspace | underfilled script `needs_repair` state with "ซ่อมบททั้งตอน" CTA |
| Arc re-plan review | Memory tab (series detail) | proposal card: drift reasons, affected episodes, old-vs-new breakdown diff, approve/reject |
| Bible/Overview | series detail | active breakdown version indicator + version history list |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `verticalDramaArcReplan` | server service | drift detection, proposal build, version activation | script/memory artifacts, active breakdown |
| `VerticalDramaDensityMeter` | new UI component (rendered inside `VerticalDramaStoryboardPanel.tsx`) | episode coverage bar + per-shot chips | `analyzeVerticalDramaEpisodeDialogueQuality` output via episode detail |
| `VerticalDramaArcReplanCard` | new UI component (Memory tab) | proposal review (reasons, diff, approve/reject) | arc re-plan procedures + memory events |
| Breakdown version indicator | series detail Overview/Bible | active version badge + history list | `breakdownVersions[]` + `activeBreakdownVersionId` |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | meter/proposal skeleton | UI test |
| empty | no script → meter hidden, no fake zeros | UI test |
| underfilled (warning) | amber meter + per-shot chips, repair CTA | unit/UI test |
| underfilled (error/blocking) | red meter, storyboard step locked in guided mode | service/UI test |
| in-range | green meter with seconds + ratio visible | UI test |
| visual-only shot | chip shows `silenceIntent` label, excluded from clip gate | unit/UI test |
| replan: proposed | card with reasons + diff + approve/reject | UI test |
| replan: approved | new active version badge; timeline event visible | UI/service test |
| replan: rejected | standing continuity warning on affected episodes | UI/service test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | meter stacks above shot grid; proposal diff scrolls | screenshot |
| tablet 768x1024 | per-shot chips wrap without overflow | screenshot |
| desktop 1440x900 | meter inline with panel header; diff side-by-side | screenshot |

### Accessibility Acceptance

- Coverage state is text + color (seconds and ratio printed, never color-only).
- Silence-gap badges have accessible names including the gap length.
- Approve/reject on proposals keyboard reachable; diff readable by screen reader (old/new labeled).

### Copy Contract

Thai-first operational copy (in `verticalDramaWorkspaceCopy.ts`):

- "บทพูดรวม {n} วิ จากเป้า {min}-{max} วิ"
- "ช็อตนี้เงียบเกิน {n} วิ"
- "บทยังบางเกินไป — ซ่อมบททั้งตอนก่อน"
- "ตอนนี้ใช้เนื้อเรื่องล่วงหน้า — เสนอปรับแผนซีซั่น"
- "อนุมัติแผนใหม่ / คงแผนเดิม"
- Localizable reason codes for all `VD_ARC_*` and `VD_DIALOGUE_*` states.

### Browser Evidence Required

Capture: underfilled warning, underfilled blocking, in-range meter,
visual-only chip, replan proposed/approved.

## Tests First

- Test: estimator determinism — same text/locale returns identical seconds (Thai 8.5 chars/s, non-Thai 2.7 words/s, 0.75s line floor unchanged).
- Test: silent-gap analyzer flags a speaking clip with > 2.5s continuous estimated silence and reports gap position; visual-only shot with `silenceIntent` is exempt.
- Test: script validation computes episode `estimatedSpeechSeconds`; below `MIN_EPISODE_COVERAGE_RATIO` → stage ends `needs_repair` with `VD_DIALOGUE_EPISODE_UNDERFILLED`; storyboard unreachable in guided mode.
- Test: script schema superset — legacy scripts without `dialogue_lines[]` still parse; new scripts require speaker/line/estimated seconds per beat.
- Test: story bible prompt includes speech budget; new-series breakdown items carry `contentBudget`; legacy breakdown derives defaults without mutating stored jsonb.
- Test: shotgrid output persists `sourceBeatIndexes[]` per shot; `resolveShotDialogueLines` uses them when present and falls back positionally (with `script_fallback` warning) when absent.
- Test: per-shot budgets derive from the duration profile (8s → target ~5.4s, min 3.6s; trailing 4s → target ~2.7s).
- Test: max 2 visual-only shots of 9 enforced unless episode marked visual-first.
- Test: `buildShotVideoPromptUserPrompt` receives and embeds duration + target speech seconds on the FIRST pass (not only `generateVerticalDramaClipDialogue`).
- Test: drift detection — each `VD_ARC_*` trigger fires on its fixture and only for future, non-produced episodes.
- Test: proposal approval appends breakdown version + `arc_replan_applied` event, moves the active pointer, leaves prior versions and produced episodes untouched; rejection appends rejection + standing warning.
- Test: repairing/regenerating an already-approved episode script re-runs drift detection on re-approval.
- Test: legacy series "Regenerate story" appends a `contentBudget`-bearing breakdown as a new approval-gated version without touching produced episodes.
- Test: `buildEpisodeMemoryBundle` includes active breakdown version + drift warnings as bundle item 9; deterministic for fixed input.
- Test: flags off — script/storyboard/dialogue/video-prompt outputs byte-compatible with today (no budget injection, no drift checks, no new blocking).

## Implementation Tasks

1. Add `contentBudget.ts` shared contracts + drift codes.
2. Extend `dialogueQuality.ts` with silent-gap analysis export (constants untouched).
3. Story bible: schema superset, budget-aware prompt, breakdown version helpers.
4. Script generation: budget inputs, dialogue-complete superset schema, coverage validation → `needs_repair`.
5. Shotgrid skill/schema: `source_beat_indexes`, `silence_intent`, budget echo; persist mapping.
6. Dialogue planner skill: distribute/enrich contract; mark invention as violation.
7. `resolveShotDialogueLines`: beat-index mapping preferred; legacy path warning.
8. `buildShotVideoPromptUserPrompt`: duration + target speech seconds parameters.
9. `verticalDramaArcReplan.ts`: drift detection, proposal build, approve/reject + versioning.
10. Routers: drift invocation points on `verticalDramaEpisodes`; `approveArcReplanProposal` / `rejectArcReplanProposal` on `verticalDramaSeries` beside the retcon procedures they mirror (mutations follow section-04 ownership/flag/authz/audit/idempotency rules).
11. Memory bundle item 9 (active version + drift warnings).
12. UI: density meter, per-shot chips, replan review card, Thai copy.
13. Tests per the list above; fixtures for a dense episode and an underfilled episode.

## Acceptance

- An underfilled script cannot silently reach storyboard in guided mode; the repair CTA targets the whole-episode script.
- First-pass prompts are duration/budget-aware; the regeneration path is no longer the only budget-aware path.
- Shot dialogue attribution is deterministic via persisted beat indexes on new runs.
- A dense episode raises an arc re-plan proposal; approval re-versions the future plan only; episode N+1 plans from the active version.
- With both flags off, shipped behavior is unchanged.

## Verification

```bash
cd apps/web && pnpm test -- dialogueQuality
cd apps/web && pnpm test -- contentBudget
cd apps/web && pnpm test -- verticalDramaArcReplan
cd apps/web && pnpm test -- verticalDramaScriptGeneration
cd apps/web && pnpm check
```
