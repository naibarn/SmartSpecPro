# Section 07 — Worker Comfy UI and Overview

## Objective

Provide one focused bilingual Worker navigation model with truthful connection,
Comfy, queue, and active-job status. Every visible action calls a real native
command or authenticated control-plane operation.

## Owned files

- `apps/worker-app/src/app/workerRoutes.ts`
- `apps/worker-app/src/components/WorkerAppShell.tsx`
- `apps/worker-app/src/components/WorkerTopbar.tsx`
- `apps/worker-app/src/components/CanonicalWorkerRouteScreen.tsx`
- new focused screens/components under `apps/worker-app/src/screens/`
- Worker locale/translation catalog and tests

## Required implementation

1. Keep one Sidebar with Overview, Connection, Series, Media Workspace, Queue,
   Published, AI Plan, Comfy Connections/Workflows/Jobs, Runtime, and Settings.
   Remove duplicate top Quick Actions and duplicate queue/editor surfaces.
2. Show header status triplet: SmartAIHub control plane, Worker loop, and active
   Comfy session/profile, each with connected/disconnected/stale/expiry time and
   actionable recovery copy.
3. Overview places active job first, then waiting/recent jobs, with job ID,
   canonical type, Series/shot, created/updated time, Worker, workflow/profile
   safe labels, phase, progress, and reason for waiting.
4. Add real screens for saved Comfy connections, workflow discovery/schema,
   Comfy jobs, and diagnostics. Use native invoke wrappers for CRUD/test/
   activate/revoke/probe/run/reconcile.
5. Support Thai/English global locale; all labels, errors, status, dates,
   accessibility names, and recovery copy follow the selected language.
6. Keep one canonical ComfyUI Sidebar group (`Connections`, `Workflows`,
   `Jobs`); legacy workflow links redirect to the canonical screen and the
   removed top Quick Actions bar is not rendered.

## TDD sequence

- Sidebar ownership and no duplicate Quick Actions/queue/editor.
- Profile grant source/revision/actor/time, checked initial grants, revoke,
  expiry, and reconnect guidance.
- Workflow schema form, ordered frames, preflight, and real pending/error/
  reconcile states.
- Header/Overview truth, serial busy queue, complete/copyable job details.
- Translation coverage, keyboard/responsive/reduced-motion, redaction.

## UI/UX Contract

### Target User / JTBD

The Worker owner opens one Overview and immediately knows whether the machine is
connected, what is processing, what is waiting, and what action fixes a block.

### Surface Inventory

Sidebar-owned Overview, Connection, Comfy Connections, Workflows, Comfy Jobs,
Queue, Published, Runtime, and Settings. Series and Media Workspace remain
separate: Series binds/selects media; Media Workspace ingests/processes files.

### Existing Pattern Reference

- Searched `WorkerAppShell.tsx`, `WorkerTopbar.tsx`,
  `CanonicalWorkerRouteScreen.tsx`, `workerRoutes.ts`, `MediaWorkspaceHost`,
  and `QuickActionsBar`.
- Decision: reuse canonical Sidebar, shell, cards, command states, and existing
  Media Workspace; remove duplicate Quick Actions rather than adding navigation.

### Component Map

Topbar status triplet, active-job card, waiting/recent list, profile card,
permission inspector, workflow schema form, preflight panel, output/publication
panel, diagnostics panel, and locale switcher.

### State Matrix

Loading disables mutation; empty gives the next action; stale/offline becomes
read-only with observation time; denied names missing scope; unavailable names
missing capability; validation marks the field; server errors show safe code and
correlation; destructive actions confirm.

### Responsive Matrix

Desktop Sidebar/detail; laptop collapses secondary panels; tablet stacks active
first; mobile is one column with sticky status/recovery action and drawers.

### Accessibility Acceptance

Keyboard/focus, semantic landmarks, field/error association, throttled live
region, contrast, reduced motion, copyable Job ID, and non-color-only states.

### Visual Direction / Token Strategy

Keep the sparse operational dashboard: Sidebar plus clear content card, semantic
status colors with text, current typography/spacing/radius/shadows, restrained
transitions, and no raw hex or global CSS reset.

### Copy Contract

Thai/English catalogs share keys. Raw job type/ID remain visible for comparison;
missing translation falls back to English with a diagnostic marker.

### Browser Evidence Required

Actual Tauri/WebView proof for locale switch, profile lifecycle, workflow
preflight, active Overview, busy queue, stale/disconnected recovery, and
destructive confirmation.

## Exit criteria

Worker UI has one navigation model, no mock buttons, complete bilingual states,
and Overview explains all current work without opening another screen.

The shell loads the locale catalog before first render, including legacy Worker
screens. Overview's active card is above the fold and uses the same server
projection fields as Web; it never invents Worker identity, progress, queue
position, or readiness from local UI state.
