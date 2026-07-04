# Orchestra Progress

[IN-PROGRESS] wave-1-audit — 4 agents dispatched: agent-A (overview/bible), agent-B (character bug), agent-C (last-3-tabs), agent-D (storyboard/char-image)
[PENDING] wave-2-fix-or-report — TBD after Wave 1 findings: small fix for item 3 if root cause is clear/small; otherwise gap report only

[COMPLETE] wave-1-audit — 4 agents returned findings:
  agent-A: Overview shows draft narrative outline (bible.episodeBreakdown), Episodes tab shows real DB episode records — not duplicative but confusingly both labeled "EP n". Story Bible generation is fully wired end-to-end; dedicated "Bible" tab is an unbuilt PlaceholderTab stub.
  agent-B: Character carryover bug ROOT CAUSE CONFIRMED — wizard writes to bible.charactersDraft (verticalDramaSeries.ts:216), Characters tab reads from separate vertical_drama_characters table (VerticalDramaCharacterStockPanel.tsx) via listCharacters — never seeded from wizard's parseCharactersDraft. Fix: seed vertical_drama_characters rows from parseCharactersDraft inside `create` mutation (1 file + small slug helper).
  agent-C: Product tie-in / Assets / Settings tabs are ALL literal generic PlaceholderTab stubs (VerticalDramaSeriesDetailPage.tsx:220-226). Product tie-in has unused compliance service (verticalDramaProductTieIn.ts) + write-only wizard path. Settings has ready `updateSeries`/policy mutation unused by any UI. Assets has zero backend surface.
  agent-D: Storyboard generation (storyboard_shotgrid stage) is STUBBED — full 15-stage pipeline/UI/approval scaffolding exists but buildStoryboard() returns hard-coded placeholder shots, provider routing explicitly skips every stage except final video-clip render. Character image generation is STUBBED/NOT STARTED — reference *management* (import/approve/staleness) fully built, but no generateCharacterImage procedure/service/UI exists anywhere (frontend, tRPC, or Python).

[IN-PROGRESS] wave-2-fixes — parallel: (a) ssp-backend seeding vertical_drama_characters from wizard charactersDraft on create, (b) ssp-frontend relabeling StoryBibleOverviewCard's episode list to read as a draft plan distinct from the Episodes tab

[COMPLETE] wave-2-fixes:
  (a) verticalDramaSeries.ts `create` mutation now seeds vertical_drama_characters from bible.charactersDraft via existing parseCharactersDraft helper + new slugifyCharacterName/seedCharactersFromDraft, best-effort (try/catch, never blocks series creation). Verified: name/role now populate identically to manually-added characters (data.description stored but not yet surfaced by VerticalDramaCharacterStockPanel for ANY character — pre-existing panel limitation, not a regression).
  (b) VerticalDramaSeriesDetailPage.tsx StoryBibleOverviewCard relabeled: draft-plan caption + per-episode "ตอนที่ {n} (แผน)" labeling + clickable hint that switches to the real Episodes tab via existing setActiveTab state.
  Both: tsc --noEmit clean (only pre-existing unrelated errors). Relevant existing test suites (verticalDramaCharacterStock, verticalDramaStoryboardHandoff) 24/24 pass.

## Final verification
- Full repo tsc --noEmit: clean except pre-existing unrelated errors (VerticalDramaCharacterStockPanel.tsx implicit-any x3, one unrelated unknown-type arg).
- No schema/migration changes this round — reused existing vertical_drama_characters table + existing parseCharactersDraft helper.

## Backlog (large unbuilt features — reported, NOT built this round; each needs its own plan + approval)
- Item #2 gap: dedicated "Bible" tab is an unbuilt PlaceholderTab stub (Story Bible generation itself IS fully wired via Overview's card + Generate/Regenerate button).
- Item #4: Product tie-in / Assets / Settings tabs are all literal PlaceholderTab stubs.
  - Product tie-in: wizard write-path + unused compliance service (verticalDramaProductTieIn.ts) exist; needs a real tab UI + edit mutation + wiring the existing planTieIn/screenClaims service.
  - Settings: updateSeries/policy mutation already exists and is unused; needs a Settings form UI.
  - Assets: zero backend surface; needs a media-ledger list procedure + lineage/cross-link logic + UI (spec's own section-03 checklist already lists this as outstanding).
- Item #5: storyboard_shotgrid stage is fully scaffolded (UI, approvals, QC, review handoff) but buildStoryboard() returns hard-coded placeholder shots; provider routing explicitly skips all stages except final video-clip render. Needs a real LLM call to generate shot content from episode text.
- Item #6: character reference-image *generation* does not exist anywhere (frontend/tRPC/service/Python) — only import-existing-asset management is built. Needs a generateCharacterImage procedure + image-model wiring (planning groundwork like resolveImageModels already exists in verticalDramaStartFrame.ts).

[COMPLETE] wave-3-tabs — Settings/Product-tie-in/Assets tabs built:
  Backend: verticalDramaSeries.ts updateSeries now patches productTieIn; new listSeriesAssets query (character assets + run artifacts, ownership-scoped, tested against verticalDramaProductTieIn.test.ts 11/11 pass).
  Frontend: 3 new components (VerticalDramaSettingsTab, VerticalDramaProductTieInTab, VerticalDramaAssetsTab) replacing PlaceholderTab branches in VerticalDramaSeriesDetailPage.tsx.
  Full tsc --noEmit: clean (only pre-existing 3 unrelated VerticalDramaCharacterStockPanel.tsx errors remain, unchanged).

[IN-PROGRESS] wave-4-episode-continuation — new generateNextEpisodes mutation (materialize unused bible.episodeBreakdown entries first, LLM-continue once exhausted, mirrors generateStoryBible credit-gating) + wire "Add episode" button in EpisodesTab.

[COMPLETE] wave-4-episode-continuation — new verticalDramaEpisodes.generateNextEpisodes mutation:
  Mode A (free): materializes unused bible.episodeBreakdown entries into real episode rows.
  Mode B (credit-gated LLM): once plan exhausted, generateNextEpisodesViaLlm (new service verticalDramaEpisodeContinuation.ts, mirrors generateStoryBible's credit-gate/model-select/validate/deduct pattern) continues story using all existing episodes as context, all-or-nothing on partial response, real DB-assigned episode numbers persisted back into bible.episodeBreakdown.
  createEpisode's numbering logic extracted into shared insertEpisodeWithSafeNumber helper, both procedures reuse it — createEpisode's own behavior verified byte-for-byte unchanged via diff review.
  Frontend: EpisodesTab "Add episode" button wired in both empty and non-empty states, loading/toast/invalidate.
  Full tsc --noEmit: clean (only pre-existing 3 unrelated VerticalDramaCharacterStockPanel.tsx errors).

[BLOCKED-FOR-DESIGN] wave-5-storyboard-generation — Investigated apps/web/server/services/verticalDramaEpisodePipeline.ts.
  Finding: buildStagePayload() is explicitly documented as deterministic/no-paid-calls, safe for dry_run/plan_only.
  Real paid generation is architected to go through a separate ProviderRoutingPort (verticalDramaProviderRouting.ts),
  which today only stubs render_or_import_video_clips (and that does nothing) and is explicitly gated behind
  approval checkpoints ("nothing paid runs in dry_run/plan_only or before approval" — stated invariant in file docs).
  Wiring real storyboard/character-image generation correctly requires extending the ProviderRoutingPort within
  its approval-gating architecture, not a simple LLM-call swap in buildStagePayload (which would risk bypassing
  the "never paid before approval" safety guarantee). Paused here rather than rushing a change to a safety-gated
  paid-generation path — asked user how to proceed.

## Key discovery (redirected wave 5/6 approach)
User clarified the actual spec intent: storyboard/character-image generation should call the app's
SKILLS ENGINE (not raw inline LLM calls) + existing media generation system. Investigation found this
is ALREADY PARTLY DONE — all 8 vertical-drama-* skills (storyboard-shotgrid, character-visual-bible,
shot-start-frame-render, video-motion-prompt-pack, script-builder, dialogue-audio-planner,
series-memory-planner, product-tie-in-planner) are already installed under apps/web/skills/, imported
from https://github.com/naibarn/vertical-drama-video-flow — they were just never invoked from the
pipeline. skillExecutor.ts's executeSkill() does NOT actually call an LLM for llm-only skills (chat-flow
only) — correct pattern is to read skill.md's body as the system prompt and call executeWithFallback
directly, same as verticalDramaStoryBible.ts/verticalDramaEpisodeContinuation.ts already do.
User decisions: (1) call real LLM only outside dry_run/plan_only modes, preserving buildStagePayload's
documented dry-run-safety invariant; (2) build character image generation now, reusing existing media
generation pattern.

[IN-PROGRESS] wave-5-storyboard-generation — new verticalDramaStoryboardGeneration.ts service (reads
  vertical-drama-storyboard-shotgrid/skill.md as system prompt) wired into runStage for storyboard_shotgrid,
  gated to non-dry-run/plan_only modes only.
[IN-PROGRESS] wave-6-character-image-generation — new verticalDramaCharacterImageGeneration.ts service
  (reads vertical-drama-character-visual-bible/skill.md for prompts) + new generateCharacterImage mutation
  in verticalDramaCharacters.ts calling mediaGenerationService for real image render, writing to
  verticalDramaCharacterAssets with source:"generated".

[COMPLETE] wave-5-storyboard-generation — new verticalDramaStoryboardGeneration.ts (reads vertical-drama-storyboard-shotgrid/skill.md as system prompt, executeWithFallback, Zod-validates snake_case output schema, credit-gated) wired into runStage's storyboard_shotgrid stage, gated to full/render_images/render_video/repair modes only. buildStagePayload's dry_run/plan_only placeholder behavior verified byte-for-byte unchanged. 39/39 adjacent test suites pass.

[COMPLETE] wave-6-character-image-generation — new verticalDramaCharacterImageGeneration.ts (skill-driven prompt generation) + new generateCharacterImage mutation in verticalDramaCharacters.ts (real image render via mediaGenerationService.generateImage, mirrors media.ts's credit/token pattern, registers media_assets row, links via existing verticalDramaCharacterStockService.linkAsset with source:"generated"). Frontend: Generate-image button + thumbnail display wired into VerticalDramaCharacterStockPanel.tsx.
Flagged follow-up (not blocking): generateCharacterImage has no rate-limiting/abuse-guard yet (media.ts's private guardrails weren't reusable as exports) — worth adding before wider exposure.

## FINAL VERIFICATION (full session)
- Full repo tsc --noEmit: clean except 2 pre-existing unrelated VerticalDramaCharacterStockPanel.tsx errors (down from 3 — one incidentally fixed as a side effect of wave-6 frontend edit touching that line).
- All existing vertical-drama test suites re-run clean throughout: verticalDramaCharacterStock, verticalDramaStoryboardHandoff, verticalDramaProviderRouting, verticalDramaProviderQcGate, verticalDramaProductTieIn — no regressions introduced across 6 waves.
- No schema/migration changes across the entire session — every feature reused already-existing tables (vertical_drama_characters, vertical_drama_character_assets, vertical_drama_run_artifacts, media_assets) and already-installed skill files.
