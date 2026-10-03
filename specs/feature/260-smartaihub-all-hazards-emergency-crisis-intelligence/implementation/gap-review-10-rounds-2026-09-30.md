# Spec 260 Gap Review — 10 Rounds (2026-09-30)

This is a source/spec audit during implementation, not the deferred integrated test, build, database replay, or Cloudflare staging evidence. Safe in-scope gaps were repaired in this pass; unresolved implementation gates remain explicit and continue to block completion.

## Round 1 — Normative coverage and section state

- **Evidence:** `development-plan.md` defines Waves 0–14 and the R1.37 Cloudflare/no-legacy boundary. The implementation ledger still marks Waves 2–12 partial and Waves 13–14 pending.
- **Finding:** The feature is not complete, and the prior generic Orchestra progress artifact refers to Spec 215 rather than this active Spec 260 objective.
- **Action:** Keep Spec 260's own progress and per-section acceptance notes authoritative; don't claim completion. The 10-round artifact is linked from its progress file.
- **Status:** Open implementation work; final integrated phases remain ordered last.

## Round 2 — Public, dashboard, API, and quick-link routing

- **Evidence:** `emergencyRouteManifest.ts` has shared page/API routes; `App.tsx`, dashboard actions, Worker matching, and platform handler registration consume the manifest. Backend handlers existed for alert list/create/update, but no dashboard consumer used create/update.
- **Finding:** Alert operations were unreachable through the dashboard despite registered routes. This is a concrete UX/API integration gap.
- **Action:** Added `EmergencyAlertManager` to the dashboard command page with draft/publish/cancel calls, retry-stable idempotency keys and bilingual text. Public alert listing and map continue to use manifest routes.
- **Status:** Fixed in source; browser/integration proof is deferred.

## Round 3 — Public projection privacy and safe geometry

- **Evidence:** The existing alert DTO exposed only a generalized point from the linked situation; no affected-area geometry existed. Map marker feature construction is explicitly allowlisted.
- **Finding:** Polygon alerts could not be authored or projected. Accepting caller geometry without normalization would expose exact or malformed locations.
- **Action:** Added strict Polygon/MultiPolygon bounds and ring closure/size validation, 0.05-degree coordinate snapping, allowlisted area features, and an independent MapLibre area source. The input is never copied directly into a public DTO.
- **Status:** Fixed in source; privacy regression tests authored, not run.

## Round 4 — Persistence and migration chain

- **Evidence:** The latest migration journal entry was index 362/tag 0376. Alert schema had no geometry field.
- **Finding:** Alert area authoring had no durable representation.
- **Action:** Added additive migration 0377 at journal index 363 and the nullable `publicGeometryJson` schema property plus migration contract test.
- **Status:** Source/journal updated. Migration replay/application remains pending for the single final local gate; no DB was modified.

## Round 5 — Viewport versus list/map parity

- **Evidence:** The map's initial list load was superseded by `public.map.list`; viewport SQL previously inner-joined alerts to situations and only returned point-backed alerts. This would discard standalone polygon alerts after map load.
- **Finding:** An alert polygon could appear in a fallback list yet vanish in the active viewport map.
- **Action:** Viewport query now includes bounded active alerts without requiring a situation point, filters public point/polygon geometry against the requested viewport, and projects normalized geometry. Areas render separately from the clustered point source.
- **Status:** Fixed in source. Result-budget/truncation and antimeridian behavior still require integrated fixture coverage.

## Round 6 — Cloudflare canonical Queue execution

- **Evidence:** Added a bounded private-origin control-plane proxy, dedicated token-authenticated context/claim/complete/fail routes, exact persisted Cloudflare dispatch validation, and canonical Feature 186 lease/fencing settlement. The Worker factory still accepts injected repository/executor, but the default export only wires the Spec 260 retention sweep; it does not compose the proxy or an executor.
- **Finding:** Transport and canonical control-plane endpoints now exist, but no default Cloudflare job executor is composed. A follow-up source read also found that the failure endpoint acknowledged every retryable failure as quarantined, which could prematurely acknowledge a Queue message even when the canonical job entered `retry_scheduled`.
- **Action:** Kept the dedicated credential boundary and lease fencing, and changed failure settlement to return `retry` only after observing canonical `retry_scheduled`; terminal/operator-review outcomes return `quarantine`, while unsettled states stay retryable. Do not enable activation/readiness or add Node/Python fallback. An explicitly allowlisted Cloudflare executor, including Spec 260 intake and retention work, is still required.
- **Status:** Partially fixed; executor composition remains Open P0 and blocks Sections 11/12/13.

## Round 7 — Privacy, consent, holds, and retention

- **Evidence:** Consent receipts, scoped disclosure revalidation, legal holds, and retention cleanup leases exist. The job still calls the web application's retention implementation and its Worker composition is not wired.
- **Finding:** Legal-hold foundation is implemented, but subject export/access/takedown, complete policy retention/deletion, restore reconciliation, break-glass, and operational recovery evidence are incomplete.
- **Action:** Preserve the lease/fencing design; do not claim end-to-end retention until the canonical consumer executes and the integrated retention/delete paths pass.
- **Status:** Open; runtime delivery and subject-rights workflows are must-close before release.

## Round 8 — Evidence and intelligence provenance

- **Evidence:** Manual excerpt capture writes private content-addressed R2 objects, records source lineage, requires independent active source groups for verified public claims, and has review controls.
- **Finding:** There is no approved external publisher fetch/archival pipeline, correction/supersession workflow, grounded brief/forecast, or canonical research executor.
- **Action:** Keep new sources pending and network-silent; do not create an unauthenticated crawler or ungrounded forecast fallback.
- **Status:** Open Section 09 work; canonical Cloudflare executor is a dependency.

## Round 9 — Federation and finance

- **Evidence:** Federation partner lifecycle and scoped case shares are audited, jurisdiction-bound, short-lived, allowlisted, and expressly `queued_not_delivered`. Contributions settle only from verified provider THB facts; pool allocations use canonical journal lines.
- **Finding:** Partner identity/delivery/read protocol and capability discovery are absent. Refunds fail closed; marketplace booking/spend, reconciliation operations, Thai tax/WHT, expenses/advances/assets, close, and audit-package workflows are absent.
- **Action:** Retain fail-closed refund and share-delivery states until verified authorities and exact contracts exist; don't imply payout from allocation.
- **Status:** Open Sections 08 and 10; not externally proven.

## Round 10 — Integrated quality, operations, accessibility, and release evidence

- **Evidence:** All product tests/build/typecheck, migration replay, browser E2E, load/recovery/a11y evidence, and real Cloudflare staging verification remain intentionally unrun until implementation ends. Repo policy prohibits `npm run typecheck`.
- **Finding:** Verification evidence is stale/not yet produced by explicit user sequencing. SLOs, runbooks, surge controls, restore reconciliation, full accessibility evidence and deployment injection templates remain incomplete.
- **Action:** Continue implementation first. After all source gaps close, execute exactly one integrated local/release-candidate gate, repair and rerun affected gates, then perform the single authorized Cloudflare staging phase.
- **Status:** Open later lifecycle stages; no tests, build, typecheck, migration application, or live Cloudflare operation was performed in this audit.

## Gap triage

### Must do now

- **GAP-CF-QUEUE-EXECUTOR** — Worker-to-platform transport, dispatch authorization, and canonical lease settlement are implemented, but the default Worker still has no allowlisted executor composition for admitted emergency jobs. Leaving it unwired means no admitted emergency job can be consumed and runtime readiness remains false. Earliest affected stage: Implement. Status: OPEN P0.
- **GAP-ALERT-AREA-FINAL-PROOF** — run the authored shared, migration, route/UI and map tests in the final integrated gate. Earliest affected stage: Verify. Status: DEFERRED BY USER'S FINAL-ONLY TEST SEQUENCE.

### Other open required section work

- **Section 08:** authenticated partner protocol, external capability discovery, share delivery/read/revocation enforcement.
- **Section 09:** source feed retrieval/archive, correction/supersession, grounded briefs/forecasts, canonical job execution.
- **Section 10:** marketplace lifecycle, reservations/metering/spend, verified refunds/reconciliation, Thai tax/WHT and finance close/audit artifact.
- **Section 11:** subject export/access/takedown, complete retention policy, surge/recovery/restore, break-glass, SLOs/runbooks, full accessibility evidence.
- **Sections 12–13:** the single complete local release candidate and final Cloudflare staging verification.

### Safely deferred until final phase

- Local tests/build/migration replay and real Cloudflare staging have not been run by design; their exact commands/evidence are recorded in the respective final sections. Production launch authority/legal/tax approvals require named external owners and remain separate from staging proof.

## Follow-up — Public and dashboard discoverability

- **Evidence:** The top-level Navbar already had a generic `/disaster` link, and the Dashboard had an Emergency sidebar item and quick action. However, the alert API was not loaded by the public overview or product homepage; the Dashboard item could be hidden by a menu override; the homepage had no emergency call-to-action; and the generic Navbar link was visually indistinct.
- **Action:** Added an always-visible, bilingual emergency entry strip to the public homepage, overview and signed-in Dashboard. It fetches public alerts, refreshes every 30 seconds while the page is visible, labels stale-feed uncertainty, and links directly to report, alerts and map; overview adds facilities, nearby help and relief support. Promoted and styled the Navbar route, pinned Emergency against menu-visibility overrides, ordered it first in Dashboard quick links and highlighted both Dashboard entry points. Authored a regression assertion for the menu-override case.
- **Status:** Source updated. Browser rendering, mobile layout, active-alert refresh behavior and route clicks remain unverified until the integrated final test pass.

## Follow-up — Spec 260 Wave 5A local feed and source qualification (2026-10-03)

- **Evidence:** `rankSituationFeedCandidates` and `buildSituationDigest` had no production caller. The public map already exposed only public-projected situations, published alerts and verified facilities. Thailand provider-pack entries had no verified endpoint/auth/schema/rights evidence and no executable adapter; their URLs included documentation leads.
- **Finding:** Shared ranking primitives alone made no feed visible in the emergency UI, while treating catalog entries as usable sources would overstate what had been verified. Critical alert inclusion also needed to be independent of the ordinary digest budget.
- **Action:** Composed a bounded digest from existing public map rows, exposed it with policy/truncation metadata, rendered a provenance/freshness list and stale-retention state, and reserved inclusion for critical published alerts. Added explicit qualification blockers and made authentication evidence mandatory. No external providers or records are invented.
- **Status:** Focused Node tests pass (4). Route/browser/build/provider-network/Cloudflare integration remains unverified. External retrieval, raw archive, correction/forecast/research jobs remain open Section 09 work; do not mark the section complete.
