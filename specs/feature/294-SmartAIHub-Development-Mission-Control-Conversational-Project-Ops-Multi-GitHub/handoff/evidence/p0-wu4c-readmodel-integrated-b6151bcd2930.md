# P0-WU-4C Mission Control read-model checkpoint — SPEC-294

- PR: https://github.com/naibarn/SmartSpecPro/pull/162
- Implementation commit: `b6151bcd293015f2376ac003d07cb296daf8c139`
- Integrated merge commit: `e3bbbb8d55cc4898c00f0cc1ebbfef0a25e8f64a`
- Focused read-model regression: 8 passed.
- Scope: project sessions now combine active trusted Runner sessions with live local Workspace Authority sessions, deduplicate by session ID, and expose local push/integration/convergence/recovery evidence when present; absent evidence remains UNKNOWN.
- Classification: partial internal implementation. `P0_CODE_IMPLEMENTATION = PARTIAL`.
