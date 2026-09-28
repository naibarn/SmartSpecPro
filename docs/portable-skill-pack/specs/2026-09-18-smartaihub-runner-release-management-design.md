# SmartAIHub Runner Release Management Design

**Date:** 2026-09-18
**Status:** Approved for implementation
**Primary spec:** `specs/feature/205-smartaihub-runner-cross-platform/spec.md`
**Related spec:** `specs/feature/204-cloudflare-container-runtime-control-plane/spec.md`

## Goal

Make SmartAIHub Runner buildable through a manual GitHub Actions workflow for
Windows x86_64, macOS Intel, macOS Apple Silicon and Linux x86_64, then expose
download, version check and safe update operations through SmartAIHub Dashboard
without requiring normal users to know the GitHub repository or workflow.

## Decisions

1. SmartAIHub is the public release surface. GitHub is an internal build and
   provenance source. Public API responses contain SmartAIHub download paths,
   not GitHub URLs.
2. Runner releases use a dedicated catalog and storage namespace. They do not
   reuse Worker App releases, Worker runtime packs or the existing Windows-only
   speaker-aware runner artifact table.
3. The workflow remains `workflow_dispatch` only. Build and GitHub Release
   publication are separate explicit manual choices; no push, PR, tag or
   schedule may publish a Runner release.
4. Each native release contains a user package plus a platform-specific raw
   update executable. The raw executable lets the running Runner perform a
   verified atomic replacement without requiring archive extraction libraries.
5. A local Runner update is a control-plane command. The server queues it,
   the Runner drains active work, verifies the signed artifact, replaces its
   executable with rollback protection, restarts and reports the result.
6. Shared Cloudflare Container updates are not local self-updates. Feature 204
   owns image/deployment rollout; Feature 205 publishes a versioned manifest
   and exposes rollout state only.

## Release flow

```text
Admin Dashboard
  -> SmartAIHub API
  -> manual workflow_dispatch
  -> native matrix + container manifest
  -> checksums/signature + optional GitHub Release
  -> SmartAIHub server-side sync and validation
  -> private object storage + runner release catalog
  -> Dashboard latest/download/update APIs
```

The sync step downloads release assets server-side, recomputes SHA-256, checks
the manifest/signature and persists only validated artifacts. A release is not
publicly selectable until every required asset for the requested target is
present and valid.

## Public and admin surfaces

### Dashboard user surface

The Dashboard contains one SmartAIHub Runner card, separate from Worker App:

- detect the browser platform/architecture and offer the matching package;
- show latest available version and the last check time;
- show registered local Runner nodes owned by the tenant with current version,
  profile, health and tool readiness;
- provide `ตรวจสอบเวอร์ชัน`, `ดาวน์โหลด Runner` and, when safe,
  `อัปเดต Runner`;
- show update states: checking, queued, downloading, verifying, draining,
  restarting, completed, offline, busy, permission required, verification
  failed and rollback completed;
- never render GitHub repository names, workflow URLs, tokens, executable
  paths, raw credentials or provider payloads.

### Admin release surface

The existing Desktop Release Console gains a Runner release section for:

- selecting version, target platform/profile, release notes and publish mode;
- dispatching the manual workflow;
- viewing build, sync and validation status;
- publishing or withdrawing a validated release;
- inspecting manifest, checksum, signature and source commit metadata;
- handing a shared-container manifest to the Feature 204 deployment path.

The repository and workflow configuration remain admin-only configuration.

## API contract

The implementation adds a versioned Runner release API with server-owned URLs:

- `GET /api/runner-releases` — public published catalog filtered by platform,
  architecture and channel;
- `GET /api/runner-releases/latest` — latest compatible package/update pair;
- `GET /api/runner-releases/:id/download` — same-origin streamed package;
- `GET /api/runners/:runnerId/update-commands/:commandId/download` —
  Runner-authenticated, command-bound streamed raw executable;
- admin-only build, sync, publish, withdraw and history endpoints;
- `GET /api/runners` — tenant-scoped registered Runner summaries for Dashboard;
- `POST /api/runners/:runnerId/update` — tenant-owner/admin request to queue an
  update, protected by session auth, runner ownership and release compatibility;
- Runner-authenticated command poll/ack endpoints using a dedicated
  `runner:update` scope and the existing local-device proof rules.

All mutating requests carry an idempotency key. Download responses set
`Content-Disposition`, `Content-Length` when available, `Accept-Ranges` where
supported, `Cache-Control: no-store` for mutable latest URLs and
`X-Content-Type-Options: nosniff`.

## Update safety

The Runner reports a version in its capability snapshot and heartbeat. The
server compares versions using the shared release version comparator and will
not queue an update when:

- the release is withdrawn, invalid, incompatible or unsigned when signature
  policy requires signing;
- the Runner is revoked, not owned by the tenant or already updating;
- an active job cannot be drained under the requested policy.

The Runner update state machine is:

```text
requested -> queued -> downloading -> verifying -> draining -> applying
          -> restarting -> confirmed
                         \-> rollback -> failed
```

The current executable is backed up before replacement. A startup health
confirmation deadline determines whether the new binary is retained; failure
restores the backup and reports a terminal rollback state. No update action
writes browser-local Runner state directly.

## GitHub Actions contract

The workflow must:

- accept ref, version, target, profile, publish/release choice, release notes,
  release identifier and signing mode;
- build the four native targets and the shared-container manifest;
- run focused Rust tests, formatting checks and package validation;
- emit deterministic package names, raw update binaries, manifest and
  SHA256SUMS;
- sign metadata when required and fail closed when required secrets are absent;
- upload review artifacts on every manual run;
- create/update a GitHub Release only when the explicit publish input is true;
- never deploy Cloudflare; Feature 204 receives the signed versioned manifest
  through its explicit deployment path.

## Cross-spec boundary

- Feature 205 owns the standalone Runner binary, native packaging, release
  catalog, local update protocol and user download/update projection.
- Feature 204 owns Cloudflare image build/deployment, instance lifecycle,
  autoscaling, rollout and rollback of shared Container Runner instances.
- Features 197, 198, 199 and 200 continue to own capability inventory,
  orchestration, external MCP upstreams, chat/control-plane presentation and
  Task Control step projection. This design only supplies typed Runner/release
  state to those owners.
- Worker App release workflows and package identities remain unchanged.

## Verification gates

- focused Rust tests and release-package tests;
- focused server route/service tests for catalog, sync, auth, idempotency,
  download headers and update state transitions;
- focused UI tests for version states, platform selection, redaction,
  accessibility and responsive rendering;
- static workflow tests proving `workflow_dispatch` is the only trigger and
  all four native targets are present;
- no repository-wide TypeScript type check;
- real GitHub/Cloudflare publication remains an operator-controlled external
  gate and must be reported separately from local/unit proof.
