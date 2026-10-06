# Dynamic Spec Inventory

## Goal
Discover configured canonical Spec roots and alternate/legacy Spec candidates dynamically without Spec-ID allowlists, preserving malformed and duplicate records in inventory output.

## Scope
Implement root policy parsing, filesystem discovery, candidate classification, duplicate ID/revision detection, missing/malformed paths, moved/renamed evidence hints, structured inventory, and CLI entry points. Do not reconcile lifecycle or edit Spec documents.

## User-Facing Behavior
An operator can request inventory and see every canonical record plus alternate or malformed candidates, with stable paths and explicit classification reasons.

## Technical Constraints
Use repository-native Python tooling conventions and standard library where practical. Config may list path roots, never individual Spec IDs. Traversal is bounded, deterministic, symlink-aware, and does not follow generated output recursively.

## Dependencies
Split 01 contract. Canonical root decisions must be based on repo config and current layout.

## Outputs
Inventory library, CLI `inventory`, root config, JSON inventory report, duplicate/malformed fixtures and tests.

## Edge Cases
Spec-like template outside configured roots; nested child spec under a canonical Spec; duplicate ID in different roots; a directory named like a Spec without spec.md; inaccessible/symlink path.

## Error Handling
Unreadable or malformed entries remain as diagnostic records. Root traversal errors fail validation visibly and never produce a silently incomplete success result.

## Testing Expectations
Temporary filesystem fixtures, configured-root equality, alternate-root capture, duplicate grouping, deterministic ordering, symlink safety, and proof that IDs are not allowlisted.
