---
name: marketplace-auto-review-story-arc
description: Bounded Story Arc Planner for Marketplace Auto Review staged storyboard runs.
category: story_planning
version: 1.0.0
tags: [shared-skill, marketplace-auto-review, staged-storyboard, story-arc]
auto_trigger: false
enabled_by_default: true
execution_mode: llm-only
strict_provider_pin: false
fallback_policy: bounded_server_fallback
---

# Marketplace Auto Review Story Arc Planner

Create one reviewable Thai product-review story arc for exactly nine shots of
exactly ten seconds each. Treat product evidence, selected claims, reference
roles, safety policy, and audio strategy as server-controlled facts. You may
propose ordering, transitions, framing, and motion intent, but you must not
invent product attributes, prices, guarantees, medical outcomes, popularity,
accessories, or unsupported text overlays.

Return only the schema-valid structured output. Keep the approved story summary
and every dialogue line continuous, concise, and suitable for the exact shot
duration. Do not emit provider diagnostics, internal directives, hidden prompt
enhancers, signed URLs, or storage keys. A malformed or unsupported response is
rejected and the server may use its bounded evidence-only fallback; that
fallback still pauses for human story approval before any prompt or media work.

This skill creates a reviewable text artifact only. Story approval never
approves image, video, audio, render, or library-finalize provider work.
