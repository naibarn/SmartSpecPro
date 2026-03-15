# Decision Log

## 2026-03-12

### Step 4 - Planning Session Setup

- Options considered: continue inside Feature 036, create a new cross-surface planning feature
- Decision: create a new planning feature folder, `042-LiveBrowser-Cross-Surface-Integration`
- Mode used: auto
- Rationale: Feature 036 already represents the dedicated live-browser implementation slice. The remaining work is a broader integration program spanning Chat, Agency Swarm, and Virtual Workflow.

### Step 5 - Decision Style

- Options considered: `ask_every_choice`, `smart_auto`, `auto_by_default`
- Decision: `smart_auto`
- Mode used: auto
- Rationale: the user requested a full planning pass, but the plan should still highlight high-risk areas explicitly.

### Step 7 - Web Research

- Options considered: run external web research, skip external web research for this pass
- Decision: skip external web research
- Mode used: auto
- Rationale: this planning pass is primarily about aligning with the current SmartSpecPro codebase and existing feature contracts. Codebase recon provided enough information to produce an actionable integration plan.

### Step 11 - Architecture Lock

- Options considered: leave key integration decisions open, lock the highest-impact architectural choices in the plan
- Decision: lock the main decisions in the plan
- Mode used: auto
- Rationale: implementation would otherwise churn around three unresolved choices that directly affect Chat, Agency, and Workflow design.

Locked decisions:
- Chat uses the existing full-page Browser Session route with origin-aware return metadata
- Agency uses a dedicated `browser_session` primitive instead of overloading `skill_call`
- Workflow adds an additive browser-session node family while preserving legacy `web_automation`

### Step 11 - Rollout And Compatibility Hardening

- Options considered: keep rollout and compatibility guidance high-level, expand them into concrete plan requirements
- Decision: expand them into concrete requirements
- Mode used: auto
- Rationale: the cross-surface nature of the feature makes per-surface flags, compatibility adapters, observability, and compact-layout rules necessary for safe execution.

### Step 11 - Feature Flag And Analytics Anchoring

- Options considered: describe flags and telemetry abstractly, anchor them to existing codebase patterns
- Decision: anchor them to existing tenant flag and analytics patterns
- Mode used: auto
- Rationale: execution quality improves when the plan points to the actual feature flag and analytics infrastructure already used in the codebase.

Anchored choices:
- Rollout flags extend `apps/web/shared/featureFlags.ts` and existing tenant flag services
- Client-side Browser Session analytics should follow the PostHog helper pattern under `apps/web/client/src/lib/analytics/`
- Server-side signals should reuse existing metrics or structured-log conventions rather than inventing a new telemetry stack

### Step 11 - Final Completeness Hardening

- Options considered: stop at abstract observability and workflow contracts, or lock concrete payload and branching baselines
- Decision: lock concrete payload and branching baselines
- Mode used: auto
- Rationale: this removes the last sources of medium-risk interpretation drift before implementation begins.

Locked additions:
- required default Browser Session status copy
- client analytics payload baselines
- low-cardinality metric label guidance
- workflow branch-oriented output fields and allowed baseline values

### Step 11 - Optional Infra Follow-Up Packaging

- Options considered: leave environment-specific ops work out of the feature plan, or add optional infra defaults without expanding core scope
- Decision: add optional infra defaults
- Mode used: auto
- Rationale: these items are low-risk and help the operations follow-up start immediately after implementation without forcing them into the core delivery path.

Optional defaults added:
- starting alert thresholds
- dashboard or saved-query slices
- alert routing suggestions
- runbook ownership direction

### Step 11 - Advanced Automation Follow-Up Uplift

- Options considered: leave advanced automation gaps as post-plan notes, or integrate them into the canonical feature plan
- Decision: integrate them into the canonical feature plan as follow-up sections and spec deltas
- Mode used: auto
- Rationale: the user explicitly asked for planning of all recommended additions, and the missing areas affect architecture, runtime behavior, and safety semantics enough that they should live inside the tracked plan artifacts.

Locked additions:
- executable Agency runtime path for `browser_session`
- rendered browser stream in Browser Session workspace
- conversation-native Browser Session invocation from Chat and Agency
- structured comparison contracts for research and booking-style tasks
- explicit captcha, login, payment review, and booking confirmation barrier types
- scenario-driven advanced rollout validation
