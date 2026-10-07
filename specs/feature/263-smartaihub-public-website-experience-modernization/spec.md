# Spec 263 — SmartAIHub Public Website Experience Modernization

**Status:** IMPLEMENTATION IN PROGRESS — REVISION 263.9; partial implementation is integrated and static frontend is deployed, while complete production acceptance remains open.
**Target:** `https://smartaihub.app` public website  
**Spec Type:** Public Product Experience / Brand System / Conversion / Discovery  
**Audit Date:** 2026-10-02  
**Audit:** Six 10-pass completeness/gap review cycles completed (60 passes total); gaps incorporated into this file. Revision 263.8 synchronizes the public-site experience contract with **Spec 270 R1.4 — SmartAIHub Design Intelligence, UI Generation & Provider-Neutral Design Runtime**, while preserving Spec 263 as the public experience authority and Spec 224 as the development/implementation authority.  
**Primary Objective:** Modernize the SmartAIHub public website from a feature/catalog-led AI SaaS presentation into a product-experience website that clearly communicates SmartAIHub as a universal AI work platform, while making **AI Film / Short Film / Vertical Series** a flagship, immediately understandable capability.

---

# 1. Executive Summary

The public SmartAIHub website must communicate two truths simultaneously:

1. **SmartAIHub is a universal AI work platform** capable of understanding user intent, selecting capabilities, executing work, and returning usable artifacts.
2. **AI Film / Short Film / Vertical Series is a flagship proof-of-capability** and must remain highly visible because it is one of the clearest and most differentiated product experiences currently available.

The redesign must NOT reduce SmartAIHub to:
- an AI video generator;
- a generic AI chat product;
- a workflow builder;
- a skill marketplace;
- an agent framework;
- a developer infrastructure platform.

Instead, the public narrative should be:

> **Tell SmartAIHub what you want to create or get done.  
> SmartAIHub finds the right capabilities, carries out the work, and brings the result back.**

The flagship proof should be:

> **From one idea to a finished short film or vertical series.**

This film capability demonstrates that SmartAIHub can orchestrate complex, multi-stage work—not merely invoke a single model.


## 1.1 Normative language

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST / MUST NOT** = release-blocking requirement unless an explicit written exception is approved.
- **SHOULD / SHOULD NOT** = expected default; exceptions require documented rationale.
- **MAY** = optional implementation choice.

## 1.2 Scope

This spec governs the **public, unauthenticated product experience** and the transition from public pages into authenticated SmartAIHub product surfaces.

In scope:
- homepage and global public shell;
- public product/capability pages;
- AI Film / Short Film / Vertical Series flagship experience;
- public Marketplace and Mini App discovery surfaces where applicable;
- pricing, resources, blog/docs entry surfaces, security/trust entry surfaces;
- public design system and content system;
- SEO, performance, analytics, privacy, accessibility, security, observability, rollout;
- public-to-product deep links and intent handoff.

Out of scope unless explicitly touched by the migration:
- redesign of authenticated SmartAIHub product screens;
- changes to model-provider contracts;
- changes to execution authority or worker-job semantics;
- changes to Film Studio production logic itself;
- new capability claims that are not already implemented or separately approved.

## 1.3 Required dependencies / alignment

Spec 263 MUST remain compatible with the existing SmartAIHub architecture and related specs, especially:
- **Spec 270 R1.4 Design Intelligence, UI Generation & Provider-Neutral Design Runtime** as the canonical design-intelligence, design-artifact, provider/fallback, component-resolution, and visual-verification authority for UI design work;
- Spec 224 Development Orchestrator Runtime for implementation/QA execution;
- Spec 240 Agent-Generated UI for generated public surfaces where still applicable, subject to Spec 270 design authority;
- Specs 252–254 for Chat / Task Control / product-command integration where referenced by public demos;
- Spec 256 for capability/intent-driven product interaction;
- Spec 258 for AI Film Studio / film-production behavior and UI demonstrations;
- relevant media/audio specs for actual capabilities shown publicly.

Spec 263 MUST NOT redefine execution authority owned by those specs. It defines **public presentation, discovery, evidence, and entry paths**.

## 1.4 Cross-spec authority contract with Spec 270

For public website design work, authority is divided as follows:

```text
Spec 263
Public Website Experience Authority
        │
        │ defines WHAT the public experience must communicate and protect
        ▼
Spec 270 R1.4
Design Intelligence / Canonical Design Artifact Authority
        │
        │ defines HOW design exploration, normalization, component resolution
        │ and visual verification are performed
        ▼
Spec 224
Development / Implementation / Test / Final-Verify Authority
        │
        ▼
Production smartaihub.app
```

### Spec 263 owns

- public positioning and message hierarchy;
- homepage/public-route information architecture;
- Film / Short Film / Vertical Series flagship prominence;
- Human + Product Evidence policy;
- public conversion and public→product handoff requirements;
- public content truthfulness, proof, trust, legal and commercial presentation;
- public-specific performance, SEO, accessibility, privacy, security and operational gates;
- public brand perception and anti-AI-slop rules.

### Spec 270 owns

Spec 263 MUST consume rather than redefine Spec 270 contracts for:

- `DesignRequest`;
- `DesignBrief`;
- `DesignContextBundle`;
- `CanonicalDesignArtifact`;
- `DesignVariantSet`;
- `DesignDecision`;
- `DesignSystemSnapshot`;
- `ComponentIntent`;
- `ComponentResolution`;
- `VisualVerificationEvidence`;
- native/external design-provider selection and fallback;
- design canonicalization;
- design-to-Astryx/SmartAIHub component mapping;
- provider cleanup and design-time dependency elimination;
- semantic design diff and design-decision lineage.

If the two specs appear to overlap, the following precedence applies:

```text
public meaning / positioning / conversion / truthfulness => Spec 263
design-intelligence mechanics / canonical design artifacts => Spec 270
implementation state machine / code / tests / final verify => Spec 224
capability routing => Spec 256
```

No implementation SHALL create a second public-specific design-provider subsystem, canonical design-artifact model, or component-resolution engine inside Spec 263.

---

# 2. Product Positioning

## 2.1 Public positioning hierarchy

```text
SmartAIHub
│
├── Universal AI Work Platform
│   └── Intent → Capabilities → Execution → Artifacts
│
├── Flagship Showcase
│   └── AI Film / Short Film / Vertical Series
│
├── Create
│   ├── Image
│   ├── Video
│   ├── Voice
│   ├── Audio / Music / SFX
│   └── Creative Media
│
├── Research & Analyze
│
├── Build
│   ├── Web Apps
│   ├── Websites
│   ├── Mini Apps
│   └── Software
│
├── Assistants / Agents / Automation
│
├── Skills / Marketplace / Workflows
│
└── Publish / Brand / Monetize
```

The homepage MUST lead with user outcomes.

Infrastructure terms such as:
- MCP;
- runtimes;
- sandbox;
- swarm;
- LLM routing;
- worker jobs;
- orchestration kernel;
- vector infrastructure;

SHOULD appear only where they improve understanding for technical audiences.

---


## 2.2 Audience and message architecture

The homepage MUST have one coherent primary story rather than separate equal-weight homepages embedded into one page.

Primary audience intents:

| Audience intent | What they need to understand quickly | Primary proof |
|---|---|---|
| Creator / filmmaker | “Can this take me from idea to a finished piece?” | AI Film / Vertical Series |
| General user / professional | “Can it actually finish useful work?” | Research/Create/Task artifacts |
| Builder / creator-business | “Can I build and publish an AI product?” | Mini App / branded product flow |
| Team / organization | “Can this be governed and reused?” | Skills, controlled execution, trust/security |
| Technical evaluator | “What can integrate and run underneath?” | Progressive technical detail, not hero jargon |

Message priority MUST remain:

```text
Outcome
→ Proof
→ Breadth
→ Control
→ Extensibility
→ Technical depth
```

Do not reverse this order on the homepage.

## 2.3 Primary conversion journeys

The site MUST define explicit public journeys instead of treating every CTA as a generic signup link.

### Journey A — Film creator

```text
Homepage / Film proof
→ /film (or approved canonical route)
→ Start creating
→ Auth if needed
→ Film Studio entry with campaign/capability context preserved
```

### Journey B — General work

```text
Homepage intent composer
→ capability understanding / example
→ Start
→ Auth if needed
→ Chat / Task Control with safe intent handoff
```

### Journey C — Builder / Mini App

```text
Build proof
→ product-building explanation
→ Start building
→ Auth
→ supported creation entry point
```

### Journey D — Marketplace discovery

```text
Marketplace preview
→ public listing/detail
→ run/install/use action
→ auth only when required
```

## 2.4 Public-to-product handoff contract

CTA behavior MUST be deterministic.

- If the visitor is authenticated, deep-link to the correct product surface when possible.
- If authentication is required, preserve a non-sensitive `returnTo`/entry intent through the approved auth flow.
- Capability context such as `film`, `research`, `miniapp`, or `marketplace` MAY be retained as structured metadata.
- Raw user prompt text MUST NOT be placed in analytics events, URL query strings, referrers, or third-party tracking payloads.
- If a public intent composer accepts draft text before sign-in, the draft MUST either remain local until the user explicitly continues or be transferred through an approved first-party secure mechanism.
- Handoff failure MUST have a recoverable fallback rather than losing the visitor's chosen capability.

## 2.5 Success metrics and guardrails

Before rollout, capture baseline values and define target deltas for:
- homepage → signup/start conversion;
- homepage → Film exploration;
- Film page → Film Studio start;
- public intent composer → authenticated continuation;
- Marketplace discovery → listing/detail engagement;
- organic landing → meaningful product action;
- returning public visitor → product entry.

Guardrails:
- bounce/exit rate by major landing page;
- Core Web Vitals;
- error rate;
- accessibility regressions;
- signup completion rate;
- SEO index coverage;
- media playback failure rate.

A redesign MUST NOT be declared successful solely because visual review passes.

## 2.6 Pricing, credits, and value transparency

Pricing is part of product comprehension, not a footer afterthought. Public pricing/credit communication MUST reflect the actual commercial model in production and MUST NOT imply unlimited or flat-rate usage where costs are usage-dependent.

Required behavior:
- clearly distinguish account access, prepaid credits/balance, usage charges, Skill/Agent/Plugin fees, and any provider/model costs that are separately visible to the user;
- explain that model/provider prices can change and avoid stale hardcoded unit-cost claims unless sourced from the approved pricing service/registry;
- show an understandable example of how a task consumes credits when a reliable estimate can be produced;
- distinguish estimated cost from final settled cost;
- disclose taxes, currency conversion, minimum top-up, refund/expiry rules, or payment limitations when applicable;
- never hide material recurring fees, required minimums, or usage conditions behind the final payment step;
- pricing CTAs MUST deep-link to the current billing/pricing flow rather than a dead marketing-only page.

If exact pricing cannot be retrieved safely at render time, the page MUST prefer durable model explanations and a verified link to current pricing over stale numbers.

---

## 2.7 Funnel continuity and anonymous intent-handoff contract

The public-to-product journey MUST preserve user momentum without turning anonymous marketing state into hidden account data or privileged execution state.

If the homepage or another public page allows a visitor to draft an intent before authentication, the implementation MUST define one of these approved handoff modes:

```text
A. Client-local draft only
B. Short-lived opaque server-side draft token
C. Explicit user copy/re-entry
```

Requirements:
- raw prompt/intent text MUST NOT be placed in query strings, fragments used for marketing attribution, referrers, analytics payloads, or third-party storage;
- an opaque draft token, if used, MUST have a documented TTL, scope, one-way lookup semantics, revocation/expiry behavior, and maximum payload size;
- anonymous draft state MUST NOT grant authorization or imply that protected execution has begun;
- the user MUST be able to review/edit the carried intent after sign-in before any protected side effect when the destination workflow requires approval;
- signup/login cancellation, token expiry, locale change, or unsupported destination MUST degrade to a clear recovery state instead of losing context silently;
- cross-device continuation is OPTIONAL and, if implemented, requires explicit user/account binding after authentication rather than fingerprinting;
- intent-handoff success/failure SHOULD be observable using non-sensitive event dimensions.

The preferred default is the smallest state necessary to preserve user momentum.

# 3. Flagship Capability: AI Film / Vertical Series

AI Film / Vertical Series is a **signature experience**.

It must be visible:
- in the hero composition;
- in the first major content sequence after the hero;
- in navigation or primary capability discovery;
- in social/SEO metadata;
- in selected conversion CTAs;
- in visual proof sections using real output.

The public website MUST demonstrate that SmartAIHub supports a production chain such as:

```text
Idea
 ↓
Story / Series Bible
 ↓
Characters
 ↓
Episode Arc
 ↓
Script
 ↓
Storyboard
 ↓
Shot Planning
 ↓
Image / Video Generation
 ↓
Voice / Music / SFX
 ↓
Timeline / Editing
 ↓
Captions / Packaging
 ↓
Short Film / Vertical Episode
```

The experience must NOT be described merely as “AI Video Generation”.

Preferred message:

> **From one sentence to a series.**


## 3.1 Film proof hierarchy

The flagship must prove an end-to-end production system, not just generation quality.

Public evidence SHOULD show at least four distinct production layers when available:
1. narrative/series planning;
2. character/visual continuity;
3. shot/storyboard/media generation;
4. editing/audio/caption/final episode output.

## 3.2 Film sample integrity and rights

Every public Film demo MUST have an asset manifest that records:
- source/owner of each uploaded or generated asset;
- permission to display it publicly;
- music/SFX/voice usage rights where applicable;
- likeness/identity consent where a real person is depicted or cloned;
- whether the artifact is an official SmartAIHub demo, customer-authorized work, or conceptual mockup;
- generation/provider metadata where disclosure is required by policy or law.

Public examples MUST NOT rely on unverified copyrighted assets, unlicensed music, unauthorized real-person likenesses, or customer content without permission.

If provenance metadata such as C2PA/content credentials is supported elsewhere in SmartAIHub, the public site SHOULD preserve/expose it where appropriate. Spec 263 MUST NOT falsely claim provenance support when none exists.

## 3.3 Film graceful degradation

If video playback or the delivery provider fails:
- show an optimized poster image;
- keep explanatory text and CTA usable;
- optionally show storyboard frames as fallback;
- never leave a blank hero region;
- never block the rest of the page on video initialization.

## 3.4 Public Film demo suitability and synthetic-media disclosure

Flagship demos are public marketing assets and therefore require a stricter publication gate than private generation output.

Before publication:
- run the approved content-safety/moderation checks;
- verify that depictions of real identifiable people, voice clones, trademarks, copyrighted characters, and third-party footage have documented permission or another approved basis;
- avoid deceptive presentation that could cause a reasonable viewer to believe a synthetic event actually occurred;
- ensure any depiction of minors is suitable for a general public marketing surface and has the required permissions;
- label synthetic/AI-generated media when required by law, provider policy, provenance standard, or SmartAIHub disclosure policy;
- preserve applicable content credentials/provenance metadata instead of stripping it without reason;
- provide a replacement/withdrawal path if rights, consent, or safety status changes after publication.

The public website MUST NOT become an exception path around Film Studio safety, rights, or moderation controls.

---

# 4. Design Philosophy

## 4.1 Show the work, not containers

The public website SHOULD use actual work as the visual language.

Avoid:

```text
[icon]
AI Video Generation
Generate amazing videos using AI.
```

Prefer:

```text
THE LAST TRAIN
Episode 03

[9:16 actual preview]

24 scenes
3 recurring characters
Voice ready
Music ready
Captions ready
```

Artifacts should become UI.

---

## 4.2 Real product over decorative AI imagery

Priority:

1. Real SmartAIHub outputs
2. Real SmartAIHub product UI
3. Real artifacts
4. Real task/progress states
5. Human-centered editorial imagery that supports a real use case or emotional context
6. Contextual non-human editorial imagery
7. Purpose-built illustration
8. Abstract decoration

Human imagery is a **supporting evidence/context layer**, not a substitute for product evidence. A prominent human image SHOULD be paired with a visible SmartAIHub command surface, artifact, Film output, or product-state proof within the same viewport/sequence.

Avoid default dependence on:
- purple/blue gradients;
- glowing orbs;
- generic AI sparkles;
- excessive glassmorphism;
- neon borders;
- floating generic chat bubbles;
- random 3D objects.

---

## 4.3 AI under the interface

AI is the operating capability, not the visual theme.

The interface should emphasize:
- work;
- output;
- progress;
- control;
- artifacts;
- capability;
- identity;
- creation;
- collaboration.

Do not label every surface “AI-powered”.

---

## 4.4 Narrative over feature catalog

Homepage narrative:

```text
User intent
   ↓
SmartAIHub understands the job
   ↓
Film flagship proves complex execution
   ↓
Create / Research / Build / Automate
   ↓
Chat + Task Control
   ↓
Skills / Agents / Models / Tools
   ↓
Artifacts
   ↓
Reuse / Publish / Sell
```

---

# 5. Visual Language

## 5.1 Public website personality

Public SmartAIHub should use:

**Contemporary Product Editorial**

Characteristics:
- high-quality typography;
- asymmetric layouts where useful;
- real content as composition;
- controlled whitespace;
- strong hierarchy;
- restrained color;
- low-noise surfaces;
- intentional motion;
- variable information density.

The public site should be more expressive than the authenticated Workbench.

---

## 5.2 Design-system architecture

```text
SmartAIHub Public Experience Requirements (Spec 263)
│
▼
Spec 270 Canonical Design Artifact / Design System Snapshot
│
▼
SmartAIHub Design Foundation
│
├── Tokens
├── Typography
├── Spacing
├── Color
├── Motion
├── Accessibility
└── Responsive Grid
     │
     ▼
Public Web Design Language
     │
     ├── Editorial Blocks
     ├── Product Showcases
     ├── Artifact Displays
     ├── Film Showcase
     ├── CTA Systems
     └── Discovery Patterns
```

Astryx / StyleX MAY be used underneath where compatible.

Production code MUST NOT couple every public component directly to a third-party design-system package.

Preferred boundary:

```text
@smartaihub/public-ui
        ↓
SmartAIHub Components
        ↓
Astryx / StyleX / underlying implementation
```

This allows future replacement without rewriting page code.


## 5.3 Layout and responsive primitives

Public components MUST prefer content-driven responsive behavior over page-specific breakpoint hacks.

Required primitives:
- max-width content containers;
- fluid spacing/type scales where appropriate;
- CSS grid/flex layouts with intrinsic sizing;
- container queries where they reduce global breakpoint coupling;
- logical properties where practical;
- safe handling of very long Thai/English strings;
- no horizontal page overflow at supported viewport widths.

Breakpoints are QA checkpoints, not permission to create entirely separate markup unless necessary.

## 5.4 Theme policy

If both light and dark public themes are supported:
- both are first-class QA targets;
- screenshots and contrast tests MUST run for both;
- embedded product screenshots MUST not become illegible against either theme;
- `prefers-color-scheme` SHOULD be respected unless product requirements dictate otherwise.

If only one public theme is shipped initially, do not ship a partially broken alternate theme.

## 5.5 Brand and art-direction contract

The public site MUST define a brand layer above raw component styling so that different teams/agents do not converge on unrelated “modern” aesthetics.

The brand package SHOULD define:
- logo/wordmark clear-space and minimum-size rules;
- primary/secondary brand colors and prohibited combinations;
- editorial photography/illustration direction;
- treatment of generated images and Film stills;
- screenshot framing and product-chrome rules;
- icon family and stroke/fill rules;
- copy/voice principles for Thai and English;
- social-preview/OG composition templates;
- when expressive layouts are allowed versus when product UI must remain quiet.

Public components MUST use semantic design tokens rather than privately redefining brand colors, radius, shadows, or typography. Token changes that can alter many pages MUST be versioned/reviewable and accompanied by visual-regression evidence.


## 5.6 Human-centered editorial imagery strategy

SmartAIHub SHOULD use human imagery on the public website to communicate that the platform exists for **people doing real creative, professional, research, business, and production work**.

The chosen direction is:

> **Human + Product Evidence**

Human imagery MUST NOT replace product proof. It should create warmth, context, aspiration, and narrative while SmartAIHub UI/artifacts remain the primary evidence of capability.

### 5.6.1 Intended perception

Human imagery should help the site feel:
- human-centered rather than infrastructure-centered;
- credible and useful rather than futuristic for its own sake;
- contemporary/editorial rather than stock-SaaS;
- creative enough for Film/Media while still professional enough for Research/Build/Business;
- emotionally approachable without becoming a lifestyle, fashion, influencer, or recruitment website.

### 5.6.2 Preferred visual treatment

Preferred human imagery:
- natural window/daylight or believable environmental light;
- realistic skin texture and restrained retouching;
- candid or lightly directed posture rather than exaggerated advertising poses;
- believable creator/work/professional environments;
- clean composition with intentional negative space for UI/copy when needed;
- wardrobe and styling appropriate to the use case;
- calm modern editorial color treatment;
- believable depth of field and camera perspective;
- visual quality high enough to sit beside premium product UI without looking synthetic or low-cost.

Avoid as a default:
- hyper-perfect “AI influencer” faces;
- beauty/fashion posing that becomes the subject of the page;
- implausibly luxurious offices used only to signal status;
- plastic skin, excessive facial symmetry, or heavy glamour retouching;
- repeated use of the same gender/presentation/visual archetype across the homepage;
- random portraits with no semantic relationship to the adjacent capability;
- fake meetings, fake collaboration scenes, or staged handshakes;
- synthetic imagery that could reasonably be mistaken for a real customer/testimonial/employee endorsement.

### 5.6.3 Role in the homepage visual hierarchy

The homepage SHOULD remain primarily product-led.

Recommended composition principle:

```text
Product UI / Artifact / Film output     = primary evidence
Human editorial imagery                 = supporting context/emotion
Typography / whitespace / brand graphics = framing
```

As a practical guardrail:
- most prominent homepage visual surfaces SHOULD still be product UI, real artifacts, or actual generated outputs;
- human editorial imagery SHOULD normally remain a minority of the total homepage visual inventory;
- a dedicated human-story/use-case section MAY temporarily give people greater visual weight;
- above the fold, a large human portrait MAY be used only when a product/Film proof layer is visible in the same composition or immediately adjacent without scrolling.

### 5.6.4 Persona/context mapping

Human imagery SHOULD map to the work being communicated rather than to generic demographic personas.

Examples:
- Film / Vertical Series → creator, director, storyteller, reviewer, performer-context imagery paired with storyboard/episode/timeline proof;
- Research / knowledge work → professional reviewing evidence/report/artifact;
- Build / Mini App → creator/founder/operator paired with the built product;
- Business / team → decision-maker/operator context paired with Task Control, approvals, or completed work;
- General creative work → approachable lifestyle/editorial scene paired with generated artifact.

Do not infer or imply sensitive traits, professional qualifications, customer status, nationality, or identity from a person's appearance.

## 5.7 Human-image source, provenance, and truthfulness contract

Every human visual used publicly MUST have an asset-source classification and publication owner.

Recommended source types:

```text
AI_GENERATED_EDITORIAL
LICENSED_EDITORIAL
SMARTAIHUB_TEAM_APPROVED
CUSTOMER_CREATOR_APPROVED
PRODUCT_OUTPUT
```

Required metadata SHOULD include:

```text
asset_id
source_type
creation_or_source_ref
rights_or_license_ref
publication_owner
approved_contexts
prohibited_contexts
locale_notes_if_any
synthetic_or_generated: true|false
model_release_or_permission_ref_if_required
reviewed_at
review_expires_at_if_applicable
withdrawal_status
```

Rules:
- AI-generated people MAY be used as editorial/supporting imagery;
- AI-generated people MUST NOT be presented as actual customers, employees, partners, testimonials, case-study subjects, or real users;
- if placement/context could reasonably lead a visitor to believe a synthetic person is a real endorser or documented user, the design/copy MUST remove that implication or provide an appropriate disclosure;
- customer/creator likeness requires documented permission appropriate to the intended use;
- asset provenance MUST survive CMS changes and localization;
- imagery with unresolved rights, likeness ambiguity, or misleading endorsement risk MUST NOT ship.

## 5.8 Human-image visual QA contract

AI-generated or heavily edited human imagery MUST receive visual QA before publication.

QA MUST inspect at minimum:
- eyes/iris direction and facial asymmetry artifacts;
- hands/fingers and limb geometry;
- ears, teeth, hair boundaries, jewelry and accessories;
- clothing seams/buttons/fasteners;
- reflections, windows, mirrors and shadows;
- furniture/body intersections;
- duplicated/background people;
- illegible or hallucinated text/signage;
- impossible perspective or anatomy;
- over-smoothed/plastic skin;
- whether the image looks conspicuously synthetic at the rendered crop/size;
- whether glamour, pose, wardrobe, or framing competes with the product message.

A technically artifact-free image can still fail if it feels like generic stock/AI-influencer imagery rather than SmartAIHub editorial art direction.

## 5.9 Human identity, likeness, age, and endorsement safety

Human imagery MUST be governed as identity-bearing media, even when generated.

Required rules:
- generated people MUST NOT intentionally imitate, approximate, or evoke an identifiable real person without documented rights/authorization for that use;
- editors/prompts MUST NOT request “make this look like [real person]” as a shortcut for public brand imagery unless the use is separately authorized and reviewed;
- a synthetic person who happens to resemble an identifiable real person MUST be rejected or materially altered if the resemblance could create endorsement/confusion risk;
- public editorial imagery SHOULD default to clearly adult-presenting subjects unless a use case specifically requires a minor and the legal/rights/guardian-consent path is documented;
- imagery involving minors MUST receive an additional suitability/rights review and MUST NOT use sexualized, glamourized, or age-ambiguous framing;
- no human image may imply that a person is a SmartAIHub customer, employee, partner, expert, creator, filmmaker, researcher, or testimonial source unless that relationship is true and authorized;
- attractiveness, body emphasis, glamour, luxury signaling, or sexualized styling MUST NOT become the primary conversion mechanism;
- human imagery MUST remain consistent with the adjacent work context and product evidence.

## 5.10 Representation and localization guardrails

Human imagery SHOULD communicate breadth of work without turning demographic appearance into a segmentation shortcut.

Required rules:
- do not map locale to ethnicity, race, nationality, religion, gender, age, disability, or other sensitive/personal identity attributes by visual assumption;
- do not use stereotyped visual shorthand to represent professions, countries, technical ability, wealth, creativity, or authority;
- avoid repeating one narrow visual archetype across the homepage when doing so makes SmartAIHub appear intended for only that archetype;
- localized pages MAY use different editorial imagery when culturally/editorially useful, but the reason should be content relevance rather than inferred identity targeting;
- alt text/captions MUST describe relevant visible context and work, not infer sensitive traits or professional credentials from appearance;
- representation review SHOULD be performed at the page/sequence level, not merely image-by-image, so the combined homepage does not unintentionally send a narrower message than the product positioning.

## 5.11 Human asset production and derivative provenance

The source registry in §5.7 MUST be sufficient to trace a published image back through its production lineage.

For generated/edited human imagery, the internal production manifest SHOULD capture:

```text
asset_id
parent_asset_id_if_any
source_type
generator_or_source
model_or_tool_version_if_known
generation_or_edit_ref
prompt_or_instruction_ref_private
manual_edit_ref_if_any
rights_or_license_ref
review_status
reviewer
approved_contexts
publication_placements
derivative_ids
cdn_object_keys_or_asset_refs
og_social_derivative_refs
locale_variants
created_at
reviewed_at
withdrawal_status
```

Rules:
- sensitive/private prompt details need not be public, but the first-party provenance record MUST be auditable;
- generated derivatives, crops, retouches, background replacements, and social/OG variants MUST remain linked to the parent asset;
- delivery copies SHOULD strip unnecessary EXIF/location/device metadata;
- a rights/provenance withdrawal MUST be able to identify all active placements/derivatives for purge or replacement.

---

## 5.12 Design drift and extension governance

The redesign MUST remain coherent after launch as new campaign pages, capabilities, Mini Apps, Marketplace surfaces, and agent-generated public pages are added.

Required governance:
- new public components/patterns SHOULD extend the registered design language before introducing one-off visual primitives;
- repeated one-off values for spacing, radius, typography, color, motion, or elevation SHOULD trigger token/pattern review rather than silent duplication;
- high-impact shared component changes require visual-regression evidence across representative public routes and both supported locales;
- generated UI MUST retrieve the current public component/pattern registry version and MUST NOT rely on stale copied design instructions;
- exceptions to public design rules require an owner, rationale, scope, expiry/review date, and migration plan when temporary;
- periodic design-conformance review SHOULD identify abandoned components, duplicate patterns, inaccessible variants, and AI-generated drift;
- a visually novel campaign MAY intentionally differ, but must preserve brand identity, accessibility, truthfulness, performance budgets, and the Product Evidence hierarchy.

A page is not considered innovative merely because it bypasses the design system.

# 6. Machine-Readable UI Constitution

Create or update:

```text
design/public/
├── SMARTAIHUB_PUBLIC_DESIGN.md
├── PUBLIC_UI_RULES.json
├── PUBLIC_COMPONENT_REGISTRY.json
├── PUBLIC_PATTERN_REGISTRY.json
├── PUBLIC_TEMPLATE_REGISTRY.json
├── PUBLIC_ANTI_PATTERNS.md
├── PUBLIC_CONTENT_RULES.md
├── PUBLIC_BRAND_RULES.md
├── PUBLIC_HUMAN_IMAGERY_RULES.md
├── PUBLIC_HUMAN_ASSET_REGISTRY.json
└── PUBLIC_TOKEN_CHANGELOG.md
```

Developer agents MUST consult these before generating new public UI.

---

## 6.1 Public UI dependency and version-governance contract

The public design system MUST remain owned by SmartAIHub even when third-party primitives such as Astryx, StyleX, animation libraries, icon sets, or headless UI packages are used underneath.

Required rules:
- application/page code MUST import public primitives through the approved SmartAIHub boundary (for example `@smartaihub/public-ui`) rather than importing Astryx or another replaceable design-system package throughout the codebase;
- third-party UI dependencies MUST be version-pinned through the repository package-management policy and MUST NOT silently float across production builds;
- an upgrade that changes rendered markup, token semantics, interaction behavior, accessibility behavior, hydration behavior, or bundle cost requires targeted regression evidence;
- token renames/removals require a migration/deprecation path rather than silent visual fallback;
- high-impact dependency upgrades require representative desktop/mobile visual-regression comparison plus accessibility smoke tests;
- beta/experimental upstream packages require an explicit owner and replacement/rollback path;
- public component wrappers MUST NOT expose unstable upstream APIs as the long-term SmartAIHub public API unless intentionally adopted and versioned.

The goal is to prevent dependency churn from causing silent brand drift or forcing the public website to inherit the visual identity of an upstream component library.

# 7. Anti-AI-Slop Rules

Public UI MUST avoid:

- excessive rounded cards;
- card grids for every feature;
- 20–32px radius on ordinary controls;
- gradient headlines as default;
- neon “AI” glow;
- circle icon + heading + text repeated everywhere;
- every surface having shadow;
- excessive centered layouts;
- giant headings without meaningful hierarchy;
- meaningless metrics;
- fake activity;
- fake customer logos;
- fake product screenshots;
- decorative dashboards that do not exist;
- repeating “powered by AI” language;
- creating custom components when a registered component already exists;
- generic AI-influencer portraits used as decoration;
- repeated glamour/beauty imagery that visually overwhelms product proof;
- synthetic people presented in testimonial/customer/case-study contexts without truthful provenance;
- stereotyped persona imagery used as a shortcut for role, expertise, wealth, nationality, or customer type.

---

# 8. Typography

Use a strong application/editorial hierarchy.

Suggested baseline:

| Role | Size |
|---|---:|
| Caption / Metadata | 12–13px |
| Control / Label | 13–14px |
| Body | 15–17px |
| Strong body | 15–17px / 500–600 |
| Section heading | 24–40px |
| Major editorial heading | 44–72px responsive |
| Hero display | fluid clamp, content-dependent |

Thai typography MUST be validated separately.

Thai text MUST NOT rely on unsuitable Latin fallback behavior.

Line-height must support Thai readability.

---

# 9. Color / Surface Rules

Use semantic tokens.

Examples:

```text
surface.canvas
surface.base
surface.raised
surface.sunken

text.primary
text.secondary
text.muted
text.inverse

border.subtle
border.default
border.strong

action.primary
action.secondary

status.success
status.warning
status.danger
status.info
```

Do NOT hardcode arbitrary color values throughout page components.

---

# 10. Radius / Spacing

Suggested radius system:

```text
radius-xs    4px
radius-sm    6px
radius-md    8px
radius-lg   12px
radius-xl   16px
radius-full 999px
```

Spacing grid:

```text
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96
```

Pills are reserved mainly for:
- status;
- tags;
- filters;
- chips;
- compact metadata.

---

# 11. Homepage Information Architecture

## Section 1 — Hero

The hero MUST communicate:
- what SmartAIHub is;
- what a user can do;
- evidence of a real product;
- the flagship Film capability.

Recommended message direction:

> **Tell SmartAIHub what you want to create or get done.**

Supporting message:

> Research, create, build and run complex work from one intelligent workspace.

Primary CTA:
- Start / Try SmartAIHub

Secondary CTA:
- Explore what SmartAIHub can do

Hero visual SHOULD combine:
- Chat/command input;
- active Task Control;
- Film / Vertical Series output;
- real artifact or production view;
- optionally, one human editorial image as a supporting emotional/context layer.

Preferred hero composition:

```text
Message / Intent Composer
        +
SmartAIHub Product Proof
        +
Film / Artifact Proof
        +
Human Editorial Layer (supporting, not dominant)
```

On desktop, a human portrait MAY occupy substantial visual area, but product/Film evidence MUST remain visible above the fold. On mobile, do not preserve a desktop human crop at the expense of the command surface, CTA, or flagship product proof.

Do not use a static decorative AI illustration or standalone portrait as the only hero visual.

---

## Section 2 — Flagship: From One Sentence to a Series

This should be the first major proof section.

Show:

```text
Prompt
 ↓
Series Bible
 ↓
Characters
 ↓
Storyboard
 ↓
Scenes
 ↓
Voice / Music
 ↓
Timeline
 ↓
Vertical Episode
```

Use real or verified demo data.

Recommended UI composition:
- 9:16 episode preview;
- character cards;
- storyboard strip;
- task/progress state;
- timeline fragment;
- episode state.

CTA:
- Create a Film
- Explore AI Film Studio

---

## Section 3 — The Same Platform Does More

Do NOT use a generic equal-weight card grid.

Present actual artifact examples:

### Research
- sources reviewed;
- report generated;
- comparison artifact.

### Create
- image;
- video;
- audio.

### Build
- Mini App;
- website;
- development artifact.

### Automate
- Assistant;
- recurring task;
- completed task output.

Each should show the work itself.

---

## Section 4 — One Interface, Many Capabilities

Explain the system simply:

```text
Chat / Task Control
        ↓
Capability Resolver
        ↓
Skills / Agents / Models / Tools
        ↓
Cloud / Local / Hybrid execution
        ↓
Artifacts
```

This section may expose deeper architecture progressively.

---

## Section 5 — Chat + Task Control

Show that Chat is not just conversational.

Public demo should communicate:
- command;
- task plan;
- parallel work;
- progress;
- approvals where required;
- artifacts returned to the same workspace.

---

## Section 6 — Skills and Marketplace

Explain:
- installable capability;
- discoverable skills;
- creator ecosystem;
- reusable product functionality.

Do not make Marketplace the primary homepage identity.

---

## Section 7 — Build and Publish AI Products

Show:

```text
Idea
 ↓
Mini App
 ↓
Brand
 ↓
Custom Domain / Tenant
 ↓
Publish
 ↓
Marketplace / Customer Use
```

This section supports SmartAIHub’s creator/business future.

---

## Section 8 — Final CTA

Return to intent.

Example:

> **What would you like SmartAIHub to do?**

The CTA may visually resemble the real SmartAIHub command surface.

---


## 11.1 Proof, trust, and credibility layer

The site MUST distinguish **product proof** from marketing claims.

Allowed proof types:
- real SmartAIHub UI;
- official SmartAIHub demo artifacts;
- authorized customer/creator work;
- measured product metrics with source/date;
- verified testimonials or logos with permission;
- documented security/privacy practices.

Required rules:
- no invented usage counts;
- no fake logos;
- no simulated “live” activity presented as real;
- no undated performance claims;
- no unqualified “best/fastest/most powerful” claims without evidence.

The global footer or trust architecture SHOULD make the following discoverable when applicable:
- Privacy;
- Terms;
- Security / Trust;
- Support;
- Status;
- Documentation;
- Contact / company information.


## 11.2 Human-centered homepage composition

The homepage SHOULD deliberately alternate between **human context** and **product evidence** rather than clustering all portraits into one gallery.

Recommended narrative rhythm:

```text
Hero
Human + Product + Film proof
        ↓
Flagship Film production
Mostly product/artifact
        ↓
Create / Research / Build
Artifacts with selective human context
        ↓
Real people, real work
Short editorial human-led bridge
        ↓
Chat / Task Control / Agents
Product-first again
        ↓
Publish / Marketplace / CTA
Output and action first
```

A human-led editorial bridge MAY show multiple work contexts, but it SHOULD answer **“who can use this and for what?”**, not merely display attractive portraits.

Every human-led block MUST have an adjacent semantic connection to at least one of:
- a command/request;
- a SmartAIHub capability;
- an artifact/output;
- a project/task state;
- a Film/creative production result;
- a Mini App/product result.

Do not create a standalone “people carousel” with no product relationship.

### Suggested art-direction families

The homepage MAY use a small set of coherent human art-direction families:

1. **Creative / human warmth** — bright natural interiors, windows/daylight, calm editorial posture; useful for Create and Film storytelling.
2. **Professional / knowledge work** — credible office/studio/workspace context; useful for Research, Build, Task Control, business use.
3. **Making / reviewing** — person interacting with storyboard, tablet, laptop, camera, notes, prototype, or artifact; preferred when a believable interaction can be depicted without fake UI.

These families MUST share one SmartAIHub photographic/generative treatment so the site does not look assembled from unrelated stock libraries.

## 11.3 Human-to-product semantic adjacency contract

Human imagery is allowed to lead emotionally, but product meaning must remain recoverable without interpretation.

For each human-led block, implementation MUST answer all three questions:

1. **Who/what context is being shown?** — creator, reviewer, professional, operator, etc. without implying unsupported identity facts.
2. **What SmartAIHub job/capability is adjacent?** — Film, Research, Build, Create, Task Control, Mini App, etc.
3. **What proof/output is visible or one direct action away?** — artifact, product UI, task state, episode, report, app, or CTA into the relevant surface.

A large human image above the fold MUST NOT become the only dominant meaning of the first viewport. On supported desktop and mobile compositions, the first viewport MUST still communicate at least one concrete SmartAIHub capability or product artifact.

Photo-only editorial interstitials MAY exist, but they MUST NOT carry primary capability claims or substitute for product proof.

## 11.4 Public-human taxonomy: editorial person vs Film character vs real user

The public site MUST distinguish these classes internally and editorially:

```text
SYNTHETIC_EDITORIAL_PERSON   generated person used only as supporting editorial imagery
FILM_CHARACTER              fictional/synthetic character shown as part of a Film/series artifact
REAL_TEAM_MEMBER            verified SmartAIHub team member
REAL_CUSTOMER_OR_CREATOR    verified external person with publication permission
LICENSED_MODEL              licensed human imagery/model with approved usage rights
```

Rules:
- CMS/source metadata MUST preserve the class;
- a `FILM_CHARACTER` MUST NOT be captioned/designed as if they are a SmartAIHub customer or employee;
- a `SYNTHETIC_EDITORIAL_PERSON` MUST NOT appear inside testimonial/case-study chrome;
- real-user/team/customer treatment MUST use documented permission/relationship data;
- disclosure SHOULD occur at the project/demo context when generated Film characters or synthetic editorial people could otherwise be reasonably mistaken for documentary/customer evidence.

---

# 12. AI Film / Vertical Series Landing Page

Create a dedicated public destination.

Suggested route:

```text
/film
```

or canonical product route approved by existing routing conventions.

The page MUST include:

1. Hero with actual 9:16 film output
2. End-to-end workflow
3. Character consistency
4. Story / episode management
5. Storyboard / shot planning
6. Image and video generation
7. Voice / dubbing
8. Music / SFX
9. Timeline / editing
10. Captions
11. Vertical-series production
12. Export/output
13. Relevant supported providers/models, only if actually integrated
14. CTA into Film Studio

Do not market model availability that is not currently production-enabled.

---


## 12.1 Public route and migration inventory

Before coding begins, implementation MUST produce a machine-readable inventory of current public URLs containing at minimum:

```text
url
route_owner
http_status
indexable
canonical
locale
page_type
current_title
current_description
replacement_url_if_any
redirect_required
```

The team MUST capture:
- current sitemap(s);
- current indexed/important landing pages;
- top organic landing URLs where analytics are available;
- backlinks/high-value externally referenced URLs where available;
- public routes used by ads/social/docs;
- existing auth entry links.

No route may be deleted solely because it is absent from the new navigation.

Public route inventory SHOULD explicitly cover utility/error surfaces:
- 404;
- 500/error fallback;
- maintenance/degraded-service state where applicable;
- legal/privacy/terms;
- security/trust;
- pricing;
- contact/support entry.

Pricing/credit information shown publicly MUST come from an approved source of truth or clearly state when pricing is illustrative/subject to change. Stale hardcoded pricing is a release defect.

## 12.2 Pricing and trust route contract

The supporting public architecture MUST include or intentionally map the following canonical destinations when applicable:

```text
/pricing
/privacy
/terms
/security or /trust
/status (or approved external status destination)
/contact or /support
```

Requirements:
- Privacy and Terms MUST be reachable from the global footer on all public routes;
- Security/Trust information MUST describe only controls that are actually implemented;
- Status MUST not claim operational health from static content; use the approved status source or clearly link externally;
- contact/support paths MUST identify expected channel/purpose and avoid collecting unnecessary sensitive data;
- customer logos/testimonials require documented authorization and a revocation/update path;
- pricing and legal/trust pages MUST be included in route inventory, localization/indexing policy, monitoring, and release QA.

---

# 13. Navigation

Recommended top-level navigation:

```text
Product
Create
Film
Build
Marketplace
Pricing
Resources
```

Account controls:
- Sign in
- Start

Navigation MUST remain simple on mobile.

Mega menus MAY be used only if discovery genuinely improves.

Avoid exposing internal architecture terminology in the primary nav.

---

# 14. Responsive Design

Required validation widths:

```text
390px
430px
768px
1024px
1280px
1440px
1920px
```

Mobile MUST NOT be a collapsed desktop afterthought.

Film showcase must adapt naturally:
- 9:16 content should become an advantage on phones.
- Horizontal storyboard/timeline should have intentional mobile behavior.
- Heavy compositing effects should degrade safely.

Human editorial imagery MUST also define responsive crop/focal-point behavior:
- store or derive a focal point / safe crop region for important human assets;
- preserve face/gesture context without hiding CTA/product proof;
- mobile MAY replace or remove a large portrait when it harms information priority;
- do not rely on face-position assumptions that break across locale or copy length.


Mobile acceptance MUST include:
- portrait and landscape behavior where relevant;
- browser chrome/safe-area handling;
- 200% zoom and text reflow checks;
- touch keyboard opening on intent/form fields;
- no critical control hidden behind sticky navigation, consent UI, or bottom bars;
- primary touch controls SHOULD generally target approximately 44–48 CSS px even though WCAG 2.2 AA minimum target-size rules can be satisfied at smaller dimensions under defined conditions.

## 14.1 Progressive enhancement and browser-support policy

The public site MUST define and version a browser-support matrix before release. It SHOULD cover current supported releases of Chromium, Safari/WebKit, and Firefox plus the supported mobile browsers represented in production analytics.

Core public experience principles:
- primary positioning copy, critical navigation, trust/legal links, pricing explanation, and basic CTA destinations SHOULD remain understandable when non-critical client JavaScript fails;
- SSR/static HTML MUST not render an empty shell for critical public routes;
- feature detection is preferred over brittle user-agent branching;
- use of new browser APIs requires a fallback, progressive enhancement, or documented support decision;
- unsupported browsers SHOULD receive a usable degraded experience or clear upgrade guidance rather than a blank/crashed page;
- client hydration errors MUST NOT remove server-rendered critical content;
- optional animation, carousels, interactive demos, and live previews MUST be enhancements rather than prerequisites for understanding the product.

The test matrix MUST identify the minimum supported browser versions or an explicit rolling support policy.

---

# 15. Motion

Motion should explain state or create narrative.

Allowed:
- scroll-linked storytelling where performant;
- artifact transitions;
- task-state changes;
- storyboard progression;
- lightweight parallax;
- preview playback;
- hover/focus feedback.

Avoid:
- permanent floating;
- excessive motion;
- decorative animation unrelated to product behavior.

Respect:

```css
prefers-reduced-motion
```

---

# 16. Performance and media delivery

Public website performance is a release gate.

Core Web Vitals targets at the 75th percentile, evaluated separately for mobile and desktop:
- LCP: <= 2.5s
- CLS: <= 0.1
- INP: <= 200ms

The implementation MUST collect real-user measurements after rollout; lab-only Lighthouse scores are insufficient for final production validation.

## 16.1 Default route budgets

Unless a measured exception is approved:
- initial route JavaScript SHOULD remain <= 200 KiB compressed;
- initial CSS SHOULD remain <= 70 KiB compressed;
- only fonts needed above the fold should be preloaded;
- hero poster/LCP imagery SHOULD be responsive and aggressively compressed;
- no full hero video payload may be required before meaningful content becomes usable;
- third-party scripts MUST be inventoried and budgeted.

Budgets are guardrails, not excuses to degrade accessibility or product fidelity. A documented exception MUST include measured impact.

## 16.2 Film/video delivery

Film/video media MUST NOT destroy mobile performance.

Required behavior:
- poster first;
- explicit `width`/`height` or aspect ratio to prevent CLS;
- below-fold video lazy initialization;
- no autoplay with sound;
- autoplay, if used, MUST be muted, non-essential, and respect reduced-motion/data-saving policy where detectable;
- use adaptive/streaming delivery where justified by clip length and infrastructure;
- encode modern formats with compatible fallback as supported by the chosen delivery stack;
- do not preload large video files by default;
- pause or suspend offscreen media where practical.

## 16.3 Rendering and caching

- Critical public copy MUST be available to crawlers without relying on fragile client-only rendering.
- Prefer static/SSR/edge-rendered public content where appropriate.
- Apply cache headers intentionally by asset/content class.
- Hashed immutable assets SHOULD use long-lived cache policy.
- Editorial content MUST support controlled invalidation/purge after publish.
- Asset delivery SHOULD use the approved CDN/R2/media path and avoid origin hotspots.

## 16.4 Performance observability

Capture at least:
- LCP/INP/CLS;
- TTFB/FCP as diagnostic signals;
- JS error rate;
- media load/playback failure;
- route transition latency where applicable.

Performance telemetry MUST include release/version context without collecting sensitive user content.

## 16.5 Low-bandwidth, font, and third-party budget

The public site MUST remain understandable on constrained mobile networks and mid/low-tier phones.

Required practices:
- test at least one throttled mobile profile and one CPU-constrained profile in pre-release QA;
- honor `Save-Data` or equivalent browser signals where available by avoiding non-essential autoplay/high-bitrate media;
- use responsive image `srcset`/`sizes` and modern formats with supported fallbacks;
- prefer adaptive bitrate delivery for longer Film previews when infrastructure supports it;
- subset/self-host fonts where licensing permits, define safe system fallbacks, and use a font-display strategy that avoids invisible text;
- preload only proven critical assets; do not cargo-cult `preload`, `preconnect`, or speculative prefetching;
- third-party scripts require an owner, purpose, consent classification, performance budget, and removal plan;
- marketing tags MUST NOT block first render or primary CTA interaction.

Third-party additions that materially regress Core Web Vitals require an explicit performance exception and product owner approval.

## 16.6 Media capacity, cost, and abuse guardrails

The Film flagship is media-heavy; delivery MUST therefore be operated as a bounded production service rather than an unlimited decorative download path.

Required controls:
- monitor bytes delivered, cache-hit behavior, media error rate, and high-volume asset/request anomalies;
- use CDN/cache/origin protection appropriate to the selected R2/media architecture;
- avoid automatically downloading complete high-bitrate Film assets when a poster or short preview is sufficient;
- generate intentional responsive preview variants instead of using the master/export asset as a homepage preview;
- support a reversible `poster-only` or reduced-media mode for traffic spikes, provider/CDN incidents, or cost anomalies;
- define anti-hotlink/bot/rate controls where public asset abuse creates material infrastructure or moderation risk, without blocking legitimate indexing/accessibility;
- do not place private/original production assets at guessable public URLs when only a derivative preview is intended for publication;
- establish a media traffic/cost alert owner and threshold before full rollout.

A Film showcase that is visually impressive but can generate uncontrolled bandwidth, transformation, or provider cost is not production-ready.

## 16.7 Human-image delivery and responsive art direction

Human imagery MUST follow the same performance discipline as other flagship media.

Required:
- declare intrinsic dimensions/aspect ratio to prevent CLS;
- generate responsive derivatives and use `srcset`/`sizes` or framework-equivalent responsive-image behavior;
- prefer efficient modern formats such as AVIF/WebP where supported with appropriate fallback;
- define focal-point/crop metadata for approved desktop/tablet/mobile compositions instead of relying on arbitrary `object-position`;
- below-fold human imagery SHOULD lazy-load;
- only the actual LCP image MAY receive eager/high-priority treatment where justified;
- mobile MAY remove/de-emphasize a supporting human layer when it improves clarity, bandwidth, or product prominence;
- image-transformation/CDN policy MUST cap unbounded derivative generation;
- withdrawal/purge procedures MUST invalidate CDN and social/OG derivatives, not merely remove the CMS reference.

---

## 16.8 Cache/CDN invalidation and freshness contract

The public site uses multiple cacheable layers; publish/rollback correctness MUST therefore include cache behavior, not only application code.

Define cache classes and invalidation behavior for at least:
- immutable hashed frontend assets;
- HTML/SSR/edge page responses;
- CMS/editorial API responses;
- image/video derivatives;
- locale variants;
- pricing/availability/claim data that can become stale;
- OG/social-preview assets and metadata.

Required controls:
- mutable content MUST have an explicit freshness policy (`max-age`, `s-maxage`, revalidation, or approved equivalent);
- publish, withdrawal, incident correction, and rollback procedures MUST identify which cache layers require purge/revalidation;
- purge/invalidation operations MUST be verifiable using a post-action fetch/check rather than assumed successful;
- cache keys MUST include locale/auth/public-state dimensions where omission could produce cross-user or cross-locale leakage;
- stale-while-revalidate MAY be used only where stale content is safe for the relevant claim/pricing/status class;
- revoked rights assets, incorrect pricing, unsafe Marketplace content, and material incident messages MUST NOT depend on long TTL expiry as the primary withdrawal mechanism;
- cache invalidation failure must have an escalation/alternate mitigation path.

# 17. Accessibility

Target: **WCAG 2.2 Level AA** for public pages and public interactive components.

Required:
- semantic document landmarks and heading hierarchy;
- visible keyboard focus;
- focused elements are not obscured by sticky headers, consent bars, drawers, or overlays;
- keyboard-operable navigation and menus;
- pointer target size/spacing compliant with WCAG 2.2 2.5.8;
- dragging interactions have a non-drag alternative when applicable;
- appropriate text and non-text contrast;
- color is not the only status indicator;
- reduced motion support;
- usable zoom/reflow;
- meaningful alt text;
- editorial human imagery alt text that describes relevant scene/context without guessing identity or sensitive attributes;
- decorative human imagery uses empty alt text when it adds no semantic information;
- accessible dialogs, menus, carousels, accordions, tabs, and media controls;
- error identification and programmatic form labels;
- status/progress changes announced appropriately when interactive demos expose them;
- touch targets appropriate for mobile use.

## 17.1 Media accessibility

For meaningful public film/video content:
- provide captions for spoken dialogue where practical/required;
- transcript SHOULD be available for important marketing/explainer video;
- avoid essential information that exists only in motion/audio;
- autoplaying animation/video must be pausable or non-essential according to applicable WCAG requirements;
- no autoplay audio.

## 17.2 Auth-transition accessibility

If the public migration touches sign-in/signup entry surfaces, those surfaces MUST preserve accessible authentication and error-recovery behavior; marketing redesign MUST NOT regress the existing auth flow.

## 17.3 Public-page accessibility details

Additionally:
- each page MUST expose the correct document language and mark language changes where needed;
- provide a skip-to-main-content mechanism for keyboard users;
- navigation landmarks/labels must remain distinguishable when multiple navigation regions exist;
- intent composer validation and async status MUST be programmatically announced without stealing focus;
- links/buttons MUST use correct semantics rather than clickable generic elements;
- content MUST remain usable at 400% browser zoom/reflow where WCAG requires it;
- no animation or Film preview may contain unsafe flashing;
- cookie/consent controls must be keyboard/screen-reader usable and must not trap focus incorrectly.

## 17.4 Human + product composition accessibility

When human imagery and product UI are visually composited:
- DOM reading order MUST remain logical without relying on the visual overlay position;
- meaningful product copy MUST remain actual text rather than being baked into imagery;
- text overlays require stable contrast across responsive crops and image variants;
- decorative human imagery MUST not create duplicate/noisy screen-reader content;
- informative human imagery alt text should describe the relevant action/context (for example, “creator reviewing a storyboard beside a vertical episode preview”) rather than appearance details that are irrelevant to the task;
- focus indicators and interactive controls MUST remain visible when positioned over imagery/video;
- disabling images, loading a fallback, or using high-contrast/forced-colors modes MUST leave the core product proposition understandable.

---

# 18. SEO, crawlability, and machine discovery

Public pages MUST include as applicable:
- unique title;
- meta description;
- self-referencing canonical;
- OpenGraph/social preview;
- meaningful heading hierarchy;
- crawlable explanatory copy;
- sitemap inclusion policy;
- robots/index policy;
- locale alternates / `hreflang` where separate localized URLs exist.

Critical positioning and CTA copy MUST NOT exist only inside canvas/video/client-rendered visuals.

## 18.1 Structured data

Use only schema types that truthfully match visible page content.

Expected candidates:
- `Organization` on the appropriate organization/home surface;
- `SoftwareApplication` where SmartAIHub application information meets requirements;
- `VideoObject` on public pages where the marked-up video can actually be watched and required fields are available;
- `BreadcrumbList` on hierarchical detail pages where breadcrumbs are visible/appropriate.

Structured data MUST be validated before release. Do not add markup only to chase rich-result eligibility.

## 18.2 Film/video discovery

For indexable public film demos:
- unique watch/detail URL SHOULD exist for important showcase videos where appropriate;
- stable thumbnail/poster URL;
- title, description, duration and upload/publication metadata where known;
- `VideoObject` only when requirements are met;
- ensure the video/thumbnail is crawlable when intended for search discovery.

## 18.3 Migration SEO rules

If URLs change:
- create explicit old→new mapping;
- use server-side permanent 301/308 redirects where appropriate;
- redirect directly to the final destination and avoid chains;
- update internal links, canonical tags, sitemap entries and `hreflang` references;
- preserve valuable old URLs when no equivalent new destination exists rather than blanket-redirecting everything to the homepage;
- monitor 404s, index coverage and canonical selection after rollout.

## 18.4 Current-site crawlability regression gate

Because existing public SmartAIHub content is already indexed, the redesign MUST prove that:
- homepage returns usable HTML/content to crawlers;
- no production “unexpected error”/hydration failure hides the homepage;
- `/marketplace`, `/blog`, and other retained routes remain crawlable;
- public route metadata reflects the new positioning instead of stale site-wide generic titles.

## 18.5 Discovery themes

Important discovery themes include, where supported by real page content:

```text
AI film creation
AI short film
AI vertical series
AI video production workflow
AI creative studio
AI work platform
AI agents
AI skills
AI mini apps
AI research
AI app builder
```

Do not keyword-stuff. “AI discovery” is not permission to create thin machine-targeted pages.

## 18.6 Crawl-control and status-code contract

Implementation MUST explicitly manage:
- `robots.txt` and its sitemap references;
- XML sitemap(s) segmented by content type/locale when useful;
- video sitemap entries for important Film demos when supported and worthwhile;
- intentional `index`/`noindex` behavior for preview, experiment, search/filter, and duplicate routes;
- HTTP 404 for missing resources, 410 where content is intentionally permanently removed and no replacement exists, and 5xx for true server failures rather than soft-404 marketing pages;
- canonical URLs in the initial server-rendered HTML where feasible and no contradictory client-side canonical mutation;
- preview/staging environments protected from accidental indexing.

The blog/resources system SHOULD expose a standards-based feed (RSS/Atom) if publishing remains an active acquisition channel.

## 18.7 Search/discovery operations

Post-launch operations SHOULD include:
- verified search-engine webmaster properties for the production domain;
- sitemap submission/monitoring;
- crawl/indexing and rich-result issue review;
- top landing-page query/click monitoring;
- video discovery monitoring for Film pages;
- alert/triage workflow for sudden indexed-page loss, widespread soft 404s, canonical drift, or metadata regression.

As of the 2026-09 Google Search documentation update, `VideoObject` guidance includes newer supported properties such as `creator`/`author` and clarified `interactionStatistic`; implementation MUST validate against current documentation rather than freezing this spec’s schema vocabulary.

## 18.8 Marketplace, search, filter, and large-scale indexation policy

Public Marketplace/Mini App discovery can create a very large URL surface. The implementation MUST define which combinations are intended search landing pages rather than allowing every search/filter state to become indexable.

Requirements:
- internal search-result URLs SHOULD normally be non-indexable unless intentionally promoted as stable curated landing pages;
- faceted/filter/sort/query parameters MUST have explicit canonical/index rules;
- low-value duplicate parameter combinations MUST NOT create an unbounded crawl space;
- infinite-scroll discovery MUST expose accessible navigation/pagination or stable linked URLs when crawlable item discovery depends on it;
- removed, unpublished, suspended, or abusive Marketplace entries MUST update indexability/status behavior consistently with the content lifecycle;
- indexable creator/listing pages require sufficient unique, truthful content and MUST not be produced solely for keyword coverage;
- monitor index growth, duplicate titles/descriptions, soft-404 behavior, spam pages, and anomalous parameter crawling after rollout.

---

# 19. Localization

Minimum design architecture:
- Thai
- English

Requirements:
- no text baked into images where avoidable;
- locale-aware content blocks;
- typography verified for both scripts;
- CTA copy managed through localization system;
- metadata localized.

- localized canonical/hreflang relationships validated where locale URLs differ;
- language switch retains the closest equivalent page instead of always returning to home;
- fallback language behavior defined;
- dates, numbers and currencies formatted by locale when shown;
- content expansion is tested so translated UI does not truncate.
- automatic locale detection MAY suggest a language but SHOULD NOT trap users in redirects that prevent manual language choice or correct indexing.

## 19.1 Locale URL and editorial parity contract

Before launch, choose and document one canonical locale URL strategy (for example `/th/...` and `/en/...`, or an approved equivalent). The implementation MUST NOT mix incompatible strategies across page types.

Requirements:
- define default locale and `x-default`/fallback behavior where appropriate;
- each indexable localized page must reference real equivalent alternates only;
- do not emit `hreflang` to untranslated placeholders;
- language switch preserves route/query state only when safe and meaningful;
- localized slugs, if used, require stable redirect handling when copy changes;
- critical product claims and legal/pricing text require human editorial review in each supported language;
- locale-specific OG/social metadata must not accidentally mix Thai and English creative/copy;
- a content-release process MUST define whether one locale may publish ahead of another and how missing translations are represented.

---

# 20. Analytics, privacy, and experimentation telemetry

Track meaningful product-interest events.

Required event families:

```text
public.hero.cta
public.intent.start
public.intent.continue
public.film.view
public.film.play
public.film.cta
public.capability.open
public.marketplace.open
public.miniapp.open
public.signup.start
public.signup.complete
public.pricing.open
public.locale.change
```

Event payloads MAY include controlled dimensions such as:
- locale;
- page type;
- capability key;
- entry point;
- campaign attribution;
- experiment assignment;
- anonymous first-party session identifier where allowed.

Event payloads MUST NOT include:
- raw prompts;
- message bodies;
- uploaded file contents;
- secrets/tokens;
- unnecessary personal data.

## 20.1 Privacy/consent

Before launch:
- inventory cookies, local storage, pixels, analytics and third-party scripts;
- classify essential vs non-essential processing;
- gate non-essential tracking when consent is legally/organizationally required;
- provide clear privacy controls and notices;
- define retention for public analytics identifiers;
- honor applicable privacy preference signals/policies such as Global Privacy Control where required by policy/jurisdiction;
- do not load unnecessary advertising/analytics SDKs before consent.

## 20.2 Experiment telemetry

Experiments MUST use stable assignment per visitor/session as appropriate and MUST NOT introduce visible flicker or CLS.

Every experiment requires:
- hypothesis;
- primary metric;
- guardrail metrics;
- eligibility/audience;
- start/end or decision rule;
- rollback/stop condition;
- variant identifier in analytics.

## 20.3 Experiment validity and governance

Experiments that influence product or marketing decisions SHOULD additionally maintain:
- an experiment registry with owner and status;
- an explicit exposure event so analysis distinguishes assignment from actual view;
- sample-ratio-mismatch and instrumentation checks;
- pre-declared minimum runtime/sample rule or another documented decision method;
- protection against overlapping experiments that confound the same primary surface/metric unless intentionally designed;
- segmentation review for mobile/desktop and Thai/English when material;
- archived results and decision notes so failed variants are not unknowingly repeated.

Do not optimize a vanity metric at the expense of signup completion, accessibility, trust, or downstream product activation.

## 20.4 Campaign attribution and landing-page governance

Marketing attribution MUST be useful without becoming a privacy, redirect, or SEO escape hatch.

Required rules:
- define an allowlisted campaign-attribution schema (`utm_*` or approved equivalent) with maximum lengths and accepted character/value rules;
- never place prompts, email addresses, names, uploaded-content identifiers, secrets, or other unnecessary personal data in campaign parameters;
- attribution propagated through authentication MUST use approved first-party state and MUST NOT weaken the `returnTo`/open-redirect controls;
- storage duration and consent classification for attribution identifiers MUST be documented;
- campaign-specific landing pages require owner, lifecycle/expiry, canonical/indexation decision, and content-truthfulness review;
- campaign variants MUST NOT silently become permanent duplicate SEO pages;
- attribution failure MUST NOT block the visitor from starting or signing up.

---

## 20.5 Analytics data-quality and decision-integrity contract

Instrumentation is useful only when event data is trustworthy enough for product decisions.

For release-critical funnel and experiment events, define:
- schema version;
- event owner;
- expected trigger semantics;
- required/optional fields;
- deduplication/idempotency behavior where applicable;
- bot/internal/test-traffic treatment;
- retention/classification;
- downstream validation owner.

Required quality checks:
- detect material event-volume drops/spikes after deploy;
- distinguish page view/assignment/exposure/action semantics;
- avoid double firing caused by hydration, route transitions, retries, or consent-state changes;
- verify signup/auth completion events against an authoritative product-side count where possible;
- experiment analysis MUST fail closed or be qualified when exposure, SRM, or primary-event quality is materially broken;
- release dashboards MUST include release/build identifiers so instrumentation regressions can be correlated;
- product decisions MUST NOT treat known-corrupt telemetry as ground truth merely because dashboards render successfully.

A short analytics validation report SHOULD be part of the 24h/72h post-launch review.

# 21. Public Content Truthfulness

Every public claim must map to one of:

```text
AVAILABLE
BETA
PREVIEW
COMING_SOON
WAITLIST
```

No capability may be visually presented as operational if it is not operational.

Human imagery follows the same truthfulness standard:
- synthetic people are editorial representations unless explicitly tied to a real, permissioned person;
- generated portraits MUST NOT imply a real testimonial, employee, partner, customer, creator, or case study;
- captions/copy around human imagery MUST not invent names, occupations, usage history, or endorsements.

For demo artifacts, indicate when they are:
- real customer/public work;
- official SmartAIHub demo;
- conceptual mockup.


Capability labels MUST be sourced from an approved product/capability registry or equivalent source of truth rather than manually diverging across pages.

Each public claim SHOULD have:
- owner;
- evidence/source;
- lifecycle state;
- last-reviewed date for claims that can become stale.

Provider/model names MUST NOT be displayed merely because an adapter exists in source code; public availability must reflect actual user-accessible production state.

## 21.1 Claim, testimonial, logo, and benchmark lifecycle

Public evidence MUST remain auditable after launch.

For measurable claims/testimonials/customer logos, record as applicable:
- source/evidence URL or internal evidence reference;
- permission/consent owner;
- approved wording and locale;
- date measured/quoted;
- comparison population/method for benchmarks;
- expiry/review date;
- withdrawal/contact path.

A scheduled content-integrity check SHOULD flag expired, unsupported, or ownerless claims. Expired evidence MUST be removed, refreshed, or visibly qualified; it must not remain indefinitely because it was once true.

## 21.2 Marketplace / public UGC trust, moderation, and takedown

Where public Marketplace, creator, Mini App, Skill, template, review, or other user/partner-authored content is shown, the public site MUST treat it as untrusted content.

Requirements:
- only content in an approved public lifecycle state may appear as a normal public listing;
- all user-authored text/markup/URLs must pass the approved sanitization and URL policy;
- public listing content MUST NOT execute arbitrary HTML, JavaScript, embedded scripts, or unsafe iframe content in the marketing origin;
- external links require an explicit safe-link policy and must not inherit trusted SmartAIHub appearance in a misleading way;
- users must have a discoverable report/abuse path where Marketplace/UGC is public;
- operators need a takedown/suspend/unpublish mechanism that removes discovery without requiring a full website redeploy;
- moderation/takedown state must propagate to search indexation, caches, social previews, and public APIs within the defined operational window;
- badges such as “verified”, “official”, “featured”, ratings, usage counts, or revenue/success claims require defined source semantics;
- installing/running a third-party Skill/Mini App MUST not be visually confused with first-party endorsement.

## 21.3 Demo artifact provenance across capability types

The Film manifest is necessary but not sufficient. Public proof shown for Research, Build, Image, Audio, Agents, Mini Apps, Skills, and other capabilities also requires a provenance record.

Each flagship/featured demo SHOULD have a stable internal demo ID and record at least:
- owner;
- artifact type/capability;
- publication status;
- creation or last verification date;
- source/product version or capability state where material;
- factual-data source/freshness information for research/benchmark examples;
- disclosure/rights information where generated media or third-party assets are used;
- the public routes/components where the demo appears;
- withdrawal/replacement path.

Screenshots and demonstrations MUST be refreshed or qualified when the represented product behavior is no longer available or materially changed. Public proof MUST not become a museum of features that no longer exist.

---

## 21.4 High-risk commercial, security, availability, and comparative claims

Some public statements carry materially higher trust/legal risk than ordinary feature copy. These claims require explicit source-of-truth and approval treatment.

High-risk classes include statements about:
- price, discount, free usage, credits, refunds, or savings;
- uptime, SLA, availability, speed, accuracy, success rate, or performance;
- privacy, security, encryption, compliance, certification, or data residency;
- “enterprise”, “production-ready”, “unlimited”, “real-time”, “best”, “leading”, or comparative superiority when those words imply measurable capability;
- model/provider availability;
- customer counts, usage counts, revenue, rankings, ratings, or benchmark outcomes.

Requirements:
- every high-risk claim MUST identify an owner and evidence/source-of-truth reference;
- claims that can change operationally MUST have freshness/expiry or live-source behavior;
- localization MUST preserve the approved meaning rather than strengthen the claim in translation;
- CMS publication of high-risk claims requires an approval class appropriate to the risk;
- comparative/benchmark claims MUST identify methodology/population/time period where necessary to avoid misleading interpretation;
- expired or unverifiable claims MUST be removed, downgraded, or qualified before publication continues.

# 22. Component Families

Public UI should define reusable component families such as:

```text
PublicHero
IntentComposer
ProductArtifactFrame
VerticalEpisodePreview
FilmWorkflowNarrative
StoryboardStrip
TaskProgressPreview
CapabilityShowcase
ResearchArtifactPreview
MiniAppPreview
AgentIdentityPreview
MarketplacePreview
EditorialSection
PublicCTA
PublicFooter
```

These must use shared tokens and accessibility primitives.

Component governance MUST track at least:
- maturity state (`experimental`, `beta`, `stable`, `deprecated`);
- accessibility status;
- public pages consuming the component where discoverable;
- replacement path for deprecated components.

Stable shared public components SHOULD have isolated examples/tests (Storybook or an equivalent component harness is acceptable) and automated visual-regression coverage for high-risk variants.

---

# 23. Product Identity Objects

People, Assistants, Agents, Projects, Films, Mini Apps, and Artifacts SHOULD have recognizable identity.

Example Agent identity:

```text
Research Assistant

Capabilities
• Web Research
• Deep Research
• PDF Analysis

Last run
3 min ago

Artifacts
38
```

Avoid reducing important entities to generic icon cards.

---

# 24. Public Film Demo Data Contract

Film showcase data should be renderable from structured data, not hardcoded markup.

Example conceptual shape:

```ts
type PublicFilmShowcase = {
  title: string;
  format: "short-film" | "vertical-series";
  aspectRatio: "9:16" | "16:9" | "1:1";
  posterUrl: string;
  previewUrl?: string;
  episode?: {
    number: number;
    durationSeconds: number;
    status: "ready" | "generating" | "draft";
  };
  characters: CharacterPreview[];
  storyboard: StoryboardFrame[];
  productionStages: ProductionStage[];
  badges: string[];
};
```

This enables future CMS/content-driven rotation.

---

# 25. Content Management

Important homepage showcases SHOULD NOT require a code deployment for every editorial change.

Human editorial assets managed through the CMS MUST preserve the source/provenance metadata defined in §5.7. CMS editors MUST NOT be able to strip required rights/synthetic-status metadata when changing crops, captions, locales, or placements.

Support content-driven configuration for:
- hero copy variants;
- flagship project;
- artifact examples;
- featured Skills;
- featured Mini Apps;
- film showcase;
- announcements.

The content system must remain safe and versioned.


Required editorial workflow:

```text
Draft
→ Preview
→ Review/Approve
→ Publish
→ Observe
→ Roll back if required
```

CMS/content inputs MUST be sanitized and rendered through approved components. Editorial authors MUST NOT be able to inject arbitrary executable script into public pages.

Keep a last-known-good published version for critical homepage/Film content so a CMS outage does not blank the public site.

## 25.1 Editorial schema, freshness, preview, and rollback

Each critical content entry SHOULD include:
- stable content ID;
- content type/schema version;
- locale;
- owner;
- lifecycle status;
- created/updated/published timestamps;
- review/expiry date when applicable;
- linked capability/claim IDs;
- linked asset-rights manifest IDs where media is used.

Required editorial controls:
- preview exact responsive/public composition before publish;
- preview environments or preview URLs MUST be access-controlled/noindexed when necessary;
- support scheduled publish/unpublish when editorial operations need it;
- version history and one-action rollback to a previously approved revision;
- localized entries must expose missing/stale translation state;
- emergency kill switch for a revoked film/customer/rights asset without waiting for a full application deploy.

For human assets, emergency withdrawal MUST also:
- resolve all placement references from the human asset registry;
- replace/remove live page crops;
- purge or invalidate CDN/image-transformation derivatives where supported;
- replace/remove OG/social-preview derivatives under SmartAIHub control;
- prevent the withdrawn source from being accidentally reselected by CMS/agent generation;
- record the withdrawal reason/status and replacement asset if one is approved.

Content schema migrations MUST preserve older published content or provide an explicit migration/fallback path.

---

## 25.2 Editorial approval, audit trail, and separation-of-duties contract

CMS convenience MUST NOT eliminate accountability for high-impact public changes.

Content classes SHOULD be risk-tiered, for example:

```text
LOW     typo/cosmetic copy with no claim change
MEDIUM  homepage narrative, campaign content, featured demos
HIGH    pricing, legal/privacy, security, availability, customer proof, rights-sensitive media
```

Required controls:
- every published revision records author/editor, approver where required, timestamp, and change/revision identifier;
- HIGH-risk content MUST require explicit second-person/four-eyes approval unless an emergency procedure with retrospective review is invoked;
- a publisher MUST be able to preview the exact locale/device-representative output and material metadata before release;
- emergency publication privileges must be restricted and auditable;
- approval evidence MUST survive CMS rollback/version changes;
- automated/agent-authored content MUST identify that an agent produced the draft and MUST still pass the human/role approval required by its risk tier;
- scheduled publication MUST not bypass expired approval, revoked rights, or stale claim checks.

# 26. Experimentation

The redesign MAY support controlled experiments for:
- hero wording;
- CTA;
- film positioning;
- section order;
- signup entry point.

Experiments MUST NOT:
- change factual capability claims;
- degrade accessibility;
- create misleading scarcity;
- use dark patterns.


Experiments SHOULD not alter multiple primary variables simultaneously unless explicitly designed as multivariate tests. Search-engine crawlable content MUST remain coherent; do not serve deceptive crawler-only variants.

## 26.1 Human-imagery experimentation guardrails

A/B testing human imagery MUST NOT optimize for click-through rate alone.

Required guardrails:
- the same factual product proposition/proof MUST remain available across variants unless product positioning itself is the declared experiment;
- synthetic-person variants MUST remain within the approved art-direction/identity-safety rules;
- teams MUST NOT intentionally sexualize, exaggerate beauty/body emphasis, fabricate authority/status, or simulate customer endorsement merely because a variant increases CTR;
- evaluate downstream quality metrics such as qualified start/signup, Film/Product exploration, bounce, complaint/trust signals, and accessibility/performance regressions;
- stop/reject a statistically favorable variant when it materially damages truthfulness, brand fit, accessibility, or the Product Evidence hierarchy;
- human-image experiment variants MUST remain traceable to asset IDs and experiment IDs.

---

# 27. Integration with Spec 270 Design Intelligence and Agent-Generated UI

All new or materially redesigned public SmartAIHub surfaces MUST use **Spec 270 R1.4** as the canonical design-intelligence path when that subsystem is enabled for the implementation environment.

Spec 240-style or other agent-generated UI MUST NOT bypass Spec 270's canonical design artifact, component-resolution, provenance, and verification controls.

## 27.1 Canonical public design pipeline

```text
Spec 263 public requirement
        ↓
PublicWebsiteDesignContext
        ↓
Spec 270 DesignBrief + DesignContextBundle
        ↓
Design complexity decision
        ├── reuse existing UI/component
        ├── SmartAIHub Native Design
        └── optional specialized provider
             ├── Google Stitch, when authorized/available
             └── future provider
        ↓
CanonicalDesignArtifact
        ↓
ComponentResolution
        ↓
SmartAIHub Public UI / Astryx mapping
        ↓
Spec 224
Plan → Implement → Test → Visual QA → Final Verify
        ↓
Production public surface
```

The public site MUST remain **Stitch-enhanced, not Stitch-dependent**.

A public-site implementation MUST be designable, buildable, deployable, maintainable, and runnable without an active Google Stitch connection or any other dedicated external design provider.

External design providers are **design-time accelerators only** and MUST NOT become production runtime dependencies.

## 27.2 `PublicWebsiteDesignContext`

Spec 263 defines the public-specific semantic context that MUST be supplied to Spec 270 through its existing `DesignContextBundle`/`DesignBrief` contracts.

Conceptual required context:

```yaml
surface_family: smartaihub_public
route: / | /film | /marketplace | /pricing | ...
experience_authority: Spec 263
canonical_design_authority: Spec 270
implementation_authority: Spec 224

positioning:
  primary: universal_ai_work_platform
  flagship: ai_film_vertical_series

visual_strategy:
  style: contemporary_product_editorial
  human_plus_product_evidence: true
  product_evidence_priority: primary
  human_imagery_role: supporting_context
  real_artifact_first: true

must_preserve:
  - film_flagship_visibility
  - universal_platform_breadth
  - public_truthfulness
  - mobile_first_behavior
  - thai_english_quality
  - accessibility
  - performance_budget

must_avoid:
  - generic_ai_orb
  - excessive_glassmorphism
  - influencer_first_composition
  - fake_dashboard_or_metric
  - feature_card_grid_as_default
  - unsupported_capability_ui
```

The implementation MAY extend this context, but MUST NOT mutate the meaning of Spec 263 requirements merely to fit a provider-generated layout.

## 27.3 Reuse before invention

Public UI component resolution MUST follow Spec 270's reuse-before-invention invariant.

For public surfaces, the practical order is:

1. existing SmartAIHub public component;
2. existing SmartAIHub product component appropriate for public reuse;
3. existing Astryx component;
4. existing SmartAIHub/Astryx pattern;
5. composition of existing components;
6. controlled extension;
7. new component only when prior options are insufficient.

A coding/design agent MUST NOT introduce a new generic button, card, navigation, modal, input, badge, layout primitive or similar component only because it is easier than discovering the existing catalog.

## 27.4 Canonicalization before implementation

Any design output from Stitch, another external design provider, a native design model, or an agent MUST be normalized into a SmartAIHub-owned `CanonicalDesignArtifact` before it becomes the accepted implementation target.

Provider-hosted screen IDs, temporary URLs, provider-specific component semantics, or opaque external state MUST NOT be treated as the production source of truth.

The canonical artifact SHOULD capture at minimum:
- route/surface identity;
- design version;
- Spec 263 requirement references;
- component intents/resolutions;
- layout and responsive intent;
- typography/token references;
- Human + Product Evidence constraints;
- Film flagship evidence requirements where relevant;
- interaction states;
- accessibility semantics;
- asset/provenance references;
- design decisions and rationale;
- provider provenance without leaking credentials/secrets.

## 27.5 Provider-neutral design behavior

When an external design provider is unavailable, over quota, unauthorized, or unsuitable for the data-egress policy, the public-site design flow MUST either:
- reuse an existing approved design/pattern;
- use the SmartAIHub native design path; or
- enter an explicit waiting state only when the user explicitly required that provider.

The system MUST NOT silently claim that Stitch or another provider was used when it was not.

Public design work containing restricted/private material MUST honor Spec 270 `LOCAL_ONLY` / `NO_EGRESS` behavior where applicable.

## 27.6 Material public-design changes and semantic diff

The following are **material public-design changes** even when the code diff appears visually small:

```text
POSITIONING_CHANGED
FILM_FLAGSHIP_PROMINENCE_CHANGED
HUMAN_PRODUCT_BALANCE_CHANGED
PRIMARY_CTA_CHANGED
PUBLIC_TO_PRODUCT_HANDOFF_CHANGED
NAVIGATION_MODEL_CHANGED
TRUST_OR_PROOF_PATTERN_CHANGED
PRICING_PRESENTATION_CHANGED
BRAND_LANGUAGE_CHANGED
MAJOR_RESPONSIVE_BEHAVIOR_CHANGED
ACCESSIBILITY_INTERACTION_CHANGED
```

For a material change, implementation MUST produce a Spec 270 semantic design diff or equivalent structured evidence that explains:
- what changed;
- why it changed;
- which Spec 263 requirements are affected;
- which approved design decision it supersedes;
- visual/regression evidence;
- required approval owner.

A coding agent MUST NOT merge a material design change merely because screenshot similarity or unit tests pass.

## 27.7 Design decision and approval freshness

Important public design decisions MUST be recorded through Spec 270 design-decision lineage or an equivalent canonical record.

At minimum, decisions affecting these areas require explicit rationale/owner evidence:
- homepage hero composition;
- Film flagship position;
- primary CTA;
- human imagery strategy;
- pricing/credit presentation;
- public trust/customer proof;
- primary navigation;
- major token/theme change.

A stale approval MUST NOT be reused after material requirement, capability, legal, brand, or data-contract changes invalidate its assumptions.

## 27.8 Separation from production runtime

Spec 270 design-provider SDKs, MCP connections, credentials and temporary provider assets MUST NOT be required in the browser or production page runtime.

The production public site SHOULD depend only on SmartAIHub-controlled source, components, tokens, assets, APIs and explicitly approved third-party runtime dependencies.

## 27.9 Required design-time flow for agents

Before generating or materially redesigning public UI, an agent MUST:

```text
Read Spec 263 public experience requirements
        ↓
Load Spec 270 design context / current DesignSystemSnapshot
        ↓
Discover existing public/product/Astryx components
        ↓
Decide reuse vs native design vs optional external exploration
        ↓
Create/update CanonicalDesignArtifact
        ↓
Resolve components
        ↓
Implement through Spec 224
        ↓
Run Spec 270 visual verification
        ↓
Run Spec 263 public-experience gates
        ↓
Accept / Repair / Escalate
```

A public UI generated without this path MAY be used as an exploratory mockup, but MUST NOT be promoted as the approved production design target.

---

# 28. Visual QA Gates

Required screenshot validation:

```text
Desktop 1440
Tablet 1024
Tablet 768
Mobile 430
Mobile 390
```

## 28.1 QA authority split

Visual/public-experience verification MUST distinguish ownership rather than duplicating one undifferentiated checklist.

**Spec 270 visual/design authority verifies:**
- layout/component fidelity to the canonical design artifact;
- design-system/component-resolution correctness;
- responsive/state/theme consistency;
- visual regression and semantic design diff evidence;
- design provenance and approved design-decision lineage.

**Spec 263 public-experience authority verifies:**
- positioning and message hierarchy;
- Film flagship prominence;
- Human + Product Evidence balance;
- public truthfulness and proof quality;
- conversion/CTA hierarchy;
- public accessibility/performance/SEO/privacy/security requirements;
- public brand perception and anti-AI-slop compliance.

**Spec 224 verifies:** implementation correctness, tests, evidence freshness, release gates and final verify.

A pass from one authority MUST NOT be interpreted as an automatic pass from the others.

Minimum review dimensions:

1. layout fidelity;
2. hierarchy;
3. spacing/alignment;
4. component consistency;
5. typography;
6. color/theme;
7. responsive behavior;
8. artifact integrity;
9. film/media presentation;
10. accessibility;
11. performance;
12. anti-AI-slop compliance;
13. human-imagery naturalness and artifact integrity;
14. human-image semantic fit with adjacent product/use case;
15. synthetic-person truthfulness / endorsement-risk review;
16. localization overflow/truncation;
17. reduced-motion behavior;
18. no-JavaScript/failed-JavaScript critical-content behavior where applicable;
19. crawler-visible metadata/content;
20. consent/privacy UI interaction;
21. media fallback state;
22. CTA deep-link correctness;
23. error/empty/loading states.

---

# 29. Film-Specific QA

Validate:

- 9:16 content is not awkwardly cropped;
- previews have poster fallback;
- no autoplay with sound;
- mobile playback is usable;
- timeline screenshots are legible;
- captions are supported;
- production-stage labels are accurate;
- generated sample content is clearly identified;
- character consistency claims are factual;
- provider/model claims are factual.

- public-display rights/consent are recorded;
- poster and video aspect-ratio metadata prevent layout shift;
- playback failure falls back correctly;
- captions/transcript policy is satisfied;
- no Film asset blocks page interaction while loading;
- analytics never capture film prompt/script content without explicit approved purpose.

---


# 30. Security and abuse protection

Public-site modernization MUST NOT weaken the security boundary.

Required baseline:
- HTTPS only;
- HSTS according to approved domain policy;
- Content Security Policy (CSP), preferably rolled out report-only before enforcement when introducing new public assets;
- `frame-ancestors`/equivalent anti-clickjacking policy appropriate to embedding requirements;
- `X-Content-Type-Options: nosniff`;
- intentional `Referrer-Policy`;
- intentional `Permissions-Policy`;
- no secrets/API keys embedded in public bundles except credentials explicitly designed to be public identifiers;
- third-party scripts minimized and allowlisted;
- CMS/editorial HTML sanitized.

For public forms/signup/contact/intake endpoints exposed to abuse:
- rate-limit server endpoints;
- use Cloudflare Turnstile or approved equivalent where appropriate;
- Turnstile tokens, if used, MUST be validated server-side; client-only verification is not sufficient;
- failure behavior must remain accessible.

CSP rollout MUST account for approved media, analytics, and Turnstile origins without falling back to broad unsafe wildcards.

Additional requirements:
- `returnTo`, redirect, and deep-link parameters MUST use an allowlist/validated internal destination policy to prevent open redirects;
- untrusted CMS/Markdown/user-authored text MUST be escaped/sanitized to prevent DOM/server XSS;
- avoid `unsafe-inline`/`unsafe-eval` in enforced CSP unless a documented compatibility exception exists; prefer nonces/hashes/`strict-dynamic` where the framework/integration supports it;
- state-changing public endpoints MUST apply appropriate CSRF/origin protections for their authentication model;
- preview/admin/editorial endpoints MUST not become publicly writable simply because the public site is unauthenticated;
- source maps, debug endpoints, environment payloads, and error pages MUST not expose secrets or internal infrastructure details;
- dependency/supply-chain scanning for public frontend packages remains part of the normal release process.

## 30.1 Public intent-composer execution boundary

A public intent composer MUST have an explicit execution contract. It must not accidentally become an unauthenticated privileged agent endpoint.

Rules:
- before authentication, the default behavior SHOULD be local drafting, product explanation, or another explicitly safe capability;
- pre-auth input MUST NOT trigger privileged tools, external side effects, spending, account-scoped retrieval, or access to tenant/project data;
- any server-side pre-auth AI preview requires an explicit allowlisted capability, rate/cost controls, content-safety handling, and an abuse owner;
- user input reflected into HTML/UI must be safely escaped/sanitized;
- enforce reasonable request/payload limits and graceful rejection states;
- prompt/user text MUST NOT be copied into URLs, referrers, log fields, error trackers, or third-party analytics;
- authentication/approval must occur before an intent can cross into protected execution where required by the relevant runtime policy;
- failures must not imply that work has started when no durable/product execution actually exists.

## 30.2 Public API and data-exposure boundary

The redesigned public website MUST inventory every API/data source reachable from unauthenticated public pages.

Public endpoints MUST follow least-data principles:
- expose only fields required for the public experience;
- never return tenant-private/project-private/internal operational fields merely because the client ignores them;
- use server-side authorization for mixed public/private resources;
- rate-limit enumeration-sensitive endpoints where appropriate;
- avoid sequential/guessable object exposure when an object is not intended to be public;
- treat cache keys and edge caching carefully so authenticated/private variants cannot leak into public responses;
- public search/listing APIs require pagination/limits and abuse controls;
- error responses MUST not disclose stack traces, credentials, provider secrets, internal network details, or private object existence beyond the approved disclosure model.

# 31. Reliability and graceful degradation

Critical public pages MUST remain useful when non-critical dependencies fail.

Failure matrix MUST cover at least:
- CMS unavailable;
- video/media CDN failure;
- analytics blocked;
- third-party script failure;
- auth service temporarily unavailable;
- localization content missing;
- API used for live preview unavailable.

Expected principle:

```text
Marketing content remains readable
+ navigation remains usable
+ CTA explains/retries safely
+ non-critical animation/media degrades
```

## 31.1 Error, maintenance, and offline-adjacent surfaces

The public system MUST define intentional UX for:
- 404 not found;
- 500/unexpected server error;
- planned maintenance/degraded authentication;
- temporary Film/media delivery failure;
- unsupported/outdated public deep links.

Error surfaces MUST preserve brand/navigation where safe, avoid fabricated success states, expose a retry/recovery path, and return the correct HTTP status. A 200-status “not found” page is not acceptable for indexable public routing.

## 31.2 Critical dependency and edge-state recovery contract

Maintain a public-site dependency map covering at least:
- DNS/domain routing;
- Cloudflare/edge/CDN/runtime path;
- static asset origin/R2/media delivery;
- CMS/content API;
- authentication entry points;
- pricing/availability source;
- analytics/consent;
- feature-flag/configuration service if used;
- third-party fonts/scripts/providers required by critical surfaces.

For each dependency define:
- criticality;
- timeout/retry/circuit-breaker behavior where applicable;
- fail-open vs fail-closed behavior;
- cached/last-known-good fallback if safe;
- user-visible degraded state;
- owner/runbook;
- monitoring signal.

Critical public navigation and truthful core messaging SHOULD not depend on a chain of live third-party calls when static/edge-safe fallback is possible. Feature flags/configuration used for release safety MUST themselves have a known fallback state so a flag-service failure cannot unpredictably enable risky experiences.

# 32. Observability

Production monitoring MUST include:
- 4xx/5xx rates by public route;
- JS/runtime/hydration errors;
- media failures;
- broken internal links;
- auth-handoff failure rate;
- Web Vitals RUM;
- synthetic homepage/Film/Marketplace availability checks;
- release/version markers for correlation;
- alerting thresholds owned by an operational team.

A visual redesign is not considered production-complete without post-release telemetry.

## 32.1 Public-site SLOs and alert ownership

Before production rollout, define measurable targets for at least:
- availability of homepage, `/film`, pricing, and critical auth-entry path;
- server error rate;
- auth-handoff success;
- media-preview success;
- Core Web Vitals guardrails;
- CMS publish/fetch health where runtime-dependent.

Each SLO/guardrail MUST have:
- data source;
- measurement window;
- warning/critical threshold;
- owner/on-call destination;
- response/runbook link;
- rollback/kill-switch condition where appropriate.

Use error budgets/alerting thresholds to avoid both silent breakage and noisy non-actionable alerts.

## 32.2 Public incident communication and emergency controls

The public website needs a safe operational path for outages and urgent corrections without requiring a risky full redesign deployment.

Define:
- an approved incident/degraded-service banner mechanism with restricted editorial authority;
- status-page linkage and ownership;
- kill switches for non-essential Film autoplay/live demos, experiments, problematic third-party scripts, and campaign surfaces where technically feasible;
- emergency content withdrawal for revoked claims/assets/Marketplace entries;
- message templates/principles that distinguish product outage, authentication outage, media degradation, maintenance, and external-provider degradation;
- update/clear ownership so stale incident banners cannot remain indefinitely.

Emergency messaging MUST be factual and must not claim full service health when critical entry paths are known to be unavailable. Material public incidents SHOULD result in a short operational review covering detection, user impact, mitigation, and prevention.

## 32.3 Post-launch operating cadence and content-health review

The public website is an operated product surface, not a one-time redesign deliverable.

Minimum review cadence after a major release:
- **24 hours:** availability/errors, auth handoff, analytics firing, critical media, obvious conversion anomalies;
- **72 hours:** Core Web Vitals early signal, broken links/crawl errors, consent/experiment integrity, cost anomalies;
- **7 days:** conversion funnel comparison, SEO/indexation checks, content/claim issues, user/support feedback;
- **30 days:** full performance/SEO/content/design review and decision on experiments/temporary exceptions;
- **quarterly or release-driven thereafter:** stale claims, rights/provenance expiry, dependency/design drift, route inventory, localization parity, third-party scripts, cost and SLO review.

Each review MUST produce an owner and outcome (no action / issue / rollback / improvement backlog). Critical unresolved findings must enter the normal product/incident workflow rather than remain informal notes.

# 33. Test matrix

Automated and manual coverage SHOULD include:

### Functional
- navigation;
- CTAs/deep links;
- auth handoff;
- locale switching;
- CMS content rendering;
- Film preview fallback;
- forms.

### Browser/device
- Chromium/Chrome;
- Safari/WebKit;
- Firefox;
- Edge where relevant;
- iOS Safari;
- Android Chrome.

### Quality
- component tests;
- route-level E2E tests;
- visual regression screenshots with reviewed baselines;
- design-token/component contract tests for high-impact shared primitives;
- accessibility automation plus keyboard/manual/screen-reader spot review;
- Lighthouse/lab performance budget checks plus throttled/CPU-constrained profile;
- RUM verification after deploy;
- metadata/structured-data/robots/sitemap validation;
- content-schema/claim-registry integrity tests;
- broken-link/crawl/status-code test including 404/410/5xx behavior;
- auth handoff/open-redirect security test;
- CMS sanitization/XSS regression test;
- security-header verification;
- experiment exposure/instrumentation validation when experiments are active.

---

# 34. Migration Strategy

## Phase 0 — Baseline and inventory

Before changing production UI:
- capture current route inventory;
- capture representative screenshots;
- capture analytics/conversion baseline;
- capture Core Web Vitals/performance baseline;
- export existing SEO metadata/sitemaps/redirects;
- identify externally referenced/high-value URLs;
- inventory current public assets and rights;
- identify existing auth/product entry contracts;
- inventory pricing/legal/trust/status/contact routes and owners;
- inventory third-party scripts/fonts/media vendors;
- inventory locale URL/indexing behavior and CMS content freshness.

Phase 0 artifacts are required for regression comparison.

## Phase A — Foundation
- design tokens;
- typography;
- public component boundary;
- UI constitution;
- route/SEO contract;
- analytics/privacy baseline;
- security-header/CSP plan;
- brand/art-direction contract;
- content schema/claim lifecycle contract;
- public SLO/alert plan.

## Phase B — Homepage shell
- navigation;
- hero;
- global layout;
- responsive system;
- public-to-product handoff;
- proof/trust layer.

## Phase C — Film flagship
- film narrative;
- 9:16 showcase;
- workflow section;
- Film CTA;
- media delivery/fallback;
- demo rights manifest.

## Phase D — Capability storytelling
- Research;
- Create;
- Build;
- Agents/Automation;
- Marketplace.

## Phase E — Supporting public routes
- Marketplace;
- Mini Apps;
- Pricing;
- Film landing page;
- product/capability pages;
- Trust/Security/Resources routes as required;
- Privacy/Terms/Status/Contact or approved canonical destinations;
- intentional 404/500/maintenance surfaces.

## Phase F — QA / pre-production
- accessibility;
- responsive;
- performance;
- SEO/crawlability;
- structured data;
- analytics/consent;
- security headers/forms;
- browser/device matrix;
- redirect/canonical verification.

## Phase G — Staged rollout / observation
- internal;
- preview/beta;
- percentage/canary rollout where infrastructure permits;
- full public;
- 24h/72h/7d post-launch checks;
- rollback if guardrails breach.

---

# 35. Rollout Safety

Implementation MUST:
- preserve existing authenticated routes;
- preserve existing URLs where possible;
- use redirects when canonical URLs change;
- preserve SEO equity;
- avoid breaking sign-in/signup;
- maintain rollback capability;
- support staged release.

- deploy behind reversible release controls where feasible;
- preserve a known-good public build/artifact;
- define cache-purge/invalidation procedure;
- define go/no-go owner and rollback owner;
- verify redirects and metadata before traffic migration;
- prevent experimental/CMS content from bypassing release approval.

Recommended:

```text
internal
 ↓
beta / preview
 ↓
percentage rollout
 ↓
full public
```


## 35.1 Reproducible build and frontend supply-chain release contract

Production public builds MUST be reproducible enough to identify exactly what was released and to roll back to a known-good artifact.

Required controls:
- use the repository-approved lockfile/frozen dependency workflow in CI;
- perform dependency and secret scanning according to repository policy;
- record build/release identifier, source commit, and immutable artifact identifier/hash;
- retain a dependency manifest or SBOM-equivalent output when supported by the delivery pipeline;
- deploy the tested build artifact rather than rebuilding materially different code during promotion;
- environment-specific values must come from approved configuration/secrets, not source edits in production;
- production must not accumulate untracked manual code changes outside the governed CMS/configuration surfaces;
- source-map publication/access must follow security policy;
- rollback must identify the exact known-good artifact and any cache/config steps required to restore it.

Where an upstream dependency is compromised or must be urgently disabled, the release runbook SHOULD identify how to block promotion, remove the dependency, or revert to a safe build.

## 35.2 Go / No-Go gate

Release is **NO-GO** if any of the following is true:
- primary CTA/auth handoff is broken;
- homepage or Film page has a critical JS/runtime error;
- required route redirects/canonicals are missing;
- WCAG blocker prevents primary task completion;
- Core Web Vitals lab/regression signals materially exceed agreed release budget without approved exception;
- Film media has no usable fallback;
- security headers/form protections are misconfigured in a way that blocks or weakens required security;
- analytics/consent captures prohibited prompt/personal content;
- public capability claims are materially inaccurate;
- pricing/credit presentation materially disagrees with the approved billing source of truth;
- a public Film/customer asset lacks required rights/approval or has been revoked;
- critical locale routes emit broken `hreflang`/canonical relationships or expose untranslated placeholders as equivalent pages;
- redirect/deep-link handling permits an open redirect;
- staging/preview content is unintentionally indexable;
- critical legal/privacy/terms destination is missing from the release.

---

## 35.3 Rollback rehearsal and configuration-compatibility evidence

A rollback plan is not sufficient unless the team can demonstrate that the rollback artifact remains compatible with the production configuration/content state it will encounter.

Before full rollout of a material redesign, verify or rehearse:
- restore of the previous known-good frontend artifact;
- cache purge/revalidation required for rollback;
- compatibility of previous code with current CMS schema/content;
- compatibility with current auth/deep-link contracts;
- feature-flag/config defaults after rollback;
- redirect/canonical behavior after rollback;
- media/asset references needed by the previous build;
- analytics/release marker behavior so rollback is visible operationally.

If a database/schema/content migration is not backward-compatible, the release plan MUST define forward-fix or compatibility strategy rather than falsely describing frontend artifact rollback as complete recovery.

Rollback evidence SHOULD record the tested artifact IDs, environment, date, result, owner, and any steps that remain manual.

# 36. Acceptance Criteria

Spec 263 is accepted only when:

### Positioning
- [ ] Homepage clearly explains SmartAIHub without requiring AI infrastructure knowledge.
- [ ] AI Film / Vertical Series is clearly visible as a flagship.
- [ ] SmartAIHub is not presented as only a film/video product.
- [ ] Broader Create / Research / Build / Automate capabilities remain discoverable.

### Design
- [ ] Public design foundation exists.
- [ ] Anti-AI-slop rules are documented.
- [ ] Real artifacts are used prominently.
- [ ] No major section depends on generic AI decoration.
- [ ] Human imagery follows the Human + Product Evidence hierarchy and does not replace product proof.
- [ ] Hero references include at least one validated desktop and mobile composition showing how human imagery coexists with command/Product/Film evidence.
- [ ] AI-generated human assets pass naturalness/artifact QA and provenance review before publication.
- [ ] Synthetic people cannot be interpreted as real testimonials/customers/employees/partners without truthful context and permission.
- [ ] Human assets cannot intentionally imitate identifiable real people without documented authorization and review.
- [ ] Editorial, Film-character, licensed-model, team-member and real-customer asset classes are distinguishable in metadata and presentation.
- [ ] Homepage representation/localization review confirms that imagery does not narrow the intended audience through repeated stereotypes/archetypes.
- [ ] Human-led blocks retain semantic adjacency to a capability plus visible/direct proof.
- [x] Human image responsive derivatives/crops pass bounded lab CLS, bandwidth, focal-point and mobile product-prominence checks. Production evidence is tied to deployed SHA `4b536d8afa4750e7a3fb8c90be9e7e4dd441cc63`; this does not assert field CWV/RUM or external rights approval.
- [ ] Mixed Human + Product compositions pass reading-order, alt-text, contrast and image-disabled fallback checks.
- [ ] Human asset withdrawal test proves page/CDN/OG derivative removal or replacement where applicable.
- [ ] Human-image experiments include trust/quality guardrails and do not select variants on CTR alone.

### Film
- [ ] Real or verified official film demo is visible.
- [ ] 9:16 presentation works on mobile and desktop.
- [ ] Production workflow is understandable.
- [ ] Film CTA enters the correct product path.

### UX
- [ ] Navigation is simplified.
- [ ] Primary CTA is clear.
- [ ] Mobile-first behavior is verified.
- [ ] Thai and English typography work correctly.

### Technical
- [ ] Existing auth/product routes are preserved.
- [ ] Performance gates pass.
- [ ] Accessibility gate passes.
- [ ] SEO metadata is complete.
- [ ] Analytics events are validated.
- [ ] Rollback path exists.

### Agent / Development
- [ ] Public UI constitution is machine-readable.
- [ ] Component/pattern registries are available.
- [ ] Generated UI goes through visual QA.
- [ ] Agents prefer existing components before creating new ones.


### Spec 270 Design-Intelligence Integration
- [ ] Public design work identifies Spec 263 as public-experience authority and Spec 270 as canonical design-intelligence authority.
- [ ] A current `PublicWebsiteDesignContext` is supplied through the Spec 270 design context/brief path for materially redesigned surfaces.
- [ ] Approved public redesign targets are represented by a `CanonicalDesignArtifact` or equivalent Spec 270 canonical record before production implementation.
- [ ] Public component resolution follows reuse-before-invention and records justified exceptions for new generic components.
- [ ] Optional Stitch/external-provider use is design-time only; production remains provider-independent.
- [ ] Material public-design changes produce semantic design diff / design-decision lineage and required approval evidence.
- [ ] Spec 270 visual verification and Spec 263 public-experience verification are both represented in release evidence.
- [ ] No provider-hosted temporary design asset/URL/credential is required by production runtime.

### Conversion / Handoff
- [ ] Film, general-work, Build and Marketplace journeys have deterministic CTAs.
- [ ] Auth transition preserves approved non-sensitive context.
- [ ] Raw public prompt text is absent from URLs and marketing analytics.
- [ ] Baseline and post-launch conversion metrics can be compared.

### SEO / Crawlability
- [ ] Current public route inventory exists.
- [ ] Redirect map is verified.
- [ ] Homepage exposes usable crawlable HTML/content.
- [ ] Canonical/hreflang/sitemap behavior is validated.
- [ ] Structured data is truthful and passes validation where used.
- [ ] Retained public routes do not regress into generic/stale metadata.

### Privacy / Security
- [ ] Cookie/storage/third-party inventory exists.
- [ ] Consent gating is applied where required.
- [ ] CSP/security-header policy is verified.
- [ ] Public forms are rate-limited/protected as appropriate.
- [ ] No secrets are present in client bundles.

### Reliability / Operations
- [ ] CMS/media/analytics failure fallbacks are tested.
- [ ] RUM and route/error monitoring are active.
- [ ] Broken-link and synthetic availability checks are active.
- [ ] Known-good rollback artifact/path exists.
- [ ] Go/no-go and rollback ownership is explicit.
- [ ] Public SLO/alert thresholds and runbook owners are defined.
- [ ] Release-blocking normative requirements are represented in the requirement→implementation→test→evidence traceability matrix.

### Commercial / Trust / Content
- [ ] Pricing/credit presentation matches the approved source of truth and distinguishes estimates from final usage where applicable.
- [ ] Privacy, Terms, Security/Trust, Status and Contact/Support destinations are intentionally mapped.
- [ ] Customer logos/testimonials/benchmarks have evidence/permission lifecycle records where used.
- [ ] Critical claims have owners and freshness/review policy.
- [ ] Public Film demo passed rights/safety/synthetic-media publication gate.

### CMS / Localization / Discovery Operations
- [ ] Critical content has schema version, owner, locale, lifecycle state and rollback path.
- [ ] Preview/staging URLs cannot accidentally enter the index.
- [ ] Locale URL strategy and real-equivalent `hreflang` behavior are verified.
- [ ] `robots.txt`, sitemaps and public status-code semantics are verified.
- [ ] Search/discovery monitoring ownership is established.

### Security / Experiment Integrity
- [ ] Deep-link/auth redirect parameters cannot produce an open redirect.
- [ ] CMS/Markdown/untrusted content XSS sanitization tests pass.
- [ ] Active experiments have exposure instrumentation and registry ownership.
- [ ] Experimentation does not introduce layout flicker/CLS or bypass consent/accessibility requirements.

---

### Marketplace / Public Interaction Safety
- [ ] Public Marketplace/UGC lifecycle, reporting, moderation and takedown paths are defined where applicable.
- [ ] Public user-authored content cannot execute unsafe markup/scripts on the marketing origin.
- [ ] Intent composer cannot become an unauthenticated privileged execution path.
- [ ] Public APIs expose only approved public fields and are tested for enumeration/cache-boundary risks.

### Compatibility / Media / Provenance
- [ ] Browser-support/progressive-enhancement policy is documented and tested.
- [ ] Film/media delivery has traffic/cost monitoring and a poster-only/reduced-media emergency mode.
- [ ] Third-party public UI dependencies are governed through the SmartAIHub wrapper/version policy.
- [ ] Featured non-Film demos have provenance/freshness records as required.

### Acquisition / Scale / Release Integrity
- [ ] Campaign attribution schema is allowlisted, privacy-reviewed and safe through auth handoff.
- [ ] Marketplace/search/filter URL indexation rules prevent unbounded crawl/duplicate surfaces.
- [ ] Incident communication/kill-switch mechanisms and owners are defined.
- [ ] Production build has source commit + immutable artifact identity and reproducible rollback path.

### Governance / Data Quality / Recovery
- [ ] Route/content/claim decision rights and approvers are explicit for high-impact public changes.
- [ ] HIGH-risk CMS content uses auditable second-person approval or an approved emergency exception path.
- [ ] High-risk commercial/security/availability/comparative claims have evidence, freshness, and locale review.
- [ ] Anonymous intent handoff has a documented safe-state/TTL/recovery contract and does not leak raw prompts into URLs/analytics.
- [ ] Release-critical analytics events have schema ownership, deduplication semantics, and post-deploy data-quality validation.
- [ ] Critical dependency map defines fail-open/fail-closed and fallback behavior for edge/CMS/auth/config/media dependencies.
- [ ] Cache/CDN invalidation is verified for publish, withdrawal, incident correction, and rollback scenarios.
- [ ] 24h/72h/7d/30d post-launch review cadence has owners and evidence.
- [ ] Design drift/one-off public patterns are governed through the current registry/token/version process.
- [ ] Rollback rehearsal proves artifact/config/CMS/auth/cache compatibility or documents an approved forward-fix strategy.

# 37. Definition of Done

Spec 263 is DONE when the public SmartAIHub website successfully communicates:

> **SmartAIHub is a place where users can ask for real work to be done—not merely talk to AI.**

and demonstrates that promise with a flagship experience:

> **A user can move from an idea to a completed short film or vertical series through one integrated SmartAIHub production experience.**

while also making clear that the same platform can:

- research;
- create;
- build;
- automate;
- use Skills and Agents;
- produce artifacts;
- publish Mini Apps / AI products;
- expand through Marketplace capabilities.

The end state should feel:
- current;
- credible;
- intentional;
- product-led;
- visually distinctive;
- technically disciplined;
- human-centered;
- visibly made for real people doing real work;
- balanced between human warmth and concrete product proof;
- not generically AI-generated.

---

# 38. Implementation Directive

Implementation teams and coding agents must treat this spec as an experience-system migration rather than a cosmetic homepage redesign.

Priority order:

```text
Spec 263 Positioning / Public Experience Contract
→ Information Architecture / Real Product Evidence / Film Flagship
→ Spec 270 DesignBrief + DesignContextBundle
→ CanonicalDesignArtifact + ComponentResolution
→ SmartAIHub Public UI / Astryx Design System
→ Spec 224 Implementation
→ Spec 270 Visual Verification
→ Spec 263 Public Experience / Trust / Conversion Gates
→ Responsive / Performance / Accessibility / SEO / Analytics
→ Rollout
```

Do not begin by changing colors, gradients, or card styles without first establishing the content hierarchy and public product narrative.



# 39. Ownership and required implementation artifacts

## 39.0 Spec 270 integration artifacts

The public redesign implementation MUST produce or reference the following design-integration evidence where applicable:

```text
PUBLIC_SPEC270_INTEGRATION_RECONCILIATION
PUBLIC_WEBSITE_DESIGN_CONTEXT
PUBLIC_DESIGN_BRIEF_REF
PUBLIC_CANONICAL_DESIGN_ARTIFACT_REF
PUBLIC_DESIGN_SYSTEM_SNAPSHOT_REF
PUBLIC_COMPONENT_RESOLUTION_EVIDENCE
PUBLIC_DESIGN_DECISION_LOG
PUBLIC_SEMANTIC_DESIGN_DIFF
PUBLIC_VISUAL_VERIFICATION_EVIDENCE
PUBLIC_EXTERNAL_PROVIDER_CLEANUP_EVIDENCE
```

These artifacts SHOULD reference Spec 270-native IDs/records instead of duplicating their schemas inside Spec 263.

The integration reconciliation MUST confirm:
- current Spec 270 revision/feature state;
- current Astryx/SmartAIHub component catalog snapshot;
- whether native design, reuse-only, or an optional external provider was used;
- that external design providers are absent from production runtime requirements;
- that public-specific requirements were preserved through canonicalization and implementation.


Before high-fidelity implementation begins, the design package MUST include at minimum:
- homepage information-architecture/wireframe;
- desktop (1440px) and mobile (390/430px) high-fidelity reference for the hero and Film flagship sequence;
- at least one desktop and one mobile reference demonstrating the Human + Product Evidence composition, including responsive crop/removal behavior;
- a small approved human-imagery art-direction board showing acceptable Creative/Human Warmth, Professional/Knowledge Work, and Making/Reviewing treatments;
- interaction/motion storyboard for any scroll-linked or media-led narrative;
- loading/error/fallback states for the hero and Film media;
- Thai and English representative content states;
- design review showing how the page avoids generic AI-SaaS and generic AI-influencer visual patterns.

These references are implementation guides, not permission to hardcode a single viewport.

Before implementation can be considered complete, the project MUST produce or update:

```text
design/public/SMARTAIHUB_PUBLIC_DESIGN.md
design/public/PUBLIC_UI_RULES.json
design/public/PUBLIC_COMPONENT_REGISTRY.json
design/public/PUBLIC_PATTERN_REGISTRY.json
design/public/PUBLIC_TEMPLATE_REGISTRY.json
design/public/PUBLIC_ANTI_PATTERNS.md
design/public/PUBLIC_CONTENT_RULES.md
design/public/PUBLIC_BRAND_RULES.md
design/public/PUBLIC_HUMAN_IMAGERY_RULES.md
design/public/PUBLIC_HUMAN_ASSET_REGISTRY.json
design/public/PUBLIC_HUMAN_ASSET_PRODUCTION_MANIFEST.(json|yaml)
design/public/PUBLIC_HUMAN_PLACEMENT_MAP.(json|yaml)
design/public/PUBLIC_HUMAN_WITHDRAWAL_RUNBOOK.md
design/public/PUBLIC_HUMAN_EXPERIMENT_GUARDRAILS.md
design/public/PUBLIC_TOKEN_CHANGELOG.md
public-route-inventory.(json|yaml|csv)
public-redirect-map.(json|yaml|csv)
public-locale-route-map.(json|yaml|csv)
public-capability-claims registry/reference
public-social-proof/benchmark evidence registry
public-film-demo asset/rights/safety manifest
public-content-schema + freshness policy
public-pricing/source-of-truth mapping
public-analytics-event schema
public-experiment registry/schema
public-performance-budget config
public-third-party dependency/script inventory
public-SLO-alert-runbook mapping
public-marketplace-ugc-moderation-takedown policy/runbook
public-intent-execution-boundary contract
public-api-data-exposure inventory
public-media-capacity-cost guardrail config/runbook
public-browser-support/progressive-enhancement matrix
public-ui-dependency-version governance/changelog
public-demo-provenance registry
public-campaign-attribution schema
public-indexation/facet policy
public-incident-communication/kill-switch runbook
public-build-provenance + dependency-manifest/SBOM reference
public-requirement-traceability.(json|yaml|csv)
public-release-checklist
public-decision-rights-raci.(json|yaml|csv)
public-editorial-risk-approval-policy.md
public-analytics-data-quality-contract.(json|yaml)
public-critical-dependency-fallback-map.(json|yaml|csv)
public-cache-invalidation-verification-runbook.md
public-post-launch-review-log/template
public-design-conformance-review.md
public-rollback-rehearsal-evidence.md
```

Ownership MUST be explicit for:
- Product/positioning;
- Design system;
- Public content/editorial;
- Film demo assets;
- Frontend engineering;
- SEO/discovery;
- Analytics/privacy;
- Pricing/commercial truth;
- Legal/trust content;
- Localization/editorial QA;
- Security;
- Production rollout/observability;
- Marketplace/UGC trust & safety where public UGC exists;
- Frontend dependency/supply-chain governance;
- Media delivery capacity/cost ownership;
- Human editorial imagery / likeness / synthetic-person provenance ownership;
- Public analytics data-quality ownership;
- Cache/CDN invalidation and public dependency-recovery ownership;
- Public design-conformance/drift ownership.

For Human + Product Evidence decisions, ownership MUST distinguish at least:
- art-direction approver;
- rights/likeness/provenance approver;
- product-message approver;
- accessibility/performance reviewer;
- CMS publication owner;
- emergency withdrawal owner.

One person MAY hold multiple roles, but the release evidence MUST show who made each approval decision.

## 39.1 Decision rights, RACI, and approval-service-level contract

Ownership lists are insufficient when multiple teams can change the same public surface. Maintain a lightweight decision-rights/RACI map for material public-site domains.

At minimum map who is **Responsible**, **Accountable**, **Consulted**, and/or **Approver** for:
- homepage positioning and primary CTA;
- Film flagship proof and media rights;
- pricing/credits/commercial claims;
- legal/privacy/security/trust copy;
- customer/creator proof and testimonials;
- SEO/indexation/redirect changes;
- analytics/consent/experiments;
- CMS publication;
- public runtime/release/rollback;
- emergency incident/asset withdrawal.

Rules:
- every HIGH-risk approval path must have a named role or team, not “TBD at launch”;
- define escalation/deputy behavior so an unavailable approver does not encourage bypassing controls;
- approval SLAs MAY be lightweight but SHOULD distinguish normal editorial work from emergency correction;
- no RACI structure may override technical authorization boundaries or allow an editor to self-authorize privileged production/runtime actions;
- evidence links in the traceability matrix should reference the actual approval/review outcome where required.

## 39.2 Requirement-to-test traceability contract

Implementation MUST maintain a machine-readable traceability matrix for release-blocking normative requirements. The purpose is to prevent a large spec from being declared complete because the page “looks done” while operational or policy requirements were skipped.

Recommended requirement namespaces:

```text
POS   positioning/conversion
FILM  Film flagship/public-demo requirements
DS    design system/brand
PERF  performance/media
A11Y  accessibility
SEO   crawl/discovery
I18N  localization
ANA   analytics/experimentation
PRIV  privacy/consent
SEC   security/abuse
CMS   content/editorial
REL   reliability
OPS   rollout/observability
UGC   public Marketplace/user-authored content safety
COMPAT browser/progressive-enhancement support
COST  media capacity/cost controls
SUPPLY frontend dependency/build provenance
HUMAN human editorial imagery/provenance/truthfulness
GOV   decision rights/editorial approval/operating governance
DATA  analytics data quality/measurement integrity
```

Each tracked item MUST contain at minimum:

```text
requirement_id
source_section
requirement_summary
owner
implementation_ref
test_or_review_ref
evidence_ref
status
exception_id_if_any
```

Rules:
- each release-blocking `MUST`/`MUST NOT` that affects implementation or verification must map to evidence;
- one automated test may satisfy multiple requirements only when the mapping is explicit;
- manual design/legal/content approvals must produce an auditable evidence reference rather than an informal chat acknowledgment;
- exceptions require approver, rationale, compensating control where applicable, and expiry/review date;
- a requirement marked `blocked` or `failed` cannot be silently converted to `done`;
- final Go/No-Go review MUST consume this matrix together with the acceptance checklist.

# 40. Sixty-pass completeness audit — incorporated findings

Spec 263 has now been reviewed in **five independent 10-pass cycles (50 passes total)**. Findings were incorporated directly into the normative sections above.

## Audit cycle A — Revision 263.2

| Pass | Audit focus | Gap found | Resolution added |
|---:|---|---|---|
| 1 | Positioning | Strong platform story but no explicit audience/message hierarchy | Audience intent matrix + outcome→proof→breadth order |
| 2 | Conversion | CTAs were descriptive but not contractual | Four conversion journeys + public→product handoff contract |
| 3 | Proof/trust | No formal evidence/trust rules | Proof hierarchy, verified claims, Trust/Security discoverability |
| 4 | Film flagship | Strong narrative but weak rights/provenance/failure rules | Asset rights manifest, provenance policy, graceful video fallback |
| 5 | Design system | Tokens/components existed but responsive/theme primitives were underspecified | Layout primitives, container-query guidance, theme QA policy |
| 6 | Mobile/accessibility | General WCAG requirement lacked critical 2.2 interaction detail | Focus-obscured, target-size, drag alternative, media accessibility, zoom/touch checks |
| 7 | Performance | CWV targets existed but no budgets/media delivery/RUM contract | JS/CSS guardrails, poster-first media, caching, field monitoring |
| 8 | SEO/i18n | Metadata list lacked structured-data/migration/crawl regression detail | Route inventory, canonical/hreflang, redirect rules, structured data, crawlability gate |
| 9 | Analytics/privacy/security | Event list existed but lacked consent, abuse protection and security baseline | Privacy/consent, CSP/security headers, Turnstile/rate limiting, prohibited analytics payloads |
| 10 | Delivery/operations | Rollout lacked baseline, observability, failure matrix, go/no-go ownership | Phase 0 baseline, test matrix, synthetic/RUM monitoring, staged rollout, no-go blockers |

## Audit cycle B — Revision 263.3

| Pass | Audit focus | Gap found | Resolution added |
|---:|---|---|---|
| 11 | Commercial clarity | Pricing route existed but no contract for credits/usage estimates/source-of-truth | Pricing/credit transparency + source-of-truth/fallback rules |
| 12 | Film publication safety | Rights existed but public-demo suitability/synthetic-media gate was incomplete | Rights + moderation + likeness + disclosure + withdrawal gate |
| 13 | Brand consistency | Component/tokens did not fully define art direction or token-change governance | Brand contract, generated-media treatment, token changelog/visual evidence |
| 14 | Trust/legal architecture | Footer discoverability existed but canonical route/ownership requirements were weak | Privacy/Terms/Security/Status/Contact route contract + testimonial permission |
| 15 | Low-bandwidth delivery | Media budgets did not fully govern constrained devices/fonts/third-party scripts | Save-Data, font strategy, adaptive media, third-party owner/budget/removal plan |
| 16 | SEO/localization operations | Core metadata rules lacked robots/status-code/preview-indexing and locale-release contract | robots/sitemaps/404/410/5xx + search ops + locale URL/parity rules |
| 17 | Experiment integrity | Experiment metadata existed without exposure/SRM/confound governance | Experiment registry, exposure, SRM, overlap and archived-decision rules |
| 18 | CMS/content lifecycle | Draft→publish existed but freshness/schema/expiry/emergency withdrawal were weak | Content IDs/schema versions, freshness, preview/noindex, scheduled publish, kill switch |
| 19 | Security/reliability | General CSP/forms did not explicitly cover open redirects/XSS/preview admin and error status semantics | Redirect allowlist, sanitization, CSP discipline, CSRF/origin, intentional error surfaces |
| 20 | Verification/operations | Tests/observability lacked requirement traceability/SLO thresholds and new content contracts | SLO/runbook ownership, expanded regression/security/content tests, acceptance/artifact gates |

## Audit cycle C — Revision 263.4

| Pass | Audit focus | Gap found | Resolution added |
|---:|---|---|---|
| 21 | Marketplace / UGC trust | Public listing surfaces lacked full moderation/report/takedown and endorsement semantics | UGC lifecycle, sanitization, safe-link, reporting, takedown, badge/endorsement rules |
| 22 | Public intent safety | Intent composer handoff existed but pre-auth execution authority was not explicitly bounded | Pre-auth execution boundary, rate/cost/content limits, no privileged side effects before auth/approval |
| 23 | Media capacity / abuse | Media performance existed but lacked operational cost/traffic/hotlink emergency controls | Media capacity/cost telemetry, derivative previews, anti-abuse controls, poster-only kill mode |
| 24 | Compatibility / progressive enhancement | Browser list existed without an explicit degraded/no-critical-JS contract | Browser-support policy, feature detection, SSR critical content, hydration/degraded behavior |
| 25 | UI dependency drift | Wrapper existed but upstream package/version drift could still silently change brand/accessibility | Dependency pinning, wrapper-only imports, upgrade regression evidence, beta rollback policy |
| 26 | Demo provenance | Film had provenance/rights rules but other flagship artifacts could become stale/misleading | Cross-capability demo provenance/freshness registry and withdrawal path |
| 27 | Campaign attribution | Analytics named campaign attribution without defining safe schema/lifecycle/auth propagation | Allowlisted attribution schema, PII prohibition, consent/storage, canonical/expiry governance |
| 28 | SEO at marketplace scale | Search/filter/Marketplace could create unbounded duplicate/indexable URL surfaces | Facet/search/index rules, crawl-space control, accessible pagination, spam/duplicate monitoring |
| 29 | Incident communication | Monitoring/rollback existed but no dedicated public incident messaging/emergency content control | Incident banner/status linkage, kill switches, emergency withdrawal, clear ownership/review |
| 30 | Public data/build integrity | Security/release controls lacked full public API field minimization and immutable build provenance | Public API/data inventory + least-data/cache controls + reproducible build/SBOM/artifact identity |

## Audit cycle D — Revision 263.6

| Pass | Audit focus | Gap found | Resolution added |
|---:|---|---|---|
| 31 | Human/product narrative balance | Human imagery had art-direction rules but could still dominate first-view meaning | Semantic-adjacency contract + first-viewport product-proof requirement |
| 32 | Synthetic identity / likeness safety | Provenance rules did not explicitly block real-person lookalikes or misleading role implication | Real-person imitation/likeness restrictions + endorsement-role rules |
| 33 | Age / suitability safety | Human-image contract did not explicitly define minor/age-ambiguous public imagery safeguards | Adult-default guidance + additional minor suitability/rights review + no sexualized framing |
| 34 | Representation / localization | Per-image truthfulness did not fully prevent page-level archetype/stereotype narrowing | Page-level representation review + no locale→identity inference or stereotype mapping |
| 35 | Human asset lineage | Asset registry did not fully trace edits/crops/derivatives/social variants back to source | Production manifest, parent/derivative lineage, metadata stripping and placement mapping |
| 36 | Responsive image performance | General media budgets lacked human-image focal crop/derivative/LCP rules | Responsive derivatives, focal-point metadata, lazy-load/LCP priority and derivative caps |
| 37 | Mixed-media accessibility | General alt-text rules lacked overlay/read-order/image-disabled requirements | Human+Product reading-order, contrast, text-as-text and fallback accessibility contract |
| 38 | Film/editorial/customer taxonomy | Synthetic editorial humans and Film characters could be visually confused with real-user proof | Explicit public-human taxonomy + presentation/disclosure rules |
| 39 | Withdrawal propagation | CMS kill switch did not guarantee purge of human derivatives and OG/social variants | Placement resolution + CDN/derivative/social-preview withdrawal procedure |
| 40 | Experiment/approval governance | CTR optimization and informal imagery approval could distort trust/brand/product evidence | Human-imagery experiment guardrails + explicit approval roles/evidence |

## Audit cycle E — Revision 263.7

| Pass | Audit focus | Gap found | Resolution added |
|---:|---|---|---|
| 41 | Decision rights / RACI | Ownership existed but material route/claim decisions could still have ambiguous approvers | Decision-rights/RACI map + escalation/approval evidence contract |
| 42 | Editorial publication governance | CMS workflow lacked explicit four-eyes control for high-risk public changes | Risk tiers, second-person approval, audit trail, agent-draft disclosure |
| 43 | Commercial/legal trust claims | General truthfulness rules did not fully distinguish pricing/security/availability/comparative claims | High-risk claim classes + source/freshness/localization approval rules |
| 44 | Funnel continuity | Public intent handoff could preserve context without a precise TTL/safe-state/recovery contract | Anonymous draft modes, opaque-token TTL/scope, review-before-side-effect and recovery rules |
| 45 | Analytics data quality | Event schema existed but decision integrity could still fail through duplicate/lost/misfired events | Event ownership/schema version/dedup/bot treatment + post-deploy quality validation |
| 46 | Critical dependency recovery | Failure matrix did not explicitly cover DNS/edge/config/feature flags and fail-open/fail-closed semantics | Dependency map + fallback/timeout/owner/monitoring contract |
| 47 | Cache/CDN correctness | Purge was mentioned but publication/withdrawal/rollback freshness across layers was under-specified | Cache classes, freshness policy, purge verification, leakage-safe cache keys |
| 48 | Post-launch operations | 24h/72h/7d checks existed but no durable 30d/quarterly content/design/dependency health cadence | Operating review cadence + required owner/outcome evidence |
| 49 | Design drift | Token/changelog controls did not fully prevent future campaign/agent-generated one-off drift | Design-conformance/extension governance + registry/version/exception rules |
| 50 | Rollback evidence | Known-good artifact existed but compatibility with CMS/config/auth/cache state was not proven | Rollback rehearsal + compatibility/forward-fix evidence contract |

## Audit cycle F — Revision 263.8 / Spec 270 R1.4 synchronization

| Pass | Audit focus | Gap found | Resolution added |
|---:|---|---|---|
| 51 | Authority boundary | Spec 263 could be interpreted as a second design-intelligence authority | Explicit 263/270/224 ownership and precedence contract |
| 52 | Design-context handoff | Public brand/Film/Human constraints were not formally handed to Spec 270 | `PublicWebsiteDesignContext` mapped into DesignBrief/DesignContextBundle |
| 53 | Canonical design source | Provider/agent mockups could become implementation targets directly | Mandatory `CanonicalDesignArtifact` normalization before approved implementation |
| 54 | Provider dependence | Public redesign could accidentally assume Stitch availability | Stitch-enhanced/not-dependent public-site invariant and native/reuse fallback |
| 55 | Component governance | Spec 263 preference for reuse was weaker than Spec 270 resolver invariant | Adopted Spec 270 reuse-before-invention order for public UI |
| 56 | Human/Film semantic preservation | External design exploration could visually dilute Human+Product or Film flagship intent | Public semantic constraints made mandatory in design context/canonical artifact |
| 57 | Material design changes | Visual changes could pass screenshot tests while altering positioning/conversion | Material-change taxonomy + semantic design diff + approval lineage |
| 58 | QA ownership | Visual QA responsibilities overlapped across specs | Explicit Spec 270 / Spec 263 / Spec 224 verification split |
| 59 | Runtime isolation | Provider SDK/assets/credentials might leak into production web runtime | Design-time-only provider rule + provider cleanup evidence |
| 60 | Release traceability | Spec 270 design records were not represented in Spec 263 acceptance/evidence | Added integration artifacts, acceptance criteria and release traceability |

No pass is considered complete merely because no textual inconsistency was found. Each pass asks whether an implementation team, designer, coding agent, editor, SEO owner, trust/safety owner, or operator could make a materially wrong decision because a contract was missing.

# 41. External standards/reference baseline

Implementation SHOULD verify current versions at implementation time. Baseline references used by this audit include:
- **Spec 270 R1.4 — SmartAIHub Design Intelligence, UI Generation & Provider-Neutral Design Runtime** for canonical design artifacts, provider-neutral design routing, component resolution, semantic design diff and visual verification;
- W3C Web Content Accessibility Guidelines (WCAG) 2.2;
- Google/web.dev Core Web Vitals guidance (LCP, INP, CLS);
- Google Search Central canonical, site-move, multilingual/hreflang, Organization, SoftwareApplication and VideoObject guidance, including the September 2026 VideoObject documentation update;
- Cloudflare CSP and Turnstile documentation when Cloudflare protections are used.

These references guide technical compliance; they do not override SmartAIHub product truthfulness or the stricter requirements in this spec.

**Spec 263 is the source of truth for the SmartAIHub public website modernization initiative.**

## 42. Revision 263.9 — Additive AI asset and App ecosystem positioning

SmartAIHub's public narrative MAY describe an AI asset/App ecosystem: people and organizations can discover, use, publish, and distribute Apps and other governed assets. This ecosystem framing supplements the universal AI work platform story and the AI Film/Short Film/Vertical Series flagship; it MUST NOT make SmartAIHub appear to be only a marketplace, skill catalog, workflow builder, or agent framework.

Public navigation MAY evolve toward **Product**, **Discover**, **Creators**, **Solutions**, **Pricing**, and **Developers** while retaining the existing public-route inventory and deep links. Discover MAY expose Apps, Agents, categories, collections, creators, and asset listings only when each record is explicitly public and its rights/policy permit anonymous access. Public listings MUST be browsable without login where the listing is public; private tenant data, analytics, source access, and non-public metadata remain protected.

Asset ownership, rights, and channel distribution consume SPEC-303. Stable App identity, canonical route, aliases, custom domains, and channel routing consume SPEC-304. Public pages do not become an ownership, project, knowledge, memory, or deployment authority. Existing deployed routes MUST NOT be removed or rekeyed without a route inventory, explicit compatibility/redirect plan, and acceptance evidence tied to the deployment SHA. This additive positioning does not claim that Discover or ecosystem listing flows are implemented or deployed.
