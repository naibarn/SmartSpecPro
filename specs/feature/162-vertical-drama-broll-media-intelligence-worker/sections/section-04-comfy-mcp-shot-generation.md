# Section 04 — ComfyUI MCP and generated shot video

## Goal

Implement the typed MCP-primary adapter and generated-shot path for approved
start/reference frames, with workflow/capability resolution and safe recovery.

## Files

- Add shared adapter contracts under `apps/web/shared/verticalDramaMedia/` if
  section 01 does not already contain them.
- Add Worker/native adapter module under `apps/worker-app/src-tauri/src/` or
  the existing local AI runtime seam, plus focused Rust/unit tests.
- Add server workflow registry/resolver integration and route/service tests from
  section 02.
- Add fixture workflow manifests under a test-only fixture directory; do not
  commit credentials, huge model files, or arbitrary production graphs.

## Required behavior

Negotiate pinned `comfy-mcp` tool manifest and capability probe before claim.
Resolve allowlisted workflow by operation/input contract/route/model/resource
policy. Stage start frame, ordered reference frames, optional last frame,
reference video/audio through local opaque references. Dispatch typed MCP call,
observe progress, reconcile execution ID, ingest output, run media QC, and
publish through section 02. Direct ComfyUI HTTP is adapter-internal only.

MiniMax H3 entries must be capability/license/resource probed and distinguish
T2V, I2V/first-last-frame, and reference-to-video. Missing readiness returns a
blocked capability result, never a fake completed artifact or silent workflow
switch.

## TDD requirements

Test tool-manifest mismatch, route/model capability mismatch, start/reference
ordering/hash, user override policy, no arbitrary graph/path/provider payload,
remote completion reconciliation, output QC rejection, and blocked H3 probe.
Live ComfyUI/GPU execution is a separate evidence gate.

## Acceptance

Generated-shot request can be admitted with immutable WorkflowResolution and
frame manifest; unsupported environments fail safely and observably.

## UI/UX Contract

### Target User / JTBD
Creator understands workflow/capability readiness and frame inputs before queueing a shot.
### Surface Inventory
Shot drawer workflow panel, frame pack editor, capability/error panel.
### Component Map
Workflow chooser and frame editor are presentational; server/native owns resolution and execution.
### State Matrix
Show probing, compatible, incompatible, awaiting approval, running, QC, blocked, failed, and ready.
### Responsive Matrix
Desktop drawer; tablet/narrow full-screen drawer with stacked frame list and sticky actions.
### Accessibility Acceptance
Frame roles/order and capability blockers are keyboard reachable, labeled, and announced.
### Copy Contract
Thai/English labels distinguish Admin default, user override, auto-resolved, and blocked capability.
### Browser Evidence Required
Browser proof for frame/workflow drawer; live MCP/GPU proof is a separate gate.
