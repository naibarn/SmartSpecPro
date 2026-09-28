# Planning review ledger — 2026-09-08

These are direct planning reviews, not application test runs or independent agent audits. Each pass checked completeness, contradictions, security/abuse and missing practical improvements against the request and discovered sources.

| Round | Focus | Finding / disposition |
|---|---|---|
| 1 | Full public inventory and request fit | Included Help, policy pages, static informational pages and public Marketplace; explicitly classified sensitive anonymous routes. Full scope requires a larger estimate than the pilot. Reflected in spec and route matrix. |
| 2 | Data and side effects | Logged-in Marketplace has protected actions; require anonymous-equivalent projection. Contact preparation could overwrite user text; conflict rejection is mandatory. Captured in contracts. |
| 3 | Lifecycle, API drift and search limits | Require async unmount/epoch handling, bounded metadata search, partial-failure reporting, scoped cursors and actual native evidence. Captured in spec/contracts/test plan. |
| 4 | Cross-section consistency | Clean: ownership, dependencies, TH/EN UI contracts, input validation, native-vs-mock proof and rollback agree; no additional material change needed. |
| 5 | Handoff and artifact verification | Clean: required planning artifacts, five-section manifest, local links and route entries verified by Python assertions. No remaining material planning contradiction found. |

Stop: five review passes with final two clean. Existing endpoint fields and browser API compatibility must still be verified during implementation; the plan does not claim a completed security audit of existing services. No build, runtime tests, production write, restart, paid generation or deployment performed.

Verification note: the first artifact checker assumed filesystem glob order and incorrectly included the foundation section in the UI-only check. Sorting sections fixed that checker; the rerun passed. Exact manifest parity, required artifacts, local links, new-file whitespace and scoped git diff whitespace checks passed.

Deferred by scope: authenticated tools, automated Contact sending, full-text/vector search, remote MCP bridge and browser polyfill. Native trial availability is a rollout dependency, not a blocker to implementing the default-off adapter.

## Extended audit rounds 6–20 — 2026-09-09

| Round | Focus | Finding / disposition |
|---|---|---|
| 6 | App route inventory | Found `/gallery` was a public route omitted from the matrix. Added route coverage and implementation ownership. |
| 7 | Gallery contract parity | Found the existing public `gallery.list/get` APIs and UI counters. Added search/detail tools and explicitly excluded view/like/download mutations. |
| 8 | Sensitive route exclusions | Found utility/device/play routes that are not informational but are reachable without the same wrapper. Added explicit exclusions for `/auth/device`, `/factory`, `/terminal`, `/kilo`, `/docker`, `/docker-redirect`, and `/presentation/:itemId/play`. |
| 9 | Search scope completeness | Found site-wide search enum did not include gallery after round 6. Added `gallery` scope and partial-source requirements. |
| 10 | WebMCP API drift | Current official examples and draft representation differ on input-schema serialization. Added an implementation-time native IDL adapter gate; no fixed mock shape is treated as proof. |
| 11 | Permissions policy | Source headers omit `tools`. Added a response-level acceptance gate: verify default behavior and add only narrow top-level `self` permission if native proof requires it. |
| 12 | Origin isolation | Added explicit rejection of `Origin-Agent-Cluster: ?0`/`document.domain` and a no-cross-origin-iframe-default rule. |
| 13 | Agent loop abuse | Added per-tab concurrency and execution budgets, truthful rate-limit errors and no retry behavior. |
| 14 | Tenant/publication boundary | Rechecked tenant endpoint, Marketplace and Gallery behavior; preserved current-tenant plus intentional global rows and published-only output. |
| 15 | Contact field contract | Compared to `feedback.submitPublicContact`; added exact field lengths, email constraint and contact type enum. Preparation still cannot submit or touch anti-abuse fields. |
| 16 | Output safety | Confirmed bounded envelope, 32 KiB cap, pagination, HTML stripping and no PII/tokens/URLs with credentials in results or telemetry. |
| 17 | Navigation safety | Confirmed allowlist, known slugs, same-origin requirement and rejection of auth/share/traversal/query credential paths; reserved protected Marketplace paths remain excluded. |
| 18 | React lifecycle | Confirmed requirements for duplicate mounts, async register/unmount races, route/locale/tenant epochs, abort signals and unregister cleanup. |
| 19 | Failure and rollout | Confirmed default-off flag, configuration failure disablement, timeout/cancellation, kill switch, staged native/unsupported browser proof and no production mutation. |
| 20 | Handoff consistency | Confirmed five sections, dependency order, TDD coverage, UI contracts, local links, manifest parity and current review findings are represented. No open safe in-scope gap remains in the planning package. |

Rounds run: 20 total (5 original stabilization rounds + 15 extended audit rounds). Findings in rounds 6–15 were fixed in the spec before the final verification; rounds 16–20 were clean after those fixes. Final clean rounds: 5. This is spec evidence only; implementation, native browser proof, build and deployment remain pending.

Final verification on 2026-09-09: a repository-local Node checker passed all 20 review assertions, including artifact presence, route/source parity, public gallery APIs, tenant/publication and locale boundaries, contract inventory and bounds, current WebMCP references, lifecycle/navigation/output safety, Contact constraints, gallery mutation exclusion, abuse budgets, headers/origin gates, operations/rollback, and section-manifest handoff. `git diff --check` also passed for the scoped spec files.
