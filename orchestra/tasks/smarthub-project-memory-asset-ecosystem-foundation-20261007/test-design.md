# Contract Test Design

These are acceptance scenarios to be represented in normative Specs and handoff ledgers. No runtime behavior is claimed by this design document.

| ID | Scenario | Required assertion |
|---|---|---|
| T-01 | One user, two apps, one project | App context does not fork project identity or leak private memory |
| T-02 | One user, one app, two projects | Retrieval and durable writes stay project-scoped |
| T-03 | Two users, one project/app | Shared data requires membership/ACL; private memory remains private |
| T-04 | Conversation switches Project A to B | Time-segment bindings remain attributable; subsequent writes use B only after resolution |
| T-05 | No project | No durable project-memory write; session/personal scope remains explicit |
| T-06 | Ambiguous projects / near-equal vectors | Picker or pending scope; similarity alone cannot bind durable destination |
| T-07 | User selects picker candidate | Receipt records authority, scope, resolver inputs, actor, and binding version |
| T-08 | Pending memory promoted after confirmation | Idempotent promotion preserves provenance and ACL checks |
| T-09 | Chat embedded in two apps | Same runtime accepts distinct hostAppId, space, billing, permissions, and memory views |
| T-10 | App clone / owner transfer / lease / maintainer change | App ownership changes do not transfer private memory or dependency ownership |
| T-11 | Asset sold while users retain installs/reviews | Stable public app ID and references survive commercial transfer |
| T-12 | Revenue before/after effective transfer date | Policy-versioned attribution uses effective time and immutable history |
| T-13 | Infra loss with subsidy and referral | Explicit subsidy source; one-time first qualifying event; no creator haircut or MLM |
| T-14 | Refund after allocation | Existing ledger reversal and settlement correction remain linked/idempotent |
| T-15 | Custom domain changes | URL mutability does not change AppIdentity |
| T-16 | Self-hosted app portability | Knowledge/memory portability follows rights and scope export policy |
| T-17 | Legacy Chat memory cutover | Inventory → bridge → migrate → reconcile → retire; one logical scope, one authority |
| T-18 | ACL revocation mid-session | Recheck current authorization before read/write; revoke future access promptly |
| T-19 | External/portable project binding | Namespace, tenant, trust, and data-rights policy are preserved |
| T-20 | Retry/replay during transfer or settlement | Idempotency keys and event/version fencing prevent duplicate ownership/revenue effects |
| T-21 | Tenant administrator/controller changes | Control-plane role changes do not rewrite legal ownership, payout beneficiary, or project membership without distinct authorized events |
| T-22 | App depends on a third-party Skill and is sold | Dependency Skill ownership and license stay with the original party unless explicitly transferred |
| T-23 | Publisher or maintainer changes | Stable App/Asset identity and ownership history remain unchanged; only the granted role binding changes |

Focused document validation should verify JSON schema, dynamic handoff inventory, generated STATUS, stale-reference boundaries, and exact-SHA evidence. Runtime tests are deferred until implementation work is separately authorized/planned.
