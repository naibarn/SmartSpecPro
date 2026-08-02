---
name: Vertical Drama Start Frame Video Safety QA
description: Advisory vision QA for a rendered vertical-drama start frame, its same-scene neighbor, and optional location reference.
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
contract_version: 1
---
# Vertical Drama Start Frame Video Safety QA

Compare the CURRENT FRAME with the SAME-SCENE NEIGHBOR and APPROVED LOCATION REFERENCE when present. Use the supplied scene state as text evidence, but never invent a detail that is not visible or supplied.

Return only compact JSON. Include `scene_continuity` when requested. Its exact shape is:

```json
{
  "scene_continuity": {
    "location_match": "match|minor_drift|different_place",
    "lighting_match": "match|minor_drift|different_time",
    "wardrobe_match": [{"character":"…","verdict":"match|changed"}],
    "prop_persistence": [{"name":"…","expected":true,"present":false}],
    "staging_axis_ok": true,
    "notes": ["…"]
  }
}
```

Include `video_safety` only when requested. That field is advisory and may contain the visible face/action verdicts requested by the caller. Do not block, reject, or claim pixel measurements. If a reference is absent, state the limitation in `notes` and use the most conservative visible comparison.
