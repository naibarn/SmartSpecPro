# Spec 209 Implementation Plan

**Goal:** Implement the core Workflow Studio and Mini App experience using the
approved mockups as the UI contract and canonical platform boundaries as the
runtime contract.

**Architecture:** Persist semantic workflow definitions and immutable versions;
  keep view layout and Mini App schema separate. The AI Builder produces a
  validated candidate plan and diff, the top-down canvas inspects it, typed
  bindings connect outputs to inputs, and Run/Debug submits to Feature 195 and
  projects real events/artifacts/economic states.

**Tech Stack:** React/Vite, `@xyflow/react`, existing UI primitives/tokens,
  tRPC/Zod, Drizzle/PostgreSQL, Feature 195 Job gateway, Vitest and Playwright.

**Spec:** `specs/feature/209-ai-workflow-studio-miniapp-marketplace/spec.md`

## Global Constraints

- Mockups `01-main-builder-top-down.png`, `02-subflow-data-binding.png` and
  `03-run-debug-mini-app.png` define hierarchy and interaction model.
- No newly invented dashboard visual language or replacement screen.
- Semantic workflow definition is canonical; view coordinates are not runtime.
- Every run enters Feature 195; economic facts enter Spec 207.
- Runtime capabilities route through Specs 197/199/200/206/208/210.
- No secrets in workflow JSON, unreviewed client JavaScript or retired systems.
- UI must support loading, empty, error, blocked/setup-required, success,
  disabled, hover, focus and selected states.

## Review Focus

- AI-generated plan must be previewed and accepted before semantic persistence.
- A typed binding must reject incompatible or inaccessible source fields.
- A stale version/run event must not update the visible current run.
- Missing Runner/tool/economic readiness must be actionable, not hidden.
- Published apps must point to immutable versions and preserve tenant/ACL.

## UI/UX Contract

**Target user/job:** a SmartAIHub user describes an automation, inspects the
result, runs/debugs it, and optionally publishes a reusable Mini App.

**Surfaces:** Workflow Builder route; Subflow route/state; Run/Mini App route;
right inspector; bottom output/debug drawer; Marketplace/registered app views.

**Component ownership:** page shell owns navigation/header; canvas owns graph
view only; inspector owns selected node/config/binding states; run drawer owns
events/output/trace/logs/artifacts/cost; Run surface owns inputs/progress and
recovery actions; services own all authority and validation.

**Visual direction:** reproduce the mockup's calm white/neutral SaaS surfaces,
blue primary actions, compact rounded nodes, top-down spacing, right inspector,
bottom drawer and restrained status colors using existing semantic tokens.

**Responsive matrix:** desktop keeps canvas + inspector + drawer; tablet makes
inspector a sheet and preserves graph/readability; mobile stacks header, graph,
inspector and run drawer with touch targets at least 44px and no hidden critical
actions. Run surface becomes a single-column form/progress/artifacts layout.

**Accessibility:** semantic landmarks, keyboard graph selection, visible focus,
labels for every input, non-color status text/icons, reduced-motion handling,
contrast acceptance and screen-reader announcements for async run state.

**Copy contract:** Thai and English labels live in `workflow.json` locale files;
copy must distinguish Ready, Setup required, Unavailable, Running, Waiting for
approval, Succeeded, Failed and Reconciliation required. Error copy tells the
user the next safe action.

**Browser evidence:** capture builder, subflow/binding and Run/debug at 1440×900,
768×1024 and 390×844; verify keyboard/focus and a real or explicitly blocked
run path using the browser verification policy.

## Section 1: Workflow domain, version and access schema

Add canonical Spec 209 tables or a documented additive migration that maps
legacy workflow residue without treating it as current truth. Persist semantic
definition, immutable versions, view state, input/output schema, access/publish
metadata, dependency/readiness snapshot and audit linkage. Create shared Zod/
TypeScript contracts and tenant-safe router procedures.

Tests cover create/draft/version/publish/rollback, tenant ACL, immutable
published version, schema validation and secret redaction.

## Section 2: AI Builder plan/compiler and validation

Create a service that accepts natural-language intent, discovers logical
capabilities and authorized readiness, returns bounded execution options and a
candidate definition, then validates static graph/policy/schema/cost before
accept. Persist only after explicit user acceptance; keep transient runner/
process identities out of workflow semantics.

Tests cover deterministic validation, invalid graph, incompatible option,
setup-required/unavailable state, acceptance idempotency and diff output.

## Section 3: Mockup-aligned Builder canvas/inspector/run drawer

Implement the builder route using the three mockups: left navigation/header,
top-down canvas, compact node cards, selected-node outline, right inspector with
Configure/Settings/Notes and typed inputs/outputs, and bottom run/output/debug
drawer with tabs. Use `@xyflow/react` only as presentation; no drag-and-drop
requirement for initial AI-generated flow.

Tests cover selected/hover/focus/disabled/loading/empty/error states, keyboard
selection, inspector edits, drawer tabs and responsive composition. Browser
screenshots must be compared against the mockup structure.

## Section 4: Subflow, binding and runtime graph projection

Implement subflow breadcrumb/drill-down, explicit input/output contract,
compatible source search and typed binding validation as shown in mockup 02.
Run partial/single-node/subflow actions only through the canonical Job gateway;
project checkpoints/events and reject stale version/run events.

Tests cover binding compatibility/ACL, nested cycle rejection, run-from/single
node, checkpoint/resume and stale event handling.

## Section 5: Run/Mini App and Marketplace publication

Implement the separate Run experience from mockup 03: input form, upload/typed
fields, progress steps, step details, activity log, artifacts, preview and
recovery controls. Add schema-driven result rendering, access modes, immutable
published versions, dependency/readiness display and Marketplace/registered
app discovery using existing search patterns without reviving `/workflows`.

Tests cover input validation, upload authorization, Job projection, approval/
blocked/error/retry, artifact ACL, publish immutability, share/access and
marketplace filtering.

## Section 6: Economics, observability and release

Attach Spec 207 intent/estimate/reservation/capture/release facts and surface
explainable cost in the inspector/drawer. Add audit/trace/log correlation,
feature flags, migration/backfill verification, i18n parity and browser/release
gates. Do not claim creator payout or production runtime availability without
the upstream evidence.

Tests cover economic replay/release, cost display states, audit correlation,
tenant isolation, i18n parity, feature-off behavior and release checklist.

