# Research: Vertical Drama Prompt Expansion Quality Gap Closure

## Research boundary and method

This is an existing TypeScript/React/Postgres codebase. SocratiCode was requested
by the repository instructions but no callable SocratiCode MCP tool was exposed
in this session. Discovery therefore used targeted `rg` and bounded file reads,
with no broad rewrite or worktree cleanup. No web research was needed: the
problem is an internal contract mismatch and the plan must preserve the
repository's existing provider and credit boundaries.

Relevant prior feature material was read from
`specs/feature/160-vertical-drama-prompt-expansion-and-visual-source-assets/`.
That feature already establishes preview/apply, editable output, source slots,
tenant ownership, revision/hash fencing, and focused Vitest/Playwright proof.
This plan closes the quality gap without reimplementing the larger visual-source
feature.

## Evidence ledger

| Symptom or requirement | Evidence | Consequence |
|---|---|---|
| The dialog can show the original premise as the expansion | `verticalDramaSeries.ts` routes `previewPromptExpansion` to `general-article-writer` and asks for a custom JSON object | The selected skill's default output contract does not match the caller's requested contract |
| The selected skill is unsuitable for strict custom JSON | `apps/web/skills/general-article-writer/skill.md` defaults to Markdown/plain text and only defines `cms_json` for an ArticleCMS object; the capability manifest says not to use it for `structured_json_required` | A user-message instruction cannot replace a skill-level output contract |
| Malformed output becomes a false-looking success | `parsePromptExpansionModelOutput` calls strict `JSON.parse`, and the catch path returns `expandedPrompt: fallbackPrompt` with a warning | A failed AI call is rendered as a preview whose main text is identical to the source |
| The existing fallback does not expand meaningfully | `buildFallbackExpandedPrompt` only appends generic editorial instructions when there is no model output; malformed model output follows the parser catch path instead | Fallback behavior needs explicit status, retry, and quality-gate semantics |
| Structured story architecture already exists | `vertical-drama-story-architecture-planner` has a versioned JSON schema, provider `response_format`, transport normalization, schema retry, and deterministic architecture diagnostics | Reuse these patterns, but do not use the Draft-authoritative architecture contract as the prompt-expansion payload |
| Applying currently replaces the wizard premise field | `CreateSeriesWizard.tsx` applies with `set("userPremise", value.expandedPrompt)` | The system must retain original creator text and approved treatment lineage separately while preserving existing Draft input behavior |
| Draft is downstream of the premise | `verticalDramaStoryBible.ts` and router create/generation flows carry `userPremise` into Draft prompts and `bible.userPremise` | Prompt expansion must enrich Draft input once, not create a second Draft pipeline or silently rewrite it twice |
| Existing persistence is JSON-ledger based | `vertical_drama_prompt_expansion_runs` stores original/hash/revision/status/preview JSON/approved JSON and has owner-scoped queries | An additive JSON contract can avoid a destructive migration; any new indexed ownership or status field needs an explicit migration |
| UI already has a dialog and editable fields | `VerticalDramaPromptExpansionDialog.tsx` renders brief, expanded prompt, sources, warnings, and slots | The gap is semantic distinction/state quality, not a need for a new modal framework |
| The 2,000-character guard was already addressed | Current shared constant is `PROMPT_EXPANSION_PREMISE_LIMIT = 2000`; prior focused tests cover counter and disabled CTA | Do not undo this baseline; add quality-flow tests around the bounded input |

## Current execution flow

1. The wizard sends the premise to `previewPromptExpansion`.
2. The router invokes `executeUnified` with `selectedSkillId:
   "general-article-writer"`, a free-form custom JSON request, and credit
   deduction.
3. The text executor returns text. There is no feature-specific structured
   response schema in this call.
4. The shared parser strictly parses one raw JSON shape. Any fence, wrapper,
   missing field, or plain text enters the catch path.
5. The service builds a valid preview around the original premise and saves it.
6. The dialog displays the preview; apply writes the approved JSON after
   owner/hash/revision checks.
7. The wizard copies only `expandedPrompt` into `userPremise`, and downstream
   Draft generation receives that text through the existing premise chain.

## Architecture decision

Create a feature-specific `vertical-drama-prompt-expansion` skill contract with
a versioned output schema and profile discriminator. Do not route this feature
to `general-article-writer`, and do not directly reuse
`vertical-drama-story-architecture-planner` as the output shape:

- `general-article-writer` is a generic article capability and explicitly
  excludes structured JSON tasks.
- `vertical-drama-story-architecture-planner` is the authoritative backbone
  before Draft synthesis. Using it for the optional treatment would collapse
  the distinction the product now needs and would force season/episode
  architecture into a user-editable premise expansion.
- The new skill can reuse the existing structured-call, provider response-format,
  schema-normalization, bounded-retry, model-policy, and telemetry patterns.
  It is not a new provider and is not a second Draft generator.

The story profile should be a bounded treatment with explicit sections for
characters, meeting/relationship, obstacles/costs, central question, climax,
ending direction, hooks, tone, audience, assumptions, exclusions, and a concise
Draft handoff prompt. Other profiles use their own section sets and never
receive romance-specific required fields.

## Contract and quality findings

The current `promptExpansionBriefSchema` is profile-neutral and too shallow to
prove that a story was materially developed. The replacement must keep shared
fields for title/summary/profile/audience/scope/claims/assumptions/exclusions,
then add a profile-discriminated `treatment` object. Every generated field must
carry or inherit provenance: `creator_fact`, `model_inference`, or
`user_edited`; generated factual claims additionally carry verification state.

The parser must normalize only transport differences: Markdown fences,
whitespace, known top-level envelopes, and snake/camel aliases. It must not
invent missing story content. A deterministic gate must reject empty, copied,
near-copied, generic-instruction-only, unsafe, malformed, or profile-incomplete
results. A useful plain-text response may remain editable only with an explicit
`partial_structured_output` status and a visible missing-fields list. A rejected
response must never be serialized as a successful preview whose main text is the
original prompt.

## Persistence, ownership, and handoff findings

Preview remains side-effect free with respect to the series and source pack.
The ledger remains tenant/user scoped and idempotent. Apply must verify the
original hash, expected revision, run ownership, current status, and an approved
payload hash before a single compare-and-swap update. A stale or already-applied
run must be recoverable through a fresh preview, not silently merged.

The approved treatment should be retained as a distinct lineage object in the
existing run JSON and passed into Draft generation together with the original
prompt hash and expansion run ID. The wizard may continue to expose the concise
approved `expandedPrompt` as the editable premise field for compatibility, but
the server-side Draft context must know which text is creator input and which is
approved AI treatment. Draft generation remains responsible for series-level
title/logline/main plot/season arc/characters/locations/visual bible and later
episodes; treatment remains a pre-Draft creative brief.

If an approved treatment is edited in the dialog, the client must mark it as
user-edited and send the full approved snapshot. If the premise changes after
preview, the current stale warning remains and apply is blocked. If a Draft
request references a run whose hash no longer matches, the server must reject
or require re-preview rather than mixing generations.

## Testing and proof findings

The repository uses Vitest. Focused web tests run through the web workspace;
browser-facing tests require jsdom. Existing tests cover the current expansion
service and wizard, so the new test set should extend those fixtures rather than
create a parallel test harness. Browser proof should use Playwright at 390x844,
768x1024, and 1440x900, with keyboard-only modal operation and visible state
assertions. Full typecheck is known to be baseline-noisy/OOM in this checkout;
report it separately from focused tests, `git diff --check`, and changed-file
diagnostics.

## Operational findings

The route currently deducts credits for the one preview call. Retry policy must
be bounded and must not charge a user for a parser/transport repair attempt as a
second independent user action. The implementation must use the established
credit/LLM execution boundary and expose attempt count, selected skill,
structured parse status, quality-gate status, and final outcome in telemetry.
Logs may include trace/run IDs and bounded error codes, but not raw private
prompts, model response bodies, URLs containing secrets, or user-entered
creative text.

## Strict execution findings from follow-up evidence

The first plan was not strict enough for the user's requirement because the
shared orchestrator itself contains fallback behavior independent of the
prompt-expansion parser:

- `unifiedOrchestrator.ts` falls back to `general-article-writer` when a selected
  skill cannot be resolved;
- it falls back to the text executor when the capability executor is missing;
- the router catches `executeUnified` errors and continues to construct/save a
  preview, which is how a failed call can become a visible original-prompt
  result;
- `general-article-writer` declares `execution_mode: llm-only`, but its actual
  contract is generic article Markdown or ArticleCMS JSON, not the prompt
  expansion schema;
- existing unit tests use mocks/fixtures, so their passing status cannot prove
  a configured real provider was called.

The revised plan therefore requires a strict exact-skill execution flag,
preflight validation of manifest/execution mode/schema/runtime source, explicit
real-run evidence from the executor, no success without provider/model/request
evidence, typed user-facing failure codes, and one separately labelled
non-mocked integration smoke test. Deterministic/parser fallback is removed
from the production path; a failure may retain only sanitized diagnostics and
the original prompt for recovery.
