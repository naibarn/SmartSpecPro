# Decisions

- Planning depth: standard deep-plan-quick, five sections. One browser-facing public enhancement with existing read APIs; no new trust system, schema or paid execution. Promote to deeper planning if endpoint audit requires new access semantics or search infrastructure.
- Native adapter over declarative-only forms or a polyfill/remote bridge: fits React and isolates draft API churn.
- Feature number 183: feature tree ends at 180; quick plans already use 181 and 182. New directory in requested specs/feature location.
- All informational pages receive coverage; credential/device/share routes receive explicit exclusion tests.
- Public tools keep anonymous-equivalent output even in logged-in sessions. No authenticated catalog mutations.
- Contact is prepare-only with conflict rejection. Existing user text wins. No actual submission acceptance test may target production.
- Site search is bounded public metadata search, not a new semantic/full-text engine. Partial source failure is explicit.
- Native compatibility is tested separately from mocked React behavior; missing origin trial/browser access leaves rollout pending.
- Full scope estimate is 7–12 developer days rather than the earlier 3–5 day smaller pilot; recalibrate after source audit.
