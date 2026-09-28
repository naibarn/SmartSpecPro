# Tenant and Media Identity Hardening Design

Date: 2026-08-18
Status: Approved direction, pending written-spec review

## Problem

Managed media references require both a user and tenant before they can be
converted into provider-safe broker URLs. The boundary correctly fails closed,
but several callers provide only `userId`, and `MediaAuditContext.tenantId`
remains optional. Some flows work only because a bearer token happens to carry
the tenant, while other flows use session or background tokens without it.

The same repository also contains tenant-bearing tables whose queries sometimes
filter by user without an explicit tenant predicate. Those queries need a
separate compatibility-aware hardening pass because some rows and services are
intentionally user-global or support legacy null tenant rows.

## Goals

- Make tenant identity explicit at every managed-media submission boundary.
- Remove dependence on bearer-token parsing as the primary identity contract.
- Preserve legacy public-reference and user-global behavior where it is
  intentional and documented.
- Add regression and static checks that prevent user-only propagation from
  returning unnoticed.
- Harden tenant-bearing write queries when the caller already has canonical
  tenant context.

## Non-goals

- No live provider generation, deployment, or production data mutation.
- No broad conversion of every user-owned table to tenant-only semantics.
- No Python or Drizzle schema migration until live schema/ledger compatibility
  is reviewed separately.
- No rewrite of unrelated dirty-worktree changes.

## Options Considered

### Option A: Patch only the incident callers

Add `tenantId` to the async image and video router requests. This is small but
leaves the same defect in Marketplace, Presentation, Production, Skills, and
Automation, and provides no recurrence guard.

### Option B: Central actor contract plus phased caller migration (selected)

Introduce a small tenant-media actor/context builder, migrate all confirmed
reference-bearing callers and internal media tokens, and add static and runtime
regressions. Follow with tenant-aware mutation-query fixes where tenant context
already exists. This closes the incident class while retaining compatibility.

### Option C: Immediate breaking tenant contract and schema enforcement

Make tenant non-null across all media, Python task, and tenant-bearing database
models at once. This provides the strongest final invariant but is too risky for
the current dirty checkout and mixed legacy data without a migration inventory.

## Selected Architecture

### 1. Canonical tenant-media actor

Use one explicit shape at provider-facing call sites:

```ts
type TenantMediaActor = {
  userId: number;
  tenantId: string;
};
```

Request-boundary routers resolve the tenant with `resolveTenantIdVarchar`.
Background services use their already-authoritative actor/run tenant. A helper
builds `MediaAuditContext` from this actor plus trace metadata. The actor is not
inferred from an arbitrary URL and does not silently fall back to `"default"`.

Bearer-token verification remains a compatibility fallback for public URLs and
legacy integrations, but managed references must be backed by the explicit
actor supplied by the authoritative server caller.

### 2. Caller migration

Migrate reference-bearing image/video/audio and nested URL-like `extraParams`
callers in these surfaces:

- Media Studio sync, async, queued, deferred, retry, and status flows
- Marketplace direct and staged review
- AI Presentation
- Production Director
- Work Automation
- Skill Executor
- MCP and unified orchestration paths currently relying on tenant-bearing JWTs
- Auto Team media execution

Internal media tokens created for those flows must carry the same tenant as the
audit actor. Stored retry records must preserve the actor so retries do not lose
scope after the originating request ends.

### 3. Type and runtime enforcement

Keep non-reference public media requests compatible, but provide a
tenant-required request/helper for managed-reference resolution. Do not make all
`MediaAuditContext` fields globally required because status/audit-only callers
and legacy public-reference calls have different contracts.

Runtime behavior remains fail-closed for managed storage when user, tenant, or
public URL is unavailable. Error metadata should identify source and stage but
must not expose signed broker tokens.

### 4. Query hardening phase

For tenant-bearing update/delete queries where the service already receives a
tenant, add the tenant predicate and update focused tests. Prioritize
conversation mutations, Marketplace capture/product mutations, billing payment
method default changes, user API keys, and notification mutations.

Queries that are intentionally user-global or support legacy null-tenant rows
must use an explicit named helper or exemption comment. The first pass does not
make tenant columns non-null and does not introduce RLS or a migration.

### 5. Recurrence prevention

Add a repository static check covering:

- media generation requests with reference fields but no explicit tenant actor;
- internal media bearer tokens with a user but no tenant, unless exempted;
- tenant-bearing mutation queries with a user predicate but no tenant predicate
  or documented exemption.

The check should use TypeScript AST analysis, avoid regex-only false positives,
and run as a focused CI/test script without adding a new dependency.

## Test Strategy

Use red-green-refactor for tenant isolation changes.

- Unit-test the actor/context builder and managed-reference fail-closed behavior.
- Add router/service assertions that the canonical tenant reaches image and
  video async submissions.
- Cover deferred and background retry persistence.
- Cover Marketplace, Presentation, Production, Skill, Work Automation, MCP, and
  Auto Team request construction.
- Cover managed image, style, video, audio, and nested `extraParams` URLs.
- Verify tenant A cannot resolve or mutate tenant B resources even when the
  numeric user matches.
- Run focused TypeScript tests, touched-file diagnostics, static audit, and
  scoped `git diff --check`.

Full repository typecheck failures must be separated from focused failures in
the heavily dirty baseline. No browser, provider, deployment, or authenticated
production proof is claimed unless actually performed.

## Failure and Compatibility Behavior

- Missing tenant plus managed reference: reject before provider submission and
  before consuming unrecoverable provider spend.
- Missing tenant plus already-public reference: retain compatibility, with an
  audit warning where appropriate.
- Retry/deferred task missing stored actor: fail terminally and refund through
  the existing flow rather than submitting unscoped.
- Legacy null-tenant database rows: readable only through an explicit
  compatibility clause; new tenant-aware writes must not broaden to other
  tenants.

## Rollout Order

1. Add failing propagation and static-guard tests.
2. Add canonical actor/context helper and migrate Media Studio async/deferred.
3. Migrate background and cross-feature media callers/tokens.
4. Add and run the static recurrence check.
5. Harden high-risk tenant-bearing mutation queries with focused tests.
6. Run security review, impact closure, and convergence gates.
7. Record Python/schema migration work separately if current live schema
   evidence proves it is required.

## Acceptance Criteria

- Every confirmed managed-reference caller supplies explicit user and tenant.
- No target flow depends solely on JWT tenant fallback.
- Focused regression tests cover sync, async, background, and retry paths.
- The static guard reports no unexplained target violations.
- High-risk tenant-bearing mutations include tenant scope or an explicit
  reviewed exemption.
- Existing unrelated worktree changes remain untouched.

