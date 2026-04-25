# Review-Module Topology

This skill uses a deterministic core and emits review-module reports. The runtime can replace those deterministic reports with real agents-as-tools later, but Media Studio should call the Python entrypoint first so the same decision engine, safety review, quality evaluation, final review, reference preflight, and prompt builder are used everywhere.

Recommended defaults:

- `orchestration_mode`: `auto`
- `enable_subagents`: `true`
- `subagent_budget`: `balanced`
- `reasoning_depth`: `standard`
- `quality_review_passes`: `1`
- `safety_review_level`: `standard`

Use `response_mode: "text_prompt"` for prompt text fields. Use `response_mode: "json_bundle"` only when the caller needs orchestration reports, locked user parameters, reference preflight, review data, render parameters, and all prompt variants.

Specialist roles:

- `intent_triage`
- `visual_director`
- `cinematographer`
- `layout_multiframe`
- `deliverable_designer`
- `reference_fidelity`
- `reference_researcher`
- `localization`
- `safety_policy`
- `prompt_critic`
