# Synthesized implementation specification — Feature 163

Feature 163 replaces the Worker App's four-tab surface with a route-backed
Sidebar shell, Topbar, selected-Series context, scalable screen registry, and
global Quick Actions. Feature 163 owns Series discovery/binding, local folder
root lifecycle, queue/runtime/access surfaces, and the orchestration UX; it
hosts Feature 162's Media Workspace child screens without duplicating media
algorithms.

The Worker discovers Series through a REST Control Plane using existing token
and device-proof auth. The server derives tenant and paired account from
durable Worker/connected-device records, resolves private/groups/tenant access
through a neutral access service, and fails closed on unresolved ownership.
Client `userId`, owner, tenant, raw paths, arbitrary workflow graphs, shell
commands, and provider payloads have no authority.

The feature must add typed paginated list/detail/bind/revoke/workspace/
Quick-Action routes with request IDs, contract versions, scopes, idempotency,
cursor signing, rate limits, stable errors, optimistic concurrency, and safe
projections. Execution and upload token scopes derive from one canonical
registry and explicit media-operator policy.

Native Tauri commands own folder picking, validation, scan preview, local job
state, HMAC root fingerprints, protected credential/cache storage, crash
recovery, and one background coordinator per Worker. Unbind drains or
quarantines pinned jobs, blocks later publication, and never deletes source
footage or verified artifacts. Feature flags, additive migration, dry-run
conflict reporting, rollback, unpair/delete revocation, accessibility,
responsive UI, legacy tab aliases, focused tests, and implementation evidence
are required.
