# Implementation Plan

## Objective

Make a generated Draft creator-readable and internally coherent before Apply by separating
market from character identity, adding a validated story-design handoff, and closing the
role/roleTier contract leak.

## Affected surfaces

| Surface | Files/modules | Change |
|---|---|---|
| Shared | `shared/verticalDramaSeries/*` | Add bounded identity/story-draft contracts and helpers; reuse Story Control |
| Synthesis | `server/services/verticalDramaPresetSynthesis.ts` | Request/parse optional context and story seed; normalize diagnostics |
| Create handoff | `client/CreateSeriesWizard.tsx`, `server/routers/verticalDramaSeries.ts` | Show assumptions, preserve selected seed, pass it to bible creation |
| Story generation | `server/services/verticalDramaStoryBible.ts` | Consume approved identity/story seed as facts, without changing old callers |
| Skill | preset synthesizer and full-story architect copies | Add hard precedence and story-design instructions; keep paired copies synchronized |
| Tests | shared/server/client focused suites | Cover precedence, ambiguity, enum repair/gate, story-control continuity, UI states |

## Approach

1. Add optional `storyContext` with independent market, setting, lead-background and
   dialogue fields plus `source`/`confidence` metadata. Keep the existing language and
   naming contracts as compatibility helpers, but stop using their preview as nationality.
2. Add optional `storyDesign` containing a primary/secondary engine, pressure
   threads, early payoff, romance phase skeleton, advantage beats and guardrails. Prefer
   the existing `storyControlSeedSchema` for bounded thread/romance/advantage data and
   keep creator-readable summaries separate from machine metadata.
3. Normalize role fields after parsing. Add a diagnostic for missing/invalid roles and a
   bounded repair path. Use `roleReviewStatus` when unresolved; do not invent a lead or
   villain from occupation alone.
4. Extend `applyPresetDraft` and `create` with optional additive fields. The full-story
   prompt receives these as approved facts and must not reinterpret them from title or
   spoken language. Legacy callers omit them and preserve prior behavior.
5. Replace the one-line naming preview with a compact identity-assumptions card. Add
   provenance badges, an ambiguity choice only when the draft marks a decision as needed,
   and a clear blocking message for unresolved structural diagnostics.

## Compatibility and failure handling

- Missing optional fields resolve exactly as current legacy behavior.
- Invalid optional story context/design is dropped with a diagnostic; it cannot corrupt the draft.
- Invalid role enums are lowercased/normalized where safe; unresolved characters remain
  `needs_role_review` and cannot be applied until repaired or explicitly reviewed by the
  existing role editor path.
- Existing target-audience image defaults continue through `targetAudienceRegion` only.
- No DB migration is needed because the new fields live in existing JSONB/bible payloads.

## Acceptance criteria

- Thai UI + English (US) shows Thai narrative, English title candidates, US dialogue,
  United States setting only when supported by premise, and an independent lead background.
- “Asian international student” remains broad when origin country is absent; no random
  nationality or name is stamped.
- Explicit names/heritage/setting always outrank market defaults.
- The draft exposes romance progression, pressure, early payoff, and advantage/cost intent;
  the approved seed reaches full-story generation.
- Raw enum/schema jargon is not the primary creator-facing warning.
- Old series and legacy drafts continue to parse and render unchanged.

## Verification

- Focused shared contract tests.
- Preset synthesis and story-bible prompt tests.
- Create wizard draft apply/gate tests.
- `git diff --check`, paired skill-copy comparison, and changed-surface type diagnostics.
- Browser evidence at 390x844, 768x1024, and 1440x900 if an authenticated browser is
  available; otherwise report browser verification as skipped.
