---
name: gpt-image-prompt-engineer
description: Build model-free multilingual GPT Image prompt bundles for generation and editing, with deliverable-specific auto choices, reference-image fidelity rules, final safety/quality review, and optional subagent-ready reports.
category: image_prompt_generation
version: 5.4.0
execution_mode: python
sandbox_profile: code-default
requires_network: true
requires_browser: false
max_runtime_seconds: 120
config:
  response_mode_default: text_prompt
  text_prompt_field_default: detailed
  native_runtime:
    kind: python
    entrypoint: python/skill.py
    package_entrypoint: scripts/run_prompt_flow.py
---

# GPT Image Prompt Engineer

Use the canonical instructions in `SKILL.md`. The Python entrypoint is `python/skill.py`, and the deterministic core lives in `src/gpt_image_prompt_engineer`.

Key guarantees:

- The skill is model-free; callers add the image model externally.
- `response_mode=text_prompt` returns only final-reviewed prompt text.
- `response_mode=json_bundle` returns prompts, auto decision trace, safety review, final review, subagent-ready reports, conflict resolution, and render parameters.
- Deliverable-specific profiles cover posters, social/story posts, presentation slides, product and packaging mockups, storyboards, and other supported image formats.
- `final_review` repairs unsafe/high-risk wording before output, reinforces reference fidelity and storyboard continuity, and reports missing inputs plus clarifying questions.
- Real product/place workflows require factual reference grounding through `verified_reference_facts` and `reference_sources`; those references may supplement but never replace user-provided details.
