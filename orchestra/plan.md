# Worker App Windows release 0.1.403

## Task analysis

- Intent: build the next Windows Worker App installer and publish it in the existing Dashboard release locations.
- Scope: small, implementation-ready release packaging task.
- Risk: medium; the installer is user-facing and includes the runtime pack, but no database or external deployment mutation is requested.
- Route: direct standard-light execution using the existing `apps/worker-app/scripts/package-windows-release.mjs` workflow.
- SocratiCode: unavailable; use targeted shell discovery and the repository release script.
- Specialized skill decision: the generic `release` skill was inspected but skipped for GitHub/tag/npm publishing because the user requested a Dashboard installer artifact only.

## Success criteria

1. Compute the next version from the current package/dashboard state.
2. Pass the release script dry-run and runtime-pack gate.
3. Build the Windows x64 NSIS installer.
4. Place identical copies in `apps/web/client/public/releases/` and `apps/web/dist/public/releases/`.
5. Verify filename/version, PE magic, byte identity, SHA-256, and worktree diff hygiene.

## Planned wave

- Wave 1: run release dry-run/runtime checks, build and publish the installer, then verify both Dashboard copies and report unsigned/Windows-host limitations.
