# SPEC-287 — Unified UI Governance, Rendering Conformance & Mini App Design Contract

**Status:** PROPOSED / ADDITIVE  
**Revision:** R1.5 — intelligent surface architecture and canonical ownership alignment
**Revision precedence:** R1.5 is normative over earlier R1.x statements that defer function/action invocation to an unnamed future Spec. Other R1.x requirements remain in force unless explicitly amended here.
**Scope:** SmartAIHub Web UI + Mini Apps + externally deployable Mini Apps  
**Relationship:** Extends existing UI architecture without replacing implemented providers.  
**Key constraint:** Generated interactive surface contracts are owned by Spec 240. User/client action mapping is owned by Spec 226; authorization and data scope by Spec 220; economic authorization by Spec 207; durable execution by Feature 195 (`worker_jobs` and outbox). Spec 279 applies to agent-originated command ingress and delegation. This spec governs design and rendered conformance and MUST NOT define a competing surface, action, authorization, billing, or execution protocol.

---

## 1. Executive Summary

SmartAIHub currently has multiple UI production paths: AI-native generation, Astryx, and optional Stitch. They can produce useful results, but allowing more than one of them to act as design authority on the same task causes design drift, mixed component patterns, inconsistent colors, and difficult repairs. Existing pages also contain accumulated colors, CSS overrides, theme rules, component variants, and browser-specific behavior. A recurring operational problem is that a source-level color change does not necessarily appear in the rendered browser until several edit/test loops. Safari/macOS is a particularly important failure surface.

This specification introduces a **single governance and verification layer** above all UI generators. It does not add a fourth UI generator.

The architecture is based on five principles:

1. **One UI execution authority per generation/repair task.**
2. **One persistent Design Contract as the source of truth for visual semantics.**
3. **Semantic design tokens instead of uncontrolled production colors.**
4. **Rendered-browser evidence, not source edits, determines UI completion.**
5. **The same governance/conformance pipeline applies to SmartAIHub itself and every Mini App.**
6. **Design contracts are versioned, immutable once released, and compatibility-aware.**
7. **A global token change is a governed migration with explicit blast-radius evidence, never an unscoped edit.**

UI UX Pro Max, if installed or integrated, is classified only as a **Design Intelligence Provider**. It may contribute UX rules, accessibility guidance, product/industry patterns, typography/palette reasoning, anti-patterns, and stack guidance. It MUST NOT independently become another UI execution authority.

---

## 2. Problem Statement

### 2.1 Multiple design authorities

Current and planned UI paths include:

- AI-native UI/code generation
- Astryx
- Stitch (optional)
- existing/manual UI components and legacy styles

Historically, AI-native and Astryx output can conflict or become mixed. Adding another generator would increase this problem.

### 2.2 Color drift and unreadable combinations

Existing code can contain:

- hard-coded hex/RGB/HSL colors
- Tailwind arbitrary colors
- component-local colors
- inline styles
- `!important`
- theme-provider overrides
- tenant/brand overrides
- runtime-generated styles
- duplicated semantic colors with slightly different values
- status colors used inconsistently
- low-contrast text, icons, controls, hover/disabled states

### 2.3 Source changes are not proof of rendered changes

The effective pipeline is:

`token/source -> generated CSS -> cascade/specificity -> theme/runtime override -> computed style -> browser rendering -> visible pixels`

A change at the first stage can be neutralized later. Therefore "code changed" MUST NOT equal "UI verified".

### 2.4 Safari/macOS rendering problems

Passing Chromium is not sufficient evidence for a web release. WebKit/Safari differences can affect:

- flex/grid sizing
- viewport units
- sticky/fixed elements
- overflow/scroll
- font rendering and fallback
- form controls
- filters/backdrop filters
- safe-area handling
- touch interactions
- modal/popover positioning
- newer CSS capabilities and fallbacks

### 2.5 Large legacy surface

SmartAIHub already contains many pages. A page-by-page redesign is too expensive and increases regression risk. Migration must prioritize tokens, primitives, and shared components by blast radius, then repair only the long tail.

### 2.6 Mini App consistency and portability

New Mini Apps need the same guarantees while remaining deployable:

- inside SmartAIHub
- on Cloudflare or another supported platform
- on an external server/environment

Their visual contract cannot depend on a hidden SmartAIHub runtime-only mechanism.

---

## 3. Goals

### G1 — Establish a canonical UI governance layer

All UI execution providers consume the same contract and conformance rules.

### G2 — Prevent generator mixing

A task/run has exactly one active UI execution authority unless an explicit, auditable handoff occurs.

### G3 — Make visual semantics machine-verifiable

Use semantic tokens and explicit state rules.

### G4 — Prove browser output

Verify computed styles and rendered output before declaring completion.

### G5 — Safely migrate existing SmartAIHub UI

Inventory -> baseline -> normalize -> codemod -> shared-component migration -> browser verification -> targeted repair.

### G6 — Make the same pipeline mandatory for Mini Apps

Mini App generation must not bypass UI governance.

### G7 — Preserve portability

Design contracts/tokens/tests required for UI correctness travel with externally deployed Mini Apps.

### G8 — Consume existing canonical action and execution contracts

This spec defines UI representation, interaction presentation, state visualization, and conformance only. Functional invocation and execution semantics are consumed from the existing owners in §16.

---

## 4. Non-Goals

This specification does NOT:

- replace Astryx;
- replace Stitch;
- replace AI-native generation;
- require every UI to look identical;
- force one visual theme on all tenants or Mini Apps;
- define generated surface schemas, action bindings, client-action semantics, authorization, billing, or durable execution;
- create a new MCP/WebMCP/A2A/function-call protocol;
- redesign all existing pages in one operation;
- allow UI UX Pro Max to become a fourth generator;
- treat screenshot similarity alone as proof of correctness;
- require SmartAIHub-hosted runtime services for externally deployed Mini Apps.

---

## 5. Architectural Position

```text
User / Spec / Mini App Definition
              |
              v
       UI Intent Resolution
              |
              v
 Existing Design Discovery
              |
      +-------+--------+
      |                |
      v                v
Internal Rules   Design Intelligence
                  (optional providers,
                   incl. UI UX Pro Max)
      |                |
      +-------+--------+
              |
              v
       DESIGN CONTRACT
              |
              v
      UI AUTHORITY RESOLVER
              |
       choose exactly ONE
       /       |        \
      v        v         v
 AI Native   Astryx    Stitch
       \       |        /
        +------+-------+
              |
              v
       Implementation
              |
              v
      UI Conformance Layer
              |
   +----------+-----------+
   |          |           |
   v          v           v
 Tokens/    Browser     A11y/
 Contrast   Rendering    UX
   |          |           |
   +----------+-----------+
              |
              v
      Visual Regression
              |
         PASS / REPAIR
              |
              v
       Evidence Receipt
              |
              v
          Final Verify
```

---

## 6. Core Domain Contracts

### 6.1 `DesignContract`

Minimum conceptual schema:

```yaml
designContract:
  schemaVersion: "1"
  id: "..."
  scope:
    platform: smartaihub | miniapp
    tenantId: optional
    appId: optional
    pageId: optional

  inheritance:
    platformDesignSystem: optional
    tenantBrand: optional
    appDesignSystem: optional
    pageOverride: optional

  tokens:
    surfaces: {}
    text: {}
    borders: {}
    actions: {}
    statuses: {}
    focus: {}
    typography: {}
    spacing: {}
    radii: {}
    elevation: {}
    motion: {}

  interactionStates:
    normal: {}
    hover: {}
    active: {}
    selected: {}
    disabled: {}
    focus: {}
    error: {}

  accessibility:
    target: WCAG-AA
    reducedMotion: supported
    keyboard: required
    focusVisible: required

  responsive:
    mobile: required
    tablet: required
    desktop: required

  browserPolicy:
    chromium: required
    firefox: required
    webkit: required
    realSafariAcceptance: release-policy-dependent

  prohibitedPatterns: []
  exceptions: []

  provenance:
    derivedFrom: []
    approvedBy: optional
```

Exact storage format can evolve, but semantic fields and versioning MUST remain machine-readable.

### 6.2 `UIExecutionAuthority`

```yaml
uiExecution:
  authority: astryx | stitch | ai-native
  runId: "..."
  mixing: forbidden
  fallback:
    allowed: true
    providers: [ai-native]
    requiresExplicitHandoff: true
  designContractId: "..."
```

Rules:

- only one active authority per run/task;
- fallback requires explicit handoff;
- fallback inherits the SAME Design Contract unless a separately authorized design-change task updates it;
- provider failure is not permission to redesign;
- functional-only changes do not imply design authority.

### 6.3 `UIConformanceEvidence`

Evidence SHOULD include:

- source revision/commit
- Design Contract ID/version
- authority/provider
- build artifact identity
- tested route/component
- viewport
- browser engine/version
- theme
- expected token
- resolved CSS variable
- computed style
- winning declaration/source where diagnosable
- contrast result
- accessibility result
- screenshot/visual evidence reference
- visual-diff result
- test timestamp
- PASS/FAIL
- repair attempt lineage

---

## 6.4 Design Contract Lifecycle, Compatibility and Authority

A Design Contract is a versioned runtime/build artifact, not merely documentation.

Required lifecycle states:

```text
DRAFT -> VALIDATED -> RELEASED -> DEPRECATED -> RETIRED
```

Rules:

- a `RELEASED` contract is immutable; changes create a new version;
- every generated build records the exact contract version/hash;
- inheritance resolution must be deterministic and materializable;
- circular inheritance is invalid;
- an override may change only explicitly permitted token/behavior namespaces;
- consumers declare a supported contract schema range;
- incompatible schema changes require migration tooling;
- old Mini App builds must remain reproducible using their pinned contract/materialized token artifact;
- deletion/retirement must not break still-supported deployed Mini Apps.

A contract resolver MUST output an **effective materialized contract** and provenance showing the winning value for each inherited/overridden field.

### 6.5 Token Change Blast-Radius Contract

Changing a platform or tenant token can affect thousands of surfaces. Therefore a token change is treated as a migration operation.

Before merge/release, the system must produce:

- token(s) changed;
- old/new values;
- affected component count;
- affected route/Mini App count where discoverable;
- affected tenants/themes;
- contrast delta;
- visual-regression sample/risk tier;
- whether the change is intentional design evolution or defect repair;
- rollback target.

High-blast-radius changes require canary validation before broad propagation.

### 6.6 UI Authority Lease and Concurrency

Parallel sessions/agents must not silently acquire competing UI authority over the same scoped surface.

The authority record SHOULD include:

```yaml
authorityLease:
  scope: component | route | miniapp | design-contract
  ownerRunId: "..."
  provider: astryx | stitch | ai-native
  acquiredAt: "..."
  revisionBase: "..."
  expiresOrReconcilesByPolicy: true
```

Conflicting changes must be reconciled through the existing development handoff/integration mechanism. A stale lease must not permanently block work, and lease expiry must not silently authorize conflicting design changes.



### 6.7 Design Token Registry, Ownership and Change Authority

There MUST be one canonical registry for governed semantic token definitions and metadata. Generated CSS, Tailwind mappings, framework themes, Mini App materializations, and documentation are projections of that registry, not competing sources of truth.

Each governed token SHOULD carry metadata equivalent to:

```yaml
token:
  id: "text.primary"
  type: color
  owner: "ui-platform"
  semanticPurpose: "Primary readable foreground"
  allowedScopes: [platform, tenant, miniapp]
  overridableByTenant: true
  accessibilityRole: foreground
  deprecated: false
  replacement: optional
```

Rules:

- duplicate token IDs with divergent semantics are invalid;
- generated projections must include registry/version identity;
- editing a generated projection directly must be detected or overwritten by regeneration;
- token ownership determines who may approve semantic changes, but does not bypass automated gates;
- deprecated tokens require a replacement/migration path;
- aliases must be cycle-free and resolve deterministically.

### 6.8 Legacy Escape Hatch and Debt Ledger

Legacy UI may temporarily require exceptions while migration proceeds. Exceptions MUST be explicit, scoped, expiring/reviewable debt rather than permanent silent bypasses.

An exception record SHOULD include:

- rule violated;
- exact scope/component/route;
- reason;
- owner;
- creation date;
- review/expiry policy;
- migration target;
- risk classification.

New code MUST NOT copy a legacy exception merely because an existing component has one. Conformance reporting must expose exception count and burn-down trend.



### 6.9 Baseline Ownership and Approval Authority

Visual baselines are governed artifacts, not test-generated truth.

Each baseline set MUST record:

- owning scope/team;
- Design Contract version/hash;
- source/build revision;
- browser/viewport/theme/locale identity;
- approver or policy authority;
- reason for intentional baseline change;
- superseded baseline reference.

Rules:

- the same automated repair agent that produced a visual change MUST NOT silently approve its own baseline replacement;
- baseline approval cannot bypass accessibility, contrast, security, or functional requirements;
- bulk baseline regeneration requires an impact report and explicit approval policy;
- obsolete baselines must be retired without destroying audit provenance.

### 6.10 Component API Compatibility Contract

UI migration may change shared component internals but MUST preserve or deliberately migrate component API semantics.

For governed shared components, track where applicable:

- props/attributes and defaults;
- emitted events/callback behavior;
- slots/children composition;
- keyboard/focus behavior;
- ARIA semantics;
- loading/disabled/destructive states;
- CSS/custom-property extension points;
- supported variants;
- deprecation/replacement.

A visual migration that silently changes functional component behavior is a regression even if screenshots pass.


---

## 7. Semantic Color Governance

### 7.1 Canonical semantic families

At minimum:

```text
surface.canvas
surface.primary
surface.secondary
surface.elevated

text.primary
text.secondary
text.muted
text.inverse

border.default
border.strong
border.focus

action.primary
action.primaryText
action.secondary
action.destructive

status.success
status.warning
status.danger
status.info
```

### 7.2 Rules

Production application UI SHOULD use semantic tokens.

New arbitrary colors MUST be rejected by lint/conformance policy unless covered by an explicit category or exception.

Allowed exception classes may include:

- charts/data visualization;
- media/video/image canvas;
- user-generated content;
- tenant branding values mapped into approved semantic slots;
- color pickers;
- domain-specific visualization where color itself carries required information.

Exceptions MUST NOT silently weaken text/control contrast requirements.

### 7.3 State coverage

Contrast and semantic correctness must be checked for:

- normal
- hover
- active
- selected
- disabled
- focus
- validation/error
- light theme
- dark theme

Color alone MUST NOT be the only carrier of critical status meaning.


### 7.4 Color Space and Transparency Semantics

Color verification must account for the effective rendered composite, not only a raw token pair.

Requirements:

- normalize supported CSS color syntaxes/color spaces before comparison;
- account for alpha/transparency and effective background;
- gradients/images behind readable text require a conservative or sampled contrast strategy;
- disabled-state policies must remain usable even when conventional text contrast exceptions apply;
- HDR/wide-gamut colors, if introduced, require explicit fallback behavior for unsupported displays/browsers.


---

## 8. Rendering Forensics — Mandatory Phase 0

No repository-wide color migration may begin until the rendering pipeline is proven.

### 8.1 Trace model

```text
Design Token / Source
        ->
Generated CSS
        ->
CSS cascade / specificity
        ->
Theme / tenant / runtime overrides
        ->
Computed Style
        ->
Rendered Browser
        ->
Visible Pixel / Visual Result
```

### 8.2 Diagnostic requirements

For a target element, tooling SHOULD be able to report:

- expected semantic token;
- expected resolved value;
- actual computed value;
- whether the expected CSS variable is present;
- winning CSS declaration when available;
- source stylesheet/module;
- specificity/override clues;
- inline style or `!important`;
- active theme and tenant override;
- relevant parent opacity/filter/blend effects.

### 8.3 Completion rule

Changing a source token is **IMPLEMENTED**, not **VERIFIED**.

UI work can reach VERIFIED only after required browser evidence passes.


### 8.4 Extended Rendering Boundaries

Forensics must cover rendering paths that bypass ordinary component-local CSS when used:

- portals (dialogs, menus, tooltips);
- Shadow DOM / web components;
- iframe or embedded Mini App surfaces;
- CSS-in-JS/runtime style injection;
- constructable stylesheets;
- SVG `fill`/`stroke` and icon currentColor inheritance;
- canvas/WebGL visualization where DOM computed-style checks are insufficient;
- pseudo-elements (`::before`, `::after`);
- native form-control appearance;
- parent opacity/filter/backdrop/blend effects.

The diagnostic output must identify when the effective visual value cannot be inferred from the target node's `getComputedStyle()` alone.

### 8.5 SSR, Hydration and First-Paint Correctness

Where SSR/streaming/hydration is used, conformance must test:

- server-rendered theme matches hydrated theme;
- no persistent hydration mismatch;
- no unacceptable flash of unthemed/wrong-theme content (FOUC);
- CSS/token assets required for first meaningful paint are available;
- theme selection does not depend on a race that differs across browsers.

A final-state screenshot alone is insufficient if users see an incorrect first paint.

### 8.6 Font and Locale Rendering

Font correctness must be verifiable because typography changes layout and contrast perception.

Requirements:

- deterministic fallback stack;
- font-load failure test;
- no invisible text caused by font-loading strategy;
- Thai and other supported-script glyph coverage;
- representative Thai/English mixed-content tests;
- long labels and localization expansion;
- line-height/word-break/overflow checks;
- numeric/table alignment where relevant.


---

## 9. Golden UI Conformance Surface

Create an internal test surface such as `/__ui-conformance` or equivalent non-public harness.

It must exercise:

- surfaces and text hierarchy
- buttons and all states
- inputs/selects/textareas
- checkbox/radio/switch
- badges/status
- alerts/toasts
- cards
- dialogs/modals
- tables
- tabs
- menus/popovers/tooltips
- navigation
- loading/skeleton
- empty/error states
- focus states
- disabled states
- representative charts where applicable

Matrices:

- light/dark where supported;
- mobile/tablet/desktop;
- Chromium/Firefox/WebKit;
- tenant/theme variants where material.

### 9.1 Canary mutation test

Before broad migration, intentionally change a controlled semantic token to an unmistakable test value in an isolated test run.

The system must prove:

1. source/token changed;
2. generated CSS changed;
3. computed style changed;
4. screenshot/render changed;
5. visual test detected the change.

If any step fails, migration is blocked until the override/cache/build/cascade problem is understood.


### 9.2 Deterministic Visual-Test Environment

Visual tests must control or mask nondeterministic inputs, including where relevant:

- animations/transitions/caret blinking;
- current time/date;
- random IDs/content;
- network-loaded variable data;
- ads/sponsored/live feeds;
- user avatars/media;
- locale/timezone;
- font availability/loading;
- device scale factor;
- scrollbar behavior;
- asynchronous skeleton/loading completion.

A flaky screenshot must not be normalized by widening thresholds until the nondeterministic cause is understood. Dynamic regions may be masked only with explicit justification and must retain separate functional assertions where material.


---

## 10. Legacy SmartAIHub Migration

### Wave 0 — Inventory and baseline

Collect:

- routes/pages;
- components;
- component usage counts;
- CSS modules/stylesheets;
- Tailwind utilities and arbitrary values;
- hard-coded colors;
- CSS variables;
- inline styles;
- `!important`;
- theme providers;
- tenant overrides;
- runtime style injection;
- typography;
- spacing/radius/elevation patterns;
- browser-risk CSS;
- screenshots of critical routes.

Do NOT redesign during inventory.

### Wave 1 — Color census and token mapping

Cluster existing values by semantic usage.

Do not blindly merge visually similar colors. Determine intent and usage.

Create mapping:

`legacy value/class -> semantic token`

Flag ambiguous mappings for review.

### Wave 2 — Primitive normalization

Prioritize high-blast-radius primitives:

- Button
- Input
- Card
- Badge
- Dialog/Modal
- Tabs
- Menu
- Table primitives
- Form controls

### Wave 3 — Shared component migration

Rank components by:

`usage_count x severity x user_traffic x browser_failure_frequency`

Repair shared roots before page-specific symptoms.

### Wave 4 — Deterministic codemods

Use AST/CSS-aware codemods where safe.

Requirements:

- dry-run report;
- deterministic output;
- reversible change set;
- no arbitrary redesign;
- migration provenance;
- lint/test after batch.

Unsafe/ambiguous transformations go to targeted repair.

### Wave 5 — Canary routes

Select representative high-value routes, including:

- Chat
- Task Control
- Dashboard
- Settings
- Admin
- Media Studio
- Mini App host
- public-facing surface
- modal-heavy surface
- table/form-heavy surface

Do not expand migration until canaries pass browser and visual gates.

### Wave 6 — Broad migration

Migrate in bounded batches. Each batch requires conformance before proceeding.

### Wave 7 — Long-tail targeted repair

Only remaining failures are handed to an AI/UI provider.

Repair instruction must be equivalent to:

`preserve visual identity; repair the diagnosed conformance failure; do not redesign unrelated UI`.


### 10.1 Changed-Surface and Dependency Impact Detection

PR/task gating must not rely only on files directly edited. The system SHOULD maintain or derive a UI dependency graph:

```text
token -> primitive -> shared component -> feature component -> route -> Mini App
```

Changed-surface selection must expand through indirect dependencies.

Examples:

- changing `text.primary` can affect every route using it;
- changing Button internals affects routes even if route files were untouched;
- changing a tenant token affects that tenant's inheriting Mini Apps;
- changing a shared font or CSS reset can be global.

When dependency resolution is uncertain, the test scope must expand conservatively rather than claiming narrow coverage.

### 10.2 Migration Checkpoint and Resume

Long migrations must be resumable and idempotent.

Persist at least:

- completed migration wave/batch;
- source revision;
- token/contract version;
- codemod version;
- passed/failed surfaces;
- unresolved exceptions;
- rollback checkpoint.

Restarting a migration must not reapply destructive transformations or lose prior evidence.


---

## 11. Cross-Browser Conformance

Required automated engines:

- Chromium
- Firefox
- WebKit

Critical Safari/macOS release paths SHOULD additionally be tested on real Safari/macOS according to release policy, because automated WebKit is not equivalent to every Safari/OS/font/rendering condition.

Test categories:

- layout geometry
- clipping/overflow
- scroll behavior
- responsive breakpoints
- viewport height behavior
- safe-area behavior
- form controls
- focus/keyboard behavior
- modal/popover placement
- fonts/fallback
- CSS feature fallback
- theme rendering

A Chromium-only PASS MUST NOT be represented as a cross-browser PASS.


### 11.1 Safari Acceptance Tiers

Define explicit release tiers rather than treating all routes equally:

- **Tier A — Critical:** authentication, billing/credits, primary chat, Task Control, destructive/approval flows, Mini App creation/publish. Requires automated WebKit plus real Safari/macOS evidence for material UI changes before production release.
- **Tier B — High-use:** automated WebKit mandatory; real Safari smoke test on scheduled release cadence and when WebKit/visual risk changes.
- **Tier C — Low-risk/internal:** automated WebKit may satisfy normal release policy unless a defect/risk signal escalates it.

A known Safari-specific defect automatically escalates the affected surface until closure evidence exists.

### 11.2 Capability/Fallback Policy

Use feature detection and supported fallbacks for CSS/browser capabilities where required. Do not rely on user-agent sniffing as the primary compatibility mechanism.



### 11.3 Interaction-Capability Matrix

Viewport width alone is not a device model. Critical UI must also consider applicable input capabilities:

- coarse pointer/touch;
- fine pointer/mouse;
- hover available/unavailable;
- keyboard-only;
- trackpad/wheel scrolling;
- orientation change;
- virtual keyboard appearance on mobile/tablet.

Controls whose usability depends on hover must provide an equivalent non-hover path.


---

## 12. Visual Regression

Visual regression is required for critical and migrated surfaces.

Requirements:

- baseline versioning;
- route + viewport + theme + browser identity;
- tolerances for expected antialiasing/font differences;
- perceptual/structural comparison where appropriate;
- explicit baseline approval when intentional design changes occur;
- no automatic baseline replacement merely because a new screenshot was produced.

Pixel differences alone are insufficient for semantic correctness; visual regression complements computed-style and accessibility checks.


### 12.1 Visual Baseline Storage and Retention

Baseline/evidence storage must support reproducibility without uncontrolled growth.

Define:

- content-addressed or revision-linked identity;
- retention policy by risk tier;
- deduplication where safe;
- immutable audit reference for released critical surfaces;
- cleanup that does not orphan evidence receipts;
- storage quotas/alerts.

Baseline storage failure must not silently convert a required visual check into PASS.


---

## 13. Accessibility and UX Gates

At minimum:

- WCAG AA target for applicable content;
- keyboard navigation;
- visible focus;
- reduced-motion support where animation exists;
- text scaling/zoom resilience;
- no critical information conveyed only by color;
- semantic labels/roles;
- readable disabled/error/status states;
- touch target checks for mobile/tablet;
- content must not clip at supported viewport/text scaling conditions;
- forced-colors/high-contrast mode is usable where supported;
- OS/browser color-scheme changes do not create unreadable intermediate states;
- screen-reader-critical state changes use appropriate semantic/live-region behavior;
- RTL is supported when a product/locale requires it;
- localization expansion and Thai text wrapping are tested on representative critical surfaces.

---

## 14. UI UX Pro Max Integration

If used, register as:

```yaml
capability:
  category: design-intelligence
  executionAuthority: false
```

Allowed contributions:

- UX guidelines;
- product/industry design reasoning;
- typography/palette recommendations;
- accessibility guidance;
- anti-patterns;
- responsive guidance;
- stack-specific UI guidance;
- design-system recommendation inputs.

Forbidden:

- silently becoming the active UI generator;
- overriding the canonical Design Contract without an authorized design-change operation;
- introducing uncontrolled colors/components;
- bypassing SmartAIHub conformance gates.

SmartAIHub must remain functional if this provider is unavailable.


### 14.1 Design Intelligence Trust and Version Pinning

Design-intelligence providers can change independently. Their output is advisory input, not an unversioned hidden dependency.

When their recommendations materially influence a released Design Contract, provenance SHOULD record:

- provider identity;
- provider/skill/ruleset version where available;
- retrieval/query context or rule IDs where practical;
- acceptance/rejection decision.

Provider updates MUST NOT automatically rewrite released Design Contracts.


---

## 15. Mini App Creation Workflow

Every new Mini App follows:

```text
Mini App Intent
      ->
Functional/Domain Planning
      ->
Existing Design Discovery
      ->
Design Intelligence
      ->
Mini App Design Contract
      ->
Choose ONE UI Authority
      ->
Generate/Implement
      ->
UI Conformance
      ->
Functional Integration Verification
      ->
UAT
      ->
Evidence
      ->
Release
```

### 15.1 Design inheritance

Recommended hierarchy:

```text
SmartAIHub platform defaults
        ->
Tenant/brand contract (optional)
        ->
Mini App contract
        ->
Page/surface override
```

Lower levels override only explicitly declared semantics.

### 15.2 Mini App must not invent uncontrolled theme values

Brand input is normalized into semantic slots. The app consumes semantic tokens.

### 15.3 Mini App conformance

Before release:

- Design Contract validation;
- semantic token validation;
- contrast/accessibility;
- responsive checks;
- Chromium/Firefox/WebKit;
- critical visual regression;
- functional interaction checks;
- evidence receipt.

### 15.4 External deployment portability

A portable Mini App package SHOULD carry or materialize:

```text
miniapp/
  app/
  components/
  design/
    contract.json
    tokens.css
    theme.json
  tests/
    ui-conformance/
  assets/
```

Exact packaging may differ by stack, but external deployment must preserve equivalent semantics and tests.


### 15.5 Mini App Design Profiles

Mini Apps may have different visual identities without bypassing governance. Supported conceptual profiles include:

- `platform-native` — follows SmartAIHub visual language closely;
- `tenant-branded` — inherits tenant brand semantic mappings;
- `app-branded` — distinct approved app identity within accessibility/governance limits;
- `embedded-neutral` — designed for embedding in multiple hosts.

The selected profile is explicit in the Design Contract. A generator must not infer a new brand profile simply because it has creative freedom.

### 15.6 Host/Embed Boundary

For Mini Apps rendered inside a host shell, define and test:

- token/theme handoff;
- CSS isolation strategy;
- z-index/portal ownership;
- viewport/container query assumptions;
- host navigation/chrome boundaries;
- font ownership/fallback;
- safe-area behavior;
- no style leakage in either direction.

For externally deployed Mini Apps, the materialized design artifact becomes authoritative when the SmartAIHub host is absent.

### 15.7 Mini App Template and Upgrade Strategy

New Mini Apps should start from a versioned conformance-ready UI template/package where the target stack supports it. The template should include:

- semantic token wiring;
- base primitives;
- accessibility defaults;
- browser-test configuration;
- Golden/Smoke conformance fixtures;
- Design Contract loader/materializer.

Template upgrades must be explicit and migration-aware; existing Mini Apps are not silently rewritten when the platform template changes.



### 15.8 Host/App Contract Version Negotiation

When a Mini App is embedded in SmartAIHub, host and app may not always ship the same Design Contract/template version.

The host/app boundary must define:

- supported schema/version range;
- compatibility negotiation;
- behavior when no compatible version exists;
- whether the app uses host-provided tokens or its pinned materialized tokens;
- safe fallback that does not silently reinterpret token semantics.

An incompatible contract MUST fail clearly or fall back to a known materialized design; it must not partially merge unknown schemas.

### 15.9 Mini App Lifecycle States

UI conformance must cover lifecycle states beyond first creation:

- draft/preview;
- published;
- upgraded;
- tenant rebranded;
- duplicated/forked;
- exported/external deployment;
- imported/reconnected where supported;
- deprecated/archived.

A Mini App must retain sufficient contract provenance to explain its visual behavior after these transitions.


---

## 16. Intelligent Surface and Action Integration Boundaries

Generated surface and action semantics are consumed from the existing owners listed below. SPEC-287 governs visual design and rendered conformance only.

### 16.1 Canonical ownership

This spec MUST NOT independently define:

- action/tool/function invocation envelopes;
- authentication handoff format;
- authorization token format;
- capability identifiers if the canonical spec owns them;
- remote/background invocation protocol;
- MCP/WebMCP/A2A mapping rules owned by the canonical spec;
- retry/idempotency semantics owned by the canonical spec.

The former assumption that a separate Mini App function-invocation specification was still being drafted is stale. Integrations MUST use the current owners below; the referenced specs' current revisions and implementation state are tracked in the dated alignment evidence under this Spec's `handoff/evidence/` directory.

| Concern | Canonical owner | SPEC-287 responsibility |
|---|---|---|
| Generated surface envelope, declarative component schema, safe component registry/compiler, streaming revisions, and action-binding request contract | Spec 240 | Apply the Design Contract and rendering/conformance gates to the surface; do not fork its protocol. |
| Presentation mode/layout selection, fit, and safe presentation fallback | Spec 299 | Apply design/rendering conformance to the selected surface; do not add a competing presentation router. Its mapping and runtime implementation remain subject to its canonical handoff/evidence. |
| Provider-neutral design-time generation, Astryx/Stitch adapters, design artifact lifecycle | Spec 270 | Consume its approved design artifact/provider interfaces; do not turn a design provider into runtime authority. |
| Assistant intent and conversation orchestration | Spec 269; capability discovery through Spec 256 | Define visual/presentation conformance only; do not add a second intent router or assistant runtime. |
| User/client command and task-control mapping | Spec 226; Spec 277 for task-control experience | Render the existing action/task state with governed components; do not create another command bus. |
| Agent-originated command ingress and delegation | Spec 279 | Use only for its agent-to-orchestrator ingress/delegation profile; it is not the generic Mini App UI action protocol. |
| Tenant, principal, project/resource authorization and policy | Spec 220 | Require server-side reauthorization at action execution and data access; UI state is never authority. |
| Credit/budget quote, reservation, metering and settlement | Spec 207 | Require the existing economic gate where applicable; do not add a UI-owned ledger. |
| Durable long-running execution, retries, leases, fencing, events and outbox | Feature 195 (`worker_jobs` + outbox) | Require canonical jobs for applicable long-running work; do not create a second queue or finality store. |
| Portable application/backend contract and deployment boundary | Spec 288; portable application standard Spec 261 | Require versioned host/app compatibility and portable contracts; do not deploy generated code with Core credentials. |
| Mini App knowledge/RAG portability | Spec 281; retrieval authority Spec 229 and memory/context authority Spec 268 | Consume scoped retrieval/context interfaces; do not introduce a new memory or vector authority. |
| Mini App productization and lifecycle | Spec 209 product/lifecycle portions, subject to the retired-workflow boundary in repository policy | Reuse app identity, publication and marketplace contracts only; never revive the retired `/workflows` engine. |

If any owner or revision cannot be verified from canonical source and handoff evidence, retain the relationship as unresolved and stop before introducing a new protocol. A path prefix, document date, or self-declared PASS count is not authority evidence.

### 16.2 What this spec owns

This spec MAY define UI-side presentation semantics such as:

- how an available action is represented visually;
- loading/pending/success/error UI states;
- confirmation surfaces;
- permission-required presentation;
- destructive-action visual treatment;
- disabled/unavailable presentation;
- progress presentation;
- responsive behavior;
- accessibility;
- design conformance.

### 16.3 Presentation decision and rendering sequence

The experience may choose text, structured data, a transient interactive surface, or a persistent Mini App. That choice changes presentation only; it MUST NOT change execution authority, permissions, billing, or data ownership.

```text
User intent / authorized task context
  -> existing assistant and capability routing (Spec 269; Spec 256 only after authority reconciliation)
  -> existing presentation mode/fit/fallback selection (Spec 299)
  -> text | structured result | transient surface | persistent Mini App
  -> Spec 240 surface proposal, schema validation, allowlisted component resolution
  -> incremental, revision-fenced surface update
  -> SPEC-287 Design Contract and renderer conformance
  -> trusted host action dispatch (Spec 226; agent-originated delegation may use Spec 279)
  -> server-side authorization/policy (Spec 220)
  -> budget and metering (Spec 207), and trusted human approval where policy requires
  -> canonical durable worker job/outbox when long-running (Feature 195)
  -> authoritative result, audit receipt, and a newly authorized surface revision
```

The LLM or external provider MAY propose a presentation kind and data values. The authenticated server MUST bind tenant, principal, project/resource scope, schema version, component registry version, and action references. Generated UI data and events are untrusted input. Generated code MUST NOT execute with direct backend credentials or direct database/network authority. Every action MUST be validated and authorized server-side at invocation and again at the authoritative mutation boundary where required.

Streaming MUST validate each complete patch before visible commit and bind it to the surface ID, sequence, base/next revision, schema version, and digest. Duplicate or out-of-order patches are deduplicated/replayed or trigger a full snapshot; patches that alter a privileged action fail closed. Reconnect, resume, device switch, or promotion to a persistent Mini App reloads canonical state and reauthorizes every binding. If rich rendering fails or is unsupported, preserve the original result and offer a safe text/structured fallback; never convert a failed render into successful action completion.

Responsive web, mobile, tablet, and desktop projections MUST preserve semantic meaning and action policy while adapting layout and input modality. Agent/headless consumers use the same typed capability/action contracts without opening a UI; the renderer is an optional projection, not a prerequisite for execution.

### 16.4 Adapter requirement

Implement only thin compatibility adapters where required by the host/runtime boundary:

```text
Mini App UI
   |
   v
UI Action Binding Adapter
   |
   v
Spec 226 user/client action mapping or Spec 279 agent-originated command ingress
   |
   v
Spec 220 policy -> Spec 207 economic gate (when applicable) -> Feature 195 worker_jobs/outbox (when durable)
```

The UI MUST NOT embed provider-specific invocation logic, credentials, authorization decisions, or direct backend access. The UI MUST NOT call the retired `/workflows` engine.

### 16.5 Offline/remote/headless compatibility

The Design Contract is independent from whether a function executes:

- locally;
- in SmartAIHub;
- through a Runner;
- remotely;
- in background;
- through another authorized harness.

The canonical owner for each execution path in §16.1 owns those semantics.

---

## 17. Existing UI Preservation Policy

Functional work does not grant design authority.

Examples:

- adding Export must not silently change card colors;
- fixing an API call must not redesign navigation;
- repairing Safari overflow must not restyle the whole page.

Unrelated visual changes are rejected unless the task explicitly includes a design change.

---

## 18. Caching and Build Correctness

Because source changes may fail to appear due to stale or overridden assets, conformance tooling must distinguish:

- source revision;
- generated CSS revision/hash;
- frontend bundle identity;
- service-worker/cache state where applicable;
- deployed artifact identity;
- runtime theme configuration.

Tests must not accidentally validate an old cached build.

Where practical, test harnesses should use deterministic cache-busting or clean contexts.


### 18.1 Runtime Configuration Precedence

The effective style/config precedence must be documented and machine-inspectable. At minimum, the implementation must define ordering among:

- platform defaults;
- compiled tokens;
- tenant theme;
- Mini App theme;
- page/surface overrides;
- user preference (where permitted);
- runtime state;
- emergency/accessibility overrides.

No provider may introduce an undocumented precedence layer.

### 18.2 Service Worker and CDN Deployment Verification

When service workers/CDN caches are used:

- asset revisioning must prevent mixed old/new CSS/JS bundles;
- deployment smoke tests must verify the production/staging URL serves the intended artifact;
- service-worker update behavior must be tested;
- rollback must restore a coherent asset set, not a mixed version.


---

## 19. Multi-Tenant and Branding

Tenant branding must map into constrained semantic tokens rather than arbitrary component-level styles.

Requirements:

- tenant cannot make required text/control contrast invalid without validation failure;
- platform safety/status semantics remain distinguishable;
- tenant theme is versioned;
- tenant override provenance is inspectable;
- Mini Apps inherit tenant branding only when policy permits;
- externally deployed Mini Apps can materialize the tenant/app theme without requiring private SmartAIHub internals.

---

## 20. Repair Loop

```text
FAIL
  ->
Classify root cause
  ->
Prefer highest shared/root cause
  ->
Repair with same UI authority
  ->
Run affected tests
  ->
Run regression boundary
  ->
PASS or repeat
```

Failure classes include:

- token resolution;
- CSS cascade/specificity;
- theme override;
- component defect;
- browser compatibility;
- accessibility;
- visual regression;
- page-specific layout;
- stale build/cache;
- font/fallback;
- provider output violating Design Contract.

Repeated blind edits without updated diagnostic evidence are prohibited.


### 20.1 Repair Budget and Escalation

Automated repair must have bounded attempts per failure class. After the configured threshold:

- stop blind mutation;
- preserve evidence;
- escalate the unresolved root cause;
- do not weaken tests, contrast thresholds, browser matrix, or visual baselines merely to obtain PASS.

A repair loop that passes only by deleting/loosening the failing assertion is invalid unless the governing requirement itself was explicitly changed and approved.


---

## 21. Orchestra / Development Harness Integration

UI work should become a first-class gated workflow:

```text
Plan
 -> UI impact detection
 -> Design Contract resolution
 -> UI authority lock
 -> Implement
 -> Static UI lint
 -> Build
 -> Rendering verification
 -> Browser matrix
 -> A11y/contrast
 -> Visual regression
 -> Repair loop
 -> Evidence receipt
 -> Final Verify
```

### Status semantics

- `IMPLEMENTED`: source change exists.
- `BUILT`: target build artifact succeeded.
- `RENDERED`: browser rendered target artifact.
- `CONFORMANT`: required UI gates passed.
- `VERIFIED`: evidence satisfies task/release policy.

`IMPLEMENTED` MUST NOT be promoted directly to `VERIFIED`.


### 21.1 Gate Outcome Semantics

Every required gate must return one of:

```text
PASS | FAIL | BLOCKED_INFRA | NOT_APPLICABLE
```

Rules:

- timeout/browser crash/test-service outage is `BLOCKED_INFRA`, not PASS;
- `NOT_APPLICABLE` requires a recorded reason/policy;
- required `FAIL` or `BLOCKED_INFRA` prevents VERIFIED unless an explicit release policy authorizes a documented exception;
- reruns must preserve prior failed/blocked evidence rather than erase history.

This prevents infrastructure instability from being mistaken for product conformance.

### 21.2 Provider Degraded Mode

If Astryx, Stitch, or optional Design Intelligence is unavailable:

- existing UI remains operable;
- no provider outage may corrupt/replace the active Design Contract;
- work may fall back only through the explicit UI-authority handoff policy;
- if no authorized provider is available, task status becomes BLOCKED rather than mixing providers or bypassing gates;
- optional design-intelligence outage must not block deterministic conformance validation of already-defined contracts.

### 21.3 PR / Change Gate Integration

For UI-impacting changes, the development harness should:

1. detect direct and indirect UI impact;
2. resolve contract/authority;
3. run static checks;
4. select risk-based browser/visual matrix;
5. emit machine-readable gate summary;
6. attach evidence to the existing task/review mechanism;
7. prevent Final Verify on unresolved required failures.

A documentation-only or proven non-UI change may skip expensive browser gates only when changed-surface analysis records why.


---

## 22. Evidence and Audit

Every material UI migration or generated Mini App should retain enough evidence to answer:

- Which Design Contract was used?
- Which UI authority produced the change?
- Was there a provider handoff?
- Which browser/viewport/theme was tested?
- What failed?
- What repaired it?
- Did the actual computed style match the token?
- Was the screenshot based on the correct build?
- Which intentional visual changes changed the baseline?

Evidence should integrate with the platform's existing task/evidence/audit mechanisms rather than create an unrelated audit store.


### 22.1 Evidence Integrity and Schema Versioning

Evidence receipts must themselves be versioned and tamper-evident enough for the platform's audit requirements.

At minimum:

- evidence schema version;
- immutable references/hashes for material artifacts where practical;
- producer/tool version;
- linkage to task/run/source revision;
- supersession rather than silent mutation of released evidence.

Do not create a second independent audit system if existing SmartAIHub evidence/provenance infrastructure can satisfy these requirements.


---

## 23. Security and Privacy

- Test pages/harness routes must not expose secrets or privileged production data.
- Internal conformance routes must be disabled, protected, or excluded appropriately in production.
- Screenshots/evidence must respect tenant boundaries and data classification.
- External Mini App packages must not embed private tokens or internal credentials.
- Theme/config provenance must not leak secrets.
- Future action invocation uses the canonical authorization model from the separate spec.


### 23.1 Style Runtime Security

UI theming/generation must not weaken browser security controls.

Requirements:

- user/tenant-provided theme values are schema-validated and encoded as data, not executable CSS/HTML;
- disallow unsafe CSS constructs/URLs according to platform policy;
- runtime style injection must be compatible with the platform CSP strategy;
- nonce/hash handling, if required, must be deterministic and documented;
- Trusted Types or equivalent DOM-injection protections must remain compatible where enabled;
- generated UI must not require `unsafe-inline` merely for convenience;
- external font/icon/style origins require explicit allowlisting and privacy/security review;
- CSS must not be used as an unintended data-exfiltration channel.

Mini App external deployment may define its own CSP, but exported templates SHOULD provide a secure baseline.


---

## 24. Performance Constraints

Governance must not materially degrade production rendering.

Guidelines:

- design intelligence runs at design/generation time, not every paint;
- tokens compile/materialize efficiently;
- conformance tests run in CI/dev/UAT rather than blocking every normal user render;
- runtime theme switching should avoid excessive style recalculation;
- visual matrices may be risk-tiered, but required release gates cannot be silently skipped.


### 24.1 Test Matrix Risk Budget

Full Cartesian testing of every route × browser × viewport × theme × tenant can be prohibitively expensive. The implementation must use a deterministic risk-based matrix without creating blind spots.

Required approach:

- full matrix for Golden Surface and Tier A critical flows;
- representative pairwise/risk-weighted matrix for broad low-risk surfaces;
- impacted-surface expansion based on dependency/blast-radius analysis;
- scheduled broader sweep;
- automatic escalation after browser-specific or visual regressions.

Test reduction must be recorded in evidence; it must never be represented as full coverage.

### 24.2 Observability

Track at minimum:

- conformance pass/fail rate;
- failures by browser;
- failures by root-cause class;
- repeated repair count;
- arbitrary-color violations;
- contract/version distribution;
- Mini Apps on deprecated contract/template versions;
- Safari-specific regressions;
- visual baseline churn.

This enables the governance system itself to be evaluated rather than becoming an opaque gate.



### 24.3 Performance and Layout Stability Budgets

Conformance should capture regressions caused by UI governance itself.

At minimum for critical surfaces, track:

- layout shifts caused by fonts/theme/hydration;
- excessive stylesheet/token payload growth;
- duplicate CSS introduced by multiple projections;
- theme-switch latency;
- excessive runtime style recalculation;
- interaction blocking caused by visual initialization.

Performance budgets may vary by surface, but a migration that fixes color while materially degrading usability is not a successful migration.

### 24.4 Test Data and Privacy Boundary

Browser/visual tests should prefer deterministic synthetic or sanitized fixtures. If production-like data is required:

- minimize data;
- enforce tenant isolation;
- redact sensitive content from screenshots/evidence;
- define evidence retention/access policy;
- prevent test artifacts from becoming an uncontrolled secondary data store.



### 24.5 Conformance Infrastructure Health

The test platform itself must expose health/version information:

- browser binaries/versions;
- OS/runtime image identity;
- font package identity;
- screenshot engine/version;
- test harness version;
- capacity/queue saturation;
- infrastructure error rate.

Unexpected infrastructure-version changes can invalidate visual baselines and should trigger controlled revalidation rather than mass baseline acceptance.


---

## 25. Rollout Plan

### M0 — Discovery
- identify current Spec 240/270 contracts and implementation seams;
- inventory UI stacks/theme systems;
- locate existing visual/browser test infrastructure;
- define integration points without breaking implemented providers.

### M1 — Governance foundation
- Design Contract schema;
- UI authority lock/handoff;
- semantic token schema;
- lint rules;
- provenance.

### M2 — Rendering forensics
- computed-style inspection;
- cascade/override diagnostics;
- artifact/cache identity;
- Golden Conformance Surface;
- canary mutation proof.

**Exit gate:** prove `token -> CSS -> computed style -> rendered visual`.

### M3 — Browser/a11y/visual gates
- Chromium/Firefox/WebKit;
- contrast/a11y;
- visual regression;
- evidence receipts.

### M4 — SmartAIHub canary migration
- token census;
- primitive normalization;
- representative routes;
- no broad rollout until canaries pass.

### M5 — SmartAIHub broad migration
- shared components;
- codemods;
- bounded waves;
- targeted repair.

### M6 — Mini App integration
- creation pipeline;
- inheritance;
- portable contract/package;
- conformance harness.

### M7 — Existing action/command adapters
Consume the existing Spec 226 user/client action mapping and Spec 279 agent-ingress boundary. Keep each adapter thin and defer authorization, economic decisions, and durable execution to their canonical owners.

### M8 — Enforcement
- new UI work cannot bypass authority/contract/conformance;
- exceptions require explicit policy and evidence.

---

## 26. Acceptance Criteria

### Architecture
- [ ] No fourth UI generator introduced.
- [ ] Exactly one active UI execution authority per run.
- [ ] Explicit auditable provider handoff.
- [ ] Design Contract is persistent, versioned, immutable after release, and compatibility-aware.
- [ ] Effective inherited contract can be materialized with provenance.
- [ ] Parallel UI authority conflicts are detectable/reconcilable.
- [ ] High-blast-radius token changes produce impact evidence.
- [ ] One canonical token registry owns semantic token definitions.
- [ ] Generated token projections cannot silently become competing sources of truth.
- [ ] Legacy exceptions are scoped, observable, and burn down over time.
- [ ] Visual baseline ownership/approval is explicit and cannot be silently self-approved by the repair agent.
- [ ] Shared component API/behavior compatibility is checked during migration.
- [ ] UI UX Pro Max, if present, is design-intelligence only.
- [ ] Presentation choice can resolve to text, structured result, an allowed transient surface, or an explicitly promoted Mini App without changing execution authority.
- [ ] Generated surface schemas and components are validated against a pinned allowlist/version; generated code cannot execute with backend credentials or direct backend access.
- [ ] Incremental updates are schema-validated, ordered and revision-fenced; invalid/unsupported surfaces preserve the original result through a safe fallback.
- [ ] Authorized headless agents can invoke the same capability/action contracts without opening the renderer.

### Color
- [ ] Semantic color taxonomy exists.
- [ ] New arbitrary production colors are linted/rejected except approved cases.
- [ ] Contrast is automatically checked.
- [ ] Interaction states are covered.
- [ ] Tenant branding cannot bypass contrast policy.

### Rendering
- [ ] Golden Conformance Surface exists.
- [ ] Canary mutation proves source-to-render propagation.
- [ ] Computed style is captured for critical token checks.
- [ ] Override/cascade diagnostics are available.
- [ ] Build/cache identity prevents stale-result false PASS.
- [ ] Portal/Shadow DOM/iframe/runtime-style boundaries are covered where used.
- [ ] SSR/hydration/first-paint theme correctness is verified where applicable.
- [ ] Font fallback and Thai/mixed-language rendering are covered.
- [ ] Visual-test environment controls nondeterministic data/animation/time/font inputs.
- [ ] Transparency/gradient effective contrast is handled where applicable.

### Browser
- [ ] Chromium automated gate.
- [ ] Firefox automated gate.
- [ ] WebKit automated gate.
- [ ] Real Safari/macOS policy exists for critical release paths.
- [ ] Responsive mobile/tablet/desktop coverage exists.
- [ ] Tier A surfaces have real Safari/macOS acceptance policy/evidence.
- [ ] Feature fallback uses capability detection rather than primary UA sniffing.
- [ ] Touch/coarse-pointer/hover/keyboard interaction capability is tested independently from viewport.

### Legacy migration
- [ ] Inventory before edits.
- [ ] Baseline before migration.
- [ ] Shared/root fixes prioritized.
- [ ] Safe codemods are reversible/auditable.
- [ ] Canary pages pass before broad migration.
- [ ] Long-tail repairs preserve existing visual identity.
- [ ] Indirect UI dependencies expand changed-surface test scope.
- [ ] Migration batches are resumable/idempotent with checkpoints.

### Mini Apps
- [ ] Every new Mini App resolves/creates a Design Contract.
- [ ] Every generation run selects one UI authority.
- [ ] Mini App passes the same core conformance gates.
- [ ] Contract/tokens can travel with external deployment.
- [ ] Mini App design profile is explicit.
- [ ] Host/embed CSS/theme isolation is defined.
- [ ] Mini App UI template/version upgrades are migration-aware.
- [ ] Embedded host/app Design Contract version negotiation is defined.
- [ ] Mini App lifecycle transitions preserve design provenance.
- [ ] Optional design-intelligence/provider outage has a defined degraded mode.
- [ ] Function invocation is not redefined here.
- [ ] User/client actions use Spec 226 and are reauthorized by Spec 220.
- [ ] Agent-originated command ingress uses Spec 279 only within its declared profile.
- [ ] Applicable billing and durable execution use Specs 207 and Feature 195.
- [ ] Human approval is rendered in trusted host chrome and bound to current server-resolved action, target, effect and cost.
- [ ] Transient-to-persistent promotion is explicit, versioned, portable and rollbackable; it does not auto-deploy generated code.

### Completion semantics
- [ ] Source change alone cannot produce UI VERIFIED.
- [ ] Final Verify requires rendered evidence according to risk policy.
- [ ] Failures enter a diagnosed repair loop rather than blind repeated editing.
- [ ] Required gate outcomes distinguish product FAIL from BLOCKED_INFRA.
- [ ] Evidence schema/artifact identity is versioned and linked to source/run.
- [ ] Conformance infrastructure version/health is observable.

---

## 27. Required Tests

At minimum:

1. semantic token resolution;
2. token inheritance and page override;
3. tenant theme mapping;
4. invalid contrast rejection;
5. arbitrary color lint rejection;
6. allowed visualization exception;
7. UI authority exclusivity;
8. explicit handoff preserving Design Contract;
9. functional-only task preserving UI;
10. Golden Surface token mutation detection;
11. computed-style expected/actual comparison;
12. CSS specificity override diagnosis;
13. inline style override diagnosis;
14. `!important` detection;
15. stale build/cache detection;
16. Chromium render;
17. Firefox render;
18. WebKit render;
19. responsive mobile/tablet/desktop;
20. keyboard/focus;
21. reduced motion;
22. text zoom/scaling;
23. visual baseline comparison;
24. intentional baseline approval flow;
25. component blast-radius migration;
26. codemod dry-run and rollback;
27. Mini App contract generation;
28. Mini App tenant inheritance;
29. external Mini App token materialization;
30. user/client and agent-originated adapters resolve to their existing canonical owners;
31. Design Contract released-version immutability;
32. schema compatibility and migration;
33. inheritance cycle rejection and effective-contract provenance;
34. token-change blast-radius report;
35. parallel authority conflict detection;
36. portal/pseudo-element style verification;
37. iframe/embedded Mini App isolation where applicable;
38. Shadow DOM/runtime-style boundary where applicable;
39. SSR/hydration theme consistency;
40. first-paint/FOUC regression;
41. font load failure/fallback;
42. Thai + English mixed-content wrapping and glyph coverage;
43. forced-colors/high-contrast usability where supported;
44. localization expansion/long-label resilience;
45. real Safari Tier A smoke/acceptance flow;
46. service-worker/CDN mixed-asset prevention;
47. Mini App host style-leakage prevention;
48. Mini App template upgrade compatibility;
49. repair-attempt budget/escalation;
50. risk-matrix coverage evidence and observability metrics;
51. canonical token registry/projection drift detection;
52. token alias-cycle rejection and deprecation migration;
53. legacy exception scope/expiry/burn-down reporting;
54. alpha/transparent/gradient effective contrast;
55. deterministic screenshot environment under animation/time/network variance;
56. touch/coarse-pointer/no-hover interaction path;
57. mobile virtual-keyboard/orientation resilience on critical forms;
58. host/Mini App Design Contract version negotiation;
59. incompatible host/app schema safe failure/fallback;
60. Mini App lifecycle provenance across publish/upgrade/export;
61. CSP-compatible runtime theming without unnecessary unsafe-inline;
62. malicious/invalid tenant theme value rejection;
63. external font/style origin allowlist behavior;
64. layout-shift/theme/font performance regression;
65. visual evidence privacy/redaction and tenant-isolation behavior;
66. baseline approval separation from automated repair producer;
67. bulk baseline regeneration impact/approval;
68. shared component API/ARIA/event compatibility across migration;
69. indirect changed-surface expansion from token/shared-component edits;
70. conservative test expansion when dependency graph is uncertain;
71. migration checkpoint resume/idempotency;
72. visual baseline storage failure returns BLOCKED_INFRA;
73. design-intelligence provider/ruleset provenance and version pinning;
74. provider outage explicit handoff/degraded mode;
75. no-provider-available task BLOCKED behavior;
76. browser crash/timeout/test-service outage classification;
77. NOT_APPLICABLE gate reason enforcement;
78. evidence receipt schema/version/artifact linkage;
79. conformance infrastructure version-change detection;
80. documentation/non-UI change browser-gate skip with recorded impact proof.

R1.5 adds these required intelligent-surface cases:

81. presentation selection covers text, structured output, transient UI and persistent Mini App, with policy-constrained fallback;
82. malformed, oversized, deeply nested, unknown-version and unknown-component schemas fail closed;
83. duplicate, missing, stale and out-of-order stream patches are deduplicated, replayed or replaced by an authorized full snapshot;
84. generated UI cannot supply tenant/principal scope, privileged component definitions, backend credentials or arbitrary network access;
85. forged, cross-tenant, stale, revoked, replayed and double-submitted actions are denied at server execution;
86. high-risk action approval uses trusted host UI and server-resolved target/effect/cost, with expired approval producing no effect;
87. billable durable action produces canonical quote/reservation/settlement and worker_job/outbox receipts without duplicate charge/effect on retry;
88. an authorized headless agent invokes the same typed capability without creating or requiring a UI session;
89. explicit transient-to-Mini-App promotion verifies provenance, package/version compatibility, host isolation, rollback and external deployment boundary;
90. local/provider/protocol absence, renderer error, reconnect and unsupported mobile capability preserve readable results and never imply execution success.

---

## 28. Failure / Rollback Strategy

If a migration wave causes unacceptable regressions:

- stop subsequent waves;
- retain diagnostic evidence;
- revert the bounded migration batch;
- do not revert the governance foundation unless it is itself defective;
- fix root cause;
- rerun canary;
- resume only after conformance.

Design baseline updates require explicit approval and must never be used to hide regressions.

---

## 29. Dependency Rules

### Existing/implemented systems

This spec is additive and should integrate through existing extension seams wherever possible. It MUST avoid breaking implemented UI providers merely to conform to a new internal shape.

### Spec 240

Spec 240 owns generated interactive surfaces and their safe runtime contract. This spec supplies design governance and rendering conformance. Its current source is proposed and implementation is unverified in canonical handoff; do not treat its architecture as implementation evidence or duplicate it here.

### Spec 270

Spec 270 owns provider-neutral design-time generation and its design artifact lifecycle. It is separate from runtime surface/action execution. Its current source is proposed and implementation is unverified in canonical handoff; do not assume provider or runtime acceptance.

### Spec 271

Reuse UAT/browser/computer-use capabilities where available for conformance and evidence rather than building duplicate harness infrastructure.

### Spec 256 / capability discovery

Use existing capability discovery/registration seams. Do not hard-code a third-party skill into core routing.

### Specs 226 and 279 — action and command boundaries

Spec 226 owns user/client command and task-control mapping; Spec 279 owns agent-to-orchestrator command ingress and delegation. Neither makes the UI itself an authorization grant. Spec 220 reauthorizes protected actions, Spec 207 owns economic controls, and Feature 195 owns applicable durable execution. The dated R1.5 evidence records current revisions and unresolved implementation status.

---

## 30. Implementation Guardrails for Coding Agents

Before modifying UI:

1. resolve the active Design Contract;
2. determine whether the task grants design authority;
3. acquire/verify the UI authority lock;
4. inspect existing components before creating duplicates;
5. prefer semantic tokens;
6. preserve unrelated UI;
7. never report color/style success from source diff alone;
8. render and inspect required browser evidence;
9. diagnose failed propagation before repeated edits;
10. keep Mini App actions behind the existing canonical action/command and server authorization boundaries in §16.

For legacy migration:

- do not mass-replace ambiguous colors;
- do not use an LLM to redesign hundreds of pages;
- do not combine Astryx/Stitch/AI-native output in one run without explicit handoff;
- do not auto-accept new screenshots as baselines.

---


## 31. Gap Review Record — 12 Passes

This R1.1 revision was reviewed across twelve independent dimensions:

1. **Authority/conflict pass** — added concurrent authority lease/reconciliation semantics.
2. **Design-contract pass** — added lifecycle, immutability, schema compatibility, inheritance materialization and provenance.
3. **Color/token pass** — added governed blast-radius requirements for global token changes.
4. **CSS/rendering-causality pass** — expanded for portals, pseudo-elements, Shadow DOM, iframe, CSS-in-JS, SVG/canvas boundaries.
5. **Safari/browser pass** — added explicit Safari acceptance tiers and capability/fallback policy.
6. **SSR/runtime pass** — added hydration, first-paint/FOUC and runtime precedence requirements.
7. **Typography/localization pass** — added font failure, Thai/mixed-language, long-label and localization-expansion coverage.
8. **Accessibility pass** — expanded forced-colors/high-contrast, semantic state announcement and locale-sensitive layout requirements.
9. **Legacy migration pass** — retained bounded waves/canaries and strengthened blast-radius/rollback evidence.
10. **Mini App pass** — added design profiles, host/embed isolation, versioned templates and upgrade policy.
11. **Operations/evidence pass** — added service-worker/CDN coherence, bounded repair attempts, risk-based test matrix and observability.
12. **Future invocation-boundary pass** — revalidated that function/action execution protocol remains deferred and no competing invocation standard is introduced here.

No pass authorizes rewriting already-implemented providers unnecessarily. Gaps should be closed through adapters, governance seams, and incremental migration first.

---


## 31A. Second Independent Gap Review — 12 Passes (R1.2)

R1.2 performed another independent twelve-pass review of the already gap-closed R1.1 baseline:

1. **Token source-of-truth pass** — added canonical registry, ownership, projection identity, aliases and deprecation.
2. **Legacy coexistence pass** — added scoped escape hatch/debt ledger to avoid either big-bang migration or permanent bypass.
3. **Color-compositing pass** — added alpha, gradients/background composition and color-space considerations.
4. **Visual determinism pass** — added controls for animation, time, network data, locale, fonts, scale and dynamic regions.
5. **Device-input pass** — separated touch/coarse pointer/hover/keyboard/orientation/virtual-keyboard from viewport width.
6. **Mini App compatibility pass** — added host/app Design Contract version negotiation and incompatible-schema behavior.
7. **Mini App lifecycle pass** — added provenance requirements across publish, upgrade, rebrand, fork and export.
8. **Security pass** — added CSP, Trusted Types compatibility, unsafe style/URL prevention and external-origin policy.
9. **Performance pass** — added layout stability, CSS/token payload, theme-switch and recalculation budgets.
10. **Privacy/evidence pass** — added deterministic sanitized fixtures, screenshot redaction and tenant-isolation requirements.
11. **Test/acceptance pass** — expanded required tests from 50 to 65 and linked new gaps to explicit acceptance criteria.
12. **Architecture-boundary pass** — revalidated single UI authority and additive provider integration; R1.5 supersedes its historical future-Spec invocation assumption.

R1.2 intentionally does not invent the pending Mini App function-invocation standard and does not require destructive rewrites of implemented Spec 240/270 providers.

---


## 31B. Third Independent Gap Review — 12 Passes (R1.3)

R1.3 performed a further implementation/operations-focused review of R1.2:

1. **Baseline governance pass** — added owner/approver/provenance and prohibited silent repair-agent self-approval.
2. **Component compatibility pass** — added behavioral/API/ARIA/event contracts so visual migration cannot hide functional breakage.
3. **Dependency-impact pass** — added indirect changed-surface expansion from token/component/theme dependencies.
4. **Migration durability pass** — added checkpoint/resume/idempotency requirements for long migration waves.
5. **Baseline-storage pass** — added retention/dedup/audit linkage and fail-closed behavior.
6. **Provider provenance pass** — added design-intelligence ruleset/version provenance without making it a runtime authority.
7. **Gate-semantics pass** — separated PASS/FAIL/BLOCKED_INFRA/NOT_APPLICABLE.
8. **Degraded-mode pass** — added provider outage behavior and explicit fallback/blocking rules.
9. **PR integration pass** — made UI impact detection and evidence attachment concrete for development/Final Verify.
10. **Evidence-integrity pass** — added evidence schema versioning and immutable artifact/source linkage.
11. **Infrastructure-health pass** — added browser/OS/font/harness version observability to prevent invalid baseline churn.
12. **Boundary/regression pass** — reconfirmed additive integration, Mini App portability, and single UI authority; R1.5 supersedes its historical future-Spec invocation assumption.

Required tests now total **80**. These additions close implementation and operational failure modes without expanding SPEC-287 into the separate function-invocation domain.

---

## 32. Definition of Done

This specification is implemented only when:

- SmartAIHub has one enforceable UI governance path above all generators;
- token changes can be proven from source through computed style to rendered output;
- Safari/WebKit is a real test target;
- existing UI can be migrated incrementally without page-by-page redesign;
- Mini Apps automatically receive the same Design Contract and conformance model;
- external Mini Apps retain portable visual semantics;
- UI UX Pro Max can contribute intelligence without becoming a competing generator;
- functional invocation remains delegated to the existing canonical owners listed in §16;
- semantic tokens have a single governed source of truth and legacy exceptions are measurable debt;
- embedded Mini Apps negotiate Design Contract compatibility instead of partially merging incompatible schemas;
- runtime theming remains compatible with CSP/security policy and visual evidence respects tenant/privacy boundaries;
- visual baselines have independent approval governance and cannot be silently rewritten to manufacture PASS;
- UI-impact analysis follows indirect dependencies, and long migrations can checkpoint/resume safely;
- infrastructure failures are distinguished from product failures and cannot silently become PASS;
- shared-component visual migration preserves or explicitly migrates functional/API/accessibility behavior;
- Orchestra cannot close material UI work as VERIFIED without the required rendered evidence.

---

## 33. Expected Outcome

After implementation, the question is no longer:

> "Which AI made this page, and did the color change actually show up?"

Instead the system can answer deterministically:

- what design contract governs the surface;
- which single provider had execution authority;
- what semantic token should apply;
- what CSS value actually won;
- what Chromium/Firefox/WebKit rendered;
- whether contrast/accessibility passed;
- whether the visual result regressed;
- and what evidence justified Final Verify.

This turns UI generation from provider-dependent styling into a governed, portable, testable platform capability for both SmartAIHub and Mini Apps.

## R1.4 Additive shared App and Project context primitives — 2026-10-07

Shared UI contracts MAY provide `ProjectContextChip`, `ProjectPicker`, `ProjectAmbiguityPrompt`, `NoProjectState`, `CreateProjectFlow`, `ChatSurface`, `ChatSkinProfile`, `AppShell`, and `AppHome`. They consume project resolution from SPEC-302, memory policy from SPEC-268, shared conversation runtime from SPEC-269, and stable app identity from SPEC-304; UI components MUST NOT create a competing identity, memory, or conversation authority. Project context is visible and accessible without obscuring the primary task. Picker choices include recommended authorized candidates, recent/active projects, authorized search, `No Project`, and `Create New Project` where allowed. Ambiguous context MUST be presented before a durable shared write. App Home may compose Continue, Saved, Recent, My Apps, My Assets, Purchased, Subscribed/Hosted, Recommended, Official, Trending, and Discover. `Official` is a certification badge, not an ownership claim. Existing dashboards/routes are migrated only with their owning Spec and explicit compatibility evidence. Project picker and ambiguity states MUST work at mobile widths, support keyboard-only operation, expose accessible names/roles/status to assistive technology, preserve focus on open/close, announce resolver/loading/error state, and provide a non-color-only distinction between active, pending, and no-project states.

## R1.5 Intelligent UI architecture alignment — 2026-10-08

R1.5 replaces the stale future-invocation dependency with the verified cross-Spec ownership map in §16. It aligns generated interactive UI with Spec 240, design-time provider behavior with Spec 270, user/client action mapping with Spec 226, agent delegation with Spec 279, and canonical policy/economic/execution authority with Specs 220/207 and Feature 195. It adds no second component registry, action bus, permission engine, billing ledger, memory store, task queue, or workflow runtime.

The product-level architecture and evidence-backed impact matrix, ten-pass gap audit, P0–P7 roadmap, test/acceptance matrix, and current implementation limitations are recorded in `handoff/evidence/intelligent-ui-architecture-alignment-2026-10-08.md`. That artifact is a document/repository audit; it does not certify production implementation, deployment, or acceptance.
