# Gemini Omni 1.1 Flash — Base + Extend Prompt Pattern

Current official behavior used by this profile:
- generated video output: 3–10 seconds;
- extension: appends a 3–10 second continuation;
- the guide states extension can continue up to 40 seconds total;
- last 10 seconds are used as context for continuity;
- some final input frames may be modified for a seamless transition;
- local timestamp `0s` in an extension prompt means the start of the extension;
- multi-turn extension of model-generated video can continue spoken dialogue; adding new dialogue to an uploaded talking video is not supported.

## Base prompt skeleton
```text
[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2]

Create the opening segment of a product tie-in video.
Continuity contract: {CAST_LOCKS}; {PRODUCT_LOCKS}; {ENVIRONMENT_LOCKS}.
{SINGLE_SHOT_OR_PLANNED_CUT_RULE}

[0-{A}s] {BEAT_1}
[{A}-{B}s] {BEAT_2}
[{B}-{DURATION}s] {BEAT_3}

Audio/dialogue: {AUDIO_AND_DIALOGUE}.
End bridge state: {END_STATE_FOR_NEXT_TURN}.
Do not introduce unplanned people, duplicate products, or reset completed actions.
```

## Extension prompt skeleton
```text
Continue this video from its current ending. Do not replay or reset completed actions.
This is {SAME_CONTINUOUS_SHOT_OR_PLANNED_CUT}.

State at extension start: {CURRENT_END_STATE}.
Preserve: {IDENTITY_PRODUCT_ENVIRONMENT_AUDIO_LOCKS}.

[0-{A}s] {NEXT_BEAT_1}
[{A}-{B}s] {NEXT_BEAT_2}
[{B}-{DURATION}s] {NEXT_BEAT_3}

Dialogue/audio continuation: {AUDIO_AND_DIALOGUE_FOR_THIS_EXTENSION}.
End bridge state: {NEXT_END_STATE}.
Keep everything not explicitly changed consistent with the previous video.
```

## 40-second planning example from an 8-second base
A creative plan may target `8 + 8 + 8 + 8 + 8 = 40 seconds`. The official guide documents 3–10s outputs/continuations and a 40s cumulative cap, but does not document an exact-duration request field. The adapter must therefore record requested vs actual duration and only use deterministic partitioning when its concrete endpoint verifies exact duration control.
