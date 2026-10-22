# SmartAIHub Runner Companion WP2B — native floating shell

Date: 2026-10-22
Source commit: `c022847a4` (`feat(runner): add native floating companion shell`)
PR: `https://github.com/naibarn/SmartSpecPro/pull/1163`

## Implemented native shell

- Added a hidden-by-default Tauri `companion` window with compact mascot
  surface, expanded status panel, drag/collapse controls, settings handoff,
  tray show/hide, optional always-on-top, edge docking, bounded local
  preferences, theme support, keyboard focus handling and reduced-motion CSS.
- Positioning uses physical monitor work areas, supports negative coordinates,
  clamps restored bounds and retains existing Runner settings/control and CLI
  windows.
- Added allowlisted offline/reconnected/projection-unavailable notifications
  through the existing Tauri notification plugin without sensitive payloads.
- The live Task Control projection is intentionally unavailable in this shell:
  the current desktop transport authenticates the Runner device, while the
  companion projection is user/tenant scoped. Browser cookies and device
  credentials are not interchangeable, so no fabricated task or progress
  state is shown.

## Focused verification

- `cargo check --locked` passed.
- `cargo fmt --check` passed.
- `cargo test --locked`: 8 Rust tests passed.
- `node --check ui/companion.js` passed.
- `node tests/companion-contract.cjs` passed.
- Twelve targeted gap reviews covered identity/auth, authority reuse,
  lifecycle/tray, bounds/DPI, local preference safety, accessibility, reduced
  polling, notification egress, CSP/config, preserved existing surfaces,
  generated capability schemas and headless cross-platform behavior.

The current environment has no Windows host, display server or Tauri runtime,
so no native screenshot, Windows lifecycle acceptance or real-device E2E claim
is made.
