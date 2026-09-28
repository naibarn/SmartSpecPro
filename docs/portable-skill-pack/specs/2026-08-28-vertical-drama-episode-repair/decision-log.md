# Decision log

## 2026-08-28

- Use a new `vertical_drama_episode_revisions` table for immutable candidate history and promotion metadata. This preserves the original episode and makes retries idempotent.
- Reuse `vertical_drama_story_jobs` with kind `episode_repair`; the worker executor remains the existing router boundary.
- Auto-promote only candidates that pass schema, 9-shot, continuity, and high-risk safety gates. Unsafe candidates are terminal `needs_review` and never trigger image/video work.
- Read previous episode facts through the existing memory bundle. Read next episode only as a bounded, explicitly labeled constraint containing title/logline/key beats/cliffhanger and no future character-knowledge injection.
- On promotion, clear downstream plan JSON fields but retain all old media and task history; future start-frame/video generation is user-triggered from the promoted episode.
- Do not run a real paid repair for episode 232 in this coding task.
