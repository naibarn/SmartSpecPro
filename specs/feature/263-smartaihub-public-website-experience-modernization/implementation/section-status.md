# Spec 263.8 public implementation section status

This status reflects candidate source and evidence, not production release acceptance. A section is only `COMPLETE` when its required evidence exists; partial source work is not treated as section closure.

| Section | Candidate state | Source/evidence | Remaining closeout |
|---|---|---|---|
| 01 — Public inventory and truth map | `PARTIAL — SOURCE INVENTORY PRESENT` | `public-route-inventory.json` (57 routes), `public-locale-route-map.json`, `public-redirect-map.json`, `public-claims-registry.json`, `public-media-governance-inventory.json`, `public-truth-map.md` | Route owners must decide unresolved canonical/indexation behavior; production crawl and content/rights owners are not recorded. |
| 02 — Shell, content and retired-claim repair | `PARTIAL — LANGUAGE CHECKPOINT DEPLOYED; SEO REPAIR CANDIDATE` | Host-aware Navbar/Footer/Home routes; desktop nav no-wrap plus compact menu below `xl`; scoped theme; bilingual copy; unverified marketing images removed; `html lang` now follows locale on production Features/Docs and live switch; public SEO repair adds route-first metadata precedence and prerender metadata de-duplication | SEO repair awaits exact-SHA integration/deploy and production DOM recheck. Production crawl, consent, analytics, status/legal/support and content freshness verification remains open. Backend no-JS snapshot change cannot be activated by the static-only publisher while the running service source checkout is unrelated and dirty. |
| 03 — Homepage experience | `PARTIAL — IMPLEMENTED CANDIDATE` | Outcome H1, supported signup/Vertical Series handoff, discovery/trust/CTA sections, centered frame; focused tests and mocked local Chromium evidence | Spec 270 native artifact/catalog acceptance and source-backed Film/product proof are absent; no production visual or signed-in acceptance. |
| 04 — Film flagship and handoff | `PARTIAL — DISCOVERY ONLY; SPEC 258 PROOF GATED` | Existing `/drama-series` destination through `/login?returnUrl=%2Fdrama-series`; no `/film` route | Approved Spec 258 claims, public Film asset/rights/safety manifest and real film proof are absent. Do not call the concept panel Film proof. |
| 05 — SEO, accessibility and proof | `PARTIAL — SEO DEFECT REPAIR CANDIDATE` | SEO null-image and route-first metadata tests; exact-deployed-SHA browser matrix; live TH/EN locale switching; six Home widths in both locales; Features/Docs at mobile/desktop; menu keyboard/Escape/focus restore and reduced motion | Canonical and description duplicates and retired tenant-default titles were confirmed in production; repair is not yet integrated/deployed. All-route crawl/indexation, signed-in UAT, human accessibility/contrast review, measured CWV/performance budget remain open. |

## Spec 270 relation

The repository-owned public design package is an implementation reference aligned to Spec 270 R1.4. It is **not** the native Spec 270 canonical design-artifact record, design-system catalog snapshot, component-resolution evidence, or provider verification. See `design/public/PUBLIC_SPEC270_INTEGRATION_RECONCILIATION.md` and the Spec 270 G0 reconciliation record for the live authority boundaries.

## Current gate

Integrated/deployed SHA `b916f620475c70420df72c353a3eceb7537799bd` passes its 10-file / 46-test focused repair suite, canonical build/publish, 20 signed-out production observations and live locale/keyboard checks. New SEO findings have focused coverage at 13 files / 52 tests on the candidate; they require promotion and redeployment before acceptance. Do not treat the `ec605d1` browser matrix as current. External claim, rights, catalog, consent, full crawl, accessibility and performance owners remain unverified and are not silently marked complete.
