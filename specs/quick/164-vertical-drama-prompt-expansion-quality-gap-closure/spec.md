# Spec: Vertical Drama Prompt Expansion Quality Gap Closure

## Context

The Vertical Drama planning flow already has an optional prompt-expansion dialog,
preview/apply persistence, source-slot derivation, and a draft-generation flow.
The current user-visible result can be identical to the original premise because
the server calls `general-article-writer`, which normally returns Markdown rather
than the custom JSON contract. Strict parsing then falls back to the original
prompt. The existing feature must be completed as a coherent product contract,
not merely patched at the parser.

## Goal

Make prompt expansion produce a materially richer, editable, profile-aware
creative brief while keeping it clearly separate from the downstream Draft
generation flow. The operation must run the real LLM-backed skill and must fail
closed when the skill, provider, model, structured output, or quality gate is
unavailable. There is no deterministic/mock fallback result.

## Product contract

For `story`, expansion is an editable story treatment/brief, not a final Draft.
It should preserve explicit creator facts and, where appropriate, cover:

- protagonist and co-protagonist foundations, goals, wants, and needs;
- setting and the circumstances in which the leads meet;
- relationship progression and why affection develops;
- external obstacles, internal wounds, opposing forces, and escalating costs;
- the central mystery/question or largest conflict;
- turning point, climax, ending direction, and unresolved hooks;
- tone, audience, exclusions, creative assumptions, and a concise downstream prompt.

It must not create per-episode scenes, dialogue, shot grids, or a production
Draft. The approved treatment becomes input to the existing Draft flow.

Other profiles remain profile-specific: review uses review criteria and audience
angle; documentary uses subject/context/evidence boundaries; news requires
current claims and verification state; software review uses product/workflow
context. Romance/story fields must not be forced onto non-story profiles.

## Non-goals

- Replacing the existing Draft generator or creating a second Draft pipeline.
- Automatically applying AI output without user confirmation.
- Treating model-proposed facts, URLs, evidence status, or media ownership as
  authoritative.
- Adding a new provider, media registry, or unrelated schema redesign.

## Required behavior

1. Route prompt expansion through a capability/skill contract that can satisfy
   the requested structured output. Do not rely on a generic article skill's
   Markdown default while expecting a custom JSON object.
2. Use a versioned shared schema for profile-specific treatment fields, bounded
   lists, maximum lengths, and explicit provenance of model inference versus
   creator fact.
3. Parse only valid structured JSON from the real skill, allowing safe transport
   fences/wrappers. Plain text, empty output, copied output, malformed output,
   or missing structured fields is an error, not an editable AI result.
   Never silently replace a failed AI result with the original prompt.
4. If the skill/provider/LLM call/result is unavailable, retry only through a
   bounded real-LLM repair call or show a recoverable error. No deterministic,
   mock, sample, generic, or local fallback may be returned as expansion.
5. Enforce an expansion-quality gate: the result must add concrete structure,
   not merely prepend instructions or repeat the source. The gate must be
   deterministic and return actionable warnings.
6. Keep preview immutable and cancel-safe. Apply remains owner/tenant scoped,
   idempotent, revision/hash fenced, and conflict-safe.
7. Make the dialog explain the difference between “AI treatment” and “Draft
   เนื้อเรื่องย่อ”, show the original and generated content distinctly, and
   preserve editable fields before apply.
8. On apply, persist the approved treatment and expanded prompt in the existing
   run/source-pack contract, then pass the approved treatment as the authoritative
   premise context into Draft generation without duplicating or silently
   rewriting approved story facts.
9. Add focused unit, router/service, UI, and browser evidence for success,
   malformed output, copied output, retry, provider failure, cancellation,
   stale apply, long text, non-story profiles, and Draft handoff.
10. Add observability sufficient to distinguish model success, structured parse
   failure, quality-gate rejection, retry, and user cancellation without logging
   raw private prompts or secrets. A successful result must include verifiable
   real-run evidence: resolved skill/version, `execution_mode: llm-only`,
   provider/model, provider trace/request ID, token usage, and a non-mock
   executor path.
11. Tell the user the concrete failure reason in Thai/English when any strict
   preflight or execution gate fails. Do not show a successful preview or allow
   Apply in those cases. Do not deduct credits for preflight failure, mock/sample
   detection, skill resolution failure, or a call that did not reach an LLM;
   use the existing reservation/void/refund boundary for failed real calls when
   provider billing has occurred.

## Acceptance criteria

- A normal story premise produces an editable treatment that is materially more
  complete than the source and contains the story fields above when the model
  can supply them.
- The UI never presents the original prompt as a successful AI expansion.
- A malformed or generic model response is visibly labelled as failed; the user
  can retry or cancel without losing the original, and no fallback expansion is
  shown.
- The expanded treatment and downstream Draft have distinct labels, contracts,
  and responsibilities, with no second Draft workflow.
- Review/documentary/news/software profiles retain their own required fields and
  evidence rules.
- Apply cannot overwrite a changed premise or cross tenant/user boundaries.
- Focused tests and browser evidence prove all state transitions and responsive
  dialog behavior; baseline-wide typecheck noise is reported separately.
- At least one non-mocked integration smoke run proves that the resolved skill
  reaches a real configured LLM provider and returns the expected structured
  contract. Unit-test mocks do not count as this proof.

## Existing implementation anchors

- `apps/web/shared/verticalDramaSeries/promptExpansion.ts`
- `apps/web/server/services/verticalDramaPromptExpansionService.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaPromptExpansionDialog.tsx`
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/server/services/unifiedOrchestrator.ts`
- `apps/web/skills/general-article-writer/skill.md`
- `specs/feature/160-vertical-drama-prompt-expansion-and-visual-source-assets/`
