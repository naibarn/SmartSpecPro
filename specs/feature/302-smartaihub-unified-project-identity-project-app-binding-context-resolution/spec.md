---
spec_id: 302
title: SmartAIHub Unified Project Identity, Project-App Binding & Context Resolution Contract
revision: R0.1
date: 2026-10-07
status: DESIGN_CONTRACT
scope: Platform-wide / additive identity federation
risk_class: HIGH
normative_language: RFC-style MUST / MUST NOT / SHOULD / SHOULD NOT / MAY
---

# SPEC-302 — SmartAIHub Unified Project Identity, Project-App Binding & Context Resolution Contract

## 0. Decision and authority

SPEC-302 defines the platform identity and resolution contract for projects that are represented by existing domain records. It does not replace those records or authorize a big-bang migration. It establishes a stable cross-domain identity and explicit bindings so apps, conversations, evidence, memory, and portable runtimes can refer to the same project without making that project a child of one app.

`CanonicalProject` is the proposed cross-domain identity authority. Domain tables remain the lifecycle and domain-data authorities for their own records until a separately reviewed, expand/contract migration proves a binding. SPEC-233 owns Living Project intelligence/evolution, SPEC-292 owns Work Context and collaboration projection, SPEC-284 owns evidence continuity/retrieval, and SPEC-268 owns memory scope (its requested R2.5 source recovery remains unresolved). None of those contracts becomes the global identity authority by implication.

The current repository declares separate `video_editor_projects`, `video_projects`, `storyboard_skill_projects`, and `decision_projects` in `apps/web/drizzle/schema.ts`. Their IDs use different types and local constraints. Current source does not prove a cross-domain Project table/service. This contract therefore specifies additive federation, not an implementation or migration-complete claim.

## 1. Invariants

1. A Project MUST NOT be a child of one App; an App MUST NOT own global Project identity.
2. One Project MAY bind to many Apps and one App MAY bind to many Projects.
3. One canonical identity MAY have multiple domain, app, portable, or external bindings, each namespaced and tenant-scoped.
4. Domain records retain their existing IDs, owners, lifecycle, and ACL semantics during migration.
5. Identity resolution is distinct from authorization. Every read/write MUST re-check tenant, membership, ACL, and current revocation state.
6. Similarity can retrieve or rank candidates, but MUST NOT alone select a durable project destination.
7. Ambiguous or unresolved project context MUST fail closed for durable shared writes and high-impact actions.
8. Every durable resolution MUST emit a receipt bound to the inputs and resolver/policy version.

## 2. Canonical identity model

`CanonicalProject` has at least:

- `projectId`: opaque, stable, globally unique within the platform identity namespace;
- `tenantId`, `projectType`, `title`, `aliases`;
- owner and participant references (stable principal IDs, not emails);
- ACL/policy reference;
- lifecycle (`ACTIVE`, `ARCHIVED`, `DELETED_PENDING_RETENTION`, `RETIRED`);
- `createdAt`, `updatedAt`, optional `archivedAt` and deletion/retention metadata;
- provenance and identity generation/version.

Supporting relations:

- `ProjectDomainBinding`: `(projectId, tenantId, domainType, domainRecordId, bindingVersion, lifecycle, provenance)`; unique active mapping per domain namespace and record.
- `ProjectAppBinding`: `(projectId, appId, tenantId, relation, policyRef, lifecycle, effective interval)`; many-to-many.
- `ProjectAlias`: normalized alias, locale/namespace, confidence/source, validity interval; aliases are lookup hints, not identity.
- `ProjectMembership`: stable principal ID, role, policy reference, effective interval, revocation epoch.
- `ActiveProjectContext`: actor, app/installation, workspace/space/session, selected project, source, effective interval, and revision; scoped to the principal and context owner.
- `ConversationProjectBinding`: conversation/space, project, segment and time interval, selection source, actor, revision, and policy snapshot; supports project switches without rewriting prior segments.
- `ProjectResolutionReceipt`: input-context digest, candidate set/ranking evidence, selected state and ID, resolution source, actor, policy/resolver versions, authorization result reference, timestamp, and idempotency/correlation key.

The tables above are target contracts, not a claim that matching tables already exist. Identifiers are opaque; external IDs are never treated as global IDs without an explicit namespace binding.

## 3. Domain compatibility and migration

Initial compatibility bindings cover `video_editor_projects` (integer local key), `video_projects` (numeric local key with tenant/user fields), `storyboard_skill_projects` (UUID), and `decision_projects` (tenant-scoped local ID). Additional string/integer `projectId` fields in Chat, memory, media, Library, and job metadata remain legacy references until inventory establishes their owner and cardinality.

Migration MUST proceed as inventory → read-only mapping → dual-read/observe → explicit binding backfill → consistency reconciliation → selected consumer cutover → retirement of an old reference only after rollback and retention windows close. Backfill MUST preserve original keys and ACLs, be idempotent, report collisions/orphans, and support pause/resume. No production migration is authorized by this Spec alone.

SPEC-233 `LivingProject` may bind as an intelligence projection. SPEC-292 `WorkContext` may carry a canonical project reference but remains a collaboration/context projection. SPEC-284 evidence records bind and query the resolved identity while preserving source and tenant ACL. A binding does not transfer ownership or permissions.

## 4. Project context resolution

`ResolvedProjectContext` includes `canonicalProjectId?`, tenant and actor, app/installation, work context, workspace/space, conversation/session, resolution state, confidence band, authoritative source, policy/resolver version, and receipt ID.

Resolution states: `RESOLVED_EXPLICIT`, `RESOLVED_CONTEXTUAL`, `RESOLVED_INFERRED`, `AMBIGUOUS`, `UNRESOLVED`, `NO_PROJECT`, and `SESSION_PENDING_SCOPE` (ephemeral pending destination, not a project identity).

Precedence, strongest first: explicit current user selection; current page/object's verified domain binding; task/workflow/artifact binding; conversation segment binding; app active-project binding; signed launch/navigation context; recent project as a suggestion; semantic/vector candidates as suggestions only. Contradictory authoritative inputs produce `AMBIGUOUS` with a receipt, never silent last-writer selection.

The picker MUST be offered when multiple plausible candidates, close scores, low confidence, or a durable/high-impact action requires confirmation. It MUST support recommended candidates, recent/active projects, search across authorized projects, `No Project`, and `Create New Project`. A choice becomes effective only after authorization and durable binding are recorded.

## 5. Reads, writes, and security

Ephemeral reads MAY use a lower confidence band only when all candidates are authorized, results are labeled as suggestions, and no durable destination is selected. Personal durable writes require explicit personal-scope policy and confidence above a configured threshold. Project-shared durable writes require an authoritative binding (explicit, verified object, or confirmed contextual binding), current ACL approval, and an idempotent receipt. High-impact actions require authoritative project binding and fresh authorization.

For `AMBIGUOUS`, `UNRESOLVED`, or `NO_PROJECT`, the system MUST NOT write durable Project data. It MAY retain content in a session/pending scope according to user consent, retention, and tenant policy; pending content is not searchable as shared project memory and can be promoted only after confirmation plus ACL revalidation.

The resolver MUST not use `userId` alone. Tenant, principal, app/installation, project, workspace/space, conversation/session, environment, and purpose are independent dimensions. Cross-tenant candidates MUST never be exposed through similarity search.

## 6. Conversation integration

One conversation runtime can serve many conversation spaces and app-specific surfaces. Conversation project bindings are segment-based; switching Project A to B creates a new effective segment and does not retroactively move messages or memory. App embedding passes host app and project context explicitly. The runtime validates all bindings and does not infer host ownership from the runtime's own product identity.

## 7. Acceptance contract

Required scenarios include one user with two apps and one project; one user/app across two projects; multiple users with ACLs on one project; project switch within a conversation; no project; ambiguous candidates; picker confirmation; near-equal vector scores; pending write promotion; project revocation mid-session; external project namespace collision; and backfill retry with an orphan/collision report.

## 8. Rollout and evidence

Phase 0 is read-only inventory. Phase 1 introduces identity/binding contracts behind non-authoritative observation. Phase 2 adds a bounded domain binding and dual-read reconciliation. Phase 3 migrates one consumer only after access-control and rollback evidence. Phase 4 expands by domain. Each phase records exact source SHA, mapping counts, mismatches, authorization tests, and rollback evidence. Spec status, source changes, integration, and deployment remain separate lifecycle facts.
