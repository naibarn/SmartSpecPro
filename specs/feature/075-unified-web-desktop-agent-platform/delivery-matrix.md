# Delivery Matrix

## Purpose

This matrix turns Feature 075 into an execution-oriented checklist that implementers and leads can scan quickly.

## Workstream matrix

| Workstream | Primary outputs | Main code areas | Key blocker to resolve first |
|---|---|---|---|
| Device identity and policy | device registry, enrollment, refresh, disable/offboard flows | `drizzle/schema.ts`, server device services, desktop enrollment/policy bridge | no canonical desktop device model exists yet |
| Shared contracts and labels | desktop-host contracts, run-label matrix, trust vocabulary, feature flags | `apps/web/shared/*`, Tauri shared adapters, UI label helpers | desktop/web/worker vocabulary can drift without one source of truth |
| Package registry and trust | signed package manifests, revocation feed, compatibility checks, materializer | package registry services, signing/revocation services, Tauri package sync/materializer | no canonical desktop package lifecycle exists yet |
| Update trust chain | signed release metadata, updater verification, downgrade protection | server update metadata services, Tauri updater bridge | package signing alone does not secure the desktop binary/runtime chain |
| Local file intelligence | consented roots, indexing, previews, staged attachments | Tauri local file service/indexer, desktop UI, policy services | current file access is still raw absolute-path access |
| Workspace manager | managed mounts, egress classes, workspace profiles, writeback policy | Tauri workspace manager, Docker wrappers, audit sink | current Docker sandbox path is too permissive for managed mode |
| Pi runtime host | Pi adapter, gateway-only provider injection, host-controlled tools | Tauri Pi runtime host, desktop run router, shared runtime labels | no Pi integration exists yet |
| Agency Swarm and connectors | agency pack materialization, local orchestration runtime, connector runtime | Tauri agency runtime, connector runtime, secret store, package services | no desktop-local agency materializer/runtime exists yet |
| UX and handoff | unified badges, first-run bootstrap, cross-surface open/view flows | web client desktop-host features, Tauri-hosted workbench, run/package detail UI | product coherence fails if labels and flows diverge by surface |
| Security and governance | approval matrix, DLP hooks, audit, quarantine, offboarding cleanup | server policy/audit services, Tauri audit sink/secret store, document parser workers | current shell/file/docker primitives are stronger than current governance |

## Suggested execution slices

### Slice A: Foundation and trust

- device identity and policy
- shared contracts and labels
- package registry and trust
- update trust chain

### Slice B: Managed local substrate

- local file intelligence
- workspace manager
- approval/step-up policy model

### Slice C: Runtime unification

- Pi runtime host
- Agency Swarm and connector runtime
- runtime router and provenance labels

### Slice D: Product coherence and hardening

- UX and handoff
- security/governance
- offboarding and cleanup
- rollout/regression truthfulness

## Release blockers

Treat these as blockers before broad managed rollout:

1. Device enrollment and runtime tokens are still long-lived or not device-bound.
2. Desktop binary/update payloads are not signed and downgrade-protected.
3. Raw absolute-path file access remains reachable as the primary managed discovery flow.
4. Managed workspaces still allow ungoverned mounts or egress profiles.
5. Runtime labels can still over-claim `Local` when the flow is really `Hybrid`.
6. Local-unverified package outputs can still promote into shared verified surfaces without provenance or review.
7. The 004 localhost proxy path is still silently treated as canonical instead of compatibility-only.

## Ownership reminders

- Keep desktop-host contracts separate from worker-runtime contracts unless the same abstraction is genuinely shared.
- Keep Pi and Agency Swarm as internal Desktop Host runtime labels.
- Use `desktop_zeroclaw_managed` only when the desktop host needs worker-fabric projection compatibility.
