# Appendix - Security and Authorization

## Purpose

Turn the new preflight review and orchestration model into explicit authorization rules.

## 1. Preflight preview access

### Requester-safe preview

Allowed actors in v1:

- requester for that request
- `admin`
- `domain_admin`

Allowed contents:

- compiled brief summary
- linked source list
- selected surfaces
- cost and approval preview
- blocked reasons in redacted form

Redacted for non-admin callers:

- permission internals
- privileged governance diagnostics
- secret-bearing excerpts
- connector or private-vault internals

### Admin diagnostic preview

Allowed actors in v1:

- `admin`
- `domain_admin`

Additional visibility:

- full blocked-reason diagnostics
- feature-flag and permission details
- contract-compatibility diagnostics
- team-resolution diagnostics

## 2. Skill Studio action policy

| Action | Allowed actor | Auto-executable by default | Notes |
|---|---|---|---|
| `create_private_or_pending_review` | requester, `admin` | no | may create private or pending-review output only |
| `improve_owned_skill` | skill owner, `admin` | no | requires target skill access and local-skill support |
| `auto_apply_proposal` | `admin` only | no | requires dedicated approval |
| `publish_or_widen_visibility` | `admin` only | no | requires dedicated approval |

## 3. Preflight revision invalidation

The `PreflightRevisionFingerprint` must change when any of the following changes:

- request title
- request objective
- linked conversations
- linked workpack runs
- linked role-routine runs
- selected source set
- budget/policy inputs that affect planning
- explicit team override or launch-governance inputs

When the fingerprint changes:

- the approved preflight bundle becomes stale
- launch must fail closed
- the UI must require regenerate-and-review

## 4. Team resolution rules

Resolution order in v1:

1. approved explicit team override
2. current case queue owner
3. request `defaultQueueId`
4. request queue-style `defaultOwner`
5. tenant fallback orchestration team when explicitly configured
6. else fail closed

Required resolution codes:

- `resolved_plan_override`
- `resolved_case_owner`
- `resolved_request_default_queue`
- `resolved_request_default_owner`
- `resolved_tenant_fallback`
- `missing_team`
- `inactive_team`
- `ambiguous_team`
- `unauthorized_team`

Forbidden behavior in v1:

- unrelated-team heuristic search
- silent null kickoff
- hidden fallback to the latest used room/team

## 5. Security regression checklist

- requester can review their own request preview without domain-admin rights
- requester cannot see privileged diagnostics
- locked private-vault sources stay blocked without explicit unlock state
- stale preview approval cannot launch
- `workflow` dispatch requires runtime permission plus approved step
- `skill_studio.auto_apply_proposal` is blocked for non-admins
- team resolution emits stable codes and fails closed when no team is valid
