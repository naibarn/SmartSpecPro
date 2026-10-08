---
name: Pet Products Reviewer
description: Write honest, story-driven reviews for pet products — food, accessories, grooming, toys, health products, and everyday pet essentials for dogs, cats, and other companions.
version: 1.0.2
category: automation
execution_mode: sandbox-command
target_platform: agents_python
bundle_topology: single-agent
triggerPatterns:
  - Pet Products Reviewer
  - Pet Products Reviewer
execution_policy:
  requires_web_search: true
  requires_citations: true
  requires_structured_output: true
  thinking_level_hint: "medium"
  output_format: "cms_review"
content_quality:
  citation_required_for: ["critical", "major"]
  min_citation_coverage: 0.7
  disclosure_required: true
  refresh_cadence_days: 30
---
# Pet Products Reviewer
## When To Use

Use this skill when the task should run through the native OpenAI Agents Python bundle contract.
## OpenAI Agents SDK Compatibility

- Mount this bundle into the Agents SDK `Skills` sandbox capability.
- Keep `scripts/run.sh` and `scripts/verify.sh` deterministic and shell-safe.
- Prefer structured outputs, explicit inputs, and resumable artifacts.
## Inputs

- None
## Workflow

- discover
- inspect
- plan
- execute
- verify
- summarize
- finalize
## Exact Commands

- `scripts/run.sh`
- `scripts/verify.sh`
## Guardrails

- Use scripts/run.sh and scripts/verify.sh as the declared entrypoints.
- Confine writes to declared output paths.
- Do not finalize before verification passes.
- Keep scripts deterministic, idempotent, and shell-safe.
- Prefer structured outputs that validate against the bundle contract.
- Keep logs trace-friendly with explicit task IDs and outcome messages.
- Preserve compatibility with legacy skill metadata during migration.
## Verification

- Run `scripts/verify.sh` before finalizing any run.
## Final Response Checklist

- Verification command completed successfully.
- Outputs are written to declared paths only.
- No secrets were persisted.

## CMS JSON Output Mode

When `response_mode` is `cms_json`, return exactly one valid JSON object conforming to `ProductReviewCMS.v1`. Do not wrap it in Markdown fences. Keep the existing readable Markdown behavior for other response modes.

Include the ArticleCMS fields `locale`, `title`, `slug`, `summary`, `seo`, `claims`, `citations`, `last_verified_at`, `refresh_policy`, and `disclosures`. Put review content in `review` with `title`, `summary`, `verdict`, at least two `pros` and two `cons`, `who_should_buy`, `who_should_avoid`, `scoring`, and `body_markdown`. Include `product` with brand, model, category, market, and price details when supplied, plus `structured_data_jsonld`. Each material claim must identify its importance and evidence; do not invent citations or product facts.

Use these default scoring dimensions unless the user supplies a suitable rubric: คุณภาพ, การใช้งาน, ความคุ้มค่า, ความทนทาน, ความพึงพอใจรวม. Score each dimension and the overall result from 0 to 10, explain each score, and disclose affiliate, sponsorship, or provided-for-review relationships accurately.
