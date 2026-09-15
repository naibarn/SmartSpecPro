# Unified Episode Story Plan Design

## Goal

Show the narrative plan for both normal and Special Tie-in episodes in the
episode workspace so content review is possible without opening each shot. The
panel must expose a short episode-level summary immediately and keep the
nine-shot detail available behind a single expand/collapse control.

## Current evidence

- Normal episodes render `VerticalDramaEpisodePlanPanel` from the normal series
  bible breakdown item.
- Special Tie-in episodes intentionally pass `episodePlan = null` so the parent
  series plan cannot leak into the standalone special story.
- The Special Tie-in output already persists `output.storySummaries` for the
  nine ordered shots in `vertical_drama_episodes.specialData` JSONB.
- `getSpecialTieInStatus` already returns the Special Tie-in output to the
  browser.
- The selected idea is already persisted as `specialData.input.idea` when the
  user chooses an idea and creates/updates the Special Tie-in episode. That is
  the authored episode summary and must remain the primary display source.
- The two episode kinds have different authoritative storage boundaries, but
  both can be projected into the same read-only panel view:
  `episodePlan.shotDrafts`/canonical storyboard drafts for normal episodes and
  `specialData.output.storySummaries` for Special Tie-ins.

## Product behavior

### Both episode kinds

Use one shared story-plan panel in the same workspace area. The panel keeps the
normal episode's existing fields (working title, logline, key beats, and
cliffhanger) when those fields exist, and adds the same compact nine-shot
summary section for both episode kinds.

1. The panel header identifies the episode story plan and shows the available
   shot count, normally `9 shots`.
2. An episode-level summary is visible by default. For normal episodes, the
   existing logline is the primary summary; for Special Tie-ins, use the
   selected idea persisted in `specialData.input.idea`. Do not replace that
   authored idea with a new LLM summary assembled from the nine shots.
3. The nine-shot list is collapsed by default.
4. A single accessible toggle expands or collapses the complete ordered list.
5. No expand/collapse state is persisted. Reloading the page returns to the
   default state: summary visible, nine-shot list collapsed.
6. The normal plan's existing title/key-beat/cliffhanger fields remain visible
   and retain their current rendering behavior; the new shot section does not
   replace them.
7. If generation is still queued/running or has no output, retain the existing
   generation-status panel and do not invent a story plan.
8. If legacy Special Tie-in data has no persisted input idea, use the stored
   episode summary when available, then a bounded deterministic fallback from
   the ordered shot summaries.
9. If a normal episode has no authored `shotDrafts`, use only the existing
   canonical storyboard shot summaries as a bounded fallback. Do not invent
   missing shot summaries or read Special Tie-in data for a normal episode.
10. The panel is read-only; editing the story plan remains outside this change.

The summary and shot list must remain readable when text is long. The panel may
use bounded text wrapping and a constrained detail region, but it must not hide
the story content behind a horizontal scroll.

## Data contract

No new summary field or provider call is required. When the user selects one of
the generated ideas, its authored story text is placed in
`SpecialTieInInput.idea` and persisted under `specialData.input.idea` by the
existing create/update boundary. Normal episodes require no new storage field:
their existing episode-plan summary and shot drafts are projected into the
shared panel view.

Backward compatibility rules:

- New and updated Special Tie-ins display the persisted selected idea as the
  summary. Existing outputs without an input idea may use the legacy stored
  `episodeSummary`, then fall back to a deterministic summary from the ordered
  `storySummaries` entries, bounded to the UI-safe maximum.
- Existing outputs and existing nine-shot storyboard data remain valid; no SQL
  migration or backfill job is required.
- The page may expose a normalized `episodeStoryPlan` view to the shared panel,
  but source selection remains explicit. Special Tie-in data is not merged into
  the normal `episodePlan`, preserving the parent-story isolation boundary.

The API can reuse the existing `getSpecialTieInStatus.output` response. The
normal `getEpisodeDetail.episodePlan` contract does not need to change for this
feature.

## UI/data flow

```text
normal episodePlan.shotDrafts ─┐
normal canonical storyboard ───┼─> normalized episodeStoryPlan
specialData.output ────────────┘       │
                                       ▼
                              VerticalDramaEpisodeWorkspace
                                └─ shared story-plan panel
                                     ├─ visible short summary
                                     └─ collapsed/expanded nine-shot list
```

For a Special Tie-in, the panel must not read the parent series bible, normal
episode breakdown, or normal `episodePlan` as a fallback. For a normal episode,
the panel must not read `specialData` as a fallback.

## Error and empty states

- `queued`/`running`: existing generation status remains authoritative; the
  story-plan panel is omitted until output exists.
- `needs_clarification`: show available story output if present, with the
  existing clarification state outside the panel; do not suppress valid shots.
- `failed` with prior output: show the last committed output only if the
  existing status contract marks it as current/usable; do not silently combine
  output from different input versions.
- Missing or malformed summaries: omit invalid shot rows and show a bounded
  empty-state message rather than rendering `undefined`, raw JSON, or parent
  episode content.

## Testing and acceptance

Add focused tests for:

- the shared panel showing the episode summary by default for normal and
  Special Tie-in episodes;
- the nine-shot section being collapsed initially and expanding through an
  accessible control;
- no localStorage read/write for panel state;
- normal episode plan rendering remaining unchanged;
- normal shot drafts being projected into the same nine-shot section;
- canonical storyboard fallback when a normal episode has no authored shot
  drafts;
- selected idea persistence/normalization as the primary summary;
- deterministic fallback for legacy output without a selected idea;
- no parent-series plan leakage into Special Tie-in content;
- queued/running/clarification/empty output states.

Run the focused Vertical Drama client/server tests, TypeScript parse/build
checks appropriate to the changed files, and `git diff --check`. No provider
call, credit charge, migration, deployment, or production data mutation is
part of this change.

## Trade-offs

- Reusing the selected idea already stored in the Special Tie-in input keeps
  the summary faithful to the user's choice, avoids a second interpretation of
  the story, and requires no additional credit charge, job, or migration.
- A separate panel/type adds a small UI surface but makes the normal/special
  ownership boundary explicit and prevents accidental reuse of the normal plan.
- Non-persisted toggle state is intentionally simple and matches the request;
  users who reopen the page will see the compact summary and can expand details
  again when needed.
