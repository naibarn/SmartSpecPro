# Section 02 staged diff manifest

Review the staged diff for these paths:

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.speakerSubShots.test.tsx`
- `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts`
- `apps/web/server/services/__tests__/verticalDramaEpisodeVideoAssembly.test.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.voiceChain.test.ts`

Use `git diff --cached -- <paths>` as the authoritative staged diff. The router
has unrelated unstaged work; verify its staged hunks contain only canonical
readiness changes.

Verification completed:

- Focused Vitest after review fixes: 4 files passed, 110/110 tests passed.
- `npm run check`: passed.
- Browser route verification: not run because the reported production route is
  authenticated and no equivalent local authenticated fixture is configured;
  component-level RTL evidence covers label, warning, full-button disabled
  state, and partial-button state.
