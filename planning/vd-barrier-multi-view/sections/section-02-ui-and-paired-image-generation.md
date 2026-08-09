# Section 02 — UI and Paired Image Generation

## Ownership boundary

Own configuration/status UI, page/workspace callback plumbing, paid paired-generation orchestration, view-specific start/reference image prompts, and reference-frame linking. Do not change video prompt generation here.

## Target areas

- `VerticalDramaStoryboardPanel.tsx`
- `VerticalDramaEpisodeWorkspace.tsx`
- `VerticalDramaEpisodePage.tsx`
- existing reference-frame dialog or a focused Barrier configuration dialog
- `verticalDramaStartFrameGeneration.ts` and router image-generation paths
- localized workspace copy and client tests

## UI/UX Contract

- Target user: drama producer defining a physically separated conversation.
- Surface: shot card with a dedicated `Barrier Multi-View` block.
- State matrix: disabled, configured, start-only, reference-only, ready, stale, loading, partial failure, ownership/provider error.
- Accessibility: distinct text labels `Start frame · Inside` and `Reference frame · Outside`, keyboard-accessible actions, no color-only status, descriptive retry/error text.
- Copy: Thai first with English fallback; never call the outside actor `Caller`.
- Browser evidence: verify both slots, partial retry, and stale blocking in the shot card at desktop and narrow responsive widths.

## TDD expectations

Test slot labels, callback payloads, status transitions, and partial retry before implementation. Prove the outside character never enters the main frame selection.

## Risks

Use one paid confirmation for the paired operation but persist per-view success. Do not clear unrelated generic references or mutate other shots.
