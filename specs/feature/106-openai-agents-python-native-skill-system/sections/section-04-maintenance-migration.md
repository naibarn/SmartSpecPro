# section-04-maintenance-migration

## Scope

Implement the maintenance lifecycle and safe migration path for converting legacy skills into native bundles.

## What this section must cover

- Make evaluate, propose, apply, and verify operate on the same bundle contract as create and runtime load.
- Classify changes as breaking or non-breaking.
- Allow auto-apply only for non-breaking maintenance changes.
- Use the maintenance analyzer to prioritize the highest-value legacy bundles first.
- Keep the compatibility mirror only when it increases migration safety.
- Update lock/version metadata and changelog entries when a safe change is applied.

## Plan constraints

- Maintenance writes must stay inside the target skill bundle.
- Breaking changes require approval.
- Migration should be curated first, not a blanket conversion of the entire catalog.

## Tests to write before implementation

- safe bundle changes re-run verification before apply.
- breaking changes are blocked from auto-apply.
- migration priority prefers high-usage/high-risk bundles.
- compatibility mirrors are preserved only when policy allows them.
- maintenance write scope does not escape the bundle root.
- safe maintenance updates bump lock/version metadata and changelog content when applicable.

## Dependencies

This section depends on the bundle contract, runtime verification rules, and Node compatibility support.
