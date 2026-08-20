# Contracts

No parallel agent contracts are needed for this direct inline bug fix.

## QC revision contract

- Active `storyDesign` control fields remain immutable or explicitly mutable per the shared QC constants.
- `legacyControlArchive` is server-managed audit metadata and is stripped from provider patches before merge.
- Server-side repair may rewrite the archive without stopping QC.
