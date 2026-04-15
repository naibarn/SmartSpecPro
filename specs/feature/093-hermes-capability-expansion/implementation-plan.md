# Implementation Plan

## Objective

Extend the existing Hermes runtime so it can be used as a richer personal agent experience without losing its general-purpose flexibility.

This feature should make Hermes easier to use for profiles, channels, memory/context sync, task specialization, and user-friendly progress visibility.

## Current-codebase fit

The base Hermes runtime already exists in the worker fabric, so the implementation should build on the current control-plane and UI surfaces instead of inventing a parallel agent system.

Likely extension points:

- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerCallbackService.ts`
- `apps/web/server/services/memoryService.ts`
- `apps/web/server/services/scopedMemoryService.ts`
- `apps/web/server/services/memoryArchiveService.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/components/orchestrator/*` if user-facing run summaries need to be shared with work streams

## Implementation approach

### 1. Persona and profile layer

Add a user-friendly persona/profile selection model on top of the existing Hermes runtime metadata.

The implementation should:

- present Hermes profiles as selectable personas or work identities
- keep the runtime generic when no profile is selected
- avoid turning persona selection into a new agent type
- preserve owner-bound and tenant-bound rules
- treat the worker registry and worker runtime metadata as the source of truth for persona/profile state
- render Teams and Admin Monitoring as read-only consumers of that state
- store persona/profile metadata under `capabilitiesJson.runtimeMetadata` on the worker record and project a read-only summary into UI models
- keep `profileName`, `profileLabel`, `profilePurpose`, and `activeStatusSummary` as the initial schema shape for this feature
- default missing persona/profile fields to generic Hermes values during read and backfill only safe display defaults during migration

### 2. Channel companion layer

Expand Hermes channel workflows so the product can show and manage external channel presence more clearly.

The implementation should:

- expose channel and webhook capability summaries in a human-readable form
- preserve the existing callback and audit boundary
- keep channel tokens and sessions upstream-owned unless explicitly represented as metadata
- allow the UI to explain what Hermes can do on each connected channel
- clear or invalidate stale channel metadata when a channel is disconnected, reauthorized, or transferred
- store channel capability state in worker runtime metadata and derive UI badges from the source record rather than cached screen state
- represent inactive channels explicitly so the UI can distinguish "not connected" from "connected but revoked"
- have worker callback service enforce immediate stop while worker registry marks the channel inactive

### 3. Opt-in memory and context sync layer

Introduce explicit opt-in paths for selected memory or context sync operations.

The implementation should:

- require tenant and user consent for sync behavior
- require only user consent for persona-scoped personal sync
- require tenant admin approval for team-shared, workspace-shared, or cross-channel sync
- scope sync to explicit memory sets, personas, or task contexts
- avoid automatic flattening of Hermes memories into SmartSpecPro canonical objects
- support reversible disablement, clear provenance, and immediate revocation of active sync use
- treat personal persona-scoped sync as strictly single-user and single-persona data
- quarantine or mark inactive any revoked synced context so it cannot be reused silently before re-authorization
- store sync policy and provenance in scoped-memory and archive services, with active/inactive state separated from audit history
- avoid destructive deletion on revoke unless a later retention policy or admin action explicitly removes the archived record
- let memory archive service or an admin retention job own any later cleanup, while UI and delegation layers only mark and quarantine state inactive

### 4. Task specialization layer

Add named work modes or specialization packs so Hermes can be used for common job categories without losing its generic fallback behavior.

The implementation should:

- map work modes to capability profiles and delegated scope profiles
- reuse existing scope profile names as the implementation target for modes
- keep the generic runtime path available when no mode is selected
- avoid hard-coding one role as the only supported Hermes use case
- allow future extension of new modes without changing the base runtime contract
- store task-mode selection in delegated session or runtime metadata so it can be inspected without a separate auth model
- model task modes as explicit session metadata layered on top of existing scope profiles, not as a new scheduler namespace
- keep missing task-mode fields on legacy sessions as generic fallback instead of inferring a mode from labels or routing history

### 5. Visibility and rollout layer

Improve progress reporting and operational summaries so non-technical users can understand what Hermes is doing.

The implementation should:

- add plain-language progress summaries to Teams and monitoring surfaces
- show persona, channel, memory-sync, and work-mode state clearly
- keep operator policy and runtime health visible in Admin Monitoring
- use feature flags or rollout gates so each enhancement can be enabled independently
- default new capability slices off unless they are purely presentational and low risk
- define rollout flags explicitly for:
  - persona/profile UX
  - channel/workflow expansion
  - memory/context sync
  - task modes and specialization
  - visibility summaries
- keep Admin Monitoring as the first place where operator detail is exposed, with Teams receiving only user-facing summaries
- for migrated Hermes workers, missing metadata must resolve to safe generic defaults until the backfill completes

## Risks and mitigations

- Risk: memory sync becomes too broad and feels like automatic import.
  - Mitigation: require explicit opt-in, tenant approval for shared scopes, and immediate revocation on disable.
- Risk: task specialization makes Hermes less flexible.
  - Mitigation: keep a generic fallback path and map modes onto existing delegated profiles.
- Risk: channel data becomes hard to audit.
  - Mitigation: keep SmartSpecPro as the policy and audit authority, and invalidate stale metadata on disconnect or transfer.
- Risk: UI grows technical again.
  - Mitigation: use simple summaries first, details second.

## Acceptance criteria

1. A user can understand and choose Hermes personas or profiles without needing to inspect raw metadata.
2. Hermes can present channel and webhook capability state in a clear, non-technical way.
3. Memory and context sync only happen when explicitly enabled and scoped.
4. Hermes can be used in multiple task modes while still keeping a generic fallback behavior.
5. Non-technical users can see Hermes progress and status in a way that helps them trust the system.
6. The new feature does not break the existing Hermes bridge, team binding, or delegation flow.
7. Revoking a channel or sync scope immediately stops future use and prevents stale state from being reused.

## Rollout notes

- Ship each capability behind its own gate where possible.
- Start with profile and visibility improvements, then add channel and task modes, then add opt-in memory sync.
- Keep the generic runtime path available throughout rollout.
- Suggested gate posture:
  - `hermesProfileExperience`: off until UI is ready
  - `hermesChannelWorkflowExpansion`: off until revoke/reauth behavior is implemented
  - `hermesMemoryContextSync`: off until approval and quarantine semantics are complete
  - `hermesTaskModes`: on per mode, not a global always-on switch
  - `hermesVisibilitySummaries`: on for admins first, then broader rollout

## 6. Future Hermes-to-Work-OS integration

This is a follow-on roadmap item, not part of the first five Hermes slices.

It should only begin once Feature 082 is available and the team wants Hermes to create or update canonical work items on behalf of the user.

The implementation order should be:

1. define intent-to-work mappings and triage fallback
2. add a thin adapter that calls Feature 082 APIs only
3. project canonical Work OS status back into Hermes surfaces
4. preserve canonical ownership and fail-closed routing
5. add regression coverage for tenant isolation, actor attribution, and no-parallel-state guarantees

Recommended files for the follow-on work:

- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerCallbackService.ts`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/routers/teamWorkItem.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`

Feature 093 should continue to treat Work OS as an external canonical layer:

- do not add a Hermes-owned queue or case store
- do not infer ownership when the target is ambiguous
- route unsafe actions to triage
- keep tenant isolation and audit attribution enforced by the Work OS boundary
