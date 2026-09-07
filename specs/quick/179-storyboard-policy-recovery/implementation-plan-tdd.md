# TDD Plan

1. Add a failing test where safe shots plus an oversized handoff must pass safety without a rewrite.
2. Strengthen the existing policy-rewrite test to assert `REPAIR MODE` and the previous candidate are present.
3. Add a failing test for two unsafe repairs followed by a safe third candidate.
4. Add exhaustion assertions for attempt count, retained candidate, findings, and zero deductions.
5. Add an async pipeline test proving the structured recovery candidate is persisted only to the run artifact.
6. Implement the minimum code, run focused Vitest under Node, then run formatting/diff checks.
