# Section 05 — Worker Canonical Shell

## Goal

Replace the legacy five-tab rendering boundary with a real sidebar and
canonical screens while preserving aliases and one background coordinator.

## Owned files

- `apps/worker-app/src/app/WorkerAppShell.tsx`
- `apps/worker-app/src/app/workerRoutes.ts`
- `apps/worker-app/src/app/workerContext.tsx`
- `apps/worker-app/src/main.tsx`
- `apps/worker-app/src/screens/*` canonical screen components
- Worker UI tests/styles

## Implementation

Mount screens for Overview, Series, Binding, Media Workspace, Queue, Published,
AI/Workflows, Runtime/GPU, Connection/Access, and Settings. The sidebar owns
navigation; screen projections consume context and do not start loops. Legacy
tab IDs map to canonical routes. Add safe empty/loading/offline/revoked states.

## UI acceptance

Every route is reachable from the sidebar, old aliases still work, keyboard
navigation and responsive layout are covered, and local paths/secrets never
appear in remote projections.

## UI/UX Contract

### Target User / JTBD

Worker operator needs one predictable place to bind a local machine to a
Series, prepare media, monitor GPU jobs, and publish safe artifacts.

### Surface Inventory

Sidebar, project context bar, Overview, Series, Binding, Media Workspace,
Queue, Published, AI/Workflows, Runtime/GPU, Connection/Access, and Settings.

### Component Map

`WorkerAppShell` owns route state and navigation; each canonical screen owns
only its projection and actions; background loops remain in the app runtime.

### State Matrix

Loading, no project, unbound, offline, token revoked, queue paused, GPU busy,
partial failure, and ready states are explicit on every affected screen.

### Responsive Matrix

Sidebar collapses to an accessible menu on narrow windows; tables become cards
and destructive/irreversible actions remain visible with confirmation.

### Accessibility Acceptance

Use semantic navigation, current-route indication, keyboard traversal, focus
restoration, labels for status badges, and no secrets or absolute paths in UI.

### Copy Contract

Prefer task labels (“ผูก Series”, “เตรียมสื่อ”, “คิวงาน”, “ไฟล์พร้อมใช้”)
over implementation labels; diagnostics remain available on demand.

### Browser Evidence Required

Verify navigation and representative loading/offline/ready/revoked states at
desktop and narrow viewport sizes.
