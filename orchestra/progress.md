[COMPLETE] step-0-session-start — Archived stale orchestra session, created a fresh session, and recorded platform `standard`.
[COMPLETE] step-1-discovery — SocratiCode status green; narrowed Production Director files, planner skill, specs, and current dirty work.
[COMPLETE] step-2-planning — Created planning artifact for four concept cards, card-level regeneration, infographic image generation, fullscreen preview, and project default image/video media models.
[COMPLETE] implementation-wave-1 — Added generation default image/video model contract across shared types, goal/space payloads, and router schemas.
[COMPLETE] implementation-wave-2 — Replaced the story concept wizard with a four-card concept/storyboard board, card-level actions, infographic preview state, and fullscreen preview.
[COMPLETE] implementation-wave-3 — Wired full-board and per-card story concept regeneration, plus manual per-card infographic image generation through the existing image generation mutation.
[COMPLETE] implementation-wave-4 — Added project default image/video model selectors and applied selected defaults to production goal snapshots, generated nodes, and planning capability IDs.
[COMPLETE] implementation-wave-5 — Updated planner skill output guidance and production director e2e coverage; targeted e2e and typecheck passed.
[COMPLETE] implementation-wave-6 — Closed review findings: long-running infographic task tracking/reconciliation, regenerated-card infographic reset, card accessibility semantics, schema upgrade preservation, and browser evidence.
[COMPLETE] implementation-wave-7 — Debugged workflow canvas disappearing from real code path: stale `getSpace` query responses could overwrite newer local `ProductionSpace` drafts. Added stale-version guard, selected the generated `storyboard-card` after workflow creation, and stopped repeated infographic polling for task-not-found responses.
[COMPLETE] implementation-wave-8 — Moved full Storyboard prompt card review out of the canvas into the Video Shot tab. Added per-shot storyboard cards with editable script/image/video prompts, reference thumbnails, generated image/video previews, and per-card image/video generate/regenerate actions that prefill and auto-start the selected media surface.
[COMPLETE] implementation-wave-9 — Added a storyboard seconds-per-video contract. Production Director now lets users choose 8s or 10s per storyboard video, sends total duration / clip duration / required video count to the planner skill, and normalizes generated Storyboard prompt cards plus Video Shot records to the derived count.

Notes:
- SocratiCode was active and used before broad shell search.
- Existing uncommitted work was present in Media Studio / Production Director files before this planning task began.
- Implementation proceeded after user approval ("implement ต่อได้เลย").
- Verification:
  - `npm run e2e:production-director` in `apps/web`: passed, 25 tests.
  - `npm test -- server/services/__tests__/productionSpaceService.test.ts` in `apps/web`: passed, 35 tests.
  - `npm run e2e:production-director-browser` in `apps/web`: passed, 24 Playwright tests.
  - `npm run check` in `apps/web`: passed.
  - Latest wave: `npm run check` in `apps/web`: passed.
  - Latest wave: `npm run e2e:production-director` in `apps/web`: passed, 28 tests.
  - Latest Video Shot storyboard card wave: `npm run check` and `npm run e2e:production-director` in `apps/web`: passed, 28 tests.
  - Latest storyboard timing wave: `npm run check` and `npm run e2e:production-director` in `apps/web`: passed, 28 tests.
  - `pnpm` was unavailable in this environment, so repo npm scripts were used.
