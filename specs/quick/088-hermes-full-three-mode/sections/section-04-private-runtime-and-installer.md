# Section 04: Private Runtime and Installer

## Ownership

- `apps/web/scripts/build-hermes-runtime-pack.ts`
- `apps/worker-app/**`
- `apps/web/client/public/releases/runtime/**`
- Worker App release artifact/publication

## TDD

Run existing manifest, checksum, Hermes runtime, worker executor, and version
tests. Bump the Worker App patch version consistently before packaging.

## Acceptance

- Windows manifest reports `allowed:true`, version, checksum, and archive URL.
- Archive download succeeds and checksum matches.
- New Worker App installer contains the Hermes code and is served by the latest
  release endpoint.
- macOS remains explicitly unavailable rather than falsely ready.
