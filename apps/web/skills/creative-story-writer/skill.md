---
name: Creative Story Writer
description: Write short stories and creative fiction with narrative arcs for storytelling presentations. Supports multiple genres, moods, and bilingual output.
version: 1.0.2
category: automation
execution_mode: sandbox-command
target_platform: agents_python
bundle_topology: single-agent
triggerPatterns:
  - Creative Story Writer
  - Creative Story Writer
execution_policy:
  requires_web_search: false
  requires_citations: false
  requires_structured_output: true
  thinking_level_hint: "medium"
  output_format: "cms_article"
content_quality:
  citation_required_for: ["critical", "major"]
  min_citation_coverage: 0.0
  disclosure_required: false
  refresh_cadence_days: 30
---
# Creative Story Writer
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

When `response_mode` is `cms_json`, return exactly one valid JSON object conforming to `ArticleCMS.v1`. Do not wrap it in Markdown fences. Keep the existing Markdown behavior for other response modes.

Include `locale`, `title`, `slug`, `summary`, `seo` (`meta_title`, `meta_description`, and `keywords`), `body_markdown`, `claims`, `citations`, `last_verified_at`, `refresh_policy`, and `disclosures` (`ai_assisted`, `affiliate`, and `sponsored`). Include tables and media only when useful and identify media source, license, and alt text where applicable. Do not invent facts, sources, or verification dates.

For `creative-story-writer`, meet the configured citation coverage of 0.0; every critical and major claim needs traceable evidence. This is fiction: set claims and citations to empty arrays, and do not imply web research. Set disclosure fields truthfully and keep the article in the requested language.
