# Section 03: Runtime & agents repair UI

Ownership: Worker App runtime status and repair action.

Target file: `apps/worker-app/src/main.tsx`.

TDD: typecheck the component and verify the repair action uses the existing
native installer for macOS or managed-WSL setup for Windows, then polls and
reruns the doctor.

UI/UX Contract:

- Target user: a Worker App operator repairing a render machine.
- Surface: Runtime & agents, directly above Hermes controls.
- States: checking, current, update available, repairing, succeeded, and
  failed with visible error copy.
- Accessibility: native buttons remain keyboard accessible, use disabled state
  while work is active, and errors use `role=alert`.
- Copy: English follows existing Worker App copy; the status explicitly names
  bundled transcription and uses the existing locale fallback behavior.
- Browser evidence: native Tauri UI typecheck/build plus manual Runtime &
  agents verification is required; no browser-only proof is implied.
