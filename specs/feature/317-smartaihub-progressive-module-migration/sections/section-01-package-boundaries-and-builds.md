# Section 01 — Package boundaries and independent builds

## Requirement IDs

`REQ-4BB581C90577`, `REQ-295AD937395C`, `REQ-32CAB23B7018`, `REQ-E014BEE5B67C`, SPEC-317 R1.6/R1.7.

## Objective

Make independent build selection the default workflow. Add only the package boundaries and small versioned manifest/contract infrastructure needed for the new Shell and Chat module. Remove the root aggregate `build` command; retain explicit per-package commands and the current Core-only worker build.

## Owned paths

In `/mnt/SmartSpecDev/projects/smartaihub-platform`: root `package.json`, `turbo.json` if necessary, `packages/saas-contracts/**`, and minimal workspace/build documentation. Do not edit Core auth implementation here unless needed for package import compatibility.

## Prerequisites

Current platform main is clean and equal to `origin/main` at the inspected SHA. Existing workspace already selects `apps/*`, `modules/*`, `packages/*`; preserve one root lockfile.

## Deliverable and completion predicate

- Each selected package has a named build command: Core, Shell, Chat, and small contracts only if their own build is required.
- No default root `pnpm build` runs every workspace package.
- `pnpm --filter @smartaihub/saas-core build` remains package-only.
- Module manifest schema covers ID/version, route, hashed asset artifact, API route/contract version, capability needs, data authority, target and independent deploy/rollback metadata.
- Package dependencies do not include Legacy runtime, Express, another module's implementation or broad DB schema.
- A Chat build creates only Chat artifacts and does not build/restart Shell, Core or Legacy.

## Verification/evidence

Run package-manager workspace resolution and independent Core/package builds; capture selected package, output path, size, command and resource/time result. Validate manifest schema. Do not run root-wide build/test.

## Fallback, risks, and gaps

If Turbo insists on broad task traversal, use `--filter` in named scripts or package-local commands. Do not restore a root aggregate as convenience. Keep version compatibility explicit if the shared contracts package cannot be built independently in the current tooling. No app-specific feature behavior is in this section.

## Blocker challenge strategy

Inspect package graph and lockfile behavior first; use existing pnpm/Turbo rather than adding a new build system. Resolve only required dependency output edges and retain one lockfile.
