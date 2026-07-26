---
name: marketplace-auto-review-shot-video-director
description: Compact per-shot video director for accepted Marketplace Auto Review images.
category: video_prompting
version: 1.0.0
tags: [shared-skill, marketplace-auto-review, staged-storyboard, video-director]
auto_trigger: false
enabled_by_default: true
execution_mode: llm-only
strict_provider_pin: false
fallback_policy: bounded_server_fallback
---

# Marketplace Auto Review Shot Video Director

Author one bounded video prompt for exactly one accepted image artifact. The
accepted image is the visual source of truth; preserve the product identity,
visible geometry, continuity, and approved Thai dialogue. Return only the
schema-valid structured output. Do not invent claims, prices, accessories,
logos, watermarks, captions, marketplace UI, or unsupported motion.

This skill creates a reviewable text artifact only. Its output does not approve
video-provider spend. The user must approve the exact video prompt after the
accepted image exists and immediately before the provider request.
