# Spec 208 Implementation Plan

**Goal:** Make Computer Use a step-scoped, governed capability layer with safe
semantic-first routing and verified fallback.

**Architecture:** A resolver builds a route graph from server-authoritative
capabilities and policy. Structured WebMCP/MCP is preferred, browser semantic
execution is next, and visual/local fallback is used only when eligible. Every
effect is previewed/approved/committed and verified through the existing Job,
Runner, browser-session and economic boundaries.

**Tech Stack:** TypeScript shared types/services/routes, existing browser
session models/flags, Runner Rust protocol, Vitest/Playwright and optional
Python protocol tests.

**Spec:** `specs/feature/208-hybrid-computer-use-dynamic-capability-routing/spec.md`

## Global Constraints

- No raw payment credentials or direct UI-based economic authorization.
- Policy denial is not a fallback condition.
- Feature 197 Runner and Spec 199 MCP remain canonical boundaries.
- Session/profile isolation, approval, verification and idempotency are required.
- Browser/desktop enablement is gated by provider and authenticated local proof.

## Review Focus

- A denied action must not silently downgrade to visual clicking.
- Stale DOM geometry/profile/session must fail closed.
- Duplicate click/submit must be idempotent.
- Login/CAPTCHA/credential requests must become explicit blockers.
- Effect completion must require verification, not transport ACK.

## Section 1: Capability contracts and route graph

Extend `workflowBrowserSessionNodeTypes.ts` and create a capability resolver
contract with route candidates, requirements, authorization, cost and reason
codes. Add server-authoritative readiness snapshots and tests for structured,
semantic, local and visual routes.

## Section 2: WebMCP and semantic browser execution

Implement discovery/annotation handling as hints, normalized action plans,
visibility/geometry/occlusion checks, preview/commit separation and outcome
verification. Preserve MCP auth/transport ownership. Tests cover stale target,
missing annotation, duplicate idempotency and verification mismatch.

## Section 3: Local browser and desktop Runner

Integrate existing browser-session/Runner controls for existing authenticated,
managed and cloud browser modes plus Windows/macOS/Linux accessibility routes.
Bind profile/session/runtime owner, claims, sequence and fence. Tests cover
cross-device target, rebind, auth-required, cancellation and stale owner.

## Section 4: Policy, economics and fallback

Require Spec 207 authorization for economic effects and explicit approval for
consequential actions. Keep policy denial separate from technical fallback;
classify auth, approval, reconcile and verification blockers. Test budget/deny,
preview cancellation, fallback eligibility and release on failure.

## Section 5: Operator/UI projection

Project route choice, capability readiness, preview/approval, live session,
verification and blocked/recovery states into the Spec 209 right inspector and
bottom run/debug drawer. Preserve mockup hierarchy and tokens. Add state,
responsive, accessibility, localization and browser evidence requirements.

## Section 6: Conformance and rollout

Add browser-family/provider matrix, security/session isolation tests, chaos for
disconnect/rebind/late event, feature-flag checks and authenticated browser
release gates. Do not enable production paths without local Runner/provider
certification and rollback evidence.

