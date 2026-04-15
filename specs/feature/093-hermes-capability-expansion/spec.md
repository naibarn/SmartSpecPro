# 093 - Hermes Capability and Experience Expansion

Version: 1.0
Date: 2026-04-14
Status: Proposed
Depends-on: 077-distributed-worker-fabric-completion, 081-hermes-agent-runtime-gateway-and-channel-interop
Audience: Product, Runtime, Teams, Web Control Plane, Security, Admin, QA

---

## 1. Executive summary

Feature 081 gets Hermes connected.
Feature 093 makes Hermes feel like a strong, practical product for everyday work.

This feature expands Hermes in five user-facing directions:

- easier profile and persona selection
- clearer channel and webhook workflows
- opt-in memory and context sync
- named task modes and specialization
- better progress visibility for non-technical users

The key product rule is that Hermes must remain flexible.
These improvements should add useful layers on top of the existing Hermes bridge, not replace it with a single-purpose runtime.

The product outcome is:

- a richer personal agent experience
- better day-to-day usability for teams
- clearer operational understanding
- preserved runtime truthfulness and fail-closed behavior

---

## 2. Problem statement

Hermes is already connected to SmartSpecPro as an external runtime.
That makes Hermes available, but not yet fully pleasant or expressive for normal users.

The current experience still leaves five gaps:

1. profiles and personas are not yet surfaced in a user-friendly way
2. channels and webhooks are available as capability metadata, but not yet shaped into a practical workflow experience
3. memory and context remain upstream-owned by default, which keeps the system safe but limits continuity
4. task specialization is possible, but not yet packaged into obvious work modes
5. progress reporting is still too ops-oriented for non-technical users

This feature closes those gaps without changing Hermes into a narrow runtime.

---

## 3. Goals

1. Make Hermes profiles and personas easier to choose and understand.
2. Expand Hermes channel and webhook workflows into a clear product surface.
3. Add opt-in memory and context sync for approved scopes.
4. Provide named task modes and specialization packs while preserving generic fallback behavior.
5. Improve visibility so users can see what Hermes is doing in plain language.
6. Keep Hermes external, flexible, and capability-driven.

---

## 4. Non-goals

1. This feature does not replace the base Hermes bridge from Feature 081.
2. This feature does not make Hermes a Desktop Host runtime.
3. This feature does not automatically import all Hermes memories, profiles, or tokens.
4. This feature does not hard-code Hermes into one role or one job class.
5. This feature does not remove existing worker fabric or team binding behavior.
6. This feature does not introduce a second work-item or queue model; if Hermes is later used for intake, case, task, or queue operations, it must align with Feature 082 rather than create parallel work state.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/shared/workerRuntime.ts` | Hermes runtime identity and metadata already exist | Add persona, mode, and richer progress metadata |
| `apps/web/server/services/workerDelegationService.ts` | Delegated sessions already use scope profiles and route families | Map task specialization to understandable work modes |
| `apps/web/server/services/teamService.ts` and `apps/web/client/src/pages/Teams.tsx` | Hermes already appears as a bindable external worker | Make persona and channel state easier to understand |
| `apps/web/server/services/memoryService.ts` and related services | Memory primitives already exist | Add opt-in context sync instead of default import |
| `apps/web/client/src/pages/AdminMonitoring.tsx` | Ops view already exposes Hermes state | Add plain-language progress and capability summaries |

This feature extends the current Hermes lane rather than creating a second agent system.

Work OS alignment note:

- Feature 093 intentionally stays above the Work OS layer and does not define its own case, task, approval, or queue semantics.
- If Hermes is later connected to work intake, case updates, queue handling, or work status surfaces, that integration should use the canonical Work OS model from Feature 082.
- When Feature 082 is available, Hermes may act as a front-end assistant that creates or updates Work OS records on behalf of the user, but it must not invent a parallel work model.

---

## 6. Locked product decisions

### 6.1 Persona and profile

- Hermes profiles should be shown as user-owned personas or work identities.
- Persona selection must be optional.
- The generic Hermes runtime path must stay available.
- Persona and profile metadata should be stored as runtime metadata attached to the Hermes worker record, with the worker registry as the source of truth and the UI as a read-only consumer.
- Task-mode state should be stored as dispatch metadata or delegated-session metadata, not as a new runtime identity.
- Status summaries shown in Teams and Admin Monitoring should be derived from the existing worker, delegation, and callback records rather than from a separate Hermes state store.
- Planned metadata contract:
  - `worker.capabilitiesJson.runtimeMetadata.profileName`
  - `worker.capabilitiesJson.runtimeMetadata.profileLabel`
  - `worker.capabilitiesJson.runtimeMetadata.profilePurpose`
  - `worker.capabilitiesJson.runtimeMetadata.activeTaskMode`
  - `worker.capabilitiesJson.runtimeMetadata.activeStatusSummary`
- Planned ownership:
  - worker registry owns persona/profile fields
  - worker delegation owns task-mode selection for the active session
  - callback and heartbeat records own live progress summaries
- Migration and backfill:
  - existing Hermes workers without the new metadata fields should still render as generic Hermes workers
  - missing persona/profile fields must default to null or empty values rather than inferred labels
  - migration should populate only safe display defaults, never synthetic identity claims

### 6.2 Channel companionship

- Hermes may present channel and webhook presence, but SmartSpecPro stays the audit and policy authority.
- The UI should explain channel capability in simple language.
- Channel capability must be revoked and revalidated after disconnect, reauthorization, or tenant transfer.
- Stale channel metadata must not continue to imply live access after the underlying channel is removed.
- Planned metadata contract:
  - `worker.capabilitiesJson.runtimeMetadata.gatewayPlatforms`
  - `worker.capabilitiesJson.runtimeMetadata.supportsCallbacks`
  - `worker.capabilitiesJson.runtimeMetadata.supportsDelegatedHttp`
  - `worker.capabilitiesJson.runtimeMetadata.supportsDelegatedMcp`
  - `worker.capabilitiesJson.runtimeMetadata.channelStatus`
- Revocation semantics:
  - active callbacks stop immediately
  - channel metadata is marked inactive in the source record
  - any cached view in Teams/Admin Monitoring must re-read from source of truth before showing live status
- Cleanup ownership:
  - worker callback service owns immediate callback stop
  - worker registry owns metadata deactivation
  - UI caches must never be the authoritative source for channel live-state

### 6.3 Memory and context sync

- Sync must be opt-in.
- Sync must be scoped to an explicit persona, task, or memory set.
- User opt-in is sufficient for personal persona-scoped sync.
- Tenant-admin approval is required for team-shared, workspace-shared, or cross-channel memory sets.
- SmartSpecPro must not flatten all Hermes upstream state into canonical objects by default.
- Revoke must stop future sync immediately and remove the synced context from active use until it is re-authorized.
- Personal persona-scoped sync means context attached to one user-owned Hermes persona for that user's own work only.
- Any sync that is reused across a team, shared workspace, channel, or task queue is a shared scope and requires tenant approval.
- Revoked synced context should be quarantined or marked inactive in persistent stores so it cannot be reused silently before re-authorization.
- Planned storage contract:
  - active sync policy lives in memory or scoped-memory records
  - sync provenance lives with the memory archive / audit trail
  - revoked sync entries are marked inactive first, then eligible for later cleanup by retention policy
- Cleanup semantics:
  - personal sync revoke marks active sync inactive immediately
  - shared sync revoke marks active sync inactive and quarantines linked context for audit
  - no automatic destructive delete without an explicit retention or admin cleanup path
  - retention cleanup, when allowed, is owned by the memory archive service or a dedicated admin retention job, not by UI actions

### 6.4 Task specialization

- Specialization should be modeled as named work modes or packs.
- Task modes must be additive, not exclusive.
- Unsupported work must fail closed rather than silently widening permissions.
- Task modes are presets over existing delegated scope profiles and route families, not new auth classes.
- Task-mode metadata should be stored as a field on the delegated session, job, or runtime metadata that can be inspected by Teams and Admin Monitoring without creating a second authorization model.
- Planned metadata contract:
  - `delegatedSession.scopeProfile`
  - `delegatedSession.routeFamilies`
  - `delegatedSession.activeMode`
  - `worker.capabilitiesJson.runtimeMetadata.activeTaskMode`
- Task-mode selection must be explicit, inspectable, and resettable without changing the worker identity.
- Migration and backfill:
  - existing delegated sessions without a task mode should continue to be treated as generic fallback sessions
  - missing mode fields must not be inferred from channel, persona, or team names

### 6.5 Visibility

- Progress and status should be understandable to non-technical users.
- Operational detail remains available for admins, but not at the cost of clarity.
- Summary views should be derived from source records and never treated as authoritative if they disagree with worker/delegation/callback state.
- Summary views must fall back to generic safe states when source records are missing or partially migrated.

---

## 7. Proposed feature slices

### 7.1 Persona and profile experience

Hermes should expose profile selection in a way that feels like choosing a working identity, not editing raw metadata.

The product should let a user:

- see available Hermes personas
- pick a persona for a team or task
- understand what that persona is good at
- change personas without rebuilding the runtime

### 7.2 Channel and webhook workflows

Hermes should become more useful as a channel companion by surfacing:

- which channels are connected
- what Hermes can publish back
- which channel actions are allowed
- what to expect when Hermes is waiting for a reply

### 7.3 Opt-in memory and context sync

Hermes should be able to carry forward selected context when the user explicitly allows it.

This should support:

- selected memory sets
- persona-specific context
- task-relevant notes
- reversible disablement

### 7.4 Task modes and specialization

Hermes should support named modes for common work patterns such as:

- follow-up and coordination
- research and summary
- channel response handling
- team update drafting
- monitoring and alert triage

These modes must still route through the existing capability model rather than becoming separate hard-coded runtimes.

Recommended default mapping:

| Hermes mode | Primary intent | Suggested existing delegated profile | Notes |
|---|---|---|---|
| coordination | follow-up, reminders, task chasing | `worker_gateway_readonly` | Safe default for light-touch assistant work |
| research_summary | gather and condense information | `worker_gateway_researcher` | Best fit when the job needs search and synthesis |
| channel_response | draft or route replies from channels | `worker_gateway_content_creator` | Best fit for channel-facing message work |
| team_update_drafting | write team status updates or summaries | `worker_gateway_content_creator` | Keep output-oriented actions separate from approvals |
| monitoring_triage | watch for issues and escalate | `worker_gateway_readonly` or `worker_gateway_researcher` | Use readonly when the mode only observes, researcher when synthesis is needed |

The product should keep a generic fallback path for any mode that is not selected or not supported.

### 7.5 Visibility and rollout

Hermes should show a cleaner user-facing status:

- what persona is active
- what mode is active
- what channels are connected
- whether context sync is enabled
- what stage the work is in

Rollout should remain gateable by capability so each slice can be enabled independently.

Recommended rollout posture:

| Slice | Default posture | Security note |
|---|---|---|
| persona/profile UX | off by default until UI is ready | Safe because it only changes presentation and selection |
| visibility summaries | on for admins, gradual for end users | Must not expose hidden channel or memory details |
| channel/workflow expansion | off by default | Requires channel revoke and reauth behavior |
| task modes and specialization | on per mode, not global | Each mode must map to an existing scope profile |
| opt-in memory/context sync | off by default | Requires explicit consent and revocation handling |

---

## 8. Relationship to existing runtime behavior

| Aspect | Desired behavior |
|---|---|
| Runtime identity | Hermes remains `hermes_agent_gateway` |
| Flexibility | Multiple task types remain possible |
| Persona model | Additive and user-selectable |
| Channel model | Capability-based and auditable |
| Memory model | Opt-in and scoped |
| Progress model | Plain-language first, detail second |

The purpose is to make Hermes easier to use, not narrower.

---

## 9. Security and trust model

### 9.1 Consent first

- Memory and context sync must require explicit user or tenant approval.
- Channel tokens and upstream sessions must remain protected by the existing trust boundary.

### 9.2 Scope first

- Every new capability must be scoped to the smallest useful surface.
- No enhancement should silently widen Hermes authority.

### 9.3 Fail closed

- If a persona, channel, memory scope, or task mode is missing, Hermes should fall back to the generic runtime behavior rather than improvising access.

---

## 10. Rollout and adoption

Rollout should happen in stages:

1. persona and profile UX
2. visibility and progress summaries
3. channel and webhook workflow expansion
4. task modes and specialization packs
5. opt-in memory and context sync

This ordering gives users immediate value while keeping the more sensitive data-flow work behind explicit gates.

---

## 11. Acceptance criteria

1. Users can understand and choose Hermes personas without reading raw metadata.
2. Hermes channel and webhook capabilities are explained in user-friendly language.
3. Memory and context sync only happen when explicitly enabled and scoped.
4. Hermes can support multiple task types without losing the generic fallback path.
5. Users can see clear progress and status summaries for Hermes work.
6. The feature keeps Hermes external, flexible, and capability-driven.
