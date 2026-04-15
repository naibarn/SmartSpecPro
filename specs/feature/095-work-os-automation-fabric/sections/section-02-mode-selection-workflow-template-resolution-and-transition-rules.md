# Section 02 - Mode Selection, Template Resolution, and Transition Rules

## Goal

Define how the fabric chooses a workflow template, how it selects an operating mode, and when it is allowed to move between manual assist, semi-auto, and fully auto.

## What this section must deliver

- Case-level mode selection.
- A first-release workflow family for content-production cases.
- Template resolution from case type, request metadata, workpack provenance, role-routine provenance, skill provenance, or Agency export provenance.
- A policy for safe mode transitions.
- Confidence or authorization checks for mode upgrades.

## Files likely to change

- Work OS create/intake flow
- Workflow/template resolution services
- Any existing mode or policy helper shared with the orchestration path
- Router and UI surfaces that set or display mode

## Implementation notes

- Treat mode as a runtime property of the case, not a separate product.
- Prefer deterministic template selection over ad hoc inference.
- Keep source provenance visible for templates derived from Agency graphs or skills.
- Require explicit policy checks before upgrading to a more autonomous mode.

## Expected behavior

- Manual assist can always persist or downgrade safely.
- Semi-auto can advance to fully auto only when the case is in a safe state and policy allows it.
- Fully auto must fall back when policy, confidence, or authorization no longer hold.

## Test expectations

- Valid mode values and invalid mode rejection.
- Template resolution by provenance source.
- Safe fallback to manual assist on low confidence.
- Audited mode upgrade and downgrade transitions.

## Risks to watch

- Allowing a silent upgrade to fully auto.
- Losing the provenance link to the chosen workflow template.
- Making mode changes invisible in the audit trail.

## Implementation Result

This section now exists in the runtime fabric as a deterministic policy layer:

- [`apps/web/server/services/workAutomationPolicyService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationPolicyService.ts) resolves the canonical `content-production` template, chooses manual / semi-auto / fully-auto modes, and computes safe downgrade behavior from case and request signals.
- [`apps/web/server/services/workAutomationFabricService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationFabricService.ts) uses that policy during run creation and mode transitions, and persists template provenance + policy snapshots on the run and case records.
- [`apps/web/server/routers/workOs.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/routers/workOs.ts) exposes `resolveAutomationPlan` so operators can preview the resolved template and mode before a run is created.
- The automation fabric now falls back to `manual_assist` for low-confidence launches instead of silently upgrading to a more autonomous mode.
