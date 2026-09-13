# Decision Log

## Planning depth

- Chosen depth: `standard` quick-plan with four execution sections.
- Reason: the requirement is cross-domain, but the desired product behavior and the
  current code boundaries are sufficiently clear from the existing implementation and
  source audit. The package is intentionally split into independent sections so it can be
  promoted to a full deep plan later without rewriting the contracts.
- Promotion trigger: promote before implementation if model-catalog capability data,
  Story Truth Package schema, or quality-gate ownership cannot be implemented without a
  new product decision.

## Product decisions

1. **One visible quality control:** expose one series-level LLM quality profile with
   `balanced`, `high`, and `maximum`; do not expose per-skill raw effort selectors.
2. **Separate image controls:** image model/quality remains a different setting group.
3. **Stage-aware internal mapping:** the selected profile supplies a ceiling and baseline;
   task profiles choose the effective effort within that ceiling.
4. **Recommended default:** `high` for new Drama Series because current quality failures
   are semantic/story failures, not only formatting failures.
5. **Safe downgrade:** unsupported reasoning becomes `auto` or the highest supported
   level and never causes the pipeline to fail.
6. **Explicit model pin:** remain authoritative. Provider fallback may retry the same model
   with a provider-valid payload; different-model fallback requires the existing explicit
   model fallback policy, not a hidden quality fallback.
7. **Quality is more than reasoning:** add canonical story context, deterministic checks,
   semantic critic output, targeted repair, and a final acceptance gate.

## Architecture decisions

- Introduce one Vertical Drama policy resolver, one execution wrapper, and provider
  adapters. Skills pass semantic task information; they do not construct provider payloads.
- Keep compatibility with current `llmModelPolicy` and `generationSettings` during rollout.
  Add a normalized profile layer first; migrate storage only after runtime compatibility is
  proven.
- Treat `requestedQuality`, `effectiveQuality`, and `reasoningApplied` as distinct values.
- Keep `exclude: true` as the default for reasoning output so raw reasoning is not exposed;
  usage accounting still records provider-reported tokens.

## Open questions intentionally deferred

- Whether the provider catalog should be populated entirely from OpenRouter model metadata
  or through a manual admin override for models whose metadata is incomplete.
- Whether `maximum` should permit `max` or cap at `xhigh` for the first release.

These are implementation policy choices with safe defaults: metadata-first and cap at the
highest supported effort when `max` is not explicitly advertised.

## Self-review status

Five review rounds completed:

1. Structure and required artifact checks — pass.
2. Cross-section terminology and contract consistency — pass.
3. Failure, credit, tenant, security, and redaction coverage — pass.
4. TDD and acceptance-criteria coverage for every section — pass.
5. Implementability, delivery order, residual-risk, and UI evidence checks — pass.

No code or database changes were made while producing this planning package.
