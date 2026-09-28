# Skill Framework Reference-Anchored Storyboard Design

## Goal

Generate a continuous storyboard without re-authoring the full character and scene description for every shot.

## Behavior

- Shot 1 calls the selected image skill with the complete creative inputs and becomes the canonical identity and scene anchor.
- Shots 2 through N do not call the image skill. Their still-image prompts contain only the requested shot variation, camera/expression change, and dialogue context, plus an instruction to preserve the attached Shot 1 reference.
- The worker attaches the durable Shot 1 image asset to every later image-generation request. It does not chain each shot to the previous shot, which prevents visual drift.
- The control-plane coordinator waits only for Shot 1, then enqueues one idempotent worker job per remaining shot in parallel. Shots 2 through N never wait for one another.
- A later shot is not submitted unless a usable Shot 1 image exists.
- Each video prompt is generated from the same planned shot variation and dialogue as its still-image prompt, using that shot's generated image as the start-frame reference.

## Boundaries

The change is limited to the Skill Framework pipeline and worker. Existing Storyboard Review projection, other storyboard creation paths, and unrelated skills keep their current behavior.

## Failure handling

If Shot 1 is unavailable, later shots remain incomplete and the run remains repairable rather than generating unanchored images. Existing idempotency and reusable-image behavior remains authoritative.

If Shot 1 fails, no continuation jobs are created. If a continuation fails, the other continuation jobs continue independently and the run remains partial and repairable.

## Verification

Unit tests cover one skill invocation, compact continuation prompts, Shot 1 reference propagation, no unanchored submission, and matching video prompt action/dialogue. The worker contract uses an idempotent per-shot job key so coordinator retries fill only missing queue entries.
