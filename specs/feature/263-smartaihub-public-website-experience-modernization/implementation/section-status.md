# Spec 263.8 public implementation section status

This status reflects candidate source and evidence, not production release acceptance. A section is only `COMPLETE` when its required evidence exists; partial source work is not treated as section closure.

| Section | Candidate state | Source/evidence | Remaining closeout |
|---|---|---|---|
| 01 — Public inventory and truth map | `PARTIAL — SOURCE INVENTORY PRESENT` | `public-route-inventory.json` (57 routes), `public-locale-route-map.json`, `public-redirect-map.json`, `public-claims-registry.json`, `public-media-governance-inventory.json`, `public-truth-map.md` | Route owners must decide unresolved canonical/indexation behavior; production crawl and content/rights owners are not recorded. |
| 02 — Shell, content and retired-claim repair | `PARTIAL — LANGUAGE REPAIR READY FOR INTEGRATION` | Existing host-aware Navbar/Footer/Home routes; desktop nav no-wrap plus compact menu below `xl`; scoped theme; bilingual copy; no unverified marketing images on Home/Features/Docs; explicit OG image only; root-level i18n language-attribute synchronization added with focused tests | Production previously exposed Thai UI text with `html[lang]="en"` on secondary routes. The repair awaits exact-SHA integration/deploy and post-deploy browser verification. Production crawl, consent, analytics, status/legal/support and content freshness verification remains open. |
| 03 — Homepage experience | `PARTIAL — IMPLEMENTED CANDIDATE` | Outcome H1, supported signup/Vertical Series handoff, discovery/trust/CTA sections, centered frame; focused tests and mocked local Chromium evidence | Spec 270 native artifact/catalog acceptance and source-backed Film/product proof are absent; no production visual or signed-in acceptance. |
| 04 — Film flagship and handoff | `PARTIAL — DISCOVERY ONLY; SPEC 258 PROOF GATED` | Existing `/drama-series` destination through `/login?returnUrl=%2Fdrama-series`; no `/film` route | Approved Spec 258 claims, public Film asset/rights/safety manifest and real film proof are absent. Do not call the concept panel Film proof. |
| 05 — SEO, accessibility and proof | `PARTIAL — FOCUSED CANDIDATE EVIDENCE` | SEO null-image tests, route/source inventory, six local Thai viewports, keyboard menu/Escape/focus restore and reduced-motion observations | No production crawl, canonical-indexation decision for every route, signed-in UAT, human accessibility/contrast review, measured CWV/performance budget, or deployment-SHA browser proof. |

## Spec 270 relation

The repository-owned public design package is an implementation reference aligned to Spec 270 R1.4. It is **not** the native Spec 270 canonical design-artifact record, design-system catalog snapshot, component-resolution evidence, or provider verification. See `design/public/PUBLIC_SPEC270_INTEGRATION_RECONCILIATION.md` and the Spec 270 G0 reconciliation record for the live authority boundaries.

## Current gate

The latest focused regression run passes 10 files / 46 tests, including the document-language repair. Production matrix evidence at `evidence/browser-production-ec605d1.json` is pre-repair and cannot be used to claim `html[lang]` acceptance. Build/deploy and post-deploy browser proof must use the exact integrated SHA. External claim, rights, catalog, consent and performance owners remain unverified and are not silently marked complete.
