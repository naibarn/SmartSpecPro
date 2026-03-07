# Automated Review Protocol

This step always reviews `implementation-plan.md`. No manual choice to skip review.

## Review Mode Resolution (Automatic)
Use `review_mode` already resolved by the main skill:

| Mode | When Used | Action |
|------|-----------|--------|
| `external_llm` | At least one external credential is available | Produce an external review artifact with the available provider |
| `self_review` | External credentials unavailable or external run failed | Produce local self-review |

## Mode: external_llm

Use any available external LLM provider in the current environment to write `{planning_dir}/reviews/iteration-1-external-review.md`.

Expected behavior:
- Detect available providers (Gemini/OpenAI) from the current environment
- Write review files in `{planning_dir}/reviews/`
- If the external review cannot be produced or no usable file is created, fallback to `self_review`

## Mode: self_review

Create:
- `{planning_dir}/reviews/iteration-1-self-review.md`

Self-review must include:
- findings by severity (`high`, `medium`, `low`)
- concrete improvement recommendations
- affected areas and rationale

## Mandatory Review Summary

After either mode, always create:
- `{planning_dir}/reviews/iteration-1-summary.md`

Summary must include:
- prioritized improvements
- `high-impact` vs `low-impact` classification
- recommendation for each item

## Decision Handling for Improvements

Use the skill's `decision_mode` policy, but default to autonomous technical judgment:
- `ask_every_choice`: use only if the user explicitly requested full control.
- `smart_auto`: auto-apply technical/codebase-consistent items; ask only for product/scope/destructive tradeoffs.
- `auto_by_default`: auto-apply or auto-defer all technical items unless destructive/irreversible risk exists.

Always record what was auto-applied, what was deferred, and why. Present a short summary to the user, but do not block on confirmation unless product intent is ambiguous.

## Output Location

All review artifacts are written under `{planning_dir}/reviews/`.
