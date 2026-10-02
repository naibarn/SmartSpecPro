# Spec 262 section-first verification plan

Tests are added before behavior changes whenever possible. Prefer pure contracts/fixtures before external connectivity. Test names below are target coverage, not a claim that tests already exist.

1. **Baseline map/runtime:** `EmergencyPublicMap.workerAssetLoad.test.tsx`; renderer resolver tests for valid/invalid provider and fallback; route-manifest parity; Cloudflare proxy rejects wrong origin and never leaks private credentials. Browser: bundled worker loads, map paints, tile/config/attribution paths pass, fallback/recovery is visible.
2. **Platform and shared map/chat context:** runtime mode resolver tests (Linux, Cloudflare binding, invalid/missing config); same manifest/API contract both modes; Chat context serialization, tenant/role reauthorization, one-turn expiry/removal, never auto-send.
3. **Map UI:** command parser validation/security tests, keyboard/list equivalence and map state tests; component tests for loading/empty/stale/error/coverage. Browser at 390x844, 768x1024, 1440x900 plus risky extended sizes.
4. **Adaptive feed:** geometry normalization (antimeridian/polar/invalid CRS), viewport stabilization/debounce/cancel, zoom aggregation, public/ops audience scopes, stale action denial, bounded paging and projection consistency tests.
5. **Feed semantics:** ranking/digest determinism and attention budget, event-thread/update-in-place, fact class, freshness/uncertainty, explainability and empty-is-not-none tests.
6. **Acquisition:** malicious HTML/SSRF/oversize/rate-limit/schema-drift fixture tests; provider lifecycle and rights; transactional outbox enqueue, idempotency, lease/fencing, retries, heartbeat, replay, cancellation and safe failure tests.
7. **Hydro observations/time series:** unit and CRS conversion, event-time watermark, late/backfill/revision, censoring/missing/imputation, duplicate sensor/correlation, rating curve and physical bounds, trend/change determinism, retention/downsampling/extreme preservation tests.
8. **Network/impact:** topology direction/reversal/urban drainage, graph revision invalidation, corridor/antimeridian, exposure privacy, confidence propagation, deterministic-vs-estimated fact labels and no false downstream claim tests.
9. **Thailand pack:** fixtures by DWR/RID/TMD/ONWR/GISTDA/NDWC source contract; units/datum/time/coverage/license; provider outage/schema drift/expected silence; no live public endpoint dependency in CI.
10. **Compound impacts:** rain/runoff/river/coastal/tide/water quality/defenses/roads/evacuation capacity scenarios, exercise isolation, freshness gates and facility exposure tests.
11. **Global/regional capability:** manifest schema and version compatibility; incomplete coverage reports; country boundary changes; jurisdiction, residency and capability gating; new region onboarding contract tests.
12. **Localization:** Thai/English parity, language/geography independence, translation attribution, canonical multilingual place matching and ambiguous search tests.
13. **Watches/API/MCP/Chat:** action scopes, geofence transitions, device-safe notification idempotency, tool capability authorization, no duplicate queue, existing Chat context bridge and stale action revalidation tests.
14. **Privacy/federation:** public geometry generalization/differencing, tenant isolation, federation grants/expiry/revoke, deletion/legal hold conflict, exercise/test separation, privacy-safe telemetry tests.
15. **Offline/accessibility/device sync:** offline package manifest integrity/rights/expiry, resumable outbox and conflict resolution, low-bandwidth mode, focus/keyboard/nonvisual narrative, no map-color-only signal, cross-device revisions tests.
16. **Admin/rights/operations:** role checks, typed config validation, provider/credential rotation, kill-switch expiry/audit, quota/cost budget, attribution and license/retirement state tests.
17. **Model/replay/recovery:** model artifact identity, canary/rollback, replay bundle integrity, revision-aware recompute, DR/rebuild, SLO/load-shed and disaster rollback tests.
18. **Integrated:** map→feed→detail→existing Chat→Task Control/watch flow; public vs operations projections; scenarios A–AR; acceptance IDs 1–513 traced to focused test/browser/external gate. Run focused suites, DB migration checks, build; never run `npm run typecheck`.

## Local commands

- Use package scripts already present, especially focused Vitest invocation from `apps/web` and the shared/cloudflare package scripts after inspecting their scripts.
- No real provider keys in tests; fixtures and safe mock transports only.
- Build public assets and inspect output paths to prove worker chunk/public URLs resolve.
- If PostgreSQL/test services are absent, run pure and mocked suites and record the missing integration proof explicitly.
