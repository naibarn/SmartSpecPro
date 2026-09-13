# Section 2 — Worker App UI and native boundary

## Ownership boundary

Own Worker App platform detection, update checks/actions, OS-aware copy, settings capability states, and Rust/Tauri update/autostart helpers. Do not publish release artifacts or change server catalog selection here.

## Target files

- `apps/worker-app/src/main.tsx`
- `apps/worker-app/src/versionUpdate.ts`
- `apps/worker-app/src-tauri/src/commands.rs`
- `apps/worker-app/src-tauri/src/settings.rs`
- `apps/worker-app/src-tauri/src/lib.rs`
- `apps/worker-app/src-tauri/tauri.conf.json`

## TDD expectations

Test URL/branch helpers before effects and invoke calls. Test Mac safe installer handoff separately from Windows self-install. Keep LaunchAgent and registry tests isolated by target.

## Acceptance checks

- all app update call sites pass the current target
- Mac self-update cannot invoke the Windows-only installer path; this technical guard does not hide Windows downloads in Dashboard
- Mac copy says Start at login and native runtime, not WSL/Windows sign-in
- doctor remains fail-closed for wrong runtime IDs

## UI/UX Contract

- Target user: Mac user setting up or updating a Worker App
- Surface inventory: Overview, Settings, runtime doctor/update status
- Component map: existing cards/status rows and shared copy/target helpers
- State matrix: update available, no matching release, source-only, installer handoff, failed, runtime missing/ready
- Responsive matrix: existing desktop sidebar and stacked narrow layout; status text must wrap
- Accessibility: explicit action names, focusable installer link/button, visible non-color status
- Copy contract: Thai/English, OS-aware labels, actionable errors, locale fallback to existing namespace
- Browser evidence: mocked macOS readiness and error states, no reliance on a Linux browser pretending to be native

### Target User / JTBD

Mac user needs to know whether the app, runtime, and update action are ready; Dashboard download choices for other OSes remain available separately.

### Surface Inventory

Overview update status, Settings runtime section, autostart control, and native installer handoff message.

### Component Map

Existing Worker App shell/status rows plus shared target/copy helpers; no separate Mac page.

### State Matrix

Current, update available, no matching release, source-only, installer handoff, update failure, runtime missing, runtime ready.

### Responsive Matrix

Preserve current shell/sidebar and narrow stacked layout; long status/error messages wrap.

### Accessibility Acceptance

Update and installer actions have explicit labels, status is readable without color, focus remains visible, and keyboard navigation is complete.

### Copy Contract

Thai/English OS-aware labels for Start at login, native runtime, installer handoff, and actionable failure; use existing locale fallback.

### Browser Evidence Required

Capture authenticated mocked states for Mac-ready, unavailable, and installer-handoff flows; native install proof is required separately on Apple Silicon.

## Implementation status

Implemented target-aware update checks at all Worker App call sites. Windows keeps
its executable self-install path; macOS accepts only the same-origin arm64
installer endpoint and opens the DMG through the OS opener. Copy and autostart
labels are OS-aware, while runtime guardrails continue to reject WSL2/Windows
packs on macOS. Rust regression coverage passed for the native URL boundary.
