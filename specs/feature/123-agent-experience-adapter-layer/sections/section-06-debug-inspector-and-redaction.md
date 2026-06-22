# Section 06: Debug Inspector And Redaction

## Objective

Add redaction and visibility filtering needed before any debug inspector or external renderer receives private/internal event data.

## Dependencies

- section-01-shared-contracts-and-flags
- section-02-agency-and-team-adapters
- section-03-golden-fixtures-and-negative-tests
- section-04-preview-renderer-and-intents

## Scope

- Add data classification helper if needed.
- Add renderer filtering helpers for visibility/redaction.
- Add debug denial diagnostics.
- Add tests for normal user vs authorized debug user behavior.

## Candidate Files

- `packages/agent-experience/src/redaction.ts`
- `packages/agent-experience/src/__tests__/redaction.test.ts`
- future app wrapper for role-aware debug inspector permission checks

## Rules

- Unknown fields default private/internal.
- Normal users cannot receive debug/private events.
- Debug users receive sanitized previews only.
- Secrets, OAuth tokens, signed URLs, storage paths, provider API keys, and MCP session tokens are never shown.
- Metrics should use reason codes and redacted identifiers, not raw content.
- Trace/debug output must align with existing runtime trace/checkpoint stores or source trace IDs; do not create a parallel durable debug ledger.
- If debug projections or previews are cached, document access revocation and delete behavior before live preview.

## UI/UX Contract

### Target User / JTBD

- Internal developers need enough debug context to diagnose adapter behavior without exposing sensitive prompt, artifact, or customer data.

### Surface Inventory

- Debug inspector data contract.
- Future debug drawer or panel in the fixture preview.

### Component Map

- No required visual component in this section unless implementation chooses a debug data presenter.
- Redacted diagnostics feed Section 04 debug drawer/inspector.

### State Matrix

- debug flag off;
- permission denied;
- redaction applied;
- large metadata truncated;
- dropped-event diagnostics present;
- malformed diagnostics;
- no diagnostics available.

### Responsive Matrix

- Debug data must support compact display on mobile through grouped rows or disclosure sections.
- Long ids and reasons must wrap without horizontal overflow.

### Accessibility Acceptance

- Debug fields must have text labels.
- Collapsible debug groups must be keyboard reachable and announce expanded state.
- Redaction state must be clear in text.

### Copy Contract

- Debug labels may remain English.
- Use `Redacted`, `Dropped reason`, and `Schema version` consistently.
- Do not expose `Persona` in user-facing labels.

### Browser Evidence Required

- Required if a visual debug inspector is added.
- Capture denied, redacted, and dropped-event states at mobile and desktop sizes.

## Tests First

- Test normal user receives no private/internal events.
- Test debug user receives sanitized payload preview only.
- Test token/signed URL patterns are rejected or redacted.
- Test unknown field classification defaults private/internal.
- Test debug denial emits safe reason without payload leak.
- Test or checklist debug trace IDs align to existing source/runtime trace identity.
- Test or checklist cached debug preview retention/delete behavior is documented if any cache is introduced.

## Acceptance Criteria

- Filtering helpers are pure and tested.
- No raw debug payload is exposed to normal renderer paths.
- Future debug inspector can depend on these helpers before UI work.
- No parallel durable debug ledger is introduced.
