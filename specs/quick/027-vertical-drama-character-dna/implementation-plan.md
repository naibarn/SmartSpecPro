# Implementation Plan

## Objective

Ship the approved complete Character DNA workflow through the real Characters-tab call path:
real story/cast/history facts in, deliberate candidate selection and structured DNA out,
approved DNA persisted safely, and subsequent prompt generations anchored to that DNA.

## Current-codebase fit

The implementation extends existing boundaries instead of creating parallel ones:

- skill authors all creative design and prompt prose;
- server code supplies bounded facts, validates structured output, and persists it;
- router retains authentication, rate limits, media submission, and credit behavior;
- client retains the existing portrait preview and direct sheet flows;
- the existing JSONB character profile remains canonical.

## Section order

1. `section-01-skill-context-contracts`: typed DNA, skill behavior, context assembler,
   prompt serialization, output mapping.
2. `section-02-router-persistence`: owned context loading in all three call paths,
   preview snapshot response, direct/approved persistence, failure behavior.
3. `section-03-client-handoff-and-gates`: carry unchanged portrait snapshot, omit on edit,
   localized notice, targeted regression and integration gates.

Sections are sequential because each consumes contracts from the prior section.

## Implementation approach

### Contracts and context

- Extend the shared visual-bible schema with a structured `characterDesignDna` object and
  score/comparison substructures, retaining passthrough compatibility.
- Keep context/DNA schemas and types in the shared field-only module so the context loader
  and prompt service do not import each other and create a service-level cycle.
- Add a small server context assembler with pure snapshot projection helpers and one bounded
  owner-scoped database loader.
- Derive series DNA facts by allowlisting known string fields from the series row/bible.
- Project current cast and prior leads into compact allowlisted snapshots. Scan a bounded
  recent-series candidate window and select the five most recent series that actually
  contain usable lead evidence, rather than letting empty drafts consume the comparison
  window.
- Cap the current-cast projection at 30 rows while always retaining the target character;
  cap every free-text fact before serialization.
- Mark archive status/source quality explicitly and never infer absent dimensions.

### Skill and prompt runtime

- Integrate the supplied guide as a mandatory decision funnel before prompt construction.
- Preserve all existing mandatory safety/reference sections and define precedence explicitly.
- Require three materially distinct internal directions, scoring, one redesign attempt,
  concise selected rationale, and no private reasoning output.
- Extend input/output schemas without removing existing fields.
- Serialize `character_design_context` and existing approved DNA as facts.
- Validate `character_design_dna` in the active runtime and map only returned creative fields
  into the persisted visual-bible snapshot.
- Reduce temperature moderately while keeping the single-call architecture, and raise the
  bounded completion-token budget enough to carry the added DNA without truncating the five
  already-required prompts.

### Router and persistence

- Load design context after the existing owned series/character checks for preview, direct
  portrait, and direct sheet paths.
- Return an approved snapshot from preview without persisting it.
- Accept an optional validated approved snapshot on portrait confirm.
- Persist just-generated DNA for direct portrait/sheet calls after media submission.
- Persist preview DNA only when the approved prompt matches the preview original after trim.
- Use atomic nested JSONB update and preserve all sibling character data.
- Treat archive failure as explicit `unavailable`; treat current-cast failure as blocking.
- If persistence fails after task submission, preserve task success and return a warning.

### Client

- Extend pending portrait preview state with original prompt and validated snapshot.
- Send the snapshot only on unchanged confirmation.
- On edited confirmation, render normally and show bilingual notice that Character DNA was
  not locked; no new layout or modal is introduced.
- Cancel clears the entire pending snapshot.
- Character Sheet flow remains unchanged on the client.

## Risks and mitigations

- Prompt size growth: bounded field allowlist, at most fifteen candidate series scanned,
  five series selected, two leads per selected series, and compact snapshots.
- Oversized browser snapshot: apply explicit string/array/object limits in the validated
  transport schema; never accept arbitrary passthrough keys from the client.
- Cross-owner leakage: hard tenant+user filters and projection tests.
- Hallucinated history: explicit status/source-quality fields and skill behavior tests.
- Data clobber: atomic JSONB nested update, not full-object merge.
- Edited prompt/DNA mismatch: omit snapshot persistence when prompt changes.
- Child/reference regressions: preserve exact content markers and run all existing skill tests.
- LLM omission: strict active runtime validation and existing one-retry path.
- Dirty-tree collision: inspect and modify only exact hunks; no staging/commit.

## Acceptance criteria

All criteria from the approved design must hold, including structured history truthfulness,
lead/cast differentiation, 16/20 structured-history uniqueness threshold, child/reference
precedence, no extra paid call, atomic confirmation-only persistence, edited-prompt safety,
and backward compatibility.

## Verification

- Run focused tests after each section.
- Run cross-section targeted suites after integration.
- Run `pnpm --filter @smartspec/web check` and distinguish pre-existing failures from new
  errors by exact changed-file paths and baseline comparison.
- Run `git diff --check` and file-scoped diff review.
- Browser evidence is limited to the existing portrait preview interaction; if a runnable
  authenticated route is unavailable, record browser checks as skipped rather than passed.

## Git policy

Do not stage, commit, push, or touch unrelated index state. The implementation and planning
files remain as a scoped working-tree change for user review.
