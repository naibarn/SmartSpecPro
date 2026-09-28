# Section 03 — Graph engine, edges, subflows, and layout

## Goal

Make the canvas a real editor matching the mockup: nodes move, resize, connect,
delete, and navigate between Main flow and nested Subflows.

## Owned paths

- `apps/web/client/src/pages/workflowStudioGraph.ts`
- `apps/web/server/services/workflowStudioGraphValidation.ts`
- graph unit tests under client/server Feature 209 test locations.

## Graph model

Persist semantic `nodeType`, registry version, config, typed ports, layout
position/width/height, flow ID/type, parent node ID, and output preview. Keep
render `kind` derived from registry. Persist explicit edge ID, source/target
handles, label, branch role, and optional condition metadata.

## Editing interactions

- select/move nodes and preserve position;
- delete selected node with connected-edge handling and undo;
- drag from source to target handles to add a validated edge;
- select/delete edges and edit branch labels;
- duplicate/copy nodes with fresh IDs and safe bindings;
- resize nodes with min/max constraints and persisted dimensions;
- undo/redo graph mutations, zoom plus/minus, fit view, minimap, and viewport
  persistence;
- expose keyboard and tablet-safe button equivalents for every essential action.

## Main flow and Subflow

Represent a graph root and nested subflow contract with inputs, outputs,
parent-node ID, and breadcrumb. Main-flow cards visibly differ from Subflow
cards. Desktop double-click on a subflow node opens its graph; tablet exposes
an explicit `Open subflow` button. Breadcrumb return restores prior viewport.
Subflow calls validate the contract and prevent accidental cross-flow edges.

## Validation

Reject incompatible ports, missing handles, duplicate edges, illegal cycles,
unreachable branch outputs, invalid fan-in, broken joins, and subflow contract
mismatches. Allow cycles only through declared loop/foreach control nodes with
bounded configuration.

## Migration

Add a deterministic mapping from current Feature 209 presets/edges into semantic
registry IDs. Do not destroy existing JSON; preserve unknown legacy fields in a
quarantined extension object and show a not-ready diagnostic where needed.

## TDD-first checks

- Move/delete/resize/connect/delete-edge/duplicate/undo/redo persist correctly.
- Edge labels and handles survive save/reload and zoom.
- Invalid ports/cycles/branches/subflow links are rejected.
- Desktop and tablet subflow entry reach the same target graph.
- Legacy definitions round-trip without changing published hashes.

## Exit criteria

The attached main-flow and subflow mockups can be recreated by interaction,
including clear arrows/branch labels and a usable inspector target for every
selected node.

## UI/UX Contract

### Target User / JTBD

Workflow builder needs to visually edit a Main flow and enter a Subflow without losing context.

### Existing Pattern Reference

Reuse current React Flow and existing editor mobile sheet patterns; diverge only for workflow edges, handles, minimap, and nested flow navigation.

### Surface Inventory

Canvas, node cards, edge layer, breadcrumbs, minimap, zoom toolbar, and tablet subflow controls; rendered by section 10.

### Component Map

Graph state/validation here; canvas/card/breadcrumb components in section 10 consume the contracts.

### State Matrix

Selected, moving, resizing, connecting, invalid connection, deleting, undo/redo, and nested navigation states must be represented by graph events and diagnostics.

### Responsive Matrix

Mobile/tablet use explicit buttons and sheets; desktop supports double-click and direct canvas interaction. Detailed viewport evidence is section 10.

### Accessibility Acceptance

Graph mutations expose keyboard/button alternatives, labels, focus, and non-color edge/branch meaning; rendered checks are section 10.

### Copy Contract

Provide localized action/diagnostic keys for connect, delete, open Subflow, incompatible port, and invalid branch.

### Browser Evidence Required

Section 10 records browser evidence for move, connect, delete, resize, zoom, and Subflow entry at required viewports.
