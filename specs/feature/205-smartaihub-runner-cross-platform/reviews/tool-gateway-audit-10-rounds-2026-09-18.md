# Runner External Tool Gateway Audit — 10 Rounds

**Date:** 2026-09-18
**Scope:** Feature 205 known-tool discovery/registration and its boundaries
with Features 197, 199, 200 and 204
**Result:** 10/10 audit lenses pass after the contract/spec updates in this
review. Runtime implementation remains a documented follow-up gate.

## Decision

The Runner is the SmartAIHub-controlled gateway for work that SmartAIHub
dispatches to an approved local or shared runtime. The known catalog covers
Claude Code/CLI, Codex CLI, DeepSeek Harness, Google Antigravity, Hermes
CLI/Agents and OpenClaw-compatible runtimes, as well as approved media,
browser, desktop, local-AI and local-MCP tools.

“Scan all tools” is intentionally bounded to tools SmartAIHub knows how to
identify and safely probe. A binary merely appearing in PATH is metadata-only;
it cannot become executable or ready without an approved adapter, manifest or
generic CLI profile. The Runner also does not claim to intercept private
internal tool/MCP calls made by an external agent unless the selected adapter
explicitly exposes that surface.

## Ten audit rounds

| Round | Audit lens | Evidence and invariant | Result |
|---:|---|---|---|
| 01 | Catalog completeness | Six initial external-agent families plus approved non-agent tool classes are listed in Spec 205 and Feature 200. | PASS |
| 02 | Codebase contract fit | `runnerContracts.ts` retains legacy `capabilities` and adds additive `toolInventory`/`capabilityInventory` validation without changing Worker routes. | PASS |
| 03 | Discovery safety | PATH, known locations, bundles/package metadata, manifests and approved MCP metadata are bounded; unknown candidates remain metadata-only. | PASS |
| 04 | Readiness truth | Install, configuration, auth, health, availability, trust and policy decisions are separate; `ready` requires adapter/probe/dependency evidence. | PASS |
| 05 | Registration semantics | One redacted snapshot has revision/expiry, idempotency, accepted/rejected reason codes and stale/tombstone behavior; a tool is not a Runner. | PASS |
| 06 | Gateway boundary | Runner owns SmartAIHub-dispatched process launch/control/cancel/evidence, while Feature 200 owns provider task/session/event/result semantics. | PASS |
| 07 | MCP boundary | Feature 199 remains the only upstream MCP lifecycle/transport/grant owner; Runner consumes approved grants and cannot use arbitrary upstream URLs. | PASS |
| 08 | Cloudflare boundary | Feature 204 owns image/pool/lifecycle/cost; shared Containers scan only pinned image allowlists and never expose host-user tools. | PASS |
| 09 | Scheduling/UI projection | Feature 196/197 policy resolves capability fit; Feature 200/198 Task Control shows safe tool/adapter/readiness state without paths or secrets. | PASS |
| 10 | Delivery/evidence | Focused contract tests pass; actual `apps/runner-app`, gateway routes and manual release workflow are explicitly unimplemented gates, not falsely marked complete. | PASS |

## Contract changes made

- Added typed additive inventory entries to `runnerContracts.ts` for tool kind,
  adapter identity, discovery source, install/configuration/auth/health/
  availability/trust state, fingerprint, expiry and safe reason codes.
- Added derived capability inventory for control/resource profile,
  concurrency, confidence, policy decision and expiry.
- Added validation for duplicate IDs, timestamp windows, confidence bounds,
  bounded arrays and impossible `ready` claims.
- Added the exact capability publication request/response semantics to Spec
  205 and its deep-plan/section artifacts.
- Aligned Feature 200 provider selection/disconnect/catalog language and
  Feature 204 shared-image behavior with the six-family Runner catalog.

## Remaining implementation gates

The audit does not claim that the full gateway exists. The next implementation
work must still create the standalone Runner package, backend Runner routes,
scanner/probe adapters, durable registry projection and manual-only GitHub
release workflow. It must reuse canonical `worker_jobs` plus outbox and the
existing Worker auth invariants without reusing Worker endpoints or tokens.

## Verification

- Focused `npm --workspace apps/web test -- server/services/__tests__/runnerContracts.test.ts`: 6 passed.
- `check-sections.py`: complete, 9/9 sections.
- `check-ui-contracts.py`: passed.
- Whole-repository TypeScript typecheck: intentionally not run because of the
  repository RAM constraint.
