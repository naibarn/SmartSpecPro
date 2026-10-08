# SmartAIHub Public Experience Design

**Package:** `smartaihub-public-web` · **Version:** `1.0.0`
**Aligned with:** Spec 270 R1.4 · **Target:** Spec 263 revision 263.8
**Owner:** SmartAIHub Public Experience · **Status:** Repository-owned candidate implementation reference; not a Spec 270 canonical design-artifact record

## Product narrative

SmartAIHub helps people move from an idea to work they can continue building. The homepage introduces the general-purpose workspace first; Vertical Series is the flagship example of a multi-step creative task. Do not imply a public Film product, customer result, or specific generated output without a source-backed entry in the truth registry.

## Responsive references

The implemented React composition and candidate browser captures are the responsive reference. These SVGs show information architecture and component relationships; they are not approved fixed-pixel designs:

- [Desktop (1440 × 900)](references/home-desktop.svg): centered 1320px page frame, two-column outcome hero with generated human editorial context paired with product-flow evidence, Vertical Series flagship, an explicit SmartAIHub value section, capability discovery, supporting public entry, trust/help, and final CTA.
- [Tablet (768 × 1024)](references/home-tablet.svg): same narrative order, stacked hero and flagship media, reflowing value cards, and two-column capability discovery.
- [Mobile (390 × 844)](references/home-mobile.svg): single-column hero, full-width actions, human editorial context and product-flow evidence after the lead, stacked value cards and capability discovery, no horizontal scrolling.

## Layout and section order

1. Existing SmartAIHub public navigation.
2. Hero: one outcome H1, brief supported explanation, primary signup action, feature discovery action, and a product-flow diagram beside the copy on wide screens.
3. Vertical Series flagship: connected continuation of the hero narrative, with the supported signed-out login handoff and feature details link.
4. Why SmartAIHub: explain the practical value in plain language through starting from a goal, exploring creative spaces, and choosing a next step. Keep the examples source-backed and avoid outcome guarantees.
5. Capability/resource discovery: Features, Gallery, and Docs; do not present live user gallery content as curated customer proof.
6. Supporting public entry owned by Spec 260, placed after the core SmartAIHub story so it does not interrupt product discovery.
7. Truthful trust/help links, final signup action, existing footer.

The page frame uses Astryx `Section`, `Grid`, `VStack`, `HStack`, `Card`, `Heading`, `Text`, `Button`, `Link`, and `Theme`. Main sections are limited to 1320px and align to the same frame. At wide desktop, use balanced columns and preserve deliberate negative space only around content groups, never as an unexplained blank half-screen.

## Typography, spacing, color

Use Astryx typography roles and spacing tokens. H1 uses `display-1` with balanced wrapping; section headings step down through `display-2`/`display-3`; body copy uses `large`, supporting copy uses `supporting`, and eyebrow labels use `label`. Thai copy may wrap naturally and must not be forced to English line lengths. Brand accent resolves from SmartAIHub's existing primary token through the scoped public theme. Do not add global token overrides, raw colors, or arbitrary pixel spacing.

## Imagery and product evidence

The Home hero pairs a generated editorial image (`public-home-human-editorial`) with the code-rendered product-flow panel in the same responsive sequence. The image has bilingual alt text and visible AI-generated/non-endorsement disclosure; it is never presented as a customer, employee, product screenshot, or Film proof. An image-load failure replaces the media region with localized text while retaining the product flow. The browser selects 480/768/1020/1536px WebP derivatives through `srcset`/`sizes`; all variants preserve the same 3:2 center-safe frame, and desktop/tablet/mobile focal behavior is recorded. Source, prompt, derivative hashes and withdrawal details are in the human asset manifest. The asset remains a repository-owned candidate, not a Spec 270 native artifact approval.

## Interaction and motion

Primary actions preserve existing routes: signup, `/features`, `/features#vertical-series`, and `/login?returnUrl=%2Fdrama-series`. Product diagram elements are explanatory and not controls. Respect keyboard focus, existing responsive menu behavior, and `prefers-reduced-motion`; no autoplay media or scroll-triggered essential content.

## Fallbacks, localization, accessibility

Illustration failure falls back to a text explanation without hiding core content. Thai and English share the same section order and supported destinations. Maintain one H1, ordered headings, semantic sections/navs, descriptive text alternatives for decorative vs informative media, visible focus, minimum 44 CSS-pixel interactive targets, and readable contrast. Responsive reflow must work at 360, 390, 768, 1024, 1440, and wide desktop sizes.

## Conformance

Implementation mapping: `design/public/PUBLIC_COMPONENT_REGISTRY.json` and `design/public/PUBLIC_UI_RULES.json`. Route/content authority: Spec 263 implementation registries under `specs/feature/263-smartaihub-public-website-experience-modernization/implementation/`. This public package is source-controlled design guidance and does not satisfy Spec 270's native canonical design artifact, catalog publication, or digest-owner requirements. Evidence is recorded under `orchestra/tasks/spec263-270-public-completion-20261005/evidence/`. A passing local artifact does not certify production; production evidence must name the deployed source SHA.
