# Section 08: Rollout, Observability, Security, and Runbook

## Objective

Make the new workflow operable, tenant-safe, measurable, and reversible.

## Owned paths

- focused metrics/event/log helpers near the runtime service
- feature flag/config definitions
- `docs/` or feature spec runbook under this directory
- security/retention tests

## Required behavior

- Emit redacted run-stage, checkpoint, validation, repair, provider, credit,
  approval, reconciliation, and finalization events with tenant/run/attempt
  correlation and contract hash.
- Never log story source text, prompts, tokens, credentials, or provider URLs
  that contain secrets. Apply tenant scope at every read and operator surface.
- Add retention cleanup hooks honoring the 30-day policy while retaining
  terminal/resumable source/context/manifest evidence through the retention
  boundary.
- Define flags for telemetry-only, truthful-completion, deterministic assurance,
  premium correction, and Agents shadow/active. Include rollback and migration
  preflight checks.
- Document dashboards, stuck-run diagnosis, reconciliation procedure, approval
  procedure, and rollback. State what requires production/provider/browser
  proof.

## TDD and proof

Test redaction, tenant isolation, flag snapshots, retention cutoff, and safe
diagnostic output. Run static checks for accidental raw payload logging.

## UI/UX Contract

### Target User / JTBD
Operator diagnosing a stuck or reconciled run; no end-user visual redesign is
part of this section.

### Existing Pattern Reference
Reuse existing admin monitoring and alert surfaces for operator metrics.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Monitoring/alerts | existing admin monitoring | optional run metrics |

### Component Map
N/A; telemetry wiring only.

### State Matrix
N/A; operational states are tested as events.

### Responsive Matrix
N/A; existing monitoring layout is reused.

### Accessibility Acceptance
Existing admin monitoring accessibility contract remains applicable.

### Copy Contract
Use stable operator reason codes and avoid raw story/prompt content.

### Browser Evidence Required
No browser evidence for telemetry-only changes; document if admin UI changes.
