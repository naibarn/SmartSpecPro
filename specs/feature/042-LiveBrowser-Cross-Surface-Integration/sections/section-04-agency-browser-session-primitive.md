# Section 04 - Agency Browser Session Primitive

## Goal

Give Agency Builder a browser collaboration primitive that users can understand without knowing the internals of live-browser execution.

## Scope

- Add a dedicated `browser_session` agency node primitive.
- Keep existing agencies valid.
- Use user-facing configuration labels rather than generic runtime terminology.

## Implementation Notes

- The chosen direction is a dedicated `browser_session` primitive, not an overloaded `skill_call`.
- Configuration should describe what the agency is trying to do in user terms, such as opening a browser session, waiting for review, or asking for user input.
- Builder labels and property panels must reuse the shared Browser Session language contract.
- Existing agency graphs must remain valid without bulk migration. Prefer additive schema, load-time normalization, and save-time version tagging if needed.

## Files Likely Touched

- `apps/web/client/src/components/agency/nodes/types.ts`
- `apps/web/client/src/pages/AgencyBuilder.tsx`
- `apps/web/client/src/components/agency/NodePropertyPanel.tsx`
- agency runtime contract files as needed

## Tests

- New agency primitive appears in the builder with clear labeling.
- Validation still passes for existing agency graphs with no browser-session nodes.
- Older agency graphs load and save without rewriting unrelated nodes.

## Acceptance

- Agency Builder exposes browser collaboration as a first-class concept rather than hiding it under generic tool execution.
