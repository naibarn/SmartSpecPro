# Self Review Round 8

## Findings

- The previous draft still lacked enough detail for contract migration, preview ACLs, stale-preview invalidation, deterministic team resolution, and `skill_studio` action-specific governance.

## Auto-fixes applied

- Added explicit contract-migration guidance for `workflow` and `skill_studio`.
- Added requester-safe preview ACL and redaction rules.
- Added `PreflightRevisionFingerprint` invalidation requirements.
- Added deterministic team-resolution precedence and stable resolution codes.
- Split `skill_studio` governance into create, improve, auto-apply, and publish actions.
