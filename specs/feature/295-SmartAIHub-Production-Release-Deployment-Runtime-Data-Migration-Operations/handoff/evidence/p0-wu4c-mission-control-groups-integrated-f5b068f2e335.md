# P0-WU-4C Mission Control lifecycle checkpoint — SPEC-295

- PR: https://github.com/naibarn/SmartSpecPro/pull/160
- Implementation commit: `f5b068f2e33523395e6f6989de7fd3fad00fa8a3`
- Integrated merge commit: `327c5a6b366ee63c02b8e0e2dd90f3e5ba97fd5c`
- Integrated at: `2026-10-07T05:17Z` (GitHub PR merge)
- Workspace Authority Python regression suite: 41 passed; Python compile and `git diff --check` passed.
- Scope: local Mission Control now reports separate `blocked` and `unknown_owner` worktree groups, retains `stale_or_unknown` as a compatibility alias, and includes authoritative local session identity source/provider/Runner/task fields with `UNKNOWN` when absent.
- Classification: partial internal checkpoint. Remaining WU-4C control-plane and evidence bindings remain open; `P0_CODE_IMPLEMENTATION = PARTIAL`.
