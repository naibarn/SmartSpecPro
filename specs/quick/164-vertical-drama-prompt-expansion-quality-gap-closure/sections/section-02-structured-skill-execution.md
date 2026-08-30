# Section 02: Structured Skill Execution

## Objective

Replace the generic article route with a feature-specific structured skill and a
bounded, credit-safe preview operation that must reach a real LLM. Any missing
skill/provider/model or mock/sandbox path fails before a preview is created.

## Owned paths

- `apps/web/skills/vertical-drama-prompt-expansion/`
- `apps/web/server/services/verticalDramaPromptExpansionService.ts`
- any narrowly scoped executor/manifest registration required to resolve the
  skill; do not change generic article behavior

## Implementation contract

The new skill must require the v2 treatment schema, state that treatment is
pre-Draft, preserve explicit creator facts, mark inference, and use open
questions for unknowns. The service-owned execution function builds a bounded
payload containing premise, locale, profile, schema version, and safe hints. It
requests structured JSON using the existing provider/model/credit boundary and
records selected skill/version/model/provider/request evidence in telemetry.

Do not make the router compose a free-form “return this JSON” prompt while
selecting `general-article-writer`. Add strict execution mode to the unified
orchestrator so selected-skill resolution, executor resolution, and provider
execution never fall through to a generic skill/text executor. Do not call the
Draft-authoritative story architecture planner for this optional treatment.
Reuse its structured-call patterns where useful, not its output contract.

Allow one initial call plus at most two internal schema/quality repairs. Existing
transient executor policy may handle transport retries, but the feature must
return a bounded typed result. Parser/repair attempts belong to one preview
operation and do not become separate user charges. Reserve/record one preview
credit transaction for the operation using the existing ledger boundary. On
exhausted budget, return a typed failure only; never return a skeleton, original
text, sample, fixture, or mock result.

## TDD stubs

Test exact skill preflight, schema name/version, response format, locale/profile
payload, absence of generic article skill, absence of Draft planner invocation,
strict-mode fallback rejection, bounded retry count, provider failure, schema
failure, missing-real-run-evidence failure, quality repair, real-provider smoke,
and credit accounting semantics.

## Completion gate

A mocked executor may prove routing and failure logic, but a separate non-mocked
integration smoke test must prove the configured skill reaches a real LLM and
returns provider/model/request evidence plus a validated v2 candidate. No path
may silently call the generic article skill or mark a run successful without
real-run evidence.
