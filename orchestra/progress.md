# Orchestra Progress

Task: (1) character-swap gallery reachable from Storyboard, using each
character's own existing images; (2) correct per-shot character mapping with
drag-replace; (3) full-spec Character Sheet generation; (4) persistent
right-side reference panel replacing the current modal. See
`orchestra/plan.md` for full research findings, section-by-section design,
and the 4 open decisions (all resolved — see `orchestra/decisions.md`).

[PLANNING COMPLETE] Research done via 2 parallel Explore agents (character
asset stock/manifest system, reference panel tab structure, existing gallery
UI pattern, visual-bible skill's unused prompt fields). Plan written to
`orchestra/plan.md`. Asked user 4 clarifying questions (character-sheet
button scope, stat-field sourcing, sheet language default, responsive
fallback for the persistent panel) before starting implementation waves.

[IMPLEMENTATION COMPLETE — ALL 4 SECTIONS]

Section A.1/A.2 — per-shot character reference swap:
- `VerticalDramaCharacterReferencePanel.tsx`: added 4th "This character's
  images" tab, backed by `listCharacters` (manifest.assets filtered by
  characterId), click-to-link via existing `resolveMediaAssetForImport` +
  `linkAsset` flow.
- `VerticalDramaStoryboardPanel.tsx`: character chips and the shot start-frame
  image now accept direct drag-drop (`getDraggedImageUrl` from
  `ImageSourcePicker.tsx`, the codebase-standard drag contract), in addition
  to the existing click-to-open-panel path.

Section A.4 — persistent right panel:
- `VerticalDramaEpisodePage.tsx`: replaced the Dialog-based swap UI with
  `ResizableCollapsiblePanel` (reused, not rebuilt) — collapsible, resizable,
  persists width/collapsed state to localStorage
  (`smartspec_vd_episode_right_panel_*_v1`), renders on all screen sizes per
  the user's explicit requirement (stacks below `xl`, sidebar at `xl`+).

Section B — full Character Sheet generation:
- `verticalDramaCharacterImageGeneration.ts`: stopped discarding
  `full_body_prompt` / `expression_sheet_prompt` / `outfit_sheet_prompt` from
  the `vertical-drama-character-visual-bible` skill output; now returned
  alongside the existing portrait/turnaround prompts.
- `verticalDramaCharacters.ts`: new `generateCharacterSheet` mutation —
  combines all 4 prompt fields + an AI-authored stats sidebar (role +
  personality) into one multi-panel infographic prompt, English by default
  with a `sheetLanguage` ("en"/"th") toggle, name always rendered untranslated
  exactly as entered. Async submit+poll (matches the codebase's sanctioned
  pattern), credits reserved via `deductCredits` before submission.
- `VerticalDramaCharacterStockPanel.tsx`: new "Full character sheet" button +
  inline EN/TH toggle, result display mirrors the existing portrait/turnaround
  blocks.

[BUG FOUND + FIXED DURING LIVE VERIFICATION] All three character-image
generation call sites (`generateCharacterImage`, `generateCharacterTurnaround`,
`generateCharacterSheet`) were missing `aspectRatio` in their
`generateImageAsync(...)` payload. The default image model
(`google-banana-2-lite` via Kie.ai) requires this field — omitting it fails
at the provider with `"This field is required"`. This is the same bug class
already fixed once this session for the 3x3 multi-angle grid feature, just
never caught in these three call sites because they'd never been live-tested
end-to-end before (only typechecked). Root-caused via a one-off verification
script (`apps/web/scripts/test-vd-character-sheet.ts`) that reproduced the
exact provider error, confirmed via `python-backend/logs/media-debug/`. Fixed
by adding `aspectRatio: "9:16"` to all three call sites (matches the
convention already used for start-frame / multi-angle generation elsewhere in
this router file). Re-verified live after the fix — full task completed,
downloaded and visually inspected the resulting image: a coherent character
sheet with portrait, 5-pose turnaround, expression grid, outfit variations,
and a stats sidebar, name rendered correctly in Thai (untranslated) as
required.

Known minor gaps (disclosed to user, not blocking):
- `data-[dragover=true]` hover-highlight class was added to the character
  chip drop target in `VerticalDramaStoryboardPanel.tsx`, but the
  `onDragEnter`/`onDragLeave` state toggle that would activate it was not
  wired — drop functionality works, only the visual hover feedback is inert.
- The AI-authored stats sidebar renders `character.role` verbatim (Thai) even
  in English mode — only the name field has an explicit "render untranslated"
  instruction; role/personality text should ideally also honor the language
  toggle.
- The generated image's expression-grid panel labels have several
  misspelled/garbled words (e.g. "Comendoot", "Betermined") — this is a
  text-rendering limitation of the underlying image model, not a code defect.

Verification: `pnpm check` clean (only 2 pre-existing unrelated implicit-`any`
errors in `VerticalDramaCharacterStockPanel.tsx:709,717`); Vitest
`verticalDramaCharacterImageGeneration.test.ts` 4/4 passed; `pnpm build`
succeeded; `smartspec-web.service` restarted and healthy; live end-to-end
character-sheet generation verified with a real image for character #1
(พิมพ์วิภา) in series #2 — real credits (20) were spent for this
verification run.

[FOLLOW-UP BUG REPORT + ROOT-CAUSE FIX — 2026-07-05] User reported (with a
screenshot) that per-shot character chips still didn't work: chips showed raw
filename-like text (e.g. "pimpwipa_primary_portrait.png") instead of the
character's real name/thumbnail, were not clickable, and the selected image
was never actually used as a reference when generating that shot's Start
Frame. Traced the full data flow end-to-end (not just the UI):

1. `verticalDramaStoryboardGeneration.ts` (shotgrid stage): the LLM is told
   the exact `characterId` to use per character (e.g. `"character"`), but in
   practice sometimes invents its own slug instead (observed:
   `"character-pimpwipa"`, `"pimpwipa_primary_portrait.png"`). Any shot whose
   `characters`/`required_character_refs` don't exactly match a real
   `characterKey` can never resolve to that character anywhere downstream.
   Fixed by normalizing every shot's character-id fields right after LLM
   validation: keep only real ids the LLM happened to get right, and ADD any
   real character whose actual name is found directly in that shot's Thai
   narrative text (a signal the model reliably gets right even when the id
   field is wrong).
2. `verticalDramaEpisodePipeline.ts`'s `generateRealStartFramePlan`: a
   field-name mismatch bug — it read `s.characterIds`/`s.cameraSetup`
   (camelCase, matching only the internal dry-run placeholder shape from
   `buildStoryboard()`), never the REAL LLM output's snake-case shape
   (`s.characters`/`s.required_character_refs`/`s.camera`). This meant the
   start-frame-plan stage's LLM call was ALWAYS told every shot has zero
   characters, 100% of the time, regardless of the actual storyboard — the
   single most severe bug in the chain. Fixed to read the real field names,
   preferring `required_character_refs`.
3. `verticalDramaStartFrameGeneration.ts`'s `projectStartFramePlan`: even
   after fixing #2, this stage's OWN separate LLM call could still drift on
   `reference_assets[].character_id` the same way stage 1 did. Fixed by
   trusting the already-correct per-shot character list from stage 1 (passed
   through as a shot-number-keyed ground truth map) instead of re-deriving
   `requiredCharacterRefs` from a second unreliable LLM call.

Net effect: `resolveShotCharacterReferenceUrls` (real generation time) and
the storyboard panel's character chips now read from the same, now-correct,
`required_character_refs` values — so a shot's character chip is enabled,
shows the right name/thumbnail, and the chosen/approved portrait is actually
attached as `referenceImageUrls` when generating that shot's Start Frame.

Retroactive fix: backed up `vertical_drama_episodes` (data-only dump,
`.db-backups/vertical_drama_episodes_20260705_104457.sql`), then ran a
one-off backfill (`apps/web/scripts/backfill-vd-character-refs.ts`) applying
the same name-matching heuristic to the 5 already-generated episodes in
series 2. Only episode 1 needed correction (episodes 2-5 already had valid
ids or no character shots); all 9 shots' `characters`/`required_character_refs`
and all 9 frames' `requiredCharacterRefs` were corrected in place. Row count
verified unchanged (5) before/after.

Verified: `pnpm check` clean (same 2 pre-existing unrelated errors only);
`verticalDramaStoryboardGeneration.test.ts` (6), `verticalDramaStartFrame.test.ts`
(21), `verticalDramaStartFrameGeneration.test.ts` (5) — all 32 still pass;
`pnpm build` + `smartspec-web.service` restart succeeded; DB spot-check on
episode 1 confirms shot 1 and frame 1 now show `["character"]` instead of
the broken filename value.

[FOLLOW-UP #2 — 2026-07-05] User reported 4 more issues after seeing the
character-chip fix working (chips now show correctly): (1) no visible
"generating..." state on the single-shot "สร้างภาพ (AI)" button; (2) shot
content should be grounded in the episode's actual plan/overview content;
(3) generated images look unrelated to the real plot; (4) video prompts must
include what's actually said (dialogue).

Root-caused #2/#3 together: `generateRealStoryboard` only ever fed the
shotgrid LLM a thin series-bible `logline`/`keyBeats` (a handful of
one-line season-arc beats), and NEVER the episode's own rich
`plan_episode_script` stage output (`scene_dialogue_summary`: 8 real scenes
with location/summary/key_line each, already sitting unused in the DB) —
confirmed via the episode-plan-tab research citing
`VerticalDramaSeriesDetailPage.tsx:684-695` (same thin data) vs the
untouched, far richer `episode.script.scene_dialogue_summary` column. This
is why shots read as generic mood/atmosphere prompts disconnected from what
the episode's script actually says happens.

Fixed (prospective — affects the NEXT storyboard generation, did not
force-regenerate episode 1's already-approved shots/images since that would
spend credits and discard existing approved work without asking first):
- `verticalDramaEpisodePipeline.ts`'s `generateRealStoryboard`: now also
  loads `episode.script.scene_dialogue_summary`, normalizes each entry
  (`scene`/`location`/`summary`/`keyLine`, tolerating both `key_line` and
  `dialogue_line` field names seen in real data), and passes it as a new
  `sceneBeats` param.
- `verticalDramaStoryboardGeneration.ts`: `buildUserPrompt` now includes an
  explicit scene-by-scene instruction — ground all 9 shots in these real
  scenes in order, and use each scene's actual line as that shot's
  `dialogue_excerpt`/`subtitle_text` instead of inventing unrelated dialogue.
- Verified (no LLM call, no credits spent) via
  `apps/web/scripts/verify-vd-prompt-grounding.ts` against episode 1's real
  DB data: the scene-beat instruction correctly lists 8 real scenes with
  their Thai summaries and lines.

Fixed #4 (dialogue in video prompts):
- `verticalDramaEpisodePipeline.ts`'s `generateRealMotionPromptPack` now also
  reads each shot's `dialogue_excerpt`/`subtitle_text` and passes it through.
- `verticalDramaVideoMotionPromptGeneration.ts`: `buildUserPrompt` now lists
  each shot's dialogue line and instructs the LLM to describe matching
  mouth/lip movement; `projectMotionPromptPack` additionally APPENDS the
  ground-truth dialogue line(s) to each clip's final `prompt` deterministically
  (not just hoping the LLM includes it) — mirrors the same
  "don't trust the LLM alone" pattern used for character-ref ids.

Fixed #1 (loading state): `VerticalDramaStoryboardPanel.tsx`'s "สร้างภาพ (AI)"
button and its confirm-dialog "ยืนยัน" button both now show a `Loader2`
spinner + "กำลังสร้าง…"/"Generating…" label swap while
`generatingStartFrameImageForShot === shotNumber` — previously only the
confirm button changed text, with no spinner anywhere, and the primary
button (the one actually visible during generation, since the confirm
dialog closes immediately on click) never changed at all.

Verified: `pnpm check` clean (same 2 pre-existing unrelated errors);
targeted vitest run 134/135 passed (1 pre-existing skip, unrelated);
`pnpm build` + `smartspec-web.service` restart succeeded.

[FOLLOW-UP #3 — 2026-07-05] User reported the pipeline stage runner UI was
"weird" — a redundant test-run button before real generation, and an
approve-loop where clicking Approve repeatedly asks for approval again
without ever progressing. Also asked for a "regenerate, delete old set"
button for already-generated stages.

Root-caused the approve loop (CONFIRMED LIVE in real DB data before fixing —
episode 3's `plan_episode_script` checkpoint was already `approved` while its
run row was still frozen at `status="approval_required"`/`nextAction="approve"`,
reproducing the exact symptom):
- `stageStates` (client) derives "what needs attention" from the LATEST run
  row per stage. `runStage` (server) computes status/nextAction fresh every
  call, but nothing ever re-computed/persisted it AFTER a checkpoint was
  approved — `approveCheckpoint` only updated the checkpoint row itself.
- Compounding this: the checkpoints query the client uses to attach a
  `checkpointId` to a stage is filtered to `state: "pending"` — so once
  approved, `stageStates[stage].checkpointId` becomes `undefined`, and the
  client's `onApprove`/`onReject` handlers no-op when `checkpointId` is
  falsy. Net effect: the approval bar re-renders forever, looking approved
  but silently doing nothing on every subsequent click.
- Fixed: `approveCheckpoint` (`verticalDramaEpisodes.ts`) now also patches
  the linked run row (via the checkpoint's `runId` FK) to
  `status: "succeeded"` / correct terminal `nextAction` on approve, or
  `status: "failed"` / `nextAction: "repair"` on reject — computed inline,
  NOT by re-invoking `runStage` (which would re-run credit-charging LLM
  generation unconditionally for stages like `plan_episode_script`,
  double-charging and silently overwriting the just-approved content).
- Retroactive fix: backed up `vertical_drama_episode_runs`
  (`.db-backups/vertical_drama_episode_runs_20260705_1137ish.sql`), then ran
  `apps/web/scripts/backfill-vd-stale-approved-runs.ts` to patch every
  already-approved-but-stale run across the whole DB (2 found: episode 1 and
  episode 3's `plan_episode_script` runs) — the two stuck stages are now
  correctly `succeeded`. Row count verified unchanged (10) before/after.
  Noted in passing: episode 1 had ALREADY been re-run a second time as a
  user workaround for this exact bug (an extra `plan_episode_script` run
  exists, likely an unnecessary double credit charge from before this fix).

Fixed the redundant "test" button: `VerticalDramaEpisodeWorkspace.tsx` was
showing BOTH the dedicated "สร้างบทจริง (มีค่าใช้จ่าย)" button AND a generic
"รันแบบทดสอบ" (dry-run) button stacked together whenever `plan_episode_script`
had no output yet — confusing, since only the first one does anything
meaningful for that stage. The generic button (plus its "test mode" note) is
now suppressed whenever the stage has its own dedicated real-generation
button; a repair button is still shown if that stage's last run failed.

Added new "regenerate, delete old set" capability (did not exist before):
new `regenerateStage` tRPC mutation deletes the stage's prior
`vertical_drama_episode_runs` row(s) (cascades to that run's checkpoints +
artifacts via existing `onDelete: "cascade"` FKs — confirmed via schema, no
new cascade logic needed) then immediately re-runs the stage in "full" mode.
Surfaced in the workspace's per-stage focused-detail panel (the "ขั้นสูง"
advanced section) as a 2-step destructive confirm ("Delete & regenerate"),
available whenever that stage already has output.

Verified: `pnpm check` clean (same 2 pre-existing unrelated errors); 134/134
targeted vitest tests pass; `pnpm build` + `smartspec-web.service` restart
succeeded; DB spot-check confirms both previously-stuck episodes now show
`succeeded`/`resume_next_stage` for `plan_episode_script`.

[FOLLOW-UP #4 — 2026-07-05] User reported the character-reference asset list
(the "อ้างอิงของตัวละคร" section in the character tab) shouldn't have an
approve/reject/mark-stale QC workflow — reference images are a personal
library, not narrative content requiring review; the standard model should
just be "generate/import = add, unwanted = delete". Also: the character
description showing "ยังไม่มีคำอธิบายตัวละคร" (no description yet) looked like
a bug — it should be sourced from the series bible instead.

Fixed #1 (QC workflow -> delete): added `verticalDramaCharacterStockService
.deleteAsset` + router mutation `verticalDramaCharacters.deleteAsset`
(unlinks the `verticalDramaCharacterAssets` row only — leaves the underlying
`media_assets` row untouched, since Media History/Library may still
reference it). Removed the approve/reject/mark-stale buttons, the
`AssetStateBadge`, and their 3 now-unused mutations from
`VerticalDramaCharacterStockPanel.tsx`; replaced with a single "ลบ" (Delete)
button with a 2-step confirm (destructive-styled, matching the confirm
convention used elsewhere in this file). Left the underlying approve/reject/
stale backend endpoints and asset-state machine in place (unused by this UI
now, but not verified unused system-wide, and not worth the larger blast
radius of removing state-machine infrastructure for a UI-only ask).

Fixed #2 (description from bible): traced the "no description" text to
`extractCharacterDescriptionForDisplay`, which only reads
`character.data.{personality,backstory,identityLock,wardrobeRules}` — a
field that's often never populated. Confirmed via real DB data
(`vertical_drama_series.bible.refinedCharacters`, series 2) that the actual
rich per-character description already exists in the series bible generated
at the story-bible stage, just never consulted here. Added
`findBibleCharacterDescription()` (matches by name, substring either
direction, since the bible tends to use full names — e.g.
"พิมพ์วิภา รัตนไพศาล" — while the character record's own name is often just
the given name) as a fallback source, wired via a new
`trpc.verticalDramaSeries.get` query in the panel.

Verified: `pnpm check` clean (same 2 pre-existing unrelated errors, line
numbers shifted since ~50 lines of now-dead QC-badge code were removed);
134/134 targeted vitest tests pass; `pnpm build` + `smartspec-web.service`
restart succeeded. Did NOT live-test the delete mutation against the user's
real reference images (would be genuinely destructive to their existing
content without explicit per-click consent) — confidence instead from
mirroring the exact ownership-check pattern already used by the adjacent,
tested `transition`/`markStale` methods.
