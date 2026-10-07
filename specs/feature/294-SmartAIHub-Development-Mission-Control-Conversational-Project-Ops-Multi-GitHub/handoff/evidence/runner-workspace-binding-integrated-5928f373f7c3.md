# Runner workspace binding preservation

- Integrated pull request: #142
- Canonical integration SHA: `5928f373f7c395d1e0cf900615df3b116aae9fee`
- Code commit: `8fc8a3c30990c44281f8ea86503fb7819cc12a30`
- Changed scope: authenticated Runner snapshot normalization now preserves sanitized `projectId` and `repositoryId`; malformed/path-like identities remain rejected, and legacy snapshots remain explicitly unbound.
- Verification: Runner contract, Spec 224 workspace projection, and Workspace Authority Mission Control tests passed (3 files, 37 tests). `git diff --check` passed.
- Outcome: cross-host workspace identity evidence reaches the project authority projection. Complete Mission Control data and all seven safe-action API/worker dispatch paths remain open; `P0_CODE_IMPLEMENTATION` stays `PARTIAL`.
- External runtime and production verification: `NOT_RUN`.
