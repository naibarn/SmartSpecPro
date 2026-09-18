# Section 08 — Manual GitHub Native and Container Release

## Goal

Build and package the standalone Runner for four native targets plus the
Cloudflare Container artifact using an explicitly manual GitHub workflow,
without changing Worker App release automation or deploying implicitly.

## Ownership and file boundary

Create .github/workflows/runner-release.yml and, if needed, focused workflow
validation under .github/workflows/tests or a small script near existing
workflow checks. Inspect desktop-release.yml and
worker-app-macos-release.yml but do not repurpose or edit them.

The workflow builds Feature 205 artifacts. Feature 204 remains the only
deployment owner for the Cloudflare Container application, rollout,
autoscaling and instance policy.

## Required workflow

The only trigger is workflow_dispatch. Required manual inputs are git
ref/commit, Runner version, platform, profile (local, shared-container or all),
artifact-only versus GitHub release, release notes/release identifier and
signing mode or required-secret availability.
An artifact-only run MAY use `unsigned-review`; a run with `publish=true` MUST
use `required-secret` and fail closed before creating a GitHub Release when the
signing secret is unavailable.

The local matrix is:

- x86_64-pc-windows-msvc;
- x86_64-apple-darwin;
- aarch64-apple-darwin;
- x86_64-unknown-linux-gnu.

The shared Container job emits a deterministic image/package manifest,
entrypoint/profile/resource metadata, source commit, protocol version and
image digest where available. Artifact generation may upload for operator
review. Publishing and GitHub release creation occur only when requested by
manual input. Feature 204 deployment requires a separate explicit invocation
and must not be hidden inside a push/PR job.

All jobs run focused Runner Cargo/protocol/security/package tests, produce
deterministic names, SHA-256 checksums and signed metadata when configured,
and fail closed when required signing/provenance inputs are missing. Secrets
must be referenced through GitHub secret contexts and never printed.

## TDD/static checks

Write a YAML/static test before adding the workflow that:

1. Parses the workflow and asserts workflow_dispatch is the only event.
2. Rejects push, pull_request, schedule, tag, release, workflow_call and
   dependency-update triggers.
3. Checks all four native targets and shared Container profile inputs.
4. Checks artifact-only/publish branches and explicit Feature 204 handoff.
5. Checks manifest/checksum/source/contract fields and redacted secret use.
6. Confirms Worker App workflow files are byte/semantic unchanged.

Add a local dry-run fixture for matrix resolution and artifact naming. Do not
execute a real publish from a test and do not run whole-repository typecheck.

## Implementation steps

1. Add the static policy test and target/profile fixture.
2. Add manual workflow dispatch inputs and matrix resolution.
3. Add native Cargo builds and focused tests.
4. Add Container artifact/image manifest generation without deployment.
5. Add checksums, signing/provenance gates and upload/release branches.
6. Verify diff isolation against Worker workflows and record operator handoff.

## Acceptance and dependencies

Depends on sections 01, 03 and 06. It is complete when a workflow parser and
manual dry run prove no automatic trigger, all requested artifacts have
deterministic metadata, publication/deployment are explicit, and Worker
release workflows are unchanged.

## UI/UX Contract

### Target User / JTBD

N/A for this section: it implements a non-visual contract/runtime boundary.
The user-facing projection is specified in section 07.

### Surface Inventory

N/A; no browser surface is created or changed here.

### Component Map

N/A; this section exposes protocol/runtime contracts consumed by section 07.

### State Matrix

N/A for direct UI. Runtime states are exposed as typed status data to section 07.

### Responsive Matrix

N/A; no layout or viewport behavior is implemented here.

### Accessibility Acceptance

N/A for the non-visual layer. Any status exposed to UI must remain semantic and
localized by section 07.

### Copy Contract

N/A; no user-facing copy is introduced in this section.

### Browser Evidence Required

N/A for direct implementation. Section 07 must prove the corresponding
projection and redaction behavior.
