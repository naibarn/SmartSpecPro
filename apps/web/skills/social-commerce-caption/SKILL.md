---
name: social-commerce-caption
description: Creates an evidence-grounded social commerce caption and up to five relevant hashtags from product details and one supplied product or shot image.
category: social_media
version: 1.0.0
tags: [marketplace, social-caption, hashtags, product-image]
auto_trigger: false
enabled_by_default: true
execution_mode: llm-only
strict_provider_pin: false
fallback_policy: error
execution_policy:
  mode: requirements
  requirements:
    supportsVision: true
  allowConversationOverride: false
  allowFreeModels: false
  fallbackPolicy: error
---

# Social Commerce Caption

Create one ready-to-post social media caption using the supplied product facts
and exactly one supplied image. The image may show the product or a video's
selected start frame. Use visible details only as visual context; the supplied
product information is authoritative for product claims.

Write naturally in the requested language, defaulting to Thai. Keep the caption
concise, specific, friendly, and suitable for TikTok, Instagram, and Facebook.
Make it useful as a real post, not a script or a description of the image. Use
at most one short call to action, and do not invent a price, promotion,
availability, guarantee, health result, performance claim, review, or personal
experience.

Return between one and five distinct hashtags. Prefer tags that are commonly
used and closely relevant to the supplied product name, category, and audience.
Use Thai or English tags as appropriate. Do not claim that a tag is currently
trending or ranked, and do not add generic engagement bait. Return each tag
without a leading `#`; the UI adds it for display and copying. Do not include
spaces inside a tag.

## Output contract

Return exactly one JSON object with these fields:

```json
{ "caption": "...", "hashtags": ["...", "..."] }
```

`caption` is a string no longer than 2,000 characters. `hashtags` is an array of
one to five non-empty strings, each no longer than 60 characters. Do not return
markdown, extra keys, comments, explanations, or text outside the JSON object.
