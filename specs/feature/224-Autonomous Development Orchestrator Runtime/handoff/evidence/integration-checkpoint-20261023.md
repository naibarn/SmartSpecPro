# SPEC-224 Recovery Checkpoint Integration — 2026-10-23

- Configured canonical ref: `refs/heads/main`.
- Candidate implementation commit: `c899776f32626f7baf542baccec58e2da78f0103` (`fix(spec224): fail closed on retired workflow approvals`).
- The candidate plus its evidence commits were fast-forwarded to `origin/main`; the confirmed canonical SHA at the end of promotion was `6041559b0fe692b4f660b994b7e5ece3831f8d28`.
- The remote has no branch protection for `main`; the fast-forward was pushed through the normal non-force path. No required check was bypassed.
- Focused validation: `tests/test_spec224_external_agent_approval.py` passed 11/11 on the rebased candidate. Spec handoff validation returned `valid=true`, `completion_eligible=false`.
- This checkpoint integrates a fail-closed legacy approval boundary and durable build/CI/deployment evidence. It does not close the remaining SPEC-224 Runner, database authority, or end-to-end acceptance requirements.
