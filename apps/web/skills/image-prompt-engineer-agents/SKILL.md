---
name: gpt-image-prompt-engineer
description: Build model-free multilingual GPT Image prompt bundles for generation and editing, with deliverable-specific auto choices, reference-image fidelity rules, final safety/quality review, and optional subagent-ready reports.
category: image_prompt_generation
version: 5.4.0
icon: sparkles
tags:
  - shared-skill
  - image-prompt
  - subagent-ready
auto_trigger: false
trigger_patterns: []
enabled_by_default: true
credit_multiplier: 1
priority: 50
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
  subagents:
    enabled: true
    orchestration_mode_default: auto
    pattern: deterministic-core-with-subagent-ready-reports
strict_provider_pin: false
---

# GPT Image Prompt Engineer

Use this skill to create production-ready, multilingual prompt bundles for image generation and image editing workflows.

The skill is **model-free**. It must not set or return an image model. The external API caller supplies the renderer, for example `gpt-image-2`.

## When To Use

- Create or improve prompts for posters, banners, thumbnails, social posts, story posts, slides, infographics, diagrams, UI mockups, product ads, product mockups, packaging mockups, document replicas, character sheets, storyboards, and contact sheets.
- Convert incomplete creative briefs into sensible auto-selected prompt parameters with a decision trace.
- Prepare image-edit prompts that preserve supplied reference images, identity, product geometry, packaging labels, and unchanged regions.
- Return either a plain prompt for Media Studio fields or a JSON bundle with reviews, decisions, render parameters, and subagent-style reports.

## When Not To Use

- Do not use this skill to select, validate, or pin the image model.
- Do not use it to bypass safety review or create explicit sexual, graphic violence, hate, self-harm, illegal, deceptive, or rights-violating imagery.
- Do not use generated text inside an image as a source of truth for regulated medical, legal, financial, or official-document claims.

## Core Workflow

1. Validate input with `schemas/input.schema.json`.
2. Resolve `auto` fields with `decision_trace`: language, style, deliverable, multi-frame mode, aspect ratio, render size, quality, camera, lighting, layout, and safety settings.
3. Run safety review before prompt construction.
4. Build prompts with deliverable-specific rules, reference-image fidelity notes, and product/place factual grounding.
5. Build model-free render parameters.
6. Evaluate prompt quality.
7. Run deterministic subagent-ready orchestration when requested or when the task is complex.
8. Rebuild prompt after orchestration patches.
9. Run `final_review` before returning output. The final review can repair unsafe wording, reinforce reference fidelity/storyboard continuity, require product/place reference research, list missing inputs, and provide clarifying questions.

## Response Modes

- `text_prompt` (default): return only the selected prompt text. Use this for Media Studio prompt fields.
- `json_bundle`: return the full structured bundle with prompts, decision trace, prompt quality, safety review, final review, conflict resolution, subagent reports, and render parameters.

When `response_mode=text_prompt`, obey `text_prompt_field`:

- `detailed` (default): complete production-ready prompt.
- `short`: compact prompt.
- `structured`: labeled structured prompt.
- `edit`: image-edit prompt when available; otherwise detailed prompt.
- `variants`: all variants separated by one blank line.

Text mode must return plain text only: no JSON, Markdown fences, review objects, render parameters, labels, or commentary.

## Deliverable Standards

The Python core uses `deliverables.py` as the source of truth for deliverable-specific requirements:

- Posters: premium focal point, headline hierarchy, safe margins, print-ready polish.
- Social posts: thumb-stopping hook, strong first-glance contrast, one clear message, mobile-readable hierarchy.
- Story posts: 9:16 vertical design, safe top/bottom UI zones, central hook, swipe-stopping contrast.
- Presentation slides: one clear idea, modern executive spacing, crisp title/body zones, readable chart or diagram areas.
- Product mockups: product remains sharp, centered, correctly proportioned, undistorted, and readable.
- Packaging mockups: premium material finish, correct package proportions, front label readability, sharp product text.
- Storyboards: consistent story continuity with locked character identity, wardrobe, props, location logic, lighting direction, and style across panels.
- Text-heavy layouts: deep focus, no disruptive blur, readable labels, safe margins, and high quality by default.

## Safety Behavior

Safety review covers age-sensitive subjects, real people, public figures, brands/logos, copyrighted characters, regulated claims, explicit sexual content, sexual content involving minors, graphic violence, hate/extremism, self-harm, illegal activity, and deceptive identity or endorsement.

Blocked or high-risk wording must not be returned as the final text prompt. `final_review` rewrites unsafe topic wording to a safe alternative before output and records the repair in the JSON bundle.

## Product And Place Reference Research

When the user references a real product, brand, package, venue, landmark, or place, the workflow must search or receive clear reference data before claiming factual visual accuracy.

Reference rules:

- Prefer official product/brand/place pages, official store listings, press kits, maps/venue profiles, menus/brochures, or recent reputable visual references.
- Preserve all user-provided details as authoritative. Search results may supplement missing visual details but must not replace, correct, or override what the user gave.
- If research conflicts with the user brief, keep the user brief and flag the conflict in review data.
- If no verified facts/sources are supplied, `reference_research.status` becomes `needed` or `visual_reference_only`, and `final_review.missing_inputs` includes `verified_reference_facts` and/or `reference_sources`.
- For fictional or fully user-defined products/places, set `factual_reference_mode: "off"` so the skill does not require external grounding.

The deterministic Python core does not browse by itself. Host runtimes or real subagents should perform the search, then pass `verified_reference_facts` and `reference_sources` into the skill. The skill returns suggested `search_queries` and `source_priority` to guide that search.

## Missing Inputs

If the user omits important details, the skill should still produce a usable prompt with explicit assumptions. In `json_bundle`, `final_review.missing_inputs` and `final_review.clarifying_questions` identify what to ask next, such as:

- exact text/headline/CTA for text-heavy deliverables
- audience or platform for poster/social/story/thumbnail
- reference image, product label, or required angle for product and packaging mockups
- verified product/place facts and reference sources when a real product/place is detected
- per-panel beats and locked character/location details for storyboards

## Subagent-Ready Reports

The deterministic orchestration layer can emit reports shaped like real Agents SDK tools:

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

These reports are deterministic by default. The application layer may replace them with real agents-as-tools, but Media Studio should call the Python entrypoint as the source of truth.

## Output

For `response_mode=text_prompt`, output only the selected final-reviewed prompt text.

For `response_mode=json_bundle`, output prompt variants, quality review, safety review, final review, conflict resolution, subagent reports, and model-free render parameters. The external API caller adds the image model when rendering.
