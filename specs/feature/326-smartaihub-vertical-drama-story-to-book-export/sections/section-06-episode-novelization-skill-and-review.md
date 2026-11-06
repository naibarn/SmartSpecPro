# Section 06 — Episode novelization skill and review

## Requirement IDs

New/revised requirements: novel-like prose quality, multimodal ordered storyboard input, user-selected vision-capable LLM, per-episode reading/review, targeted episode-only re-novelization, candidate comparison/application, and preservation of edits in unrelated episodes. Reconcile exact IDs with the canonical requirement ledger before implementation.

## Objective and deliverable

Replace the current shot-by-shot short passage composition with an episode-bounded novelization workflow. The reader should experience each episode as a coherent novel chapter with connected scenes, readable narration, naturally integrated dialogue, and continuity across the selected story. Authors can inspect each converted episode and re-run only an unsatisfactory episode using a selected LLM model.

## Current gap

`verticalDramaBookComposition.ts` currently asks for one prose passage per supplied shot and appends its dialogue as separate blocks. This can preserve source coverage while still reading like nine summaries in sequence. It resolves the structured chat model internally; Book Studio does not choose a model, and it has no episode-only re-novelization or episode-focused reader action.

## Owned scope

- New product skill under `apps/web/skills/vertical-drama-book-novelizer/` with versioned `skill.md` and manifest metadata.
- `apps/web/server/services/verticalDramaBookComposition.ts` and focused service tests.
- `apps/web/server/routers/verticalDramaBooks.ts` and `apps/web/server/services/jobExecutorRegistry.ts` for model validation, cost estimate, target episode, job input and progress.
- `apps/web/shared/verticalDramaSeries/bookDocument.ts` only where the versioned candidate/review state or provenance requires it.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaBookStudio.tsx` and a focused episode-reader/quality-review component if needed.
- Canonical Spec requirement-ledger evidence and existing integration handoff.

## Skill contract

The skill receives a bounded immutable source snapshot containing selected episode metadata, ordered shot synopses, original dialogue and speaker identity, character/setting continuity facts, locale/genre/tone, and authorized storyboard images. It returns structured prose blocks and source references that validate against the Book Document schema.

The skill must:

- Turn shot summaries into continuous novel narration rather than one disconnected paragraph per shot.
- Weave known dialogue into action and narration while preserving its meaning and speaker; retain identifiable dialogue blocks when useful to the editor/accessibility renderer.
- Create scene transitions and varied sentence rhythm without changing event order or adding unsupported plot facts, relationships, motives, or outcomes.
- Use image evidence only for visible expression, action, and setting, and maintain ordered provenance back to the source shot/episode revision.
- Preserve the author's language and established character voice using the pinned series context.
- Run a compact rubric review for flow, readability, continuity, dialogue integration, source coverage, and unsupported detail. Allow at most one bounded targeted revision; return review findings for the author rather than looping indefinitely.
- Return stable block IDs and paragraph/scene-level source references so an episode can be updated without rebuilding unrelated content.

## Model and job contract

- UI lists only enabled LLM models that can receive the required image inputs. Model identity/provider selection must be validated server-side and pinned into the job payload; fail closed if unavailable. Do not silently switch to a default model.
- The user selects a model before initial composition and may choose a different eligible model for an episode retry.
- Estimate credits with the chosen model, actual bounded image count/bytes, source text, output ceiling, one self-review revision, retry headroom, and current pricing before queueing.
- Compose all episodes as resumable per-episode worker units. A retry targets the user-selected episode and creates a candidate revision. It may not modify any unrelated chapter or erase user edits.
- If the target episode contains authored edits, show the existing and proposed text and require an explicit keep/apply decision. Preserve the prior revision for rollback/history.
- Recheck ownership and pinned source fingerprint before reading image bytes and before persisting the candidate. Job status and candidate access are tenant/user scoped.

## UI contract

- Provide a reading preview organized by episode/chapter, not by visible shot number. Show clean prose by default; source synopsis, dialogue and shot images are available in a review context without disrupting reading flow.
- Show an explicit episode state: not generated, generating, draft ready, needs review, or failed/retryable.
- Provide an episode-level regenerate action with model selector, model-specific estimate, progress, cancel/retry where supported, and concise sanitized errors.
- Keep the existing draft visible while a replacement is being generated. Let the user compare and explicitly apply or discard the candidate.
- Whole-book and targeted episode controls must be distinguishable. Targeted re-novelization must clearly state that it affects only the chosen episode.
- Keyboard, screen-reader, responsive layout, and Thai-first copy follow existing Book Studio patterns.

## Acceptance matrix

| Scenario | Expected result |
|---|---|
| initial whole-book composition | Each episode becomes continuous prose; shot structure is not exposed as chapter headings; progress is resumable per episode |
| dialogue-heavy episode | Dialogue meaning and speaker are preserved and narration connects the exchanges naturally |
| visually dependent scene | Selected model receives authorized shot image evidence and uses only visible facts |
| incompatible/stale model | Request is rejected before paid execution with a sanitized explanation |
| weak quality rubric result | At most one targeted revision runs; the result and review signals remain available to the author |
| episode review | User can read prose in episode order and open source context on demand |
| single-episode retry | Only the target episode's candidate content changes; all other episodes and their edits are byte-for-byte preserved |
| target has author edits | Existing draft remains until user explicitly compares and applies replacement |
| provider failure/cancel | Completed episode checkpoints and existing approved/draft text remain intact; retry does not duplicate settled billing |
| export | EPUB/PDF include the approved novelized prose and never include unapproved candidate text |

## Focused verification

- Skill content tests assert all quality rules, image/source grounding, bounded self-review, and structured output contract.
- Service tests cover no shot-by-shot output shape regression, provenance coverage, bounded retries, pinned model, and preservation of non-target chapters/user edits.
- Router/executor tests cover model eligibility, estimate-before-queue, tenant isolation, per-episode job payload and idempotent progress.
- UI tests cover episode reader, model/estimate selection, compare/apply/discard, target-only disclosure and failure states.
- Run the scoped package/integration profile appropriate to changed files; do not run repository-wide typecheck in a shared local implementation session.

## Completion predicate

Authors can choose an eligible LLM, generate and read coherent novel prose per episode, review the source context, and selectively re-novelize one unsatisfactory episode without damaging other episodes or edits. New and revised canonical requirement rows have fresh implementation and verification evidence bound to the integrated SHA.
