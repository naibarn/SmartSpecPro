# Section 03 — Existing controls, verification and development handoff

- **Requirements:** REQ-294-UW2-06, REQ-294-UW2-07 and focused requirements from Sections 01–02.
- **Objective:** preserve browser/artifact/admission behavior through clearly named existing paths, run required focused checks/build, determine the authorized development runtime target and record evidence without marking the whole SPEC complete.
- **Owned paths:** focused tests, design/SPEC amendment and canonical SPEC-294 handoff only; no new worker/job service.
- **Prerequisites:** Sections 01 and 02.
- **Completion predicate:** no presentation-only control claims dispatch; all focused tests/build pass; handoff distinguishes source/runtime/owner UAT and lists live SPEC-224 execution as open without verified evidence.
- **Verification/evidence:** Vitest; production-mode Vite build; `git diff --check`; shared Spec handoff validate.
- **Fallback:** retain named legacy path and report runtime/owner acceptance pending; never deploy production under this mission.
- **Blocker challenge:** inspect real API state/action support before enabling any mutation.
