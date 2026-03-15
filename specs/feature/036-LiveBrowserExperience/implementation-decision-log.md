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

## 2026-03-12 Post-Review Hardening

- section or step: launch credit reservation lifecycle
- options considered:
  - keep live-browser launch credits as an open reservation with no success settlement path
  - commit the reservation immediately after successful session creation and keep refund-on-failure behavior
- decision taken: commit reserved launch credits on successful create and refund them only on create failure
- mode used: auto (`smart_auto`)
- rationale: The existing implementation deducted credits up front but never settled the reservation after success, creating a silent accounting leak. Treating the launch reserve as consumed once the live session exists closes the leak without introducing a broader usage-metering system in this slice.

- section or step: controller stream token issuance authorization
- options considered:
  - continue allowing controller-scoped stream tokens whenever the caller can read the session
  - require an active controller lease owned by the caller before issuing a controller token
- decision taken: require an active caller-owned control lease for controller stream token issuance
- mode used: auto (`smart_auto`)
- rationale: The controller token carries elevated viewport authority. Issuing it without an active takeover lease would bypass the audited takeover path and weaken control-boundary guarantees.

- section or step: execution-intent continuity on live launch
- options considered:
  - keep `executionIntent` as an unused create-session field
  - translate `executionIntent.prompt` into the first queued agent command and preserve it across hydration
- decision taken: queue the initial agent command during create when `executionIntent` is present and persist the intent in session policy context
- mode used: auto (`smart_auto`)
- rationale: The UI advertises live mode as a continuation of the automation plan. If the create request drops the prompt, users land in an empty session that does not match the product contract.

- section or step: takeover authentication hardening
- options considered:
  - leave takeover protected only by the base authenticated session
  - require a recent authenticated session before the web gateway forwards controller elevation
  - mint a short-lived signed takeover proof after recent auth and require the authoritative Python manager to verify it before granting control
- decision taken: mint a short-lived signed takeover proof after recent auth and require Python manager verification before takeover succeeds
- mode used: auto (`smart_auto`)
- rationale: The repository does not yet have a reusable live-browser MFA challenge flow, but takeover is still a privileged action. A signed recent-auth proof closes the trust gap between Node and Python now while preserving a clean path to later MFA-backed or page-class-aware proof semantics.

- section or step: live-browser telemetry export and readiness publish alerting
- options considered:
  - keep live-browser telemetry isolated to Redis durability and ad hoc task logs
  - bridge counters and incidents into the shared observability helper and record publish-failure incidents during readiness snapshot publication
- decision taken: export telemetry through `library_observability` and emit explicit incidents when readiness snapshot publication fails or reports unready state
- mode used: auto (`smart_auto`)
- rationale: Durable Redis state alone is insufficient for rollout ownership. Bridging into the existing metrics/log path keeps the change additive while making failures visible to broader production observability tooling.

- section or step: takeover-blocked UX and readiness ownership metadata
- options considered:
  - leave takeover step-up failures visible only through transient toast errors and keep readiness snapshots ownership-opaque
  - surface an inline workspace notice for takeover re-auth failures and stamp readiness snapshots with publisher metadata
- decision taken: add inline takeover re-auth notice in the live workspace and stamp readiness snapshots with publisher metadata
- mode used: auto (`smart_auto`)
- rationale: Operators and users both need clearer ownership signals. Inline re-auth messaging reduces confusion during takeover retries, while publisher metadata makes the readiness signal easier to attribute during rollout incidents.

- section or step: readiness publisher silence detection
- options considered:
  - continue relying on the web gateway's blocked-entry behavior to infer missing readiness snapshots
  - add an independent Celery watchdog that checks the Redis readiness snapshot directly and emits incidents when it is missing, invalid, or stale
- decision taken: add an independent readiness watchdog task on the Python side and schedule it via Celery beat
- mode used: auto (`smart_auto`)
- rationale: Publisher silence is an operational failure mode, not just a web-consumer error. An independent watchdog makes the absence of snapshots observable even before a user hits the live entry path.

- section or step: page-aware takeover proof enforcement
- options considered:
  - keep takeover proof semantics fixed at `recent_sign_in` and defer all page-class-aware behavior until a future MFA project
  - enforce page sensitivity inside the authoritative Python manager now by requiring higher assurance for sensitive pages, even if the web tier cannot mint that stronger proof yet
- decision taken: persist inferred page sensitivity in runtime session projections and require `mfa` assurance for sensitive-page takeover in the Python manager
- mode used: auto (`smart_auto`)
- rationale: The session manager is the contract authority for takeover safety. Enforcing sensitivity-aware assurance there closes the last authorization gap immediately, while leaving the missing MFA proof issuer as a clearly bounded identity-layer follow-up rather than a policy ambiguity.

- section or step: live-browser MFA proof issuer completion
- options considered:
  - add a separate live-browser MFA challenge subsystem and UI flow
  - reuse the existing web-tier TOTP and recovery-code verification primitives to mint `mfa` takeover proofs only when the user explicitly supplies a code for sensitive takeover
- decision taken: reuse the existing TOTP/recovery-code verification stack inside the web gateway and add a scoped takeover code input in the live workspace
- mode used: auto (`smart_auto`)
- rationale: The repository already has proven MFA verification primitives and recovery-code handling. Reusing that path keeps takeover proof issuance aligned with the existing auth system while avoiding a parallel step-up subsystem for a single live-browser flow.

- section or step: readiness ownership metadata enforcement
- options considered:
  - keep owner/runbook/cadence details as rollout documentation and non-blocking snapshot annotations
  - make ownership metadata part of the readiness snapshot contract and fail both watchdog and web entry gating when it is absent
- decision taken: require owner, runbook, publisher, publish interval, and max-age metadata in the readiness contract and fail closed when any are missing
- mode used: auto (`smart_auto`)
- rationale: Operational ownership only becomes actionable when the same metadata travels with the readiness signal that gates rollout. Enforcing the metadata at both publication and consumption points prevents “healthy but ownerless” snapshots from silently keeping live entry enabled.

- section or step: readiness operational config source of truth
- options considered:
  - keep readiness publisher identity and cadence as task-level constants while validating only the emitted snapshot shape
  - move readiness ownership and cadence into validated application settings and drive Celery beat from the same settings-backed contract
- decision taken: move readiness ownership, runbook, and cadence to validated settings and have both the publisher and beat schedule consume that shared config
- mode used: auto (`smart_auto`)
- rationale: A snapshot contract is still incomplete if deploy-time values require code edits or can drift from the scheduler that is supposed to honor them. Using validated settings as the single source of truth closes the last placeholder-style operational gap in the feature slice.
- rationale: The repository already has user-scoped 2FA material and verification helpers. Reusing that path completes sensitive takeover end to end with the smallest secure diff, while keeping raw MFA codes out of the Python boundary and avoiding a parallel challenge system.
