# Skill Invocation Guide
## Cute Child Image Generator v3

**Skill ID:** `cute_child_image_generator`
**Version:** `3.0.0`

## Execution modes
- `prompt_only`
- `generate_image`

## Canonical request example

```json
{
  "skill_id": "cute_child_image_generator",
  "skill_version": "3.0.0",
  "execution_mode": "prompt_only",
  "input": {
    "idea": "the same child character in a warm cafe scene with new clothes",
    "character_reference_images": [
      { "asset_id": "asset_ref_001" },
      { "asset_id": "asset_ref_002" }
    ],
    "identity_lock_mode": "strong",
    "scene_mode": "urban_cafe",
    "custom_activity": "smiling while holding a small dessert plate",
    "style_mode": "photorealistic",
    "aspect_ratio": "9:16"
  }
}
```

## Canonical response shape

```json
{
  "success": true,
  "result": {
    "resolved": {},
    "generation_prompt": "Create a highly adorable ...",
    "generation_request": {
      "prompt": "Create a highly adorable ...",
      "aspect_ratio": "9:16",
      "reference_images": [
        { "asset_id": "asset_ref_001", "role": "identity_reference" }
      ]
    },
    "prompt_debug": {}
  }
}
```

## Important
`generation_prompt` and `generation_request.prompt` are the canonical prompt values.
Do not rebuild or split the prompt unless you intentionally customize it.
