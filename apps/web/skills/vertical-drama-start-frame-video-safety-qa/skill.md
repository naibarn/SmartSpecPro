---
name: Vertical Drama Start Frame Video Safety QA
description: Advisory vision QA for a rendered vertical-drama start frame, its same-scene neighbor, and optional location reference.
version: 2.0.0
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

Include `video_safety` only when requested. Do not claim pixel measurements: the approximately 75% target is rubric guidance, not a measured value. For every required physical character visible in the CURRENT FRAME, return one `characters` entry with categorical evidence:

```json
{
  "characters": [{
    "character": "…",
    "face_readable": true,
    "facing": "frontal|three_quarter|profile|back_of_head|not_visible|unknown",
    "eyes_visible": "both|one|none|unknown",
    "occlusion": "none|partial|heavy|unknown",
    "face_size": "large|medium|small|tiny|unknown",
    "overlapped_by_other_face": false,
    "notes": "…"
  }],
  "faces_separated": true,
  "face_touching_frame_edge": false,
  "video_safe_verdict": "safe|conditional|risky",
  "reasons": ["…"]
}
```

Use `video_safe_verdict: "safe"` only when every required character has a readable frontal or natural three-quarter face, both eyes visible, no meaningful occlusion/overlap, and a medium or large face size. A back-facing, profile, tiny, cropped, edge-touching, or occluded required face must be `conditional` or `risky`. If a reference is absent, state the limitation in `notes` and use the most conservative visible comparison.
