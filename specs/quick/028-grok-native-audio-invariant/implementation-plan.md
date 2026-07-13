# Implementation Plan

## Objective

Enforce provider-independent Grok native audio, preserve all native dialogue in
final prompts, and add durable regression/provenance guards.

## Current-codebase fit

Keep capability ownership in `modelRegistry.ts`, extend the existing MCP seed
shape, reuse the existing dialogue compliance logic, extend the existing prompt
QC service, and add revision metadata to existing JSON contracts rather than a
relational migration.

## Implementation sequence

1. Add failing table-driven family-classifier and catalog invariant tests.
2. Implement/export the Grok video classifier and capability override.
3. Extend MCP seeds/config and add report-first backfill tooling/tests.
4. Add failing speaker-switch omission and protected-QC tests.
5. Share native-dialogue compliance and enforce deterministic fallback.
6. Add protected fragments to QC and final persistence/provider checks.
7. Add storyboard revision/stale metadata helpers and failing pipeline/router
   tests, then wire all storyboard persistence paths.
8. Surface stale/unknown provenance in episode detail/UI and block paid use.
9. Run focused tests, typecheck, diff review, and catalog audit.

## Risks and mitigations

- False-positive Grok image classification: require `type === video` and test
  image/upscale identifiers.
- Provider id drift: inspect model id plus nested provider model ids; CI scans
  every exported seed/static definition.
- Dialogue lost after corrective retry: deterministic append plus final check.
- Dialogue lost by QC: protected-fragment contract and explicit overflow error.
- Existing artifacts disrupted: additive JSON metadata, view-only legacy path,
  no deletion or automatic regeneration.
- Dirty file collisions: patch narrow hunks and inspect per-file diffs.

## Acceptance criteria

All criteria in the approved design apply. In particular, Episode 42's model
resolves native audio, all Grok video provider fixtures pass the invariant,
speaker-switch cannot return/persist an incomplete native prompt, and
storyboard changes cannot silently reuse old downstream artifacts.

## Rollout

Ship runtime protection before running catalog backfill. Backfill remains
report-only until an explicit production apply with backup approval.

