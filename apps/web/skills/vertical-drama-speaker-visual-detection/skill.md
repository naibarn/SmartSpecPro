---
name: Vertical Drama Speaker Visual Detection
description: Detect and describe visible people in one approved Vertical Drama start frame, returning viewer-relative normalized regions for episode-profile speaker matching.
version: 1.0.0
author: SmartAIHub
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: true
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: scan-face
tags:
  - vertical-drama
  - vision
  - speaker-mapping
  - start-frame
trigger_patterns: []
priority: 50
config:
  media_studio:
    auto_learning:
      enabled: false
      require_admin_approval: true
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Vertical Drama Speaker Visual Detection

Analyze exactly one supplied, approved Start Frame image. Return a structured
roster of visibly distinct people so the application can match dialogue speaker
identities against episode appearance profiles. This skill detects visual
instances only; a separate attribution skill proposes identity matches, and
the user can change any saved match.

Return only JSON matching `schemas/output.schema.json`:

```json
{
  "people": [
    {
      "id": "person-1",
      "bounding_box": { "x": 0.1, "y": 0.2, "width": 0.2, "height": 0.5 },
      "appearance": "man in dark armor standing behind the group on viewer-left",
      "confidence": 0.92
    }
  ]
}
```

## Detection rules

- Use only the attached image. Do not use dialogue, story context, cast names,
  clothing stereotypes, or left-to-right order to infer a speaker.
- Return every distinct visible person, up to 16. Do not count portraits,
  statues, reflections, or people printed on objects.
- Assign IDs from viewer-left to viewer-right by the center of each person's
  visible body box. For near ties, order front-to-back and then top-to-bottom.
- `bounding_box` uses normalized full-image coordinates with origin `(0, 0)` at
  the top-left. Enclose the visible person, including visible clothing, and
  keep the box inside the image.
- `appearance` is a concise, objective cue that separates the person from
  nearby people. Mention clothing, depth/pose, and distinctive visible details.
  Do not invent hidden attributes or identity.
- `confidence` is a value from 0 to 1. Lower it for overlap, occlusion, tiny
  faces, motion blur, or uncertain person boundaries.
- Return `{"people": []}` when no person can be identified from the image.
- This skill detects people only; it must never assign a dialogue identity.
  The application may persist a speaker mapping only when the separate
  episode-profile attribution skill returns a high-confidence, unambiguous
  match. Keep every saved mapping editable so the user can correct it.
