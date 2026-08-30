# Section 04 — Worker shell and UI screens

## Goal

Extract the current four-tab Worker App into a Sidebar/route shell with global
Series context, Quick Actions, legacy aliases, and scalable screen modules.

## Files

- Refactor `apps/worker-app/src/main.tsx` into
  `src/app/WorkerAppShell.tsx`, `workerRoutes.ts`, `workerContext.tsx`.
- Add Sidebar/Topbar/Quick Actions components and screens under
  `apps/worker-app/src/` as specified by Feature 163.
- Extend `apps/worker-app/src/styles.css` using existing tokens/conventions;
  do not add a global reset or raw design system.
- Add Worker UI tests and update localization/copy seams as needed.

## Required behavior

Routes: overview, series, binding, Media Workspace host, queue, published,
AI/workflows, runtime/GPU, connection/access, settings. Old connection/render/
hermes/settings identifiers map to canonical routes for one release.

`WorkerContext` owns connection, Worker identity/scopes, selected Series/revision,
root binding, queue and capability snapshots. Screens never own background
loops/tokens/raw paths/tenant resolution. Quick Actions show prerequisites and
dispatch typed idempotent commands; server result is authoritative.

Support boot/disconnected/connecting/no Series/loading/empty/stale/offline/
denied/binding/capability/processing/success/error/revoked/recovery states.
Use responsive desktop/tablet/narrow layouts, keyboard/focus/labels/live status/
contrast/reduced-motion and Thai/English copy.

## TDD/evidence requirements

Test route aliases, context persistence/reconnect, Sidebar collapse, selected
Series guards, Quick Action eligibility/result, all state variants,
accessibility semantics, and narrow-window no-overflow. Browser evidence and
Tauri evidence are separate acceptance gates.

## Acceptance

Existing Worker controls continue to work while the new shell can add future
modules without adding another top-level tab or duplicate coordinator.

## UI/UX Contract

### Target User / JTBD
Creator operates many Series/local roots and safe actions from one scalable Worker desktop shell.
### Surface Inventory
Overview, Series, Binding, Media Workspace host, Queue, Published, AI/Workflows, Runtime/GPU, Connection/Access, Settings.
### Component Map
Shell owns layout; Sidebar routes; Topbar context; Context owns selection; screens own projections; Tauri owns paths; server owns authority.
### State Matrix
Boot, disconnected, connecting, no Series, loading, empty, stale/offline, denied, binding, capability, processing, success, error, revoked, recovery.
### Responsive Matrix
Desktop persistent Sidebar; tablet collapsed Sidebar; narrow drawer navigation and no horizontal tab overflow.
### Accessibility Acceptance
Landmarks, keyboard/focus, labels, live queue/status, contrast, reduced motion, disabled-action explanation.
### Copy Contract
Thai/English connection, Series, local-only, stale, blocked, recovery, publish, and scope-update copy with fallback.
### Browser Evidence Required
Browser proof for shell/Sidebar/Topbar/route states; Tauri proof for native picker/path disclosure.
