# SPEC-293 — SmartAIHub Unified Git Workspace & Repository Federation
## Platform Engineering / Admin Creator / Tenant / User Git Workspaces, Repository Provisioning, App↔Source Binding, Multi-GitHub Federation & Conversational Git Operations

**Status:** PROPOSED / ADDITIVE / IMPLEMENTATION-READY — numeric slot verified against canonical `naibarn/SmartSpecPro/specs/feature` on 2026-10-06; implementation still performs G0 ownership discovery  
**Spec ID:** 293  
**Stable semantic identity:** `smartaihub.unified-git-workspace-repository-federation`  
**Revision:** R1.4 — 46-pass cumulative production hardening; privileged-CI trust, repository governance snapshots, immutable tag/release provenance, federated deployment identity, disappearing fork heads, archive-import safety, recursive source bounds, multi-remote divergence and opaque Git object IDs hardened  
**Date:** 2026-10-06  
**Target repository path:** `specs/feature/293-unified-git-workspace-repository-federation/spec.md`  
**Primary product surfaces:** Admin → GitHub; Workspace → GitHub; Tenant → GitHub; App/Mini App creation; Chat  
**Primary architectural role:** Git-provider connection, repository workspace, source binding, provisioning and repository-governance authority  
**Implementation rule:** ADDITIVE ONLY. MUST NOT replace Git/GitHub, SPAAS, Development Orchestrator, Task Control, Resource Fabric, command ingress, authorization, secret storage, deployment runtime, or billing authority.

> **Numbering verification:** The canonical SmartSpecPro repository currently contains feature directories through 292, with 292 occupied by Adaptive Work Context; no 293 or 294 feature directory was present at verification time. SPEC-293 is therefore assigned to this Git Workspace specification. G0 still re-checks repository authority immediately before implementation to protect against concurrent allocation.

---

# 0. Executive Decision

SmartAIHub SHALL provide a **Unified Git Workspace & Repository Federation** layer so that platform engineering, administrators acting as creators, tenant teams, individual users, and customer projects can connect and use Git repositories without mixing ownership or visibility domains.

The system SHALL explicitly separate these scopes:

```text
SmartAIHub Git Federation
│
├─ PLATFORM_ENGINEERING
│   └─ SmartAIHub / SmartSpecPro platform source, specs, runners, infrastructure
│
├─ PLATFORM_MANAGED
│   └─ repositories hosted/provisioned by SmartAIHub for apps/users/tenants
│
├─ ADMIN_CREATOR
│   └─ apps/projects created by an admin acting as a normal creator/user
│
├─ TENANT
│   └─ tenant-owned apps/projects/repositories
│
├─ USER
│   └─ individual user apps/projects/repositories
│
└─ CUSTOMER / EXTERNAL_ORG
    └─ repositories authorized by an external customer/organization
```

The fundamental invariants are:

```text
APP ≠ REPOSITORY
PROJECT ≠ REPOSITORY
USER ACCOUNT ≠ GIT PROVIDER ACCOUNT
TENANT MEMBERSHIP ≠ GITHUB PERMISSION
PLATFORM ADMIN ≠ AUTOMATIC ACCESS TO USER SOURCE
PLATFORM ENGINEERING ≠ ADMIN CREATOR WORKSPACE
REPOSITORY IDENTITY ≠ CURRENT INSTALLATION/CONNECTION
REPOSITORY CONNECTION ≠ REPOSITORY OWNERSHIP
GIT ACCESS ≠ EXECUTION AUTHORITY
REPOSITORY PROVISIONING ≠ APP DEPLOYMENT
CHAT CONTEXT ≠ MUTATION AUTHORITY
```

SmartAIHub MAY present these workspaces through one consistent UI family, but MUST NOT collapse their authorization boundaries or operational purposes.

---

# 1. Product Problem

SmartAIHub supports or plans to support:

- development of SmartAIHub/SmartSpecPro itself;
- user-created Apps and Mini Apps;
- tenant-branded applications;
- Skills / Plugins / workflows;
- customer projects;
- externally deployable applications;
- Git import/export;
- multiple GitHub accounts and organizations;
- SmartAIHub-managed repositories for users who do not want to configure Git themselves;
- coding agents working on repositories;
- Mission Control / Task Control monitoring;
- conversational status and control through Chat.

Without a central Git Workspace authority, repository concepts tend to leak into unrelated systems. This creates predictable failures:

- platform source mixed with customer/user repositories;
- an administrator's personal Mini App mixed with SmartAIHub engineering repositories;
- repository names treated as globally unique;
- App identity conflated with repository identity;
- one App forced into one repo even when it is multi-repo;
- one monorepo forced into one App even when it contains many packages;
- OAuth/GitHub App installation details stored as business ownership;
- repository transfers/re-installs creating duplicate logical entities;
- user GitHub access accidentally implying tenant or SmartAIHub authority;
- Git provider revocation not invalidating cached reads/actions;
- Chat commands acting against the wrong Git workspace.

This spec creates one reusable repository federation contract consumed by Apps, Mini Apps, tenants, creators, development orchestration and Mission Control.

---

# 2. Canonical Ownership & Cross-Spec Boundaries

Implementation SHALL resolve current canonical revisions from the repository canonical registry/handoff authority when present (including `SPEC_INDEX.yaml` if/when materialized). If no registry file is present, G0 SHALL use canonical `specs/feature` identity, manifest/status/handoff metadata and explicit collision checks; filesystem mtime alone is never authority.

| Concern | Canonical owner / relationship |
|---|---|
| Development lifecycle | SPEC-224 remains execution owner. This spec provides repository/source workspaces and bindings. |
| SPAAS App identity/package/lifecycle | SPEC-261 remains canonical. Git repositories are source bindings, not the App itself. |
| Task Control UX | SPEC-277 remains UX/read-model foundation. This spec exposes Git workspace projections. |
| Command ingress / mutation routing | SPEC-279 remains canonical mutation/delegation path. |
| Work Context / collaboration / cross-tenant exchange | SPEC-292 remains canonical. This spec consumes authorized participant/tenant/external-org context. |
| Project source/evidence/artifact continuity | SPEC-284 remains evidence/artifact authority. Git source commits/paths may be referenced as evidence, not duplicated as a new artifact store. |
| Unified UI governance | SPEC-287 governs UI generation/conformance. Git Workspace UI must comply. |
| Resource Fabric | SPEC-288 owns portable infrastructure resource provisioning. Git repository provisioning is a source-control capability and MAY expose a Resource Fabric adapter, but this spec owns Git-specific repository semantics. |
| Development Mission Control | SPEC-294 consumes repository/workspace facts from this spec; SPEC-294 does not own user/tenant Git workspace lifecycle. |
| Secrets / credentials | Existing canonical secret architecture / Secrets Store owns plaintext credentials. This spec stores opaque secret references only. |
| Authentication/authorization | Existing identity/policy system remains authority. Git-provider permissions are an additional gate, not replacement authorization. |
| Deployment | SPAAS/runtime/deployment authorities remain canonical; creating/pushing a repo does not equal deployment. |

## 2.1 Non-duplication rule

This spec MUST NOT create:

- another App package format;
- another Development Orchestrator;
- another global task queue;
- another approval engine;
- another secret store;
- another billing ledger;
- another deployment runtime;
- another generic project model;
- another knowledge/evidence store;
- a proprietary Git implementation when provider-backed Git is sufficient.

---

# 3. Git Workspace Scopes

`GitWorkspace` is an authorization and organization boundary over repository bindings. It is not a Git repository itself.

```ts
type GitWorkspaceScope =
  | 'PLATFORM_ENGINEERING'
  | 'PLATFORM_MANAGED'
  | 'ADMIN_CREATOR'
  | 'TENANT'
  | 'USER'
  | 'CUSTOMER_EXTERNAL_ORG';
```

Each workspace SHALL have:

```text
workspace_id
scope
owner_principal_ref?
tenant_ref?
external_org_ref?
policy_ref
visibility_policy_ref
repository_creation_policy_ref
allowed_provider_connections[]
created_at
lifecycle_state
```

## 3.1 Platform Engineering

Reserved for source that builds/operates SmartAIHub/SmartSpecPro itself, including platform apps, specs, workers/runners and infrastructure code.

Normal users MUST NOT discover its private repository metadata merely because they can use SmartAIHub.

## 3.2 Admin Creator

An administrator acting as a creator SHALL use a separate `ADMIN_CREATOR` or ordinary personal workspace for Mini Apps/Apps/projects not belonging to platform engineering.

Being `PLATFORM_ADMIN` MUST NOT automatically reclassify personal creator repositories as platform engineering.

## 3.3 Tenant

A tenant workspace MAY bind organization-owned repositories and selectively expose them to tenant members according to both SmartAIHub policy and provider authorization.

## 3.4 User

A user workspace MAY connect one or more personal/provider identities and bind only repositories explicitly selected/imported/created for SmartAIHub use.

## 3.5 Customer / external organization

Customer-controlled repositories SHALL be treated as externally owned sources with explicit authorization, retention and transfer constraints.

---

# 4. Core Domain Model

```text
GitProviderHost
GitProviderConnection
GitPrincipalBinding
GitOrganizationBinding
GitWorkspace
Repository
RepositoryAccessBinding
RepositoryWorkspaceBinding
ProjectRepositoryBinding
AppRepositoryBinding
PackageRepositoryBinding
RepositoryMutationPolicy
RepositorySyncState
RepositoryHealthProjection
RepositoryProvisioningRequest
RepositoryProvisioningReceipt
RepositoryTransferReceipt
RepositoryArchiveReceipt
GitActionAudit
```

## 4.1 Repository identity

Logical repository identity MUST survive legitimate access-route changes.

```text
Repository
  repository_id                  # SmartAIHub stable internal identity
  provider                       # github first; provider-neutral contract
  provider_host
  provider_repository_id         # stable provider ID/node ID when available
  canonical_full_name_snapshot
  default_branch_snapshot
  visibility_snapshot
  archived_snapshot
  fork_parent_ref?
  created_at
```

`installation_id`, OAuth account and token IDs MUST NOT be part of logical repository identity.

## 4.2 Repository access binding

Access is mutable and generation-fenced:

```text
RepositoryAccessBinding
  binding_id
  repository_id
  connection_id
  installation_or_account_ref
  permission_snapshot
  selected_repository_scope
  binding_generation
  authorized_at
  revoked_at?
  last_verified_at
```

Late events or cached actions from old generations MUST NOT restore revoked access.

---

# 5. Provider Connection Model

GitHub is the first production provider, but internal contracts SHOULD permit GitLab/Gitea/Azure DevOps adapters later.

Preferred GitHub connection modes:

1. GitHub App installation with least-privilege repository selection;
2. organization-managed GitHub App;
3. user OAuth where appropriate;
4. fine-grained token only as fallback.

Classic broad PATs SHOULD NOT be the default onboarding path.

## 5.1 Credential handling

Mission-control/workspace tables MUST store:

- provider connection IDs;
- installation/account IDs;
- scope summaries;
- secret references;
- token/installation expiry/health metadata.

They MUST NOT store plaintext tokens/private keys.

## 5.2 Connection separation

The same GitHub user MAY participate through multiple installations/organizations. The same repository MAY be visible through multiple authorized connections. These facts MUST NOT duplicate the repository entity.

---

# 6. Repository Placement Strategies

When creating an App/Mini App/project, source placement SHALL be explicit.

```ts
type RepositoryPlacement =
  | 'SMARTAIHUB_MANAGED'
  | 'USER_GITHUB'
  | 'TENANT_GITHUB'
  | 'CUSTOMER_GITHUB'
  | 'EXISTING_IMPORTED_REPOSITORY'
  | 'NO_REPOSITORY_YET';
```

Example UI:

```text
Source repository
○ SmartAIHub Managed
● My GitHub
○ Tenant / Organization GitHub
○ Connect existing repository
○ Decide later
```

Default visibility for newly provisioned application source SHOULD be `PRIVATE` unless product policy and user confirmation explicitly select public visibility.

Public repository creation MUST be an explicit effect with a clear source-code exposure warning.

---

# 7. App / Project / Repository Binding Semantics

**App ≠ Repository** is mandatory.

An App MAY use:

```text
App A
├─ frontend repository
├─ backend repository
├─ infrastructure repository
└─ documentation repository
```

A monorepo MAY host multiple Apps/packages:

```text
Repository R
├─ apps/app-a
├─ apps/app-b
└─ packages/shared-ui
```

Bindings SHALL therefore support:

```text
AppRepositoryBinding
  app_id
  repository_id
  role = PRIMARY_SOURCE | FRONTEND | BACKEND | INFRA | DOCS | PLUGIN | TEST | OTHER
  root_path
  canonical_branch
  integration_branch?
  package_ref?
  write_policy_ref
  deployment_binding_ref?
```

`root_path` SHALL be normalized and protected against path traversal.

## 7.1 Primary source

An App MAY designate one `PRIMARY_SOURCE`, but this does not prohibit additional repositories.

## 7.2 Unbound Apps

An App MAY exist before repository creation. Repository binding is a lifecycle step, not a prerequisite for drafting every product concept.

---

# 8. SmartAIHub-Managed Repositories

For users who do not connect GitHub, SmartAIHub MAY provision a managed repository under an approved SmartAIHub-controlled provider organization/account.

Managed repositories MUST:

- remain tenant/user scoped;
- not live inside the Platform Engineering workspace merely because SmartAIHub owns the provider organization;
- have explicit ownership/export policy;
- support later transfer/export where provider capability and policy allow;
- use least-privilege automation credentials;
- have lifecycle/audit receipts;
- never silently become public.

`PLATFORM_MANAGED` means source hosting is managed by SmartAIHub; it does NOT mean platform engineering owns the user's application IP.

---

# 9. Repository Provisioning Lifecycle

```text
REQUESTED
→ POLICY_CHECK
→ AUTHORIZATION_CHECK
→ PROVIDER_PREFLIGHT
→ NAME/LOCATION_RESOLUTION
→ CREATE_PENDING
→ CREATED
→ BASELINE_INITIALIZED
→ BOUND
→ READY
```

Failure states:

```text
BLOCKED_POLICY
AUTH_REQUIRED
PROVIDER_RATE_LIMITED
NAME_CONFLICT
PROVISION_FAILED
BINDING_FAILED
ROLLBACK_REQUIRED
```

Creation and binding MUST be idempotent with stable request IDs.

If provider creation succeeds but SmartAIHub binding fails, recovery MUST reconcile the already-created repository rather than blindly create another one.

---

# 10. Import Existing Repository

Import SHALL NOT mean copying all repository bytes into a new canonical SmartAIHub store.

Import flow:

```text
connect/select provider
→ authorize repository
→ inspect repository identity
→ select workspace/project/app
→ detect monorepo/package roots
→ scan compatible app metadata when authorized
→ create repository binding
→ optional SPAAS import/adaptation
→ establish sync/health projection
```

Untrusted repository content MUST be treated as data. Import MUST NOT execute repository scripts/hooks/package installers simply to identify an App.

---

# 11. Clone / Fork / Template / Marketplace Semantics

Operations are distinct:

- **clone locally** — execution/workspace operation;
- **provider fork** — provider repository relationship;
- **SmartAIHub App clone** — SPAAS/product relationship;
- **template instantiate** — creates a new source/product lineage;
- **marketplace install** — product entitlement/install semantics.

The UI MUST NOT label all of these as “clone” without explaining the effect.

Repository lineage SHOULD record source repository/version where legally and operationally appropriate.

---

# 12. Transfer / Export

Users/tenants SHOULD be able to move managed source to their authorized provider when policy permits.

Transfer/export SHALL distinguish:

```text
COPY_TO_PROVIDER
TRANSFER_PROVIDER_OWNERSHIP
REBIND_EXISTING_PROVIDER_REPO
DETACH_SMARTAIHUB
EXPORT_ARCHIVE
```

Each produces a receipt containing source/destination identities, revision/commit, actor, policy decision, time and resulting bindings.

A transfer MUST NOT silently transfer secrets, deployment credentials, customer data or non-exportable runtime state.

---

# 13. Archive / Detach / Delete

Destructive semantics MUST be explicit.

```text
DETACH_BINDING      # SmartAIHub stops managing/observing; provider repo remains
ARCHIVE_PROVIDER    # repository archived at provider
DELETE_PROVIDER     # destructive provider deletion
DELETE_APP          # SPAAS/product lifecycle action; not automatically repo deletion
```

Deleting an App MUST NOT implicitly delete its Git repository unless a separately authorized policy/action explicitly requests it.

Provider deletion requires strong confirmation/approval according to policy and MUST preserve an audit/evidence receipt without retaining unauthorized source contents.

---

# 14. Authorization Model

Every repository read/mutation SHALL require the intersection of:

```text
SmartAIHub principal authorization
∩ workspace/tenant/project policy
∩ provider connection authorization
∩ repository/provider permission
∩ action-specific policy/approval
```

No one layer can expand permission denied by another.

## 14.1 Admin boundary

Platform administrators MAY administer platform configuration and, when authorized, connection health. They MUST NOT automatically gain source browsing/mutation authority over private user/tenant/customer repositories solely because they are platform admins.

Emergency/support access, if the product supports it, MUST use a separately auditable break-glass mechanism with purpose limitation and expiry.

## 14.2 Tenant boundary

Tenant ownership does not override provider repository permissions. Conversely, GitHub organization membership does not automatically grant SmartAIHub tenant membership.

---

# 15. Mutation Policies

`RepositoryMutationPolicy` SHALL control capabilities such as:

```text
create_branch
push
open_pr
update_pr
merge
create_tag
create_release
change_visibility
archive
transfer
delete
manage_webhook
manage_actions_secret
```

Read-only connections MUST never surface enabled mutating controls.

Sensitive mutations MUST route through SPEC-279 and canonical approval/policy authorities rather than direct UI provider calls that bypass audit.

---

# 16. Branch / Pull Request / CI Integration

This spec owns normalized Git workspace/provider semantics; it does not replace GitHub UI.

Projection SHOULD include:

- branches/ref generation;
- pull requests;
- review status;
- checks/workflow status;
- merge queue / merge-group state where supported;
- releases/tags where relevant;
- repository rulesets/protection affecting an action.

Mission Control (SPEC-294) consumes these projections for engineering monitoring.

User Git Workspace UI may expose simpler human concepts such as “Ready to merge”, “Checks failing”, “Needs review” while preserving technical drill-down.

---

# 17. Event Ingestion & Reconciliation

Use webhook-first provider observation with periodic reconciliation.

Required properties:

- signature verification;
- delivery-ID deduplication;
- repository/access-binding generation fencing;
- out-of-order tolerance;
- schema/version handling;
- provider rate-limit awareness;
- reconciliation cursor/watermark;
- stale/partial/unknown visibility;
- revocation propagation.

A missed webhook MUST be repairable by reconciliation.

A revoked connection MUST not remain visible through stale cache or search index results.

---



## 17.1 Connection owner scope and shared installations

Provider connection identity and workspace ownership SHALL be separate.

```text
GitProviderConnection
  connection_id
  provider_host
  connection_type
  provider_principal_or_installation_id
  owner_scope = PLATFORM | TENANT | USER | EXTERNAL_ORG
  owner_ref
  connection_generation
  health
```

A single GitHub App installation MAY authorize repositories later bound into more than one permitted SmartAIHub workspace, but each `RepositoryAccessBinding` MUST independently prove current workspace authorization.

Disconnecting one user's connection MUST NOT tombstone a logical Repository that remains authorized through another valid connection. Conversely, an alternate connection MUST NOT silently preserve access for a workspace whose own authorization was revoked.

## 17.2 Out-of-band provider lifecycle

Repositories may be renamed, transferred, archived, deleted, restored or have default branches changed outside SmartAIHub.

Reconciliation SHALL classify at least:

```text
ACTIVE
ARCHIVED
PROVIDER_MISSING
ACCESS_LOST
TRANSFERRED
RESTORED
```

A provider-missing repository MUST NOT be immediately hard-deleted from SmartAIHub projections because temporary permission loss can look like deletion. The adapter SHALL distinguish `not found because unauthorized` from provider-confirmed lifecycle facts when the provider API permits.

If a repository is restored with the same stable provider repository ID, the logical Repository MAY recover. If a new provider ID is created under the same name, it is a new repository identity unless an explicit verified migration/lineage operation links it.

# 18. Repository Health Projection

`RepositoryHealthProjection` SHOULD expose:

```text
connection_health
permission_health
sync_freshness
canonical_branch_health
open_pr_attention
ci_health
merge_queue_health
ruleset_blockers
workspace_bindings
last_activity
provider_rate_limit_health
```

Health is a read model, not execution authority.

---

# 19. Product UI — Admin

Admin surfaces SHALL separate platform engineering from user/tenant source administration.

```text
ADMIN → GitHub
│
├─ Platform Engineering
│  ├─ Repositories
│  ├─ Connections / installations
│  ├─ Repository health
│  ├─ Spec/source bindings
│  └─ Open in Development Mission Control
│
├─ Platform Managed Repositories
│  ├─ user/tenant managed-source inventory (metadata subject to authorization)
│  ├─ provisioning health
│  ├─ quota/policy state
│  └─ transfer/export operations
│
├─ Connections
│  ├─ GitHub App installations
│  ├─ organization connections
│  ├─ connection health
│  └─ credential/reference health
│
├─ Policies & Defaults
│
└─ Audit / Provider Health
```

Admin personal creator work SHALL NOT appear inside `Platform Engineering`; it appears in the admin user's normal creator workspace.

---

# 20. Product UI — User / Creator

```text
WORKSPACE → GitHub
│
├─ Overview
│  ├─ Apps / Mini Apps
│  ├─ Repositories
│  ├─ Running work
│  ├─ PR / CI attention
│  └─ Connection health
│
├─ Projects & Apps
│  ├─ App cards
│  ├─ source repository bindings
│  ├─ deployment status refs
│  └─ active SmartAIHub tasks
│
├─ Repositories
│  ├─ repository detail
│  ├─ branches / PR / checks
│  ├─ app/project bindings
│  └─ recent activity
│
├─ Pull Requests
├─ Activity
└─ Connections
```

Default landing emphasis SHOULD be Apps/Projects, not raw repository inventory, because normal creators think in products rather than Git topology.

---

# 21. Product UI — Tenant Admin

Tenant admins SHOULD have a tenant-scoped Git workspace:

```text
Tenant → GitHub
├─ Organization connections
├─ Team repositories
├─ App / Project bindings
├─ Member connection references (policy-limited)
├─ Repository policies
├─ Health / attention
└─ Audit
```

Tenant UI MUST NOT expose personal repositories unrelated to that tenant.

---

# 22. App / Mini App Creation UX

When repository-backed source is appropriate, App creation SHALL offer repository placement without forcing Git terminology too early.

Example:

```text
Create Mini App
1. Product definition
2. Source location
   - SmartAIHub Managed
   - My GitHub
   - Tenant / Organization GitHub
   - Existing repository
   - Decide later
3. Repository visibility / target
4. Permissions / policy preview
5. Create
```

After creation the user should see one coherent product record even if source, deployment and runtime live in different systems.

---

# 23. Chat / Conversational Git Workspace

Chat SHALL use explicit Git workspace context rather than assuming every Git question refers to platform engineering.

```ts
type GitChatScope =
  | 'PLATFORM_ENGINEERING'
  | 'PLATFORM_MANAGED'
  | 'ADMIN_CREATOR'
  | 'TENANT'
  | 'USER'
  | 'CUSTOMER_EXTERNAL_ORG'
  | 'PROJECT'
  | 'APP'
  | 'REPOSITORY';
```

Examples:

- “Mini App ของฉันตัวไหนยังไม่ได้ push?”
- “App ร้านอาหาร CI ผ่านหรือยัง?”
- “tenant นี้มี repo ไหน permission หมดอายุ?”
- “platform engineering ตอนนี้ repo ไหนบล็อก release?”
- “สร้าง repo ให้ Mini App นี้ใน GitHub ของฉัน”

Read answers MUST be authorization-scoped and evidence-backed.

Mutations MUST route through SPEC-279 and re-resolve a stable target immediately before execution.

Pronouns such as “อันนี้”, “ตัวนั้น”, “merge เลย” MUST NOT rely solely on stale chat text. Use a generation-fenced conversation operations context and require disambiguation when multiple authorized targets remain.

---

# 24. Chat/UI Scope Separation

The same human may have several simultaneous contexts:

```text
User X
├─ Platform Admin role
├─ Admin Creator workspace
├─ Tenant A admin
├─ Personal workspace
└─ Customer Project B collaborator
```

The system MUST preserve active scope in UI deep links and Chat context.

Switching from one workspace/scope to another increments a context generation so stale selected entities cannot be mutated in the new scope.

---

# 25. Search & Discovery

Search results SHALL be filtered by current authorization before aggregation/ranking counts are exposed.

Users MAY search by:

- App/Mini App name;
- project;
- repository;
- organization;
- branch/PR;
- package/subpath;
- recent activity.

Repository search MUST NOT reveal private repository names merely because another source previously indexed them.

---

# 26. Provider-Neutral API Surface

Representative read operations:

```text
listGitWorkspaces(principal, scope)
listRepositoryConnections(workspace)
listRepositories(workspace, filters)
getRepository(repositoryId)
listAppRepositoryBindings(appId)
getRepositoryHealth(repositoryId)
listPullRequests(repositoryId, filters)
resolveGitChatTarget(context, utterance)
```

Representative mutation requests:

```text
requestConnectProvider(...)
requestCreateRepository(...)
requestBindRepository(...)
requestCreateBranch(...)
requestOpenPullRequest(...)
requestMergePullRequest(...)
requestTransferRepository(...)
requestDetachRepository(...)
requestDeleteRepository(...)
```

Mutation functions are requests to canonical authority paths, not direct provider-side bypasses.

---

# 27. Repository Naming

Repository names SHALL be resolved against provider constraints and target namespace.

SmartAIHub SHOULD generate a preview but MUST support user/tenant override when authorized.

Name resolution MUST handle:

- collisions;
- reserved names;
- provider normalization;
- renames;
- unicode/display labels vs provider slug;
- App rename without forced repository rename.

App display name changes MUST NOT silently rename repositories.

---

# 28. Quotas / Cost / Provider Limits

The system SHALL expose repository/provider quotas and API-rate constraints where material.

Platform-managed repository quotas MAY be governed by plan/tenant policy, but this spec does not own billing balances.

Operations that could incur external provider cost SHOULD disclose the relevant effect when known.

---

# 29. Audit & Evidence

Material actions SHALL produce durable audit/evidence receipts including:

```text
actor principal
SmartAIHub workspace/tenant context
provider connection/binding generation
repository stable identity
action
before/after relevant state
policy/approval references
request/idempotency ID
provider result/delivery ID
source commit/ref when relevant
timestamp / time quality
```

Repository source contents are not required inside the audit record.

---

# 30. Security Threat Model

Required defenses include:

- OAuth/GitHub App CSRF/state protection;
- redirect URI validation;
- webhook signature validation;
- least-privilege scopes;
- credential rotation/revocation;
- no plaintext secret logging;
- provider response size/time bounds;
- path/root traversal prevention;
- untrusted repo content isolation;
- prompt-injection resistance for README/issues/PR text;
- no automatic execution of repository hooks/scripts on import;
- authorization before aggregation/search;
- stale binding generation fencing;
- branch/ref generation fencing for destructive or release-sensitive actions;
- explicit public-repo exposure confirmation;
- strong confirmation for destructive provider delete/transfer actions.

---

# 31. Multi-Tenant & Data Isolation

All persistent records SHALL carry tenant/workspace ownership context where applicable.

Cross-tenant repository sharing MUST use explicit Work Context / federation policy; a repository binding in Tenant A does not silently make it visible to Tenant B.

`PLATFORM_MANAGED` hosting MUST preserve tenant/user ownership semantics even when provider infrastructure is shared.

---

# 32. Local Development / Worktree Integration

This spec owns remote/source workspace semantics, not local worktree lifecycle.

Local worktree/session adapters such as Worktrunk MAY bind to `repository_id + ref_generation` and are consumed by SPEC-294/Runner flows.

A local path is not repository identity.

A deleted/recreated worktree path MUST start a new workspace generation.

---



# 32A. Git LFS, Submodules & Nested Source Boundaries

## 32A.1 Git LFS

Repository inspection/provisioning SHALL detect Git LFS usage where material and expose LFS health/limitations without downloading all LFS objects by default.

Transfer/export readiness SHALL distinguish:

```text
GIT_OBJECTS_COMPLETE
LFS_POINTERS_PRESENT
LFS_OBJECTS_COMPLETE
LFS_AUTH_REQUIRED
LFS_QUOTA_BLOCKED
LFS_TRANSFER_UNVERIFIED
```

A source export MUST NOT claim completeness if only LFS pointer files were copied while required LFS objects were unavailable.

Provider LFS credentials/URLs are subject to the same secret and authorization rules as repository credentials.

## 32A.2 Git submodules and external nested repositories

A Git submodule reference is NOT authorization to recursively access its remote repository.

Each external submodule remote SHALL be treated as a separate repository/source requiring its own authorized Repository/AccessBinding when SmartAIHub needs to inspect or mutate it.

Import/scan MAY record submodule declarations as metadata but MUST NOT recursively clone/execute them by default.

For App source completeness, the product/package layer may declare required nested sources; the Git Workspace layer reports whether each is authorized/resolved/current.

## 32A.3 Provider-native automation secrets

Writing GitHub Actions/provider automation secrets, if supported, MUST use the canonical secret broker/secure write path. SmartAIHub MUST NOT rely on reading secret values back from the provider and MUST NOT persist plaintext values in Git Workspace tables, logs, Chat or audit payloads.

## 32A.4 Ref generations for action safety

Branches/tags SHALL carry a ref generation or equivalent lineage guard for mutation-sensitive operations. Force-push, delete/recreate or PR retarget MUST invalidate stale action previews/check assumptions tied to the previous generation.

# 33. Deployment Relationship

Repository state and deployment state are separate:

```text
SOURCE READY ≠ DEPLOYED
PR MERGED ≠ RELEASED
RELEASED ≠ RUNNING
REPOSITORY DELETED ≠ APP RETIRED
```

App/Mini App UI MAY present both source and deployment health together, but links them by stable IDs rather than conflating state machines.

---

# 34. Portability & External Deployment

Apps deployed outside SmartAIHub MAY retain source in:

- user GitHub;
- tenant/customer GitHub;
- provider-neutral Git repository;
- exported source archive where policy allows.

SPAAS remains the portable product/package contract. This spec ensures source binding can move without changing App identity.

---

# 35. State Models

## 35.1 Connection state

```text
PENDING
CONNECTED
DEGRADED
AUTH_EXPIRED
SUSPENDED
REVOKED
ERROR
```

## 35.2 Repository binding state

```text
DISCOVERED
BOUND_READ_ONLY
BOUND_READ_WRITE
STALE
ACCESS_LOST
DETACHED
ARCHIVED
```

## 35.3 Provisioning state

```text
REQUESTED
PREFLIGHT
CREATING
CREATED
INITIALIZING
BINDING
READY
FAILED_RECOVERABLE
FAILED_TERMINAL
```

These are distinct dimensions and MUST NOT be collapsed into one generic `status` string.

---

# 36. Freshness / Coverage / Confidence

Repository projections SHALL distinguish:

```text
Freshness: FRESH | AGING | STALE | UNAVAILABLE
Coverage: COMPLETE | COMPLETE_FROM_BIND_TIME | BOUNDED_RANGE | PARTIAL | UNKNOWN
Binding confidence: EXACT_PROVIDER_ID | VERIFIED_REMOTE_URL | USER_CONFIRMED | HEURISTIC | AMBIGUOUS
```

Heuristic/ambiguous bindings MUST NOT authorize mutation.

---

# 37. Observability

Monitor at minimum:

- connection success/failure;
- revoked/suspended connections;
- repository binding count by workspace scope;
- provisioning latency/failure/repair;
- webhook lag/failure/deduplication;
- reconciliation age;
- provider rate-limit state;
- stale binding count;
- permission mismatch count;
- failed/blocked mutation requests;
- public-repository creation events;
- transfer/export success/failure;
- orphan App↔Repo bindings;
- App/repository identity collision/ambiguity.

---

# 38. Scale Targets

Minimum production test profile:

```text
1 tenant: 1,000 users
1 user: up to 20 provider connections over lifetime
1 workspace: 1,000 bound repositories
1 project: 100 repositories
1 app: 20 repository bindings
platform: 100,000 repository bindings
webhook burst: 10,000 events/minute with backpressure
```

UI SHALL paginate/virtualize and SHALL NOT load all repository graphs into browser or LLM context.

---



# 38A. Membership Change / Offboarding

When a user leaves a tenant, loses a role, disconnects GitHub, or is disabled:

- SmartAIHub workspace authorization SHALL be re-evaluated immediately;
- personal connections SHALL not be silently transferred to the tenant;
- tenant-owned provider connections MAY continue according to tenant policy;
- repository bindings SHALL become `ACCESS_LOST`/reassigned/detached as appropriate, not deleted blindly;
- active mutation previews/leases using that principal's authority SHALL be invalidated or reauthorized;
- Apps/projects SHALL identify orphaned source ownership requiring an owner decision;
- provider repository deletion MUST NOT be an automatic offboarding side effect.

Ownership transfer requires an explicit receipt.

# 39. Implementation Phases

## G0 — Canonical registry and ownership discovery

- re-confirm feature-number availability and canonical ownership;
- resolve current revisions/owners for 224/261/277/279/282/284/287/288/292;
- discover existing GitHub/OAuth/GitHub App integration tables/services;
- discover existing Project/App/Tenant/User identity authorities;
- produce non-duplication map before schema creation.

## Phase A — Core identities and read-only federation

- GitWorkspace;
- provider connections;
- repository stable identity;
- access bindings;
- workspace/repository read UI;
- authorization fencing.

## Phase B — App/Project bindings

- AppRepositoryBinding / ProjectRepositoryBinding;
- monorepo root paths;
- SPAAS integration;
- Apps-first user UI.

## Phase C — Provisioning

- SmartAIHub-managed repo creation;
- user/tenant GitHub creation;
- idempotency/recovery;
- private-default/public-confirmation.

## Phase D — Provider work state

- branch/PR/check/review/merge queue;
- webhook/reconciliation;
- health projections.

## Phase E — Admin/Tenant surfaces

- Platform Engineering separation;
- Platform Managed inventory;
- tenant Git Workspace;
- policies/audit.

## Phase F — Chat

- typed read queries;
- stable scope/context;
- SPEC-279 mutation routing;
- disambiguation/stale-target protection.

## Phase G — Transfer/export/retirement

- copy/transfer/rebind/detach/archive/delete distinctions;
- receipts;
- portability tests.

## Phase H — Dual-run / migration

- map existing GitHub integrations;
- shadow reads;
- detect duplicate repository identities;
- migrate bindings without changing provider repositories;
- cutover via feature flags;
- rollback read path without rolling back provider state.

---

# 40. Acceptance Scenarios

1. Platform admin sees SmartAIHub engineering repos under Platform Engineering, while the admin's personal Mini App appears only under Admin Creator/User workspace.
2. Normal user cannot discover private Platform Engineering repo names.
3. User connects GitHub App with access to two repos; SmartAIHub shows only selected/authorized repos.
4. User creates Mini App → My GitHub → private repo provisioned idempotently → App binding created → repository visible under that App.
5. User creates Mini App with SmartAIHub Managed source → source remains user-owned scope, not Platform Engineering.
6. Tenant admin binds an org repo; user outside the tenant cannot access it despite sharing the same GitHub provider identity.
7. One App binds frontend/backend/infra repositories and remains one App identity.
8. One monorepo binds `/apps/a` and `/apps/b` to different Apps without repository duplication.
9. Repository is renamed/transferred/reinstalled; stable Repository identity survives while AccessBinding generation changes.
10. GitHub permission is revoked; UI/search/Chat/action caches stop revealing/acting on repository data.
11. Chat “merge ตัวนี้” after switching workspace cannot mutate a stale repo/PR target.
12. Read-only provider connection never exposes enabled merge/delete controls.
13. Provider repo create succeeds but SmartAIHub response times out; retry reconciles existing repo instead of creating duplicate.
14. App deletion does not delete repository unless a separately authorized provider-delete action is requested.
15. Managed repo export to user GitHub preserves App identity while Repository bindings/ownership route change.
16. Public repo creation requires explicit public-source exposure confirmation.
17. Importing untrusted repo does not execute package scripts/hooks.
18. Platform Mission Control can consume Platform Engineering repository projections without receiving user repository inventory by default.
19. User asks “Mini App ของฉันตัวไหน CI พัง?” and Chat answers only from authorized user/app scope.
20. Cross-tenant shared customer repository exposes only policy-authorized metadata through Work Context federation.


21. One GitHub App installation exposes a repo through two authorized workspace bindings; revoking one workspace removes only that workspace's access.
22. User disconnects personal GitHub but tenant-owned installation still provides authorized tenant access; personal scope does not inherit tenant access automatically.
23. User leaves tenant; personal repo remains personal, tenant repo access disappears, and no provider repo is deleted automatically.
24. Repository deleted outside SmartAIHub becomes `PROVIDER_MISSING`; a same-name repo recreated with new provider ID is not mistaken for the old repository.
25. Git LFS repo export with missing LFS objects reports incomplete source instead of success.
26. Submodule points to private external repo without authorization; import records unresolved nested source but does not clone it.
27. Force-push invalidates stale merge/action preview tied to old ref generation.
28. Provider automation secret update leaves only secret reference/audit metadata, never plaintext value.

---

# 41. Quality Gates

Implementation SHALL pass at minimum:

1. canonical registry resolution;
2. schema validation;
3. tenant/user/platform scope isolation;
4. stable repository identity tests;
5. access-binding generation/revocation tests;
6. GitHub App/OAuth CSRF and least-privilege tests;
7. credential leakage tests;
8. webhook signature/deduplication tests;
9. reconciliation-loss tests;
10. repository rename/transfer/reinstall tests;
11. App≠Repository multi-repo tests;
12. monorepo multi-App root binding tests;
13. path traversal/root normalization tests;
14. idempotent repository provisioning tests;
15. partial-create recovery tests;
16. private-default/public-confirmation tests;
17. read-only mutation suppression tests;
18. provider ruleset/merge-queue tests;
19. stale ref-generation mutation rejection tests;
20. import prompt-injection/untrusted-script tests;
21. search/aggregate authorization-before-ranking tests;
22. Chat context generation and wrong-target tests;
23. SPEC-279 mutation-route tests;
24. App delete vs repo delete separation tests;
25. export/transfer secret/data exclusion tests;
26. SmartAIHub-managed ownership/isolation tests;
27. SPAAS identity-preservation tests;
28. Mission Control integration tests;
29. mobile/tablet responsiveness tests;
30. WCAG/accessibility/non-color status tests;
31. webhook burst/backpressure tests;
32. provider rate-limit/degraded-mode tests;
33. cache/search invalidation on revoke tests;
34. audit receipt completeness tests;
35. dual-run migration/rollback tests.
36. shared-installation / multi-binding authorization tests;
37. alternate-connection revocation isolation tests;
38. user/tenant offboarding ownership tests;
39. provider out-of-band delete/restore identity tests;
40. Git LFS completeness/quota/auth tests;
41. submodule external-auth/no-recursive-execution tests;
42. provider automation secret non-disclosure tests;
43. ref-generation/force-push stale-action tests;
44. orphan source ownership detection tests;
45. no automatic provider deletion during offboarding tests.

---

# 42. 16-Pass Production Audit Closure

| Pass | Area | Gap/risk closed |
|---:|---|---|
| 1 | Authority | Prevented Git Workspace from becoming App/task/deployment authority |
| 2 | Scope isolation | Separated Platform Engineering, Admin Creator, Tenant, User, Customer and Platform Managed scopes |
| 3 | Identity | Separated repository identity from provider installation/access route |
| 4 | App topology | Added App≠Repo, multi-repo App and monorepo multi-App bindings |
| 5 | Provisioning | Added placement strategies, idempotency and partial-create reconciliation |
| 6 | Authorization | Required SmartAIHub policy ∩ workspace/tenant ∩ provider permission ∩ action policy |
| 7 | Security | Added least privilege, webhook/auth protection, untrusted repo isolation and public-repo confirmation |
| 8 | Lifecycle | Distinguished import/fork/clone/transfer/export/detach/archive/delete |
| 9 | Chat | Added explicit Git scope, generation-fenced context and single stable mutation target |
| 10 | Revocation/freshness | Added binding generations, cache/search invalidation, freshness/coverage/confidence |
| 11 | Portability | Preserved SPAAS App identity while source repository location can move |
| 12 | Operations | Added admin/user/tenant UI separation, observability, scale, migration and quality gates |
| 13 | Shared connections | Separated connection owner scope from repository/workspace binding and alternate access routes |
| 14 | Membership/offboarding | Prevented role loss/disconnect from deleting or silently transferring repositories |
| 15 | Nested/large Git source | Added Git LFS completeness and submodule authorization boundaries |
| 16 | Provider drift/ref safety | Added out-of-band delete/restore identity and ref-generation stale-action fencing |

Audit outcome: **implementation-ready after normal G0 ownership/non-duplication resolution**. R1.2 contains 26 independent production audit passes.

---

# 43. Explicit Non-Goals

This spec does NOT require:

- building a new Git server;
- mirroring every connected repository into SmartAIHub;
- exposing every repo in a connected GitHub account;
- replacing GitHub/GitLab provider UIs;
- forcing every App to use Git;
- forcing one App = one repo;
- forcing one repo = one App;
- giving platform admins automatic source access to user repositories;
- making provider access equal SmartAIHub authorization;
- making a Git commit equal an App release/deployment;
- storing plaintext provider credentials in project/read-model tables.

---

# 44. Final Architectural Invariant

> **Git is a source-control substrate; SmartAIHub owns the product/work context around it, not the user's repository by implication.**

> **Platform engineering source, platform-managed customer source, administrator creator work, tenant source and personal user source may share infrastructure, but they never share authority merely because they share a Git provider.**

> **An App keeps its identity even when its repositories are renamed, split, merged, transferred, exported or rebound.**

> **Every Git mutation is scoped twice: by SmartAIHub policy and by provider permission, then routed through the canonical command/approval path.**

# 45. R1.2 — Source Acquisition, Bidirectional Lineage, Fork/Clone/Import & Deployment Binding Amendment

This amendment is normative and additive. It closes the gap between repository connection and the real ways source enters SmartAIHub.

## 45.1 Source acquisition is not repository identity

SmartAIHub SHALL model how source was acquired independently from the current repository topology.

```text
SourceAcquisitionMethod
  CONNECT_EXISTING
  CLONE
  FORK
  IMPORT
  TEMPLATE
  GENERATED
  MARKETPLACE_CLONE
  ARCHIVE_IMPORT
  LOCAL_EXISTING
  MIRROR
```

A source acquisition record SHALL include, where known:

```text
source_acquisition_id
workspace_id
project_id?
app_id?
source_provider?
source_repository_id?
source_url_ref?
source_ref?
source_sha?
method
acquired_at
acquired_by_principal
source_license_ref?
source_visibility
provenance_confidence
```

`CLONE` MUST NOT imply that a provider-side fork exists. `FORK` MAY be a provider-native relationship. `IMPORT` MAY create an independent repository with no provider-native lineage.

## 45.2 Bidirectional repository lineage

The federation SHALL support both perspectives:

```text
CONSUMED_UPSTREAM      # we fork/derive from another source
EXPOSED_UPSTREAM       # others fork/derive from us
INTERNAL_DERIVATIVE    # another SmartAIHub user/tenant/workspace derives from us
EXTERNAL_DERIVATIVE    # an external provider principal/repository derives from us
```

Supported normalized relationships include:

```text
FORK_OF
UPSTREAM_OF
DERIVED_FROM
MIRROR_OF
TRANSFERRED_FROM
TEMPLATE_DERIVED_FROM
```

Provider-native fork relationships and SmartAIHub provenance relationships MUST remain distinguishable.

## 45.3 Fork inbound and outbound

The system SHALL represent:

```text
External upstream → our fork → our branch → PR back upstream
Our upstream       → external fork → external branch → PR into our repo
Internal upstream  → tenant/user fork → derivative App
```

A Pull Request SHALL bind base repository and head repository separately. Fork PR identity MUST NOT collapse to `repository + branch`.

Minimum PR source binding:

```text
pull_request_id
provider_pr_id
base_repository_id
base_ref
base_sha
head_repository_id
head_ref
head_sha
head_ref_generation
source_workspace_scope
linked_project_id?
linked_app_id?
linked_spec_id?
linked_workunit_ids[]
linked_requirement_ids[]
```

## 45.4 Clone-first development

A clone MAY exist before a writable remote exists. SmartAIHub SHALL support:

```text
External source
   ↓ clone
Local / Runner workspace
   ↓ development
optional later action:
   create repository
   attach writable remote
   export patch/bundle
   add upstream
   open PR
   continue as independent derivative
```

Mission Control SHALL be able to surface `DURABILITY_RISK` when valuable commits or changes exist only in non-durable local state.

## 45.5 Git remote roles

SmartAIHub MUST NOT hard-code remote name semantics such as `origin=ours` and `upstream=external`.

```text
GitRemoteBinding
  repository_or_workspace_id
  remote_name
  remote_repository_id?
  role:
    PRIMARY_PUSH
    UPSTREAM
    SOURCE
    MIRROR
    BACKUP
  fetch_url_ref
  push_url_ref?
  push_capability
  binding_generation
```

## 45.6 Upstream policy

Every long-lived derivative SHOULD declare intent:

```text
UpstreamPolicy
  TRACK_AND_CONTRIBUTE
  TRACK_ONLY
  ONE_TIME_IMPORT
  INDEPENDENT_DERIVATIVE
  MIRROR
```

`INDEPENDENT_DERIVATIVE` MUST NOT be continuously flagged merely because upstream advanced. Provenance remains visible without treating upstream drift as a blocker.

## 45.7 Provider visibility limit

SmartAIHub SHALL NOT claim to enumerate who cloned a repository when the provider does not expose clone identity. Known forks, PR-visible source repositories, connected internal derivatives and provider-supported topology may be displayed; unknown clones remain unknowable.

## 45.8 Repository-to-deployment target binding

SPEC-293 SHALL own only the source-side binding reference required to correlate a repository/app/project with deployment targets owned elsewhere.

```text
RepositoryDeploymentBinding
  binding_id
  repository_id
  project_id?
  app_id?
  package_root?
  environment_id
  deployment_target_id
  target_kind
  binding_generation
  authority_ref        # SPEC-261 / SPEC-267 / SPEC-295 projection authority
```

This binding DOES NOT make SPEC-293 the deployment authority.

## 45.9 App lineage remains separate from Git lineage

```text
SPAAS application lineage ≠ Git repository fork lineage
```

An App may be cloned while source is placed in a new repository; a repository may be forked without creating a new App identity. Both relationships MAY coexist but MUST be stored separately.

# 46. R1.2 Acceptance Additions

1. Clone external repo locally without a writable remote and preserve source SHA/provenance.
2. Later create a new repository and bind it as `DERIVED_FROM` without falsely creating `FORK_OF`.
3. Provider-native fork remains distinguishable from clone/import provenance.
4. Incoming PR from an external fork resolves distinct head/base repository identities.
5. Outbound PR from our fork to external upstream preserves SmartAIHub WorkUnit/Handoff links.
6. Internal tenant/user fork preserves tenant isolation and product lineage separately.
7. `INDEPENDENT_DERIVATIVE` does not generate false upstream-sync blockers.
8. Remote names may be arbitrary while normalized remote roles remain correct.
9. Valuable local-only commits produce `DURABILITY_RISK` until durably checkpointed or exported.
10. Unknown external clones are never inferred as known forks.
11. RepositoryDeploymentBinding can map one repo/root to multiple environments.
12. Deployment binding never grants deployment permission by itself.
13. Repo transfer/rename preserves deployment binding by stable repository identity.
14. App source can move repositories while App identity is preserved.
15. Monorepo roots can bind to different deployment targets without leakage.

# 47. R1.2 Quality-Gate Additions

46. source acquisition method/provenance schema tests;
47. clone-without-writable-remote durability tests;
48. provider fork vs SmartAIHub derivative distinction tests;
49. inbound/outbound fork relationship tests;
50. cross-repository PR head/base identity tests;
51. arbitrary remote-name normalized-role tests;
52. upstream policy behavior tests;
53. unknown clone non-inference tests;
54. local-only valuable work durability-risk tests;
55. repository-to-deployment binding generation tests;
56. deployment binding authorization non-escalation tests;
57. App lineage vs Git lineage separation tests;
58. monorepo deployment-root isolation tests;
59. repo move/rename deployment-binding persistence tests;
60. source provenance export/transfer tests.

# 48. Audit Passes 17–26

| Pass | Area | Gap/risk closed |
|---:|---|---|
| 17 | Acquisition | Added clone/fork/import/template/local-existing as explicit acquisition semantics |
| 18 | Lineage | Added provider-native vs SmartAIHub provenance separation |
| 19 | Direction | Added inbound/outbound/internal/external derivative perspectives |
| 20 | PR topology | Required distinct head/base repository identity for fork PRs |
| 21 | Clone workflow | Added local-first development before writable remote exists |
| 22 | Durability | Added durable-source destination risk for local-only valuable work |
| 23 | Remotes | Removed assumptions about `origin`/`upstream` names through normalized remote roles |
| 24 | Upstream intent | Added track/contribute/independent derivative policies |
| 25 | Provider truth | Prevented invented knowledge about unknown clones |
| 26 | Deployment linkage | Added source-side deployment target binding without stealing deployment authority |

R1.2 cumulative audit count: **26 independent passes**.


# 49. R1.2 Final Architectural Invariant

> **Repository topology, source provenance, and deployment topology are related but distinct.** SmartAIHub SHALL preserve clone/fork/import lineage without assuming provider-native relationships, and SHALL expose deployment bindings only as references to the canonical production authority.


---

# 50. R1.3 — External Source Trust, Fork-PR Security, Lineage Integrity & Repository Governance Amendment

This amendment is normative and additive. It hardens the source-acquisition and collaboration model introduced in R1.2. It does not create a legal-compliance engine, CI engine, Git server, code-signing authority, or software-supply-chain authority. It defines the repository facts and safety boundaries those existing authorities consume.

## 50.1 External-source legal/provenance observation

Clone, fork, import, template, mirror and archive-import operations MAY bring third-party source into SmartAIHub. The Git Workspace layer SHALL preserve provenance facts without pretending to make a legal determination.

Add:

```text
SourcePolicyObservation
  observation_id
  source_acquisition_id
  source_repository_id?
  source_sha?
  observed_license_ids[]          # SPDX IDs where mechanically detected
  license_file_refs[]
  notice_file_refs[]
  attribution_refs[]
  source_terms_url_ref?
  policy_state:
    UNKNOWN
    OBSERVED
    REVIEW_REQUIRED
    ALLOWED_BY_POLICY
    BLOCKED_BY_POLICY
  policy_ref?
  observed_at
  freshness
```

Rules:

- unknown license MUST NOT be silently converted into “allowed”;
- license/notice detection is evidence, not legal advice;
- repository transfer/export/marketplace publication MAY require a policy gate defined by the existing compliance/product authority;
- provenance MUST survive creation of a new independent repository after clone/import;
- a later source rewrite MUST preserve the acquisition source SHA/digest used at the time of derivation.

## 50.2 Commit trust and attestation facts

Repository state SHALL distinguish commit identity from commit trust evidence.

```text
CommitTrustObservation
  repository_id
  commit_sha
  signature_present
  provider_verification_state
  verification_reason?
  signer_identity_ref?
  author_identity_ref?
  committer_identity_ref?
  observed_at
```

A provider-reported verified signature is evidence about that commit/signature. It MUST NOT by itself prove that a SmartAIHub principal authorized the business action.

Branch protection/ruleset policy MAY require signed commits, but SPEC-293 only projects the provider fact and policy requirement.

## 50.3 Fork-originated pull requests are an untrusted-code boundary

An incoming PR from an external fork MUST be treated as untrusted source even when the base repository is trusted.

Normalized PR facts SHALL expose:

```text
PullRequestTrustProjection
  pull_request_id
  base_repository_id
  head_repository_id
  head_owner_scope
  head_is_fork
  head_is_external
  maintainer_can_modify
  source_trust_class:
    TRUSTED_INTERNAL
    TRUSTED_TENANT
    EXTERNAL_UNTRUSTED
    UNKNOWN
  secrets_available_to_ci
  privileged_workflow_requires_approval
  policy_refs[]
```

Security rules:

- Chat/UI MUST NOT imply that a PR is safe merely because required checks exist;
- executing fork-controlled code with production secrets, write tokens or privileged credentials requires the existing CI/security policy authority;
- `pull_request_target`-style privileged workflow patterns MUST be treated as a distinct high-risk execution path when an adapter detects equivalent provider semantics;
- checkout/run operations against external fork content MUST preserve head SHA/ref-generation fencing;
- retarget/force-push invalidates prior trust-sensitive previews and evidence tied to the replaced head SHA.

## 50.4 Repository lineage graph integrity

Provider-native fork topology and SmartAIHub provenance topology are related but not identical.

Each relationship SHALL carry:

```text
RepositoryRelationship
  relationship_id
  source_repository_id
  target_repository_id
  relationship_type
  provider_native: boolean
  provider_relationship_id?
  source_sha_at_derivation?
  target_initial_sha?
  relationship_generation
  discovered_at
  verified_at?
  confidence
```

Rules:

- self-relationships are invalid;
- provenance relationships such as `DERIVED_FROM`, `TEMPLATE_DERIVED_FROM`, and `MIRROR_OF` MUST be cycle-checked before mutation;
- a provider-native fork network MAY have provider-specific topology that is not representable as a simple SmartAIHub tree; preserve provider IDs instead of reconstructing it from names;
- `TRANSFERRED_FROM` records a lifecycle event and MUST NOT be interpreted as an upstream source dependency;
- rename/URL redirects MUST NOT create a second logical repository when the stable provider repository ID is unchanged;
- a new provider repository created under an old name is a new identity even if old URLs redirect ambiguously.

## 50.5 Secure clone/fetch boundary

User-supplied repository URLs and nested source references are untrusted input.

Every clone/fetch/import adapter SHALL enforce a SourceFetchPolicy that covers:

```text
allowed_provider_hosts
allowed_protocols
redirect_policy
credential_in_url_policy
local_file_protocol_policy
private_network_policy
max_object_count_or_bytes?
max_history_depth?
submodule_policy
lfs_policy
timeout
```

Minimum rules:

- credentials embedded in clone/fetch URLs MUST be redacted and MUST NOT be persisted;
- provider connection credentials are resolved by the canonical secrets/broker authority;
- redirect chains MUST be bounded and revalidated;
- local filesystem / arbitrary private-network source protocols MUST be denied unless an explicit authorized execution policy permits them;
- source acquisition MUST NOT recursively execute repository-supplied hooks or arbitrary commands;
- submodule/LFS retrieval follows the independent authorization rules already defined by this spec;
- suspicious or oversized source acquisition may be quarantined rather than partially trusted.

## 50.6 Source object completeness and durability

A repository/workspace can be logically connected while still lacking enough objects for durable recovery.

Add:

```text
SourceObjectCompleteness
  repository_or_workspace_id
  head_sha
  clone_mode:
    FULL
    SHALLOW
    PARTIAL
    SPARSE
    UNKNOWN
  commit_object_available
  required_history_available
  required_lfs_objects_complete
  required_submodules_resolved
  durable_remote_reachable
  completeness:
    COMPLETE_FOR_DECLARED_SCOPE
    PARTIAL_BUT_RECOVERABLE
    INCOMPLETE
    UNKNOWN
```

A shallow/partial clone is not automatically invalid, but handoff/export/transfer MUST state when required history or objects are unavailable.

`DURABILITY_RISK` MUST include valuable commits that are not reachable from any authorized durable remote or durable artifact/bundle.

## 50.7 Private/public fork lifecycle and permission drift

Fork lifecycle semantics vary by provider and visibility.

The adapter capability manifest SHALL declare whether it can observe:

```text
private_fork_permission_inheritance
fork_network_visibility
fork_deletion_on_access_revocation
upstream_fork_policy
maintainer_modify_permission
push_rules_inheritance
```

SPEC-293 MUST NOT generalize one provider's private-fork behavior to all providers.

When provider access changes, fork visibility and mutation capability SHALL be recalculated independently from cached repository metadata.

## 50.8 Monorepo/path binding impact candidates

`package_root` binds an App/package to source scope but is insufficient to prove impact when shared packages or build tooling change.

Add:

```text
RepositorySourceScopeBinding
  binding_id
  repository_id
  subject_kind: APP | PACKAGE | SERVICE | SPEC | DEPLOYMENT_TARGET
  subject_id
  include_paths[]
  exclude_paths[]
  shared_dependency_refs[]
  binding_generation
```

A path match is an **impact candidate**, not proof of runtime impact. SPEC-294/295 MAY combine it with build/dependency/release evidence to derive blast radius.

Changes to repository-wide files (lockfiles, build config, workspace config, shared libraries) MAY affect multiple bindings and MUST NOT be silently attributed to only one App.

## 50.9 Provider capability portability

Every Git provider adapter SHALL publish a versioned capability manifest instead of relying on GitHub assumptions.

At minimum:

```text
GitProviderCapabilityManifest
  provider
  adapter_version
  repository_stable_id
  fork
  cross_repo_pull_request
  merge_queue
  rulesets_or_branch_protection
  signed_commit_observation
  webhooks
  repository_transfer
  repository_restore
  releases
  actions_or_ci
  lfs
  submodules
  installation_scoping
  rate_limit_model
  observed_at
```

Unsupported capability MUST yield `UNSUPPORTED`, not false/empty state.

GitHub-specific concepts such as merge groups remain provider facts; the normalized layer maps them only when an equivalent semantic exists.

## 50.10 Managed repository recovery and exit

SmartAIHub-managed source MUST have an explicit portability/recovery contract.

For repositories where SmartAIHub is the hosting/provisioning owner, policy SHALL define:

- export format(s) supported;
- whether full Git history is included;
- LFS/submodule completeness;
- default branch/tags/releases included;
- transfer vs archive behavior;
- retention after tenant/user closure;
- recovery window and deletion authority;
- evidence receipt for completed export/transfer.

A repository must not be marked `EXPORTED_COMPLETE` when required Git/LFS/submodule objects are missing.

# 51. R1.3 Acceptance Additions

1. An external clone with no detected license is recorded as `UNKNOWN` and is not silently classified as allowed.
2. Source provenance survives clone → new independent repository creation with original source SHA retained.
3. External fork PR is classified `EXTERNAL_UNTRUSTED` even when targeting an internal trusted repository.
4. A privileged CI path cannot become safe merely because the PR check is green.
5. Force-pushing an external PR head invalidates trust-sensitive evidence bound to the old head SHA.
6. Repository rename with same stable provider ID does not create a new logical Repository.
7. A new repository created under an old repository name is treated as a new identity.
8. `DERIVED_FROM` and `MIRROR_OF` cycle attempts are rejected or quarantined for reconciliation.
9. Clone/fetch URL credentials are redacted and arbitrary local/private-network protocols are policy-gated.
10. Shallow/partial clones expose object-completeness state instead of claiming full source durability.
11. Private-fork visibility/access changes invalidate cached access without deleting an otherwise still-authorized logical repository.
12. Monorepo shared-file change can map to multiple candidate Apps/services.
13. Provider without merge-queue support reports `UNSUPPORTED`, not an empty healthy merge queue.
14. Managed repository export does not report complete while required LFS/submodule content is unresolved.

# 52. R1.3 Quality-Gate Additions

41. external-source provenance/license-observation tests;
42. commit-signature/trust-fact projection tests;
43. external-fork PR untrusted-boundary tests;
44. privileged CI / secret-exposure policy-routing tests;
45. repository-lineage cycle and transfer-semantics tests;
46. rename/redirect/provider-ID identity tests;
47. secure clone/fetch protocol/redirect/credential-redaction tests;
48. shallow/partial/LFS/submodule completeness tests;
49. private/public fork capability and revocation tests;
50. monorepo/path-impact candidate tests;
51. provider capability-manifest fallback tests;
52. SmartAIHub-managed repository export/recovery completeness tests.

# 53. Audit Passes 27–36

| Pass | Lens | Gap found | R1.3 resolution |
|---:|---|---|---|
| 27 | Third-party source | Provenance had a license ref but no policy/evidence model | Added SourcePolicyObservation and explicit unknown/review semantics |
| 28 | Supply-chain trust | Commit signature/trust facts were not modeled | Added CommitTrustObservation without conflating signature with business authorization |
| 29 | Fork PR security | Incoming fork code could look equivalent to internal PR code | Added PullRequestTrustProjection and privileged-CI boundary |
| 30 | Lineage integrity | Derived/mirror relationships lacked cycle/transfer semantics | Added relationship generations, cycle checks and transfer distinction |
| 31 | Clone/fetch security | Untrusted source URLs lacked protocol/redirect/private-network controls | Added SourceFetchPolicy and secret-safe acquisition rules |
| 32 | Source durability | Shallow/partial clones could appear fully recoverable | Added SourceObjectCompleteness and stronger DURABILITY_RISK |
| 33 | Fork lifecycle | Private/public fork permission behavior was too provider-assumed | Added capability-discovered fork lifecycle semantics |
| 34 | Monorepo impact | package_root alone could under-report affected Apps/services | Added RepositorySourceScopeBinding and impact-candidate semantics |
| 35 | Provider portability | GitHub capabilities could leak into generic provider assumptions | Added versioned GitProviderCapabilityManifest |
| 36 | Managed hosting exit | Managed repositories lacked complete recovery/export proof | Added history/LFS/submodule-aware recovery and exit contract |

R1.3 cumulative audit count: **36 independent passes**.

# 54. R1.3 Final Architectural Invariant

> **A connected repository is not automatically trusted, complete, durable, legally cleared, or safe to execute.** SPEC-293 preserves stable repository identity, source acquisition/provenance, provider capability, access, fork/PR trust and source completeness so downstream systems can make authorized decisions without guessing from names or GitHub UI state.

# 55. R1.4 — Privileged CI, Governance, Immutable Ref & Source-Portability Amendment

This amendment is normative. It closes source-control gaps that become material once SmartAIHub accepts external contributions, creates releases, deploys through Git-hosted automation, imports archives, or operates repositories with multiple remotes. It does **not** create a CI executor, legal engine, deployment engine, or branch-protection authority.

## 55.1 Privileged workflow execution trust

`PullRequestTrustProjection` SHALL be extended with workflow-execution trust so that “the PR check is green” cannot erase the difference between untrusted code and privileged credentials.

```text
WorkflowExecutionTrust
  repository_id
  workflow_identity
  trigger_kind
  workflow_source_ref
  checkout_source_ref?
  checkout_trust_class
  token_permission_class
  secret_access_class
  oidc_enabled
  oidc_trust_policy_ref?
  environment_protection_ref?
  self_hosted_runner_class?
  cache_write_capability?
  privileged_execution:
    NONE
    REVIEW_REQUIRED
    APPROVED
    BLOCKED
    UNKNOWN
  evidence_refs[]
  observed_at
```

Rules:

- privileged workflow context MUST NOT execute external/fork-controlled code merely because the workflow definition itself came from a trusted base branch;
- adapter detection of `pull_request_target`, `workflow_run`, comment-triggered checkout, downloaded fork artifacts, or equivalent privileged-provider flows SHALL mark the execution path for explicit trust evaluation;
- write-capable tokens, repository/org secrets, deployment credentials, private-network reachability and reusable self-hosted runners SHALL increase the privilege classification;
- OIDC is preferred where the deployment authority supports it, but the OIDC trust policy MUST bind the intended repository/workflow/ref/environment identity and MUST NOT authorize arbitrary untrusted repositories;
- a stale workflow/governance snapshot cannot authorize a mutation after head/ref generation, policy generation, environment protection or credential epoch changes.

## 55.2 Repository governance snapshot

SPEC-293 SHALL project provider governance facts independently from PR state.

```text
RepositoryGovernanceSnapshot
  repository_id
  governance_generation
  default_branch_ref
  ruleset_refs[]
  branch_protection_refs[]
  tag_protection_refs[]
  required_status_checks[]
  required_review_count?
  code_owner_review_required?
  codeowners_ref?
  merge_queue_required?
  signed_commit_required?
  force_push_allowed?
  deletion_allowed?
  actions_policy_ref?
  deployment_environment_refs[]
  bypass_actor_refs[]
  observed_at
  freshness
```

`CODEOWNERS` presence is evidence only. When provider policy requires code-owner review, merge readiness SHALL consume the provider rule and the review state for the current diff/ref generation.

## 55.3 Immutable tag / release provenance

Tags and releases are labels around Git objects and MAY be mutable unless policy proves otherwise. Release-sensitive records SHALL pin immutable object identity rather than trust a tag name alone.

```text
TagObservation
  repository_id
  tag_ref
  ref_generation
  object_id
  peeled_commit_id?
  annotated
  signature_observation?
  protected_by_policy?
  observed_at

GitReleaseSourceBinding
  provider_release_id
  repository_id
  tag_observation_ref?
  pinned_commit_id
  source_tree_id?
  release_generation
  evidence_refs[]
```

Moving/recreating a tag after a build/release MUST create drift and MUST NOT rewrite historical release provenance silently.

## 55.4 Federated automation credentials and deployment identity

Provider automation identity SHALL be separate from human/provider-account identity.

```text
AutomationPrincipalBinding
  automation_principal_id
  provider
  repository_id?
  organization_id?
  workflow_identity?
  credential_kind: GITHUB_TOKEN | OIDC | APP_TOKEN | DEPLOY_KEY | OTHER
  privilege_scope
  environment_scope?
  audience_or_trust_ref?
  credential_epoch?
  expires_at?
```

Rules:

- short-lived/federated credentials SHOULD be preferred where supported;
- deploy keys/tokens MUST NOT be silently shared across tenants/repositories;
- credential binding does not grant SmartAIHub business authority beyond the intersected policy gates in §14;
- secret values remain with the canonical secret authority and are never projected here.

## 55.5 Disappearing fork / PR head durability

A fork source repository or branch can be deleted or become inaccessible after a PR is opened.

```text
PullRequestSourceAvailability
  pull_request_id
  head_repository_id?
  head_ref?
  last_observed_head_object_id?
  provider_patch_or_merge_ref?
  availability:
    AVAILABLE
    HEAD_REF_DELETED
    REPOSITORY_UNAVAILABLE
    ACCESS_LOST
    PROVIDER_ARCHIVED
    UNKNOWN
  durable_evidence_refs[]
```

Mission Control MUST preserve the last authorized evidence and mark source availability explicitly; it MUST NOT invent current fork state or treat disappearance as approval/closure.

## 55.6 Archive / bundle import safety

`ARCHIVE_IMPORT` and uploaded Git bundle/archive acquisition SHALL have extraction controls independent of normal Git fetch.

```text
ArchiveImportPolicy
  max_compressed_bytes
  max_expanded_bytes
  max_entry_count
  path_normalization
  reject_absolute_paths
  reject_parent_traversal
  symlink_policy
  special_file_policy
  nested_archive_policy
  malware_scan_ref?
```

Archive extraction MUST defend against path traversal, archive bombs, special-device entries and unauthorized symlink escape. Imported archive provenance SHALL bind an immutable content digest even when no Git commit exists yet.

## 55.7 Recursive submodule / nested-source bounds

Submodule and nested-source traversal SHALL be bounded.

```text
NestedSourceResolutionPolicy
  max_depth
  max_total_repositories
  cycle_detection
  inherited_credentials: NEVER | EXPLICIT_ONLY
  allowed_hosts[]
  unresolved_behavior: FAIL | PARTIAL_WITH_EVIDENCE | SKIP_BY_POLICY
```

A recursive source cycle or credential-reuse attempt MUST NOT become an infinite fetch loop or cross-repository secret leak.

## 55.8 Multi-remote divergence and canonical push destination

A local clone MAY have several writable remotes. SmartAIHub SHALL not infer that the remote named `origin` is canonical.

```text
RemoteSyncProjection
  workspace_id
  remote_binding_id
  remote_role
  fetch_head?
  push_head?
  ahead_behind?
  writable
  canonical_push_candidate
  divergence_state:
    IN_SYNC
    LOCAL_AHEAD
    REMOTE_AHEAD
    DIVERGED
    UNKNOWN
```

Before checkpoint/promotion, the canonical push/integration destination SHALL come from repository/project policy, not the remote name.

## 55.9 Opaque Git object identity

Reusable Git logic MUST treat object IDs as opaque algorithm-qualified identifiers rather than assuming a 40-character SHA-1 string.

```text
GitObjectId
  algorithm
  hex_or_provider_value
```

Database schemas, APIs, regex validation and UI truncation MUST NOT make SHA-1 length a semantic invariant. Provider adapters MAY normalize current provider IDs while preserving the algorithm/format metadata where known.

## 55.10 Governance generation fencing for actions

Mutation preconditions SHALL fence both source generation and governance generation.

```text
GitMutationPrecondition
  repository_id
  repository_generation
  ref_generation?
  governance_generation
  access_binding_generation
  conversation_context_generation?
  expected_head_object_id?
```

A merge/tag/release/push preview produced before a ruleset, CODEOWNERS requirement, deployment-environment gate, access binding or branch-protection change MUST be re-evaluated before execution.

# 56. R1.4 Acceptance Additions

1. A privileged workflow cannot execute an external fork head with write token/secrets merely because the workflow came from the base branch.
2. OIDC deployment identity with an over-broad repository/ref trust condition is surfaced as policy risk rather than treated as automatically safe.
3. CODEOWNERS/ruleset/required-review state is generation-fenced and stale approval state is not reused after the diff/head changes.
4. A moved/recreated tag creates release-source drift while the historical release remains pinned to its original commit/object evidence.
5. Deployment automation credentials are represented as automation principals and cannot silently expand a user's or tenant's SmartAIHub authority.
6. Deleted/inaccessible fork head preserves last authorized PR evidence and becomes `HEAD_REF_DELETED`/`REPOSITORY_UNAVAILABLE`, not “clean/merged”.
7. Archive import rejects path traversal/archive-bomb/symlink escape according to policy and records immutable archive digest provenance.
8. Recursive submodules are depth/count/cycle bounded and do not inherit provider credentials implicitly.
9. A workspace with two writable remotes reports divergence/canonical destination from project policy rather than remote naming convention.
10. Object IDs longer/different from SHA-1 format are accepted by generic persistence/API contracts.
11. A ruleset/governance change after preview invalidates the old merge/tag/release mutation precondition.
12. Tag protection capability unsupported by a provider yields `UNSUPPORTED/UNKNOWN`, not false “unprotected”.

# 57. R1.4 Quality-Gate Additions

53. privileged-workflow/fork-code/secret-isolation tests;
54. OIDC trust-scope and automation-principal tests;
55. CODEOWNERS/ruleset/governance-generation tests;
56. tag move/recreate and immutable release-source tests;
57. fork-head deletion/source-availability tests;
58. archive-import traversal/bomb/symlink tests;
59. nested-source recursion/cycle/credential-inheritance tests;
60. multi-remote divergence/canonical-destination tests;
61. opaque Git object-ID schema/API tests;
62. governance-precondition stale-action tests.

# 58. Audit Passes 37–46

| Pass | Lens | Gap found | R1.4 resolution |
|---:|---|---|---|
| 37 | Privileged CI | Fork PR trust existed but privileged workflow + untrusted checkout could still expose secrets/tokens | Added WorkflowExecutionTrust and explicit privileged-execution fencing |
| 38 | Governance | Rulesets/protection were facts but lacked one generation-fenced governance snapshot | Added RepositoryGovernanceSnapshot |
| 39 | Tag/release provenance | Mutable tag names could be mistaken for immutable release source | Added TagObservation + pinned GitReleaseSourceBinding |
| 40 | Automation identity | Human/provider connection identity could blur with CI/deployment credentials | Added AutomationPrincipalBinding and OIDC/deploy-key boundaries |
| 41 | Fork disappearance | Deleted/inaccessible head repos could collapse into generic PR state | Added PullRequestSourceAvailability |
| 42 | Archive imports | Clone/fetch hardening did not cover uploaded archives/bundles | Added ArchiveImportPolicy |
| 43 | Nested sources | Submodule authorization lacked recursion/cycle/credential bounds | Added NestedSourceResolutionPolicy |
| 44 | Multi-remote clones | `origin` convention could accidentally become canonical push authority | Added RemoteSyncProjection and policy-owned destination |
| 45 | Git object format | Generic APIs could accidentally hard-code SHA-1 length | Added opaque algorithm-qualified GitObjectId |
| 46 | Stale governance | Source generation fencing alone did not invalidate actions after policy/ruleset changes | Added governance-generation mutation preconditions |

R1.4 cumulative audit count: **46 independent passes**.

# 59. R1.4 Final Architectural Invariant

> **Source identity, execution trust, repository governance and release labels are separate dimensions.** No PR check, tag name, remote name, provider connection, workflow credential or cached preview may silently substitute for current authorization, immutable object provenance and generation-fenced policy.

# 60. P0 Project Workspace Authority & Repository Convergence

This amendment supersedes any earlier boundary that excluded local worktree
lifecycle from SPEC-293. SPEC-293 is the normative authority for project and
repository identity, canonical remote/ref/SHA, workspace identity and role,
execution ownership, dirty-work recovery, canonical user workspace convergence,
and temporary worktree lifecycle. SPEC-294 consumes these facts as a UI
projection; SPEC-295 consumes integrated source identity as the source side of
production convergence. Neither creates a competing workspace authority.

## 60.1 Workspace authority records

Each project/repository binding MUST resolve through one shared authority
registry. Its record includes stable project and repository IDs, canonical
remote/ref/current SHA, the canonical user workspace ID/location, and workspace
IDs with role, HEAD, branch/upstream, dirty and untracked state, session/runner
owner and lease, creator/task/session, creation time, last verified state,
convergence state, and recovery linkage. Git paths, branch names, suffixes,
status labels, and creator identity are observations; they MUST NOT confer
authority.

Every observed workspace has exactly one role: `CANONICAL_USER_WORKSPACE`,
`TASK_WORKTREE`, `SESSION_WORKTREE`, `INTEGRATION_WORKTREE`,
`RECOVERY_WORKSPACE`, `EXTERNAL_WORKSPACE`, or `UNKNOWN_WORKSPACE`. One active
canonical user workspace is permitted per project/repository binding. External
hosts require explicit registration and fresh host/runner evidence; a local
process scan cannot assert their session is active or closed.

## 60.2 Dirty preservation and convergence

After integration, the registered canonical user workspace MUST converge to
the latest configured canonical ref and verify exact SHA equality before
development completion. A clean workspace may fast-forward only after proving
repository identity, explicit role, no active owner conflict, no unique local
commit/stash, and latest-ref stability. Dirty work MUST be left byte-for-byte
untouched while staged, unstaged, and untracked state is preserved in a
restricted recovery archive and linked by a durable receipt. Unique local
commits, stashes, inaccessible ownership, branch-use conflicts, or moving
canonical refs produce a blocker; they do not authorize reset, overwrite, or
automatic cherry-pick.

## 60.3 Workspace and execution lifecycle

Session activity is derived from live runner/process identity plus a
non-expired lease, not from dirty files, a registered worktree, or a local
branch. Report `ACTIVE_SESSION`, `DIRTY_WORKSPACE`, `WORKTREE_EXISTS`,
`LOCAL_BRANCH_EXISTS`, and untracked content independently. Temporary
workspaces record owner, task/session, creation time, expected lifecycle,
integration and retirement state. A completed clean worktree is retireable
only when it has no live owner, dirty/untracked/ignored/stashed data or unique
unpushed commit, and integration or explicit archive disposition is evidenced.
Retirement supports dry-run and creates no destructive mass cleanup path.

`DEVELOPMENT_COMPLETE` requires integrated source, canonical-ref verification,
canonical-user-workspace convergence, settled/retired temporary-worktree
lifecycle, and all required fresh checks. `RELEASE_COMPLETE` additionally
requires artifact provenance, settled required migrations, deployment, runtime
convergence, and health evidence. `PROJECT_CONVERGED` requires both for the
selected target. Receipts bind project/repository/workspace/task/session,
source/integration/target SHA, actor, authority, result and timestamp; they are
written through the existing Handoff/evidence architecture.

## 60.4 Reference implementation and compatibility

The current local reference resolver is
`scripts/development-lifecycle/workspace_authority.py`; it stores shared
worktree identity/leases/receipts in the Git common directory, keeps recovery
archives outside tracked source, and exposes resolve, register, preserve,
converge, verify and dry-run/apply retirement operations. SPEC-224 orchestration
remains supported through an adapter: a final-verification result alone is not
workspace convergence evidence. Providers without a persistent user filesystem
MAY bind convergence to their managed project workspace, with the same receipt
semantics. Cross-host ownership and Mission Control UI remain dependent on
their registered runner/provider adapters and MUST report `UNKNOWN` when proof
is stale or absent.
