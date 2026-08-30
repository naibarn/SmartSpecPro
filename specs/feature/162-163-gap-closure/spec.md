# Feature 162/163 Gap Closure Implementation Spec

This is the implementation spec for the approved design at
`docs/portable-skill-pack/specs/2026-08-25-feature-162-163-gap-closure-design.md`.
It closes the remaining static implementation gaps without deleting legacy
artifacts or replacing the existing provider video route.

## Current runtime posture (2026-08-26)

HyperFrames is a legacy/optional renderer lane and is not a prerequisite for
Feature 162/163 media work. The current Worker-first path uses the selected
native or Managed WSL FFmpeg/FFprobe toolchain for local inventory, analysis,
preprocessing, QC, and derived-artifact upload. Shot-video generation uses the
negotiated ComfyUI MCP lane only when its live tool and workflow capability
probe passes. HyperFrames references may remain for backward compatibility and
can be re-enabled as a separate renderer capability when that runtime becomes
production-ready again.

Runtime updates must select binaries through the Worker settings/runtime
resolver, verify both FFmpeg and FFprobe before advertising local media
capability, and replace installed packs transactionally so a failed update
restores the previous working pack. A configured MCP executable alone is not
evidence of shot-generation readiness.

## Required outcomes

1. Worker Series access resolves durable owner/group/tenant policy fail-closed,
   returns capability-scoped safe projections, and persists complete binding
   metadata with additive migration/FK/invariant coverage.
2. Admin workflow policies and a versioned workflow registry support defaults,
   allowlists, lock/override, capability requirements, audit, stale immutable
   resolutions, and a server mutation that admits shot-video jobs from a
   storyboard shot.
3. MCP negotiation checks protocol, required tool schema, workflow IDs and
   capabilities; job execution correlates remote IDs, recovers/reconciles, and
   publishes only verified derived output.
4. Local Worker media analysis supports bounded inventory/probe, silence,
   black/frozen/blur/scene evidence, subject-focus candidates, batch plans,
   deterministic processing, QC, and source immutability.
5. The nine-shot storyboard exposes a compact generated-shot inspector with
   start frame, ordered references, mode, workflow resolution, duration,
   progress/QC/retry/cancel states, and real Worker dispatch while preserving
   the existing provider route separately.
6. Worker App has canonical sidebar screens for overview, series/binding,
   media workspace, queue, published, AI/workflows, runtime/GPU,
   connection/access, and settings; old tab IDs remain aliases.

## Invariants

- Server derives tenant/user authority from Worker pairing and current policy;
  request body identity fields are non-authoritative.
- Source bytes and absolute local paths stay on the Worker until derived
  artifact publication.
- Jobs pin Series, binding revision, shot revision, policy revision, workflow
  resolution, and idempotency key.
- Missing access, capability, schema, workflow, checksum, QC, or revision
  evidence blocks work instead of silently falling back.
- Existing B-roll/provider artifacts and legacy Worker routes remain readable.
- Schema changes are additive and conductor-owned; no destructive migration or
  production restart/deploy is part of local implementation.
- HyperFrames readiness is not used as the admission gate for local media
  ingest/preprocessing; its compatibility surface is retained only as an
  optional legacy lane.

## Verification

Use TDD-focused shared/server/UI tests, Rust tests, Web/Worker typechecks,
schema/journal checks, and browser/native checks where the environment allows.
Run at least five review rounds plus two clean convergence rounds after the
last implementation fix. Separate static proof from live ComfyUI/MiniMax,
GPU, R2, vector-provider, packaged-Tauri, browser, and production evidence.
