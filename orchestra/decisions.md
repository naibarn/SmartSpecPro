# Orchestra Decisions

[2026-09-12T00:00:00+07:00] AUTO-APPROVED: Inline sequential review/repair of Feature 186 because no sub-agent tool or SocratiCode MCP is exposed.
Reason: auto_by_default mode active; scoped work remains conductor-owned and recoverable.
Risk: HIGH
Files affected: Feature 186 control-plane, adapter, schema, route, Python, and test paths.

[2026-09-12T00:00:00+07:00] AUTO-APPROVED: Preserve all existing unrelated dirty worktree files and do not reset/clean them.
Reason: repository instructions and user-owned changes require dirty-worktree safety.
Risk: MEDIUM
Files affected: unrelated existing worktree paths.
