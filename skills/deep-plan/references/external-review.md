# Automated Review Protocol

This step always reviews `implementation-plan.md`. No manual choice to skip review.

## Review Mode Resolution (Automatic)
Use `review_mode` already resolved by the main skill:

| Mode | When Used | Action |
|------|-----------|--------|
| `external_llm` | At least one external credential is available | Run `review.py` |
| `self_review` | External credentials unavailable or external run failed | Produce local self-review |

## Mode: external_llm

Run:
```bash
uv run --directory {plugin_root} scripts/llm_clients/review.py --planning-dir "{planning_dir}" --iteration 1
```

Expected behavior:
- Detects available providers (Gemini/OpenAI)
- Writes review files in `{planning_dir}/reviews/`
- If command fails or no usable files are produced, fallback to `self_review`

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

Use the skill's `decision_mode` policy:
- `ask_every_choice`: ask user for every improvement item.
- `smart_auto`: ask user for `high-impact`, auto-decide `low-impact`.
- `auto_by_default`: auto-decide all items unless destructive/irreversible risk exists.

Always present the improvement summary to user before proceeding.

## Output Location

All review artifacts are written under `{planning_dir}/reviews/`.
