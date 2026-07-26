# Section 01 inline code review

Reviewer mode: conductor fallback; no code-review subagent tool is available in
this Codex runtime. SocratiCode is also unavailable, so review used the focused
diff, imports, Zod parsing, and Vitest output.

## Findings

- [AUTO-FIXED] The initial contract did not enforce exactly nine shots at schema
  level. `StagedSequentialStoryboardStateV1Schema.shots` now uses `.length(9)`.
- [AUTO-FIXED] The initial checkpoint schema allowed a shot-scoped checkpoint
  without a shot ID and a run-scoped checkpoint with a shot ID. A Zod
  `superRefine` now enforces scope/kind relationships.
- [PASS] One-use approval consumption is represented by immutable consumption
  evidence and rejected by `isCheckpointApprovalMatch`.
- [PASS] Legacy shared contracts remain unchanged and pass their regression
  suite.

No unresolved MUST_FIX findings remain for Section 01.
