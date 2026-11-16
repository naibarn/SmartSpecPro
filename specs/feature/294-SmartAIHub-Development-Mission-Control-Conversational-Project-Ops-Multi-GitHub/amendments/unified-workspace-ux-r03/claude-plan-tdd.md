# Focused Validation Plan

1. Route test: explicit Mission and Task paths load their labeled DEV pages on allowlisted host; `/chat?view=missions` and `/chat?view=tasks` still mount ChatPage after authentication.
2. Task interaction tests: project filter, hierarchy selection, evidence tab selection, tool-call disclosure, terminal/diff wide dock, test failure/artifact/decision/verification panel, attempt switch and return selection.
3. Mission interaction tests: Harness grouping/filter, runner readiness, session tabs, waiting/attention reason, cross-navigation to Task preserving execution/session, return to Fleet preserving selected state.
4. Responsive checks at 1440x900, 820x1180, 390x844; verify no horizontal page overflow and drawer controls remain reachable. Keyboard tab through shell controls, tabs, evidence and close actions.
5. Build the modular shell bundle and inspect changed files for accidental Chat/API contract changes. Deployment check is distinct from bundle build.

Use only scoped tests/builds; do not run repository-wide TypeScript typecheck in this shared session.
