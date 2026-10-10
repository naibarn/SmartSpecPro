# Phase 1 Security Review

Review target: invocation receipt and SPEC-269 App/Project memory integration in this worktree.

| Pass | Review axis | Result and disposition |
|---|---|---|
| 1 | Client identity spoofing and ingress provenance | No authenticated ingress assertion is available to the Express application. `createContext` therefore always sets `trustedAppContext: null`; neither Host, X-Forwarded-Host, appId, hostAppId, nor projectId can establish App authority. Project-scoped router reads deny before receipt issuance on all current HTTP ingress paths. PASS for fail-closed behavior; authenticated custom-domain positive routing remains pending. |
| 2 | Tenant isolation and active principal | Receipt issue and every validation join current user tenant, disabled state, active tenant, and Project tenant. Foreign tenant, changed tenant, disabled user, or unavailable DB denies. PASS; unit tests cover tenant change and foreign tenant. |
| 3 | Project membership/ACL role | Current membership principal, lifecycle, and recognized `owner`/`editor`/`viewer` role are checked on issue and again on validation. Revoked or unknown role denies. PASS; revocation/unknown-role tests pass. |
| 4 | App identity and Project binding | Current App tenant/lifecycle and active Project-App binding are required on issue and every read. Unbound or revoked App binding denies. PASS; cross-App/revoked binding test passes. |
| 5 | Conversation/session retargeting | Conversation ownership and tenant are re-read; missing, moved, or Project-switched conversations invalidate evidence. Session and conversation IDs are compared when supplied. PASS; Project-switch test passes. |
| 6 | Ambiguous, unresolved, and no-project contexts | Only a server-owned conversation binding or an explicit candidate enters the advisory resolver. Unresolved conversation is `UNRESOLVED`; null binding is `NO_PROJECT`; both have no destination. Invalid states cannot validate. PASS; covered by authority and context-builder tests. |
| 7 | Write ceiling and migration boundary | Invocation receipt has read-only authorization. Project-scope create/update/delete/promote are denied until durable receipt exists. No schema migration or production write grant was added. PASS; router tests cover denial. |
| 8 | Protected content access ordering | Scoped memory router reads owner metadata first, authorizes current scope, then fetches memory content. Search authorization is checked for every requested scope. PASS; tests assert content fetch follows authorization. |
| 9 | Memory isolation and provenance | Chat injects Project memory only when the same App-bound receipt is freshly validated; user/global scope remains policy-permitted. Team-room persistent memory stays filtered under existing provenance protection. PASS for tested executor path; deployed/provider acceptance remains pending. |
| 10 | Receipt integrity, failure behavior, and correlation | Receipts are frozen and invocation-local; cloned receipts, cross-scope reuse, DB failures, and writes fail closed. Policy versions, provenance, issue time, correlation, and authorization reference are included. PASS; authority suite covers clone/scope/write/DB-failure cases. |

## Independent review follow-up

- P1 Host spoofing finding: resolved in application runtime by removing Host-derived App authority. Project memory reads fail closed whenever the request context has no server-provided trusted App context. Current deployment evidence does not support restoring App-bound reads.
- Ingress inspection: `cloudflared` is active with static `smartaihub.app`/`www` routing to `localhost:3000`; no App custom-domain route is configured. The Node service listens on `0.0.0.0:3000`, so direct-origin network reachability is not excluded by listener binding. Nginx configuration forwards `$host` and does not overwrite client X-Forwarded-Host; `nginx -T` could not validate the running container configuration because its dev-host upstream failed DNS resolution. External firewall/Cloudflare origin restrictions remain unverified. No production settings were changed.
- Context propagation: chat unified, fallback, and context-pack paths receive only `ctx.trustedAppContext`; the current HTTP context builder supplies null. The context builder keeps Global/Personal memory paths available.
- Exact-main failure disposition: `chatUnifiedWiring.test.ts` was run against detached `b1f2d52e5ba864685dc28414c6f49d7ffe9523eb`; 15/16 tests passed. The remaining assertion expected `agencyEscalation` and `hybridPlan` fields absent from the current `RoomIntentDecision` contract. Those obsolete expected fields were removed; the runtime was not changed.
- T-01 App-private versus global memory: no App-scoped memory dimension exists. Existing user-global memory remains shared by policy; T-01 is not PASS until App-private isolation behavior is defined and tested.
- Durable receipt reference: Phase 1 intentionally provides invocation-local read evidence only. No durable audit row is claimed; Project-shared writes remain denied pending Phase 2.

## Limits

- These are source-level review passes and focused automated tests, not a production authorization audit.
- Ten targeted review axes were rerun against the fail-closed implementation: (1) Host/X-Forwarded-Host spoofing, (2) direct-origin bypass, (3) duplicate/conflicting host headers, (4) same-tenant wrong App, (5) cross-tenant alias, (6) current tenant/principal binding and membership revocation, (7) App–Project binding revocation, (8) unresolved/no-project destination selection, (9) durable write ceiling and protected-read ordering, and (10) unified/fallback propagation with Global/Personal behavior. Untrusted ingress cases produce no trusted App context; Project reads deny before receipt or content access.
- Authorization and subsequent retrieval are separate database operations; validation is refreshed immediately before each protected retrieval path, but the DB does not provide a cross-operation transaction snapshot.
- T-01–T-09 and T-18 are fixture-ready only except for individual unit contracts named above. They are not reported as direct acceptance PASS.
- T-15 local contract acceptance is covered by two passing tests; DNS, certificate issuance, and deployed custom-domain routing are not covered.
