# Section 05 - Typed Role Communication, Delegation, and Exceptions

## Purpose

This section defines how role agents communicate, delegate, escalate, and take responsibility for blocked work without turning internal messaging into an ungoverned policy bypass channel.

The goal is to evolve current room collaboration into typed, attributable operational communication that supports handoffs, approval requests, dependency blocks, and role-aware exception ownership.

## Why this section follows earlier sections

- Role ids, contracts, routines, and lifecycle vocabulary from Section 01 are required before role communication can be attributable.
- Scheduler and routine-cycle boundaries from Section 02 ensure messages and handoffs can reference concrete operational context.
- Workpack resolution and execution inheritance from Section 03 define what delegated work is actually allowed to run.
- Monitor aggregation from Section 04 needs structured communication and exception ownership signals instead of freeform message inference.

## Files in scope

- `apps/web/shared/roleCommunicationContracts.ts` new shared typed-communication module or additions to the role contract module
- `apps/web/server/services/roleDelegationService.ts` new delegation authorization and handoff service
- `apps/web/server/services/roleExceptionBindingService.ts` new role-aware exception view service
- `apps/web/server/routers/teamRoom.ts` only where typed role-message send and fetch flows extend existing room behavior
- `apps/web/server/services/roomService.ts` only where message metadata must preserve typed role context
- `apps/web/server/services/__tests__/roleDelegationService.test.ts` new delegation tests
- `apps/web/server/services/__tests__/roleExceptionBindingService.test.ts` new exception-binding tests

## Typed communication model

Role communication should support a narrow, attributable intent model rather than treating every internal message as equally actionable.

Supported communication intents should include:

- `request`
- `handoff`
- `escalate`
- `dependency_block`
- `status_summary`
- `approval_request`
- `shared_finding`

Each communication item should attach:

- sender role id
- recipient role id or group
- related routine id
- related `role_routine_run` id when applicable
- related workpack family or workpack run reference when applicable
- priority
- due state
- provenance
- current actionability state

Freeform discussion may still exist in rooms, but only typed and attributable items may trigger delegated execution or approval flows.

## Role data-visibility matrix

Execution authority and visibility authority should be treated as separate controls.

This section should define at least these visibility classes:

- full owner visibility for the role that owns the routine or message
- delegated minimum-necessary visibility for the recipient of a bounded handoff
- shared organizational visibility for explicitly shared reference material only
- operator review visibility for approved human operators
- redacted summary visibility for roles that need status but not sensitive payload detail

The matrix should explicitly cover access to:

- role memory
- room threads and typed messages
- checkpoints and recovery summaries
- artifacts and workpack output summaries
- role-aware exception detail

Rules should follow least privilege:

- a delegated role should receive only the context needed to execute the delegated task safely
- unrelated roles should not gain access to another role's hot memory or sensitive exceptions just because they share a tenant
- role monitor summaries may expose blocked or delayed status broadly, but should redact sensitive underlying detail when the role does not have visibility rights

## Delegation authorization matrix

Delegated work must pass a full authorization matrix before execution.

The matrix should verify:

- the sender role is allowed to issue that delegation intent
- the recipient role contract allows that class of work
- the referenced workpack family is approved for the recipient's routine or delegation envelope
- the resulting connector scope does not exceed either role contract
- the resulting side-effect class does not exceed either role ceiling
- the resulting budget exposure does not exceed either role allowance
- the action remains attributable to a concrete typed message or owned routine

If any check fails, the system must fail closed into:

- exception
- approval request
- or incident path

Delegation must never become a loophole for widening authority indirectly.

## Handoff model

`role_handoff` should represent one bounded ownership transfer for one task or routine-cycle slice.

Each handoff record should capture:

- sender role
- recipient role
- source message id
- related routine-cycle context
- handoff purpose
- expected completion or review state
- outcome summary
- linked exception or workpack refs when applicable

Handoffs transfer bounded responsibility. They must not create silent permanent authority expansion.

## Role-aware exception ownership

Feature 079 already owns workpack exceptions. Feature 080 should add the role-aware ownership view over that exception truth.

`role_exception_binding` should link:

- role agent
- routine
- routine cycle
- delegated message or handoff where applicable
- underlying workpack exception id
- local triage owner
- escalation target
- current operator action state

The binding layer should let operators answer:

- which role owns this blocked work now
- whether the exception came from direct routine execution or delegation
- whether the next action is retry, remap, review, escalate, or downgrade

without copying or mutating the underlying workpack exception truth.

## Ownership boundaries

This section owns:

- typed role message vocabulary
- delegation authorization checks
- handoff records
- role-aware exception bindings
- room metadata needed for attributable role messaging

This section does not own:

- room UI layout
- workpack exception root truth
- role-monitor roster aggregation
- role learning or promotion logic

## Implementation guidance

1. Extend existing room and message flows only where typed role metadata is required. Do not replace the current room system.
2. Keep typed message and handoff schemas explicit enough that monitor and audit tooling can consume them directly.
3. Evaluate the full delegation authorization matrix before any delegated work executes or even queues.
4. Bind role exceptions to underlying workpack exceptions instead of duplicating exception payloads.
5. Preserve message and handoff provenance so operators can reconstruct why one role asked another to act.
6. Treat missing attribution as a blocker, not as an excuse to fall back to generic chat behavior.
7. Treat data visibility as its own policy matrix so delegation does not automatically imply full read access to another role's memory or artifacts.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: typed role messages validate sender, recipient, related routine or routine-cycle context, priority, provenance, and intent type.
- Test: freeform room discussion alone cannot trigger delegated execution without a typed attributable action item.
- Test: delegation authorization rejects work when sender rights, recipient contract, workpack family eligibility, connector scope ceiling, side-effect ceiling, or budget ceiling fail.
- Test: successful delegation creates a handoff record that preserves the source message and execution context.
- Test: delegated work remains linked to the recipient role and the originating typed message for audit and monitor visibility.
- Test: role-aware exception bindings preserve links to underlying workpack exceptions without duplicating exception truth.
- Test: exceptions created from failed delegation surface the correct next action and owner context.
- Test: tenant scoping and attribution remain intact across typed role messaging and exception bindings.
- Test: role data-visibility rules prevent over-sharing of room threads, memory, checkpoint detail, artifacts, and exception context to unrelated roles.
- Test: delegated recipients receive only minimum-necessary context rather than unrestricted access to the sender's operational state.

## Done when

This section is complete when role-to-role communication is typed and attributable, delegated work cannot smuggle policy across role boundaries, and blocked work can be triaged from a role-aware exception view without losing linkage to Feature 079 truth.
