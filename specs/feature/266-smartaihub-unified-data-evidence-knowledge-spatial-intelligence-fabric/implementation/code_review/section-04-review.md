# Code Review: Section 04 — Data Resolution and Retrieval

Independent review approved after three review-fix rounds.

- Validates direct offers/options and binds resolver results to current policy and separately scoped health.
- Reauthorizes vector projection against current offer, tenant, policy, immutable evidence revision/hash, and index generation before hydration; content mode requires explicit server-resolved permission.
- Cache lifetime is capped by freshness, health, rights, and retention; future cachedAt and expired rights fail closed.
- Connector URL admission rejects local/IP literals, non-HTTPS, credential-bearing URLs, and non-allowlisted hosts. Runtime DNS/IP egress enforcement remains mandatory.
- Progressive evidence planner propagates server-resolved policy version.
- Focused proof: 2 files / 24 tests passed. No unresolved local MUST_FIX; managed runtime composition is open.
