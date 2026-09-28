# Section 03 — capability and workflow resolution

## Objective

Turn MCP discovery into approved, version-pinned, schema-driven workflow inputs
for image, video, shot video, and generic workflow jobs.

## Owned files

- the capability model exposed by Section 02
- `apps/web/server/services/comfyWorkflowRegistryService.ts`
- `apps/web/server/services/comfyConnectionProfileService.ts`
- `apps/web/server/services/comfyJobService.ts`
- `apps/web/server/services/workerComfyJobAdmissionService.ts` is intentionally
  owned by Section 04 and consumes this section's enrichment/preflight result.
- shared Comfy workflow/capability mapping helpers
- the established admin/router tests for discovery and approval

## Required implementation

1. Capture protocol/server/tool/schema/workflow/input/output/limit/auth/expiry
   data and calculate a stable capability snapshot hash.
2. Keep discovered workflow descriptors review-only until approved. Published
   versions are immutable by checksum and can be deprecated/disabled.
3. Resolve by profile ID and workflow version ID/checksum, never display name.
4. Map image/video/audio/mask/start/last/ordered references, duration/FPS/size,
   aspect, seed/model/output format, and provider extensions through a typed
   schema. MiniMax H3 is only a capability example, not a hardcoded path.
5. Return structured preflight errors for stale snapshots, missing tools/models,
   unsupported input, stale binding, policy, budget, consent, or output target.
6. Record Manual, Guided AI, and Automated AI input-resolution evidence and
   enforce their respective policy gates.

## TDD sequence

- Snapshot hash/expiry and stale re-probe.
- Missing required family/tool/model and alias fail-closed behavior.
- Discovery/review/approval/deprecation and checksum immutability.
- Start/last/ordered frame and video duration/FPS/schema validation.
- Mode evidence and policy gates.
- Revision conflicts, disabled parent, and incompatible connection kind.

## UI/UX Contract

### Target User / JTBD

Admin approves safe workflows; an operator chooses a compatible version and
understands why a connection is or is not eligible.

### Surface Inventory

Extend existing admin worker/MCP monitoring and the canonical Worker Workflows
screen. Series/shot UI consumes preflight; it does not discover Comfy directly.

### Existing Pattern Reference

- Searched `apps/web/client/src/pages`, `apps/web/client/src/components`, and
  `apps/web/shared`; found MCP server management, workflow editor,
  vertical-drama provider, and media workflow policy patterns.
- Decision: reuse their approval, schema, badge, and preflight conventions and
  extend existing policy/registry boundaries.

### Visual Direction / Token Strategy

Use existing admin tables/cards, semantic success/warning/error tokens, compact
detail drawers, and current typography/spacing. Keep approval status dominant.

### Component Map

Capability snapshot card, workflow version table, approval/deprecation actions,
schema preview, compatibility badges, preflight result, and missing-capability
recovery link.

### State Matrix

Discovery loading is non-mutating; unapproved is review-only; approved is
selectable; stale/disabled is blocked with reason; schema error identifies the
input; permission/consent failure identifies the required action.

### Responsive Matrix

Desktop shows table/detail; tablet collapses schema columns; mobile uses cards
and a detail drawer while preserving approval status and version checksum.

### Accessibility Acceptance

Approval controls require labels and confirmation, tables have headers, status
is text plus icon, schema errors are associated with controls, and keyboard
ordering follows discovery → approval → preflight.

### Copy Contract

Thai/English terms distinguish discovered, approved, disabled, stale, and
unsupported; provider-returned text is sanitized and not used as UI labels.

### Browser Evidence Required

Verify discovery review, approval, exact version selection, schema preflight,
and blocked missing-capability recovery in the admin/Worker flows.

## Exit criteria

An approved workflow and current capability snapshot yield a typed preflight plan
without raw graph/tool/endpoint input from the browser.
