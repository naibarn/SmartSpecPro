# Orchestra Backlog

## Required Before Deep-Implement

Wave 6 resolved the seven Wave 5 planning blockers by converting them into explicit planning contracts and release gates.

Resolved items:

1. `UI/UX Contract` blocks now exist for Production Workspace, React Flow Canvas, Video Shot Workspace, Node Drawer / Node Config Mode, Product Evidence Tray, Handoff/Execution, and Export/Archive/Delete surfaces.
2. Mandatory browser evidence gate now points to `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`, requires command/screenshot/trace/manual evidence, and treats skipped checks as not-pass.
3. Responsive matrices now cover 390x844, 768x1024, 1280x800, and 1440x900 with surface-specific behavior.
4. Accessibility gates now cover keyboard-only journey, focus trap/restore, accessible names, contrast, dark/light readability, reduced motion, and axe/WCAG or documented equivalent.
5. Canonical E2E journey proof now covers goal -> asset/product evidence -> fixture plan -> edit/reconnect/list fallback -> Image/Video/basic TTS config -> Save to Node -> approve/preview handoff -> zero provider-credit spend -> export preview.
6. UI copy contract now covers live-disabled/deferred states, planner failed/partial/schema-invalid, provider-disabled, product blocked, invalid edge, stale conflict, permission denied, export success, and lifecycle confirmations.
7. Visual/token strategy now requires existing Media Studio/shadcn/dashboard semantics, button hierarchy, semantic status colors, focus rings, dark/light readability, and compact operational density.

No unresolved planning blockers remain from Wave 5. During implementation, Packet 10.5 must still produce real browser evidence before Feature 116 can be marked complete.

## Recommended

- Keep Kie Gemini Omni `audio_ids` fail-safe at one ID until provider docs or admin metadata safely prove a higher limit.
- Confirm exact Feature 116 flag names during code implementation if reusing F84-F90 versus adding narrower controls.
- Keep batch execution behind a later flag even after run-one-node and run-one-shot ship.
- Add visual regression snapshots for canvas, Product Evidence Tray, Video Shot workspace, node drawer, disabled states, and conflict states.
- Add Thai/English screenshot smoke for disabled/error/readiness states.
