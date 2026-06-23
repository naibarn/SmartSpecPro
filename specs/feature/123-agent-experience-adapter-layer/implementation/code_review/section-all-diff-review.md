# Code Review: All Sections

Date: 2026-06-22

## Scope Reviewed

- `packages/agent-experience`
- Agent Experience web preview components and tests
- Agent Experience tenant feature flags and admin grouping
- Feature 123 evidence artifacts

## Result

Pass with notes.

## Findings

- No SmartSpec-owned package/module/flag uses `persona` as the primary feature name.
- `@runtypelabs/persona@4.4.0` is installed only in `@smartspec/agent-experience`; bridge use remains dependency-gated and feature-flagged.
- Renderer components emit typed intents only and do not call backend mutations.
- Artifact adapter rejects inline content/URLs.
- Approval adapter requires backend confirmation before decision events.
- Cost adapter rejects client-side finalized costs.
- Redaction helper drops private/internal events and sanitizes debug fields.
- Rollout helper blocks missing evidence and non-waivable critical safety waivers.

## Notes

- Follow-up audit found `featureFlags.js` could be resolved by Node before `featureFlags.ts`; it is now regenerated as an ESM mirror with a regression test for Agent Experience flags.
- Existing unrelated dirty HyperFrames/orchestra files were not touched or staged by this review.
