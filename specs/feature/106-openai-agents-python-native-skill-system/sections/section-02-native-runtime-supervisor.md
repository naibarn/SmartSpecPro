# section-02-native-runtime-supervisor

## Scope

Implement the dedicated Python native skill runtime, sandbox-agent loading model, phase supervisor, and persistence layer.

## What this section must cover

- Add runtime modules under `python-backend/app/services/` for native skill execution, supervision, and persistence.
- Use the sandbox-agent pattern with `Capabilities.default()` and lazy local skill loading for larger directories.
- Define and enforce the phase sequence:
  - discover
  - inspect
  - plan
  - execute
  - verify
  - summarize
  - finalize
- Persist progress, last command, loaded skills, artifact index, and resume hints.
- Support interruption recovery, resume, and phase-specific retry handling.
- Use the workspace layout `repo/`, `.agents/`, `state/`, `out/`, and `logs/` so runtime artifacts are predictable.
- Persist the canonical run files `state/progress.json`, `state/last_session_state.json`, `logs/phase_<n>.md`, and `out/artifact_index.json`.

## Plan constraints

- Keep this path separate from the generic chat/team runtime until it is stable.
- Redact sensitive runtime metadata before persistence.
- Verification must be mandatory before finalize.

## Tests to write before implementation

- runtime uses sandbox-agent skill loading instead of plain agent construction.
- large skill directories load lazily.
- phase progress persists and can be resumed.
- verify failure blocks finalize.
- runtime state redacts secrets.
- interruption recovery returns to the latest safe phase boundary.
- runtime state writes expected phase logs and artifact indexes in the workspace layout.

## Dependencies

This section depends on the native bundle contract from section 01.
