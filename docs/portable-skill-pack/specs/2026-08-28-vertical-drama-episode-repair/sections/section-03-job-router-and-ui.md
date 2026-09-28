# Section 03 — job, router, and UI

Ownership: existing story-job kind/executor, Vertical Drama series router, episode workspace, copy, and client tests.

Add `episode_repair` to the existing story job queue. Expose submit/status/revision operations with existing owner checks and polling conventions. Present a single “ซ่อมทั้งตอน / Repair episode” action near episode generation errors and storyboard controls. Display progress, safety/continuity outcomes, and the downstream reset warning. Do not expose raw prompts, provider URLs, or sensitive provider errors.

UI/UX Contract: target user is a creator blocked from producing media for one episode; states are idle, queued, running, succeeded/promoted, needs review, failed, and stale; use existing Vertical Drama workspace components and Thai/English copy; keyboard-accessible action, explicit busy/disabled state, and screen-reader status updates are required. Browser evidence is required for the episode page action and completion refresh.
