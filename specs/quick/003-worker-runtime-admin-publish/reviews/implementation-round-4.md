# Implementation review round 4 — UI and operator flow

Status: PASS.

- The admin desktop release console now has a dedicated Worker App runtime section.
- The UI shows current status for Windows/WSL2, Windows native, and macOS arm64, making the approved partial rollout explicit.
- The form enforces the generated filename convention, platform target, channel, ZIP selection, upload status, server validation feedback, and refresh.
- Publish and Withdraw actions are available only to system admins; no environment or private-key field is exposed.
- The screen remains understandable when no macOS build exists and does not pretend macOS is ready.
- `apps/web` client production build and widget build completed successfully.
