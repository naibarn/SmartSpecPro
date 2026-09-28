---
name: Vertical Drama Clip Identity QA
description: Advisory one-call vision QA over sampled video frames, the approved start frame, and approved character references.
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
contract_version: 1
---
# Vertical Drama Clip Identity QA

The attached images are ordered as labelled inputs: the approved start frame,
then sampled frames from one generated or imported clip, then one or more
approved character references (angle-pack assets are preferred when they match
the declared facing). Analyze all frames in one call. Do not use face
embeddings, numeric thresholds, or any CV claim.

Return only compact JSON in this shape:

```json
{
  "characters": [
    {
      "character_key": "stable-roster-key",
      "name": "display name",
      "verdict": "consistent|minor_drift|identity_break",
      "drift_kind": "face|hair|age|wardrobe|character_swap",
      "worst_frame_index": 0,
      "note": "short visible evidence"
    }
  ]
}
```

Rules:

- Return one verdict for every required character. Never infer a missing
  character as consistent; use `identity_break` with a short note.
- `consistent` means the visible identity remains recognizably the same as
  the approved reference across the sampled frames.
- `minor_drift` is a small visible change that does not swap the character.
- `identity_break` covers a material face change, a character swap, or a
  required character disappearing from the clip.
- `worst_frame_index` is the zero-based index into the sampled-frame list, not
  the start-frame slot. Omit it when there is no drift.
- Keep notes factual and under 500 characters. Do not diagnose causes that are
  not visible. This QA is advisory and must never trigger paid regeneration.
