# Project Requirements — Specs 195–222 Ordered Orchestra Execution

## Objective

Manage the existing authorities and Specs 212–222 as one project-level,
end-to-end execution. Preserve the user-defined dependency order, make every
contract explicit, and require Planning → TDD/Test Design → Implement → Verify
→ Debug/Fix → Review → Final Verify for every spec and wave.

## Normative execution contract

The following order is fixed unless a newly discovered dependency contradiction
is proven with repository/spec evidence and recorded as a typed blocker:

1. Freeze existing authorities: 195, 199, 200, 206, 207, 208, 209, 211.
2. Spec 214 canonical Node contracts.
3. Spec 215 Workflow compiler/runtime contracts.
4. Spec 216 Phases 0–3 Studio cutover.
5. Spec 220 gateway/security core.
6. Spec 217 Tenant/Product identity.
7. Spec 222 foundation, then Spec 221 Skill contracts.
8. Spec 218 DevelopmentJob/ReleaseCandidate.
9. Spec 219 managed runtime/deployment.
10. Integration hardening for 216/217/220/221/222.
11. Spec 212 R20 certification/release gate.

Spec 213 may run as a parallel lane only for clearly owned work with an
independent dependency boundary. Its Computer Use certification must pass before
Computer Use is admitted into harness integration.

## Non-negotiable lifecycle rules

- A blocker is never a completed stage or wave.
- A discovered gap is recorded in `orchestra/lifecycle.md` before any stage
  transition; `backlog.md` is only a secondary pointer.
- Every gap has `earliest_affected_stage`, evidence, owner, action, stale gates,
  and `resume_from`.
- A repair invalidates all downstream evidence that depends on the changed
  contract, source, schema, runtime path, or proof surface.
- Stale gates are rerun in dependency order before the next wave can begin.
- Product decisions, destructive actions, unavailable external dependencies, and
  loop limits produce a typed `BLOCKED` state with gap, evidence, resume point,
  and residual risk.
- Retired Agency, `/workflows`, workpacks, OpenSandbox, `sandbox_jobs`, and
  Docker/OpenSandbox dispatch remain prohibited.

## Current evidence boundary

The repository has existing Workflow Studio, economic, Runner, external-agent,
Computer Use, and durable `worker_jobs` baseline code. Specs 214/215/216 still
define the canonical cutover target; existing baseline code is not treated as
proof of canonical cutover without conformance evidence.

SocratiCode MCP was unavailable in this session. Targeted shell discovery is the
documented fallback; all discovery claims must remain source- and command-
grounded.
