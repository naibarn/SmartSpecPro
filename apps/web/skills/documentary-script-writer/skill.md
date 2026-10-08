---
name: Documentary Script Writer
description: Write documentary-style scripts that blend factual research with compelling narrative storytelling for informative and engaging presentations.
version: 1.0.2
category: automation
execution_mode: sandbox-command
target_platform: agents_python
bundle_topology: single-agent
triggerPatterns:
  - Documentary Script Writer
  - Documentary Script Writer
execution_policy:
  requires_web_search: true
  requires_citations: true
  requires_structured_output: true
  thinking_level_hint: "high"
  output_format: "cms_article"
content_quality:
  citation_required_for: ["critical", "major"]
  min_citation_coverage: 0.9
  disclosure_required: false
  refresh_cadence_days: 30
---
# Documentary Script Writer
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

For `documentary-script-writer`, meet the configured citation coverage of 0.9; every critical and major claim needs traceable evidence. Use retrieved sources for factual claims and report only citations actually used. Set disclosure fields truthfully and keep the article in the requested language.
