# Section 3 — macOS packaging, runtime and CI

## Ownership boundary

Own native Apple Silicon build, DMG packaging, HyperFrames runtime pack, signing/notarization hooks, artifact validation, and release workflow. Do not alter Dashboard product copy beyond data contract needs.

## Target files

- `apps/worker-app/scripts/package-macos-release.mjs`
- `apps/worker-app/scripts/package-macos-runtime.mjs`
- `apps/worker-app/package.json`
- `apps/worker-app/MAC_BUILD.md`
- `apps/worker-app/MAC_RUNTIME_BUILD.md`
- `.github/workflows/worker-app-macos-release.yml` or separated matrix lane
- runtime release route/service tests

## TDD/release checks

- dry-run rejects wrong target and wrong artifact names
- manifest lists version, target, hashes and provenance
- Mach-O/Sharp/Chrome/ffmpeg checks run on macOS
- DMG mounts and installs into a clean temporary location
- codesign verification is mandatory when signing is configured; unsigned builds remain non-production

## Acceptance checks

Published Mac latest is a native DMG with the same release identity as the tested app, and `hyperframes-macos-arm64` manifest is 200/allowed and installable.

## Risks/coordination

Requires Apple Silicon runner and secrets for signing/notarization. Keep prior artifacts for rollback and never overwrite Windows release files.

## UI/UX Contract

### Target User / JTBD

Indirect: publish artifacts whose metadata lets users receive a correct Mac install/update experience.

### Surface Inventory

No direct UI; release catalog and runtime manifest are consumed by Dashboard and Worker App status surfaces.

### Component Map

No new component. Produce native DMG and runtime metadata with stable names, target, version, hash, and readiness.

### State Matrix

Build pending, unsigned, signed, notarized, published, runtime unavailable, and rollback candidate.

### Responsive Matrix

No layout change; file names and release notes must be safe for existing wrapping cards.

### Accessibility Acceptance

Downstream UI must announce artifact readiness and failures as text; packaging itself has no DOM surface.

### Copy Contract

Expose enough metadata for localized labels such as Native DMG, Apple Silicon, unsigned build, and runtime not published.

### Browser Evidence Required

Section 4 verifies catalog states in browser fixtures; this section requires CI artifact and install evidence on Apple Silicon.

## Implementation status

Implemented the Apple Silicon DMG packager, `release:mac` workspace command, and
manual macOS CI workflow. The packager enforces Darwin arm64, creates the
canonical `smart-ai-hub-worker-app-<version>-arm64-setup.dmg`, and keeps native
HyperFrames runtime publication separate. Dry-run and syntax checks pass; actual
build, signing, notarization, and clean-machine install remain Apple Silicon
release gates.
