# Feature 183 — Public Site WebMCP

**Status:** PLANNED — no application implementation or browser compatibility proof yet.
**Created:** 2026-09-08
**Scope:** All public informational surfaces; public browsing and form preparation only.
**Authority:** This spec, route matrix, and tool contracts govern implementation sections.
**Continuation:** Existing website (Feature 003), bilingual content (Feature 062), current public tenant pages, Help, Blog and Marketplace. This is a new feature, not an extension of the unrelated character-prompt spec open in the IDE. Number 183 avoids the existing 181–182 quick-plan identifiers.

## Outcome

Visitors using a compatible browser agent can discover public pages, read the same published content they see, search documentation, catalogs and the public gallery, inspect pricing, and prepare a Contact message. All existing manual flows continue to work without WebMCP. “All public pages” means every informational route receives an explicit coverage entry, not that every anonymous-access URL becomes an agent tool.

## Architecture decision

Use a small native-first browser adapter and page-owned React tool registrations. Alternatives considered: declarative annotations alone are insufficient for shared content and React state; a broad polyfill/remote MCP bridge adds transport and compatibility scope without serving this first release. Declarative Contact integration may be revisited after native browser proof; this release uses an imperative prepare-only action.

WebMCP is a draft, not a stable W3C standard. Pin the implementation's tested spec/browser combination in the rollout evidence. Target `document.modelContext`; do not silently substitute an unrelated MCP library or claim native support from mocks. Feature-detect registration and cleanup capabilities; unsupported or disabled environments perform no registration. No mandatory new runtime dependency, database migration, remote agent, or paid model call.

## Requirements

1. A centralized explicit public-route policy controls registration, navigation and data access. Route patterns are tested against App.tsx; unknown routes fail closed. Do not use “not /admin” as the policy.
2. Each page exposes an explicit public view model derived from its existing data and presentation. Never scrape document.body: logged-in navigation, tokens, hidden forms and account details are outside the public projection.
3. Resolve the current origin/tenant and actual content language through existing mechanisms. Client inputs cannot select tenantId, arbitrary origin or backend endpoint. Return only published, public fields even when the visitor is logged in.
4. Register tools after their owning route is ready; unregister on route exit, flag disable and unmount. Handle StrictMode double-mount, duplicate names, async registration resolving after unmount, stale callbacks and in-flight requests. Revalidate route epoch before returning results or changing UI.
5. Keep tool names stable and descriptions developer-owned. Returned CMS/catalog text is data, never instructions. Use appropriate untrusted-content annotations, bounded plain-text output and existing HTML sanitization.
6. Navigation uses only validated internal public routes and known published slugs. Reject external URLs, protocol-relative paths, traversal, encoded bypasses, auth callbacks, fragments/query values carrying credentials, and private share tokens.
7. Search uses bounded, deterministic existing sources. Search indexes contain only anonymous-visible content. Public site-wide search covers route metadata and public Help/Docs/Blog/Marketplace metadata; no vector service or LLM is needed. Do not download every article body at startup.
8. Pricing returns the same package values and currency semantics as UI; no inferred subscription promises, invented savings, or checkout tools. Status returns the page's declared source and timestamp, not fabricated live health.
9. Contact preparation validates provided fields, updates visible React state and focuses the form. Never sends, bypasses Turnstile, fills the honeypot, invents personal information, or replaces existing nonempty values with different values silently. Return FIELD_CONFLICT when replacement would overwrite user content; the user edits manually.
10. Existing Contact submission remains the human-owned path with current validation and abuse protection. WebMCP preparation must not reset anti-abuse timing or serialize tokens. Other application, support or community actions remain normal UI links unless explicitly listed in contracts.
11. TH/EN content follows existing localization and fallback behavior; results identify requested and resolved locale when different. Locale-specific caches also include origin/tenant identity. Changing locale invalidates stale tool output.
12. Operational controls include a default-off rollout flag and server-supplied enablement per origin/tenant using existing public configuration patterns. Fetch failure disables tools. Names introduced by this feature must be documented in rollout; existing flags must not be repurposed.
13. Apply a bounded per-tab execution budget and concurrency cap to limit agent loops; server-side public rate limits remain authoritative. Budget exhaustion returns a truthful rate-limit error and never retries or invokes a gallery counter or Contact submission.
14. Before enablement, verify the response's origin isolation and Permissions Policy: no `Origin-Agent-Cluster: ?0`/`document.domain`; if a `tools` policy is sent it permits top-level `self` only. Do not widen cross-origin iframe access as part of this feature.

## Boundaries

Public catalog access does not include like, comment, install, purchase, generation, account settings or admin tools. No new access to private document shares, device pairing, OAuth, email verification or password reset. Public tools are removed on these routes even though some are reachable anonymously. Public data must remain equally public for anonymous and authenticated visitors.

## Acceptance and delivery

The route matrix must have no uncovered informational page; every registered tool must match tool-contracts.md. Tests must prove tenant/published boundaries, TH/EN parity, unsupported-browser behavior, no private-route registrations, gallery counter non-invocation, state synchronization and zero tool-triggered Contact submissions. Native-browser evidence and ordinary-browser regression evidence are required before enablement. Mock tests prove application behavior only.

Deliver in five dependency-ordered sections. Initial 3–5 day discussion covered a narrower pilot. Full public inventory, catalog/help search and compatibility evidence should budget roughly **7–12 developer days**, pending the first section's endpoint audit and browser availability. No promise of universal browser/agent support. Implementation must report missing native proof as pending, not passing.

See [route matrix](route-matrix.md), [tool contracts](tool-contracts.md), [implementation plan](implementation-plan.md), [test plan](implementation-plan-tdd.md), and [sections](sections/index.md).
