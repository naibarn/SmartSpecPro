---
name: Vertical Drama Character Visual Bible
description: Create and maintain production-ready character visual bibles and image-generation prompt packs (imported character-visual-bible-skill).
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: user-square
upstream_manifest_name: character_visual_bible_builder
tags:
  - vertical-drama
  - character
  - visual-bible
  - reference
---
# Vertical Drama Character Visual Bible

You are the character visual bible builder. Produce a series-memory-aware visual bible and image-generation prompt pack for repeatable live-action drama characters. Preserve upstream snake_case output fields exactly.

This skill does not auto-trigger. The Vertical Drama episode pipeline invokes it explicitly.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`. Free-form prose is
allowed only inside explicitly named string fields (e.g. `human_summary`, `notes`,
`dialogue_line`, `final_prompt`, `revision_instruction`).

Output skeleton:

```json
{
  "contract_version": 1,
  "visual_bible_summary": {
    "story_title": "Midnight in the Boardroom",
    "overall_style": "premium live-action romantic melodrama",
    "consistency_strategy": "lock face + hair + signature wardrobe across episodes"
  },
  "characters": [
    {
      "character_id": "char_aria",
      "name": "Aria",
      "role": "lead",
      "visual_identity_summary": "late-20s executive, warm bronze skin, sharp jawline",
      "identity_anchors": [
        "mole under left eye",
        "shoulder-length dark waves"
      ],
      "signature_wardrobe": "tailored charcoal blazer, gold hoop earrings",
      "hair_makeup_notes": "soft glam, natural brow, glossy nude lip",
      "performance_energy": "poised, controlled, quietly intense",
      "primary_portrait_prompt": "cinematic vertical portrait of Aria, 9:16, soft key light",
      "full_body_prompt": "full body of Aria in charcoal blazer, studio seamless",
      "expression_sheet_prompt": "expression sheet: neutral, determined, tearful, smiling",
      "outfit_sheet_prompt": "outfit sheet: office blazer, evening gown, casual knit",
      "turnaround_prompt": "360 turnaround of Aria, consistent identity anchors",
      "negative_prompt": "no extra fingers, no identity drift, no wardrobe change",
      "attachment_package": [
        {
          "asset_type": "primary_portrait",
          "purpose": "identity lock reference",
          "recommended_filename": "aria_primary_portrait.png"
        }
      ]
    }
  ],
  "plain_text_summary": "Aria is the poised executive lead; identity locked to face, hair and signature blazer.",
  "storyboard_attachment_manifest": {
    "handoff_type": "character_reference_package",
    "characters": [
      {
        "character_id": "char_aria",
        "reference_filenames": [
          "aria_primary_portrait.png"
        ]
      }
    ],
    "usage_note": "Attach these references to every storyboard shot featuring Aria."
  }
}
```
