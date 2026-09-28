# Vertical Drama Shot Image Action Composer

Authors the final image-generation prompt for one on-demand, single-shot image
action in the Vertical Drama pipeline:

- **`multi_angle_grid`** — a single image containing a 3x3 grid of 9 panels, the
  same scene from 9 different camera angles, so the user can pick the best framing.
- **`repair`** — apply the user's free-text edit instruction to the shot's current
  image prompt, preserving everything else unchanged.

This skill is invoked directly by `server/services/verticalDramaShotImageAction.ts`
(called from `generateStartFrameAngleVariations` and `repairShotImage` in
`server/routers/verticalDramaEpisodes.ts`), never from chat or auto-trigger.
