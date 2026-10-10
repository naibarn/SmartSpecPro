# Phase 1 Security Review

Review target: invocation receipt and SPEC-269 App/Project memory integration in this worktree.

| Pass | Review axis | Result and disposition |
|---|---|---|
| 1 | Client identity spoofing | `hostAppId` and Project ID are absent from request-body authority inputs. The route derives App identity from the request host alias and Project from the owned conversation row. A scoped-memory Project ID is treated as a candidate and must equal the validated conversation Project. A separate review flagged that direct-origin Host spoofing depends on ingress host/SNI enforcement; no live ingress evidence is available here, so this sub-boundary remains PENDING_EXTERNAL_VERIFICATION. |
| 2 | Tenant isolation and active principal | Receipt issue and every validation join current user tenant, disabled state, active tenant, and Project tenant. Foreign tenant, changed tenant, disabled user, or unavailable DB denies. PASS; unit tests cover tenant change and foreign tenant. |
| 3 | Project membership/ACL role | Current membership principal, lifecycle, and recognized `owner`/`editor`/`viewer` role are checked on issue and again on validation. Revoked or unknown role denies. PASS; revocation/unknown-role tests pass. |
| 4 | App identity and Project binding | Current App tenant/lifecycle and active Project-App binding are required on issue and every read. Unbound or revoked App binding denies. PASS; cross-App/revoked binding test passes. |
| 5 | Conversation/session retargeting | Conversation ownership and tenant are re-read; missing, moved, or Project-switched conversations invalidate evidence. Session and conversation IDs are compared when supplied. PASS; Project-switch test passes. |
| 6 | Ambiguous, unresolved, and no-project contexts | Only a server-owned conversation binding or an explicit candidate enters the advisory resolver. Unresolved conversation is `UNRESOLVED`; null binding is `NO_PROJECT`; both have no destination. Invalid states cannot validate. PASS; covered by authority and context-builder tests. |
| 7 | Write ceiling and migration boundary | Invocation receipt has read-only authorization. Project-scope create/update/delete/promote are denied until durable receipt exists. No schema migration or production write grant was added. PASS; router tests cover denial. |
| 8 | Protected content access ordering | Scoped memory router reads owner metadata first, authorizes current scope, then fetches memory content. Search authorization is checked for every requested scope. PASS; tests assert content fetch follows authorization. |
| 9 | Memory isolation and provenance | Chat injects Project memory only when the same App-bound receipt is freshly validated; user/global scope remains policy-permitted. Team-room persistent memory stays filtered under existing provenance protection. PASS for tested executor path; deployed/provider acceptance remains pending. |
| 10 | Receipt integrity, failure behavior, and correlation | Receipts are frozen and invocation-local; cloned receipts, cross-scope reuse, DB failures, alias failures, and writes fail closed. Policy versions, provenance, issue time, correlation, and authorization reference are included. PASS; authority suite covers clone/scope/write/alias failures. |

## Independent review follow-up

- P1 Host spoofing concern: mitigated only if the deployment ingress binds the routed Host to the actual TLS/SNI request and prevents direct origin access. This code path does not claim to prove that external boundary. Project reads still require the current App–Project binding and current Project membership. Verify ingress routing before relying on host alias as App context.
- P1 missed App context propagation: fixed by resolving the server-side route context once for the LLM skill invocation and passing it into unified, fallback context-pack, and chat-runtime context requests. Focused router tests are rerun after this change.
- T-01 App-private versus global memory: no App-scoped memory dimension exists. Existing user-global memory remains shared by policy; T-01 is not PASS until App-private isolation behavior is defined and tested.
- Durable receipt reference: Phase 1 intentionally provides invocation-local read evidence only. No durable audit row is claimed; Project-shared writes remain denied pending Phase 2.

## Limits

- These are source-level review passes and focused automated tests, not a production authorization audit.
- Authorization and subsequent retrieval are separate database operations; validation is refreshed immediately before each protected retrieval path, but the DB does not provide a cross-operation transaction snapshot.
- T-01–T-09 and T-18 are fixture-ready only except for individual unit contracts named above. They are not reported as direct acceptance PASS.
- T-15 local contract acceptance is covered by two passing tests; DNS, certificate issuance, and deployed custom-domain routing are not covered.
