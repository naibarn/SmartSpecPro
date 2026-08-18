# TDD Plan

1. Add classifier tests first: explicit LLM/media/unknown thresholds, provider markers, malformed amounts, and non-credit passthrough.
2. Add auto-report tests for ordinary user-only routing, suspicious high-priority routing, provider critical routing, and dedup group keys.
3. Add feedback processor regression proving critical ticket priority reaches `createNotification`.
4. Add media-job helper regression proving credit failures do not use generic admin fan-out.
5. Run the focused Vitest files, then `pnpm check` from `apps/web`, then `git diff --check`.

Expected initial failure: the current implementation creates an admin notification/ticket for every system credit error and has no user-only credit route.
