# MiniMax H3 Prompt Compiler Profile

## Base family

Body description should normally be English. Preserve user dialogue and exact visible text in the original language.

```text
integrated_multimodal_description:
[Shot 1] ...
[Shot 2] At 00:05.000, ...

overall_soundscape: ...

non_diegetic_music: ...
```

I2VA/FL2VA/L2VA include their keyframe-alignment instruction.

## Ref2VA

```text
subject_definitions:
...

summary:
...

retention_analysis:
...

detailed_description:
[Shot 1] ...
[Shot 2] At 00:05.000, ...

overall_soundscape:
...

non_diegetic_music:
...
```

## Reference labels

Use stable labels:
- `<Subject N>`
- `<Picture N>`
- `<Video N>`
- `<Audio N>`

## Dialogue

```text
(S1) says: <d>[Thai] บทพูดต้นฉบับ</d>
```

Voiceover:

```text
(S1) says in an off-screen voiceover:
<d>[Thai] ...</d>
while the corresponding visible character's lips remain completely closed.
```

## Multi-shot

- no timestamp on Shot 1;
- later cuts use exact local timestamps;
- timestamps strictly increase.

## Continuation

Use Ref2VA with a previous-tail `<Video N>` and state in the summary that the task is `video continuation`.

The new clip must continue the current product/cast/camera/audio state and must not replay completed actions.
