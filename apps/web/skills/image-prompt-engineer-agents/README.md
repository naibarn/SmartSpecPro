# GPT Image Prompt Engineer Skill v5.5 — Review Modules, Model-free

This package builds multilingual GPT Image prompt bundles. It is intentionally **model-free**: it never sets, infers, validates, or returns an image model name. Your external API caller supplies the renderer, for example `gpt-image-2`.

## v5.5 additions

- `locked_user_params` records explicit user values so `auto` decisions cannot silently override them.
- `final_review.reference_preflight` reports whether real product/place research is required, what action is next, and which search queries/sources should be used by the host.
- Product and packaging reference-image reviews now lock silhouette, package aspect, label grid, logo scale, and exact text placement more strictly.
- Media Studio review summaries expose locked parameters and reference preflight while keeping the native runtime model-free.

## v5.4 additions

- Product/place factual reference grounding with `reference_research`
- Search query and source-priority planning for host/subagent web research
- `verified_reference_facts` and `reference_sources` inputs
- User-provided details are authoritative and must not be replaced by search results
- Review-module `reference_researcher` report

## v5.3 additions

- Deliverable profiles for posters, social/story posts, presentation slides, product and packaging mockups, storyboards, and other supported formats
- Final safety/quality gate via `final_review`
- High-risk prompt text repair before `text_prompt` output
- Reference-image fidelity notes and render-request `input_images`
- Review-module `deliverable_designer` and `reference_fidelity` reports
- UI schema alignment for `document_replica` and `packaging_mockup`

## v5 additions

- Optional deterministic review-module orchestration layer
- `orchestration_mode`: `auto`, `off`, `single_pass`, `subagents`
- `enable_subagents`
- `subagent_budget`: `auto`, `low`, `balanced`, `high`
- `reasoning_depth`
- `quality_review_passes`
- `safety_review_level`
- `orchestration` output object
- `subagent_reports`
- `merge_report`
- `conflict_resolution`
- `final_quality_delta`
- `final_review`

## Specialist Review-Module Roles

The deterministic orchestration layer mirrors the shape of reports that real Agents SDK agents-as-tools can return:

1. `intent_triage`
2. `visual_director`
3. `cinematographer`
4. `layout_multiframe`
5. `deliverable_designer`
6. `reference_fidelity`
7. `reference_researcher`
8. `localization`
9. `safety_policy`
10. `prompt_critic`

The core skill remains deterministic and standard-library friendly. Real agents-as-tools can be placed around this skill at the application layer when a host needs live research or external review.

## Usage

```bash
python scripts/run_prompt_flow.py --input-json '{
  "topic": "cinematic storyboard หลายเฟรม of a hero entering a neon alley",
  "target_language": "th",
  "image_style": "auto",
  "orchestration_mode": "auto",
  "enable_subagents": true,
  "subagent_budget": "balanced"
}'
```

## API caller pattern

The skill output contains:

```json
{
  "render_request": {
    "image_api": {
      "prompt": "...",
      "size": "1536x1024",
      "quality": "high"
    }
  }
}
```

Your renderer layer adds the model externally:

```json
{
  "model": "gpt-image-2",
  "prompt": "<render_request.image_api.prompt>",
  "size": "<render_request.image_api.size>",
  "quality": "<render_request.image_api.quality>"
}
```

## Tests

```bash
python3 -m unittest discover -s tests -v
```
