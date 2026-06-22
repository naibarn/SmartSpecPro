# Section 07: Runtype Renderer Spike

## Objective

Evaluate `@runtypelabs/persona` as an optional renderer bridge after SmartSpec contracts, fixtures, preview renderer, and redaction gates are stable.

## Dependencies

- section-01-shared-contracts-and-flags
- section-03-golden-fixtures-and-negative-tests
- section-04-preview-renderer-and-intents
- section-06-debug-inspector-and-redaction

## Scope

- Produce dependency gate report.
- Optionally install exact pinned dependency only after gate approval.
- Build removable `runtypePersonaBridge` if approved.
- Prove bridge consumes filtered canonical events and emits typed intents only.

## Out Of Scope

- No external dependency before this section.
- No bridge imports from core Chat, Agency, Team, approval, artifact, or billing files.
- No private API reliance.
- No customer widget.

## Evidence Required

- exact package version and license;
- dependency tree and install diff;
- bundle impact for `apps/web`;
- CSS/theme isolation and style bleed risk;
- Shadow DOM or DOM ownership behavior if the package uses one;
- mobile drawer/layout parity with existing SmartSpec preview UI;
- accessibility parity;
- private API usage check;
- supply-chain audit result;
- uninstall/rollback steps.

## UI/UX Contract

### Target User / JTBD

- Product and engineering reviewers need evidence on whether an external renderer improves Agent Experience without confusing it with existing Persona functionality.

### Surface Inventory

- Spike evidence document only.
- Optional isolated local demo if needed, not wired into product routes.

### Component Map

- No production component commitment.
- Any spike component must remain isolated behind `agentExperienceRuntypeRenderer`.

### State Matrix

- dependency unavailable;
- dependency installed in isolated spike;
- renderer disabled by flag;
- renderer enabled in fixture-only demo;
- naming leak detected;
- bundle/theming risk detected.

### Responsive Matrix

- If a demo is created, verify it does not break mobile 390x844 or desktop 1440x900 preview framing.
- No responsive requirement for documentation-only spike.

### Accessibility Acceptance

- Spike must record any accessible-name, keyboard, focus, or reduced-motion gaps discovered.
- Do not approve adoption without an accessibility risk note.

### Copy Contract

- Product-facing copy must remain `Agent Experience`.
- External library/package names may appear only in internal evidence.
- Do not introduce a `Persona` UI label.

### Browser Evidence Required

- Required only for an isolated renderer demo.
- Evidence must include screenshots or a written reason why no browser demo was created.

## Tests First

- Test renderer flag ignored when layer disabled.
- Test bridge disabled when dependency gate is incomplete.
- Test bridge receives filtered canonical events only.
- Test bridge emits typed intents only.
- Test SmartSpec renderer fallback works when bridge fails.

## Acceptance Criteria

- Dependency gate report exists.
- Bridge remains removable.
- No backend event semantics depend on Runtype Persona.
- No customer-facing widget behavior is introduced.
