# Implementation Decision Log

## 2026-03-11 Preflight

- section or step: preflight / repo state
- options considered:
  - stop because the current branch is `main`
  - continue while isolating work to feature 036 and touched implementation files
- decision taken: continue with isolated additive changes
- mode used: auto (`smart_auto`)
- rationale: The user explicitly invoked `deep-implement`, the workflow does not require history rewriting, and the current dirty tree does not yet show direct overlap with the new live-browser artifacts beyond ordinary repository churn.

- section or step: section-01 foundation scope
- options considered:
  - start with runtime scaffolding before contracts
  - start with additive schema, shared contracts, and parity fixtures
- decision taken: implement schema/contracts/tests first
- mode used: auto (`smart_auto`)
- rationale: Section 01 is the dependency root for later sections. Locking enums, payload schemas, and durable table shapes first minimizes downstream drift across web and Python layers.

- section or step: section-01 web test wiring
- options considered:
  - keep the new Drizzle schema test outside the default Vitest include set
  - widen the existing Drizzle include glob to cover nested test files
- decision taken: widen the Vitest include pattern to `drizzle/**/*.test.ts`
- mode used: auto (`smart_auto`)
- rationale: The repository already keeps some Drizzle tests under `drizzle/__tests__`. Expanding the include pattern keeps the new schema test runnable through the standard web test entry point instead of depending on a one-off invocation.

- section or step: section-02 runtime slice boundary
- options considered:
  - wire a durable DB-backed runtime through the currently dirty Python service/router areas in this turn
  - add an isolated authoritative manager with tested CAS, idempotency, lease, recovery, and single-writer behavior first
- decision taken: implement the isolated manager first and record durable persistence wiring as a blocked follow-up
- mode used: auto (`smart_auto`)
- rationale: The Python service tree already contains substantial unrelated changes. An isolated manager module moves the core state machine forward without entangling this run with broader runtime/router churn, while keeping the remaining durability gap explicit.

## 2026-03-12 Section 02 Completion

- section or step: section-02 durable store completion
- options considered:
  - keep the authoritative manager process-local and defer all persistence until the API layer is ready
  - add durable SQLAlchemy-backed session, event, idempotency, and runtime-owner persistence now while keeping API wiring for later sections
- decision taken: add the durable SQLAlchemy-backed store and runtime-owner claim columns now
- mode used: auto (`smart_auto`)
- rationale: This closes the core section-02 durability gap without entangling the work with later gateway routing or wider Python service churn.

- section or step: section-02 cross-instance event identity
- options considered:
  - keep per-process incrementing event identifiers
  - switch live-browser events to globally unique IDs and cursors
- decision taken: use globally unique event IDs and cursors
- mode used: auto (`smart_auto`)
- rationale: Per-process counters collide during failover or multi-instance recovery. Opaque unique identifiers preserve replayability without assuming a single in-memory counter.

- section or step: section-03 provider boundary
- options considered:
  - wait for a real managed-provider SDK/client before defining the adapter
  - define the strict transport contract now with a deterministic in-memory managed backend
- decision taken: define the adapter boundary now and back it with an in-memory managed backend for tests
- mode used: auto (`smart_auto`)
- rationale: Section 03 is about locking the transport contract and failure semantics. Delaying that boundary until real provider wiring would push contract drift into section 04.

- section or step: section-03 readiness semantics
- options considered:
  - treat readiness as health-only and let missing capabilities fail later at session creation time
  - include missing required capabilities directly in readiness failures
- decision taken: readiness includes missing required capabilities
- mode used: auto (`smart_auto`)
- rationale: The release gate needs to block proactively when the provider cannot satisfy Phase 1 transport requirements, not only after a user starts a live session.

## 2026-03-12 Section 04 Gateway Integration

- section or step: section-04 live feature gate shape
- options considered:
  - reuse the existing `automationCopilot` feature flag and release gate for live mode
  - add a dedicated `liveBrowser` tenant flag and release-control surface while keeping browser-policy checks shared
- decision taken: add a dedicated `liveBrowser` feature flag and release-control surface
- mode used: auto (`smart_auto`)
- rationale: Live browser rollout needs independent enablement from blind automation so tenants can keep Copilot available while live mode remains gated behind its own release readiness checks.

- section or step: section-04 stream token issuance
- options considered:
  - wait for the real managed-provider credential exchange before exposing any gateway token path
  - issue short-lived, session-scoped Node JWTs now after validating session access through the Python-backed session lookup
- decision taken: issue Node-signed session-bound stream tokens now
- mode used: auto (`smart_auto`)
- rationale: Section 04 needs a concrete frontend-safe token surface immediately, and the gateway is the correct place to keep short-lived user-facing stream credentials without leaking broader provider secrets.

- section or step: section-04 rate-limit implementation
- options considered:
  - block until Redis-backed distributed rate limiting is introduced for live-browser endpoints
  - use the repository’s existing in-memory web-tier rate-limit pattern for the first gateway slice and record Redis promotion as a follow-up
- decision taken: use process-local rate limiting for the first gateway slice
- mode used: auto (`smart_auto`)
- rationale: This keeps the section scoped to the gateway contract and current repository conventions while still failing closed on burst traffic. Distributed hardening remains explicit for later rollout work.

## 2026-03-12 Section 05 Orchestration

- section or step: section-05 pending-human-input command gating
- options considered:
  - let the generic `waiting_for_human` state gate reject all queued commands first
  - surface explicit pending-approval/assist blocking for agent-owned commands before the generic state gate
- decision taken: prioritize the explicit pending-human-input gate for agent-owned commands
- mode used: auto (`smart_auto`)
- rationale: Section 05 requires approval and assist orchestration failures to be explicit and auditable. Preserving a distinct error path makes the contract deterministic and avoids conflating human-blocked work with unrelated invalid session states.

## 2026-03-12 Section 06 Frontend Workspace

- section or step: section-06 live workspace delivery shape
- options considered:
  - block on a dedicated route-backed live workspace before exposing any client live-mode path
  - ship the first workspace slice inline inside `AutomationChatModal` while keeping it session-backed and explicitly non-fallback
- decision taken: deliver the first live workspace slice inline in the existing modal
- mode used: auto (`smart_auto`)
- rationale: The plan requires live mode to extend the current automation entry flow. Keeping the first client slice in the modal minimizes integration churn while still proving the live-session launch path, state model, and interaction rails.

- section or step: section-06 live refresh strategy
- options considered:
  - wait for full event-stream hydration before rendering any live workspace state
  - use polling-backed session and event refresh with explicit reconnect messaging for the first client slice
- decision taken: use polling-backed refresh first
- mode used: auto (`smart_auto`)
- rationale: This keeps the workspace explicit and testable now without inventing a half-wired transport layer. The UI still fails closed and surfaces reconnect state instead of pretending the stream is healthy.

## 2026-03-12 Section 07 Observability And Rollout

- section or step: section-07 live entry readiness gate
- options considered:
  - wait for the full Python live-browser API surface to expose active readiness probes before blocking entry
  - add a gateway-side create-session readiness gate now that consumes an operational readiness snapshot and fails before credits or provisioning start
- decision taken: add the gateway-side create-session readiness gate now
- mode used: auto (`smart_auto`)
- rationale: The feature still lacks the broader Python live-browser API surface, but rollout safety needs an explicit entry block immediately. A snapshot-backed gate keeps create-session fail-closed without expanding this section into unrelated endpoint wiring.

- section or step: section-07 maintenance and telemetry shape
- options considered:
  - build new cleanup state machines separate from the live-session manager
  - wrap the existing session-manager cleanup primitives with a thin maintenance and telemetry layer
- decision taken: wrap the existing cleanup primitives with observability helpers
- mode used: auto (`smart_auto`)
- rationale: The session manager already owns authoritative expiry behavior. Reusing those primitives keeps section 07 additive, reduces drift risk, and still gives rollout hooks for metrics and incidents.

## 2026-03-12 Finalization

- section or step: post-implementation security re-review action
- options considered:
  - `fix_now` for the remaining rollout and telemetry gaps
  - `plan_now` for a dedicated hardening follow-up plan
  - `defer` because only low-severity operational follow-ups remain
- decision taken: `defer`
- mode used: auto (`smart_auto`)
- rationale: The refreshed verification pass stayed green across web and Python live-browser suites, and the security re-review still shows only low-severity rollout-readiness and telemetry-durability follow-ups that would expand scope beyond this implementation slice.

## 2026-03-12 Gap Closure

- section or step: backend live-browser runtime surface
- options considered:
  - keep the Node gateway pointed at unimplemented Python endpoints and defer the authoritative API surface
  - add the missing FastAPI router, runtime singleton wiring, and contract-preserving error mapping now
- decision taken: add the Python live-browser API router and runtime wiring now
- mode used: auto (`smart_auto`)
- rationale: The gateway contract was already present in the web tier. Leaving the Python surface absent would make the feature structurally incomplete despite green unit slices elsewhere.

- section or step: readiness snapshot failure behavior
- options considered:
  - continue treating missing or malformed readiness snapshots as implicitly ready
  - fail closed when the Redis snapshot is missing, invalid, or stale
- decision taken: fail closed on missing, invalid, or stale readiness snapshots
- mode used: auto (`smart_auto`)
- rationale: Rollout safety requires the live entry gate to stop before credits or provisioning start whenever readiness infrastructure is unhealthy or absent.

- section or step: maintenance and telemetry durability
- options considered:
  - keep maintenance as manually invoked helpers with process-local counters only
  - wire maintenance into Celery beat and persist telemetry into Redis while keeping the production alert bridge separate
- decision taken: schedule maintenance through Celery beat and add a Redis-backed telemetry sink now
- mode used: auto (`smart_auto`)
- rationale: This closes the real production gap around unattended cleanup and restart-safe observability without expanding scope into a full metrics-platform integration project.

- section or step: frontend resume delivery
- options considered:
  - keep live mode resumable only inside an already-open modal instance
  - add a route-backed resume path that rehydrates observer-mode access on page load
- decision taken: add `/automation/live/:sessionId` route-backed resume
- mode used: auto (`smart_auto`)
- rationale: The inline workspace can stay in the existing modal for now, but users still need a recoverable entrypoint after refresh or direct navigation.
