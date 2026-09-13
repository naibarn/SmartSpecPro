# Implementation plan

Read spec.md, route-matrix.md and tool-contracts.md first. They override section shorthand.

1. Foundation: verify route and endpoint visibility inventory, implement flag/capability adapter and bounded schemas. Freeze anonymous public projections before registering tools. Estimate 1–2 days.
2. Public content: integrate page view models, discovery, navigation, metadata search, prices, Docs/Help/Blog and static pages. Add bounded server metadata search only where required. Estimate 2–4 days.
3. Marketplace and gallery: connect existing filters and public detail views, enforce public projections regardless of session, and explicitly avoid gallery view/like/download mutations. Estimate 1–2 days.
4. Contact: connect prepare-only tool to controlled form state, reject overwrite conflicts and preserve abuse protection. Estimate 1 day.
5. Proof/rollout: complete route matrix tests, native browser execution, TH/EN and unsupported-browser regressions, build in suitable environment and staged flag enablement. Estimate 2–3 days.

Sections 2–4 depend on section 1; section 5 depends on all. Main integrator owns App.tsx and shared contracts; page sections do not independently change global registration rules. Preserve dirty unrelated files. No database migration is planned; if needed, record the concrete reason and revise scope before proceeding.

Production enablement remains default-off until every required proof passes. Validate HTTPS, origin isolation, tools Permissions Policy and origin trial configuration against each enabled origin. The current response policy must be checked for `tools` and `Origin-Agent-Cluster`; add the narrowest required header only if native registration proves it is needed. Do not relax existing CSP or frame policy merely to register top-level tools. Test a supported browser with trial/flag and an unsupported browser; a mocked API cannot satisfy this gate.

Observe tool name, duration, result code and aggregate failure counts via existing telemetry, without search text, form fields or output content. Use existing retention rather than a new event store. The server flag is the kill switch: rollback disables it, unregisters tools on the next configuration refresh (target <=60 seconds in active tabs), and leaves normal UI working. Document any propagation limit before launch.

Done means all route-matrix entries have integration proof, all contracts have tests, no private data is exposed, build/browser evidence is attached, and the rollout owner records enabled origins and compatibility version. Planning completion is not implementation completion.
