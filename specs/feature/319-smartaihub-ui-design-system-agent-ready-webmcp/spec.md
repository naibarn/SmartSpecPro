---
spec_id: 319
semantic_id: smartaihub.modular-ui-agent-ready-webmcp
revision: R1.5
status: PROPOSED_NOT_IMPLEMENTED
owner: SmartSIHub UI and Agent Interaction Architecture
production_domain: smartsihub.com
date: 2026-11-02
---
# SPEC-319 — Modern Modular UI, Design System, Agent-Ready Actions & WebMCP

> **Current-revision note (R1.5, 2026-11-02):** Earlier proposal text is retained for provenance. If R0.x–R1.4 post-login, runtime, browser-session, or always-on assertions conflict with the final R1.5 section or current owner-decision register, R1.5 controls.

## 0. Executive decision
Build a NEW first-party SmartSIHub visual experience, not a legacy Astryx skin, generic AI dashboard, or copy/paste public template. SaaS Shell and interactive first-party modules use React 19, TypeScript, Vite, Tailwind CSS 4, semantic OKLCH tokens, an owned accessible component library (Base UI/shadcn-compatible primitives), and minimal interaction motion. Astro is the designated framework for the NEW public website under SPEC-320, with React islands where necessary. Exact dependency versions are pinned after compatibility verification, not guessed from examples.

**The product invariant is `ACTION ≠ UI`:** Every agent-invokable capability SHALL have a server-side typed, authorized, versioned Action/Capability Contract. Human UI, in-browser WebMCP, headless HTTPS, remote MCP Tools, and existing agent/Skill adapters all invoke this SAME action authority. None are second business systems or duplicate payment/job engines. The UI must remain optional for headless execution. WebMCP cannot satisfy headless operation: it is a browser-tab-side early-preview API.

Historical authority integration: SPEC-270 owns design-intelligence/provider integration; SPEC-287 owns canonical semantic design governance and rendered verification; SPEC-256 owns capability resolution; SPEC-199/248 own MCP transports; SPEC-261 governs portable Mini Apps; SPEC-304 owns App Identity and routing; SPEC-207/280 own charging; SPEC-318 and existing worker_jobs own execution. This is an implementation profile, NOT a second design-token registry, tool registry, action executor, or entitlement engine. SPEC-263 is a historical public site definition, revised by a scoped applicability note under SPEC-320.

## 1. Explicit visual design requirements
1. New SmartSIHub UI must NOT import or require the legacy `apps/web` runtime/component graph or be forced to use existing Astryx screens as templates. Existing assets/flows may be studied as behavioral references.
2. Define one versioned `DESIGN.md` and semantic token contract: typography scale, visual hierarchy, colors/surfaces, spacing, density, radii, elevation, iconography, light/dark/high-contrast, interactive states, responsive breakpoints and locale. Existing SPEC-287 registry remains the source-of-truth for concepts; new platform may have a new versioned product profile and generated token projection.
3. Separate design profiles for Public Marketplace, SaaS Console, Creator Studio, Chat/Agent surfaces, and Data-Dense operations. Brand coherence does not require identical layouts.
4. Source design quality from competitor/task analysis, high-fidelity page briefs, real content, tangible portfolio imagery and human review. Explicitly reject generic center-aligned gradient hero, indiscriminate glowing cards, random glassmorphism, oversaturated neon, meaningless icons and excessive animations. These are review heuristics, not compile gates.
5. Component primitives: accessible Base UI or well-maintained equivalent; shadcn/ui may be used as copied implementation reference, not a default visual theme. Own tokens and components with explicit licensed usage. Avoid multiple general UI kits in production bundles.
6. Performance: islands/client splitting, per-module CSS/JS build, responsive images via R2/CDN, no loading entire SaaS Shell for public visits; prefer native HTML and CSS for non-interactive content. Record route-level Core Web Vitals, bundle and hydration cost. Soft budgets from SPEC-312–314; report regressions rather than globally block beta.
7. Accessibility: WCAG 2.2 AA target, keyboard focus, forms with real labels, touch targets, reduced-motion, color contrast, Thai/English content, locale-aware prices/currencies, loading/empty/error states, and meaningful voice/screen-reader labels.
8. Test: Storybook components/states; Playwright E2E screenshot and keyboard/mobile/browser runs; axe accessibility scanning; Lighthouse/field RUM; human review on actual public routes. Accept scoped known issues with tracking. Do not block unrelated features due to aesthetic differences.

## 2. Canonical Action Contract
Each exposed operation has fields `actionId`, `version`, `moduleId`, `semanticCapabilityId`, `inputSchema`, `outputSchema`, `effectClass`, `riskClass`, `idempotencyPolicy`, `entitlement`, `tenantScope`, `billingOffer`, `executionMode`, `jobType`, `cancellation`, `previewSupport`, `deprecation`, and a `humanHelpUrl`. Server-side contract registry references existing SPEC-256 capability/Skill source-of-truth; no second Skill Registry.

Operations classified as public READ may permit anonymous use only if catalog policy allows. Mutating actions require scoped authenticated actor/tenant grants. Purchases, subscription changes, external publishing, ownership transfer and irreversible operations require appropriate existing authorization and, when truly necessary, explicit user confirmation; do not invent repeated global approvals. Revalidating authorization must happen server-side, not only in UI/WebMCP.

## 3. UI, headless and WebMCP projections
- React UI invokes Action API over HTTPS; it never contains secret business logic or direct ledger writes.
- Headless invocation uses HTTPS with authenticated scoped API Tokens / OAuth and OpenAPI-compatible schemas, calling the same Action handler without a browser or fake click stream.
- MCP remote Tool interface uses the existing SPEC-199 gateway and negotiated capabilities; reuse existing Spec 248 Skill definitions without assuming every Skill is a Tool. Auth and audience remain scoped.
- WebMCP projection is registered in supported Chromium browsers via `document.modelContext` with feature detection. React follows contemporary framework integration guidance; register through centralized hooks/adapters, not directly during component renders. Use imperative tools for complex interactions; declarative annotations for suitable HTML forms. Version/pin adapter to the current draft/browser capability.
- WebMCP is **client-side tab-scoped** and currently early preview; no claim of browser-universal production coverage. Feature detection and conventional UI must work elsewhere. It is not an HTTP server or the remote MCP protocol and currently does not expose MCP Resources/Prompts.
- WebMCP tools invoke the same Action API, receive current auth context and return bounded structured status/errors. Never export credentials, raw private tenant data, or unrestricted admin tools. A browser WebMCP tool cannot bypass server authorization or billing.
- Machine discoverability is via validated action schemas/capability registry and authenticated APIs, not DOM scraping; expose minimal publicly permissible schema for listing when opted in.

## 4. Contract example (informative)
```ts
type ModuleAction = {
  actionId: 'miniapp.executeSkill';
  version: '1.0.0';
  inputSchema: { miniAppId: string; skillId: string; input: unknown };
  effectClass: 'BILLABLE_JOB';
  executionMode: 'ASYNC_JOB';
  billingOffer: { mode: 'METERED_OR_SUBSCRIPTION'; offerId: string };
};
// /api/v1/actions/miniapp.executeSkill  -> canonical authorization
//   -> SPEC-280 pricing -> SPEC-207 reserve/settle when applicable
//   -> SPEC-318 job admission -> returns existing canonical jobId.
// UI, headless API, MCP and browser WebMCP all call this SAME handler.
```

## 5. WebMCP compatibility and audits
Probe API feature, tool registration, name/schema consistency, tenant and session changes, navigation/remount cleanup, unsupported browser fallback, abort/cancel semantics, confirmation for risky actions, hydration/race conditions, duplicate invocation keys, accessibility and refusal states. Use GoogleChromeLabs WebMCP Tool Inspector, WebMCP Evals and official draft-guidance, with the tool library as an evaluation aid rather than runtime dependency.

## 6. Mini App creator governance
Created Mini Apps inherit the Action Contract and minimal UI token profile but may declare their own licensed visual identity. First-party modules use no iframes by default; untrusted third-party runtime must use isolated origin/context with scoped bridge. Portable apps cannot assume Cloudflare-only APIs without declaring requirements per SPEC-261/273.

## 7. Incremental acceptance / no global gate
P1: one typed core action callable headless and from UI on `aimarkethubs.com`.
P2: WebMCP registration on supported browser and feature detection in unsupported browser.
P3: one Mini App's billable skill invoked by headless and UI with one job/one settlement.
P4: useful design tokens, responsive/keyboard states and visual screenshots of public shell.
P5: scoped Cloudflare production beta `smartsihub.com` after affected action auth/finance integrity is proven; defects elsewhere do not freeze implementation.
No source-only test substitutes for real browser or human UAT. No new global approval platform.

## R0.7 — Same commercial Skill decision across UI, WebMCP and headless Agents

All action manifests and adapters MUST expose the server-authoritative billing classification and applicable quote for an invocation: `APP_EXCLUSIVE_INCLUDED` versus `SHARED_METERED`. A subscribed Mini App does not exempt shared/Marketplace/Core/other-App Skills, including nested calls. Browser and headless paths use the same SPEC-321 admission/reservation/settlement idempotency and cannot lie about price or app ownership. If a formerly included action now incurs credit charge, present a clear authorization/price-required response; do not silently charge or execute for free. Accessible UI distinguishes subscription-included and credits-per-use actions.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

Platform Subscription plans, PAYG usage estimates, credit-line exposure, Agent spend mandates, Auto Top-up and Mini App subscription terms must appear clearly in new UI, while the SAME versioned Action contracts are accessible to headless MCP/HTTPS Agents. Browser WebMCP is optional/feature-detected and cannot serve as primary payment API. Agent can quote/reserve/run/pay autonomously within delegated spending policies; return structured human payment handoff if PSP demands interaction. Show forecast vs verified actual and release unused held credits. Protect payment method refs/tokens in frontend hydration and web tools.

## R1.0 — UI-independent portability and authenticated origin
Apps on root platform routes, custom domains, BYOC accounts or owner servers all use stable App action contracts. Browser WebMCP is optional and origin-scoped; headless API/MCP does not depend on pages loading. Untrusted Mini App JS must not execute under Core privileged browser origin; allow seamless navigation using isolated hosts and short-lived, audience-scoped account context, not shared Core database access.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

Chat is the first new UI module: modern UI plus exactly the same typed actions for headless API/MCP/WebMCP. P0 Admin operates the *old* `smartaihub.app` UI for autonomous development until the new Action/Mission UI is proven; never make a redesign of the old UI a prerequisite for Core builds. The new task inspector must expose selected Agent, Machine, Harness, Workspace, Run, steps, artifacts, cost, errors and next automatic action. Human testing occurs at each usable slice, without an aesthetics-only gate.


## R1.2 — Chat-native Interactive Workspace, Artifact Windows and Agent Browser (Normative Addendum)

### Decision and scope

The old `smartaihub.app` is the P0 development control tool. The NEW Chat on `aimarkethubs.com` / eventual `smartsihub.com` SHALL become a **chat-native interactive workspace**, not a Markdown-only chatbot. The user-provided UI references show three non-negotiable patterns: (1) inline structured diagrams, (2) copyable/downloadable code/YAML views, and (3) interactive choice widgets. The new UI additionally provides persistent side-panel/window artifacts and agent-operated browser sessions. These are **presentations of existing canonical Jobs, Actions, Apps and Artifacts**, not new execution authorities. The existing three theme profiles—Light, Dark, Balance—MUST style the same semantic components and retain accessible contrast, focus and reduced-motion behavior.

### UX placement contract (desktop / mobile)

- **Inline message**: Text/Markdown, syntax-highlighted code/YAML, Mermaid, optional React Flow expanded diagram, tables with sorting/filter, charts, action cards, progress/receipts, multiple-choice, forms, file previews and tool results. Render on demand per message. Inline widgets MUST NOT be replaced with plain explanatory text when safe structured UI is available.
- **Artifact panel**: Dock to right of conversation, resize, detach into separately routable window/tab, switch tabs (Preview / Source / Diff / History / Files / Tests / Versions). Artifacts have `artifactId`, owning `runId`/`threadId`, immutable version/digest, MIME/schema, storage pointer and authorized actions. Use R2 for large blobs and database for bounded metadata/provenance; never store whole binaries in chat text. Show a small durable inline preview with **Open in panel**, **Expand**, **Copy**, and **Download** according to permission.
- **Browser panel**: Tabbed with inspector when space is tight; `Live`, `Timeline`, `DOM`, `Logs`, `Screenshots`, `Take Control`, `Open in Browser`. A detached panel/window is optional. Browser is a remote session, not an embedded full browser engine in the React bundle; secure transport via authorized same-origin broker or short-lived signed view endpoint. No arbitrary remote-control URL in model output.
- **Responsive**: Desktop uses three panes (navigation, Chat, right inspector/artifacts/browser). Tablet collapses left navigation; right pane becomes switchable drawer. Mobile opens inline previews in an accessible full-screen sheet; the composer remains usable, with one clear primary action at a time.
- Public Website link remains available to all authenticated users. Admin / Back Office is **only** rendered for authorized admins and verified server-side on navigation; neither page location nor WebMCP registration is an authorization mechanism.

### Typed renderable message and state contract

`ChatMessage` retains a stable `messageId`, `conversationId`, `threadId`, `createdAt`, `contentVersion`, `blocks[]`, and associated `runId` (when applicable). Stable `blockId` + `blockVersion` identifies each renderer, using explicit `kind` values: `markdown | code | diagram | chart | table | form | choice | action-card | job-status | artifact-preview | browser-preview | error`. Preserve canonical source artifacts and the untrusted source text, sanitize/validate before rendering. Every interactive block declares `schemaVersion`, `renderMode`, `statePolicy`, `fallbackText`, action references, and capability/tenant permissions. Restore prior messages without regenerating LLM output. Rehydrate live queries only after authorization and with freshness/error indicators.

- Stream text and versioned structured block deltas; recover from disconnect by replaying stable persisted events, not generating a conflicting second message. When streaming is interrupted, show partial status and retry without duplicate actions.
- `choice` / `form` can update local client state and, on Submit, issue `GenUI`-style **typed Action API** requests. React interactions are user gestures, not implicit executable model code. Live data binds through OpenUI `Query` and `Mutation` toolProvider **only to allowlisted backend actions**. Arguments are untrusted; server validates ownership, auth, tenant, price, quota, run idempotency and side effects.
- `diagram` defaults to accessible SVG/semantic textual fallback (Mermaid) and may promote to React Flow for zoom/pan/node selection. No external arbitrary scripts or Markdown HTML execution. For untrusted custom HTML artifact previews, use an isolated origin and restrictive sandbox bridge; do not put third-party Mini App code in privileged Core origin.
- Preserve renderability with missing OpenUI, unsupported browser, old block versions, JS disabled, network error or renderer failure: show safe text/source, direct links, downloadable artifact as appropriate. All interaction must be keyboard-usable; error states should be explicit.
- Tool output and artifact existence are canonical recorded events, not claims generated by the model. A code/artifact panel cannot report 'saved', 'deployed', or 'verified' without actual backing receipts.

### OpenUI policy

OpenUI (Thesys; https://github.com/thesysdev/openui) is an **OPTIONAL renderer and language/adapter**, not the entire chat app, the canonical UI token authority or a new action registry. Pin and audit a version. SmartSIHub's owned Component Library/Tokens (SPEC-287) govern it; implement the three themes. Prefer OpenUI for dynamic in-chat forms/charts/tables, not fixed navigation, billing checkout, irreversible actions or stable Studio screens. An inline interactive card may be pinned/reopened as a durable Artifact independent of the chat renderer. `Query` and `Mutation` call verified Action/Capability Contracts (SPEC-256/280/207/318), never raw SQL or bearer secrets. Provide static fallback and no LLM call on every UI click.

### Browser provider and human controls

Use a versioned `BrowserSessionProvider` abstraction with `acquire`, `navigate`, `act`, `inspect`, `screenshot`, `liveView`, `pause`, `handoffToHuman`, `resume`, `checkpoint`, `close`, `capabilities`, `limits`, and `costEstimate`. The canonical Job owns `browserSessionId`, selected provider, tenant, actor, agent, expiry, audit and artifacts. Do NOT make the browser process the durable Job source of truth.

Default provider for P2 Chat Pilot: **Chromium/Playwright** on approved Debian/Runner, or **Cloudflare Browser Run** for managed remote sessions; Cloudflare supports CDP, Playwright, Live View and structured Human in the Loop (https://developers.cloudflare.com/browser-run/). **Moli** (https://github.com/lexmount/moli) is an OPTIONAL Rust-native provider for DOM-first/extraction/agent interactions; benchmark and capability-detect, fall back to Chromium for high-fidelity pixel rendering, Canvas/WebGL, complex authentication, PDF or unsupported automation operations. Do not import full Chromium/Moli into Hono Worker bundles. `Moli` is not a full GUI browser or drop-in browser-user replacement.

Browser session lifecycle: run can last hours/days, but each live browser session is *ephemeral*. Store URL, progress/steps, permitted reconnect metadata and sanitized screenshots/DOM evidence; recreate/replay only safe idempotent steps after browser timeout or process crash. Never claim a browser session itself runs forever. Separate **View**, **Take Control** and **Open in my Browser**. Take Control is an audited short-lived remote-view handoff, permission-scoped and revocable. Open in my Browser opens the verified URL in user's Chrome/Edge/etc.; it does NOT transfer session cookies or passwords automatically. MFA/payment/CAPTCHA require user handoff or approved provider flows; no bypass. Never expose Cloudflare view links or CDP tokens to unauthorized users.

Browser security: per-user/tenant isolated credentials and network namespace, allowlisted egress/private-network policy, SSRF protection, navigation boundary review, phishing/prompt injection treated as untrusted webpage content, zero access to Core secrets, auditable browser steps, time/cost limits, safe cancellation. Keep viewing of sensitive fields redacted unless necessary and authorized. Disable public sharing of sessions by default.

### Human UAT: focused realistic slices (NOT a global implementation gate)

1. Chat returns a streamed diagram and a code/YAML block with copy and expand actions; both render after reload in all three themes.
2. Chat offers multiple-choice/options; a click updates the selected state and submits a typed server action once (no model call required for local selection).
3. Agent creates one real artifact, saves a versioned receipt, and opens/edits it in a docked panel plus an independent window without losing chat state.
4. Chat starts a browser job that persists in `worker_jobs`; Cloudflare Browser Run or Chromium performs a Playwright navigation; user views and, where supported, takes control; user can open URL in their own browser.
5. On Moli unsupported site/feature, route transparently to Chromium; record measured compatibility and memory, do not claim parity.
6. When tab closes or browser session times out, the job remains visible/recoverable from durable state; no duplicate payments or side effects.
7. Non-admin sessions never see or invoke Back Office; Mini App third-party previews are origin-isolated.

Ship partial working slices to `aimarkethubs.com` for authorized human UAT. OpenUI/Moli/Browser Panel integration MUST NOT delay the base Core/Chat/Creator migration or create new global approval gates. The next selected module can proceed in parallel once its own dependency surface works.

---

## R1.3 — Computer Use, Clef, Kitesurf and Chat visibility profile

- SPEC-208 Rev 9 already owns **Computer Use and Clef-first dynamic capability routing**. Do not create a duplicate routing engine, permission approval layer or new browser authority in the rebuilt Core. SPEC-319 projects it into Chat, artifact cards, browser panel and typed/headless actions.
- **Cloudflare Clef is NOT Computer Use or a browser.** It is an optional System One typed decision model. Clef-flash is a candidate for fast eligible-route selection after deterministic authorization; Clef and Clef-omni are optional model alternatives. No inferred user consent or auto-approved payments based on model confidence.
- Browser options include `MOLI_NATIVE_DOM`, `CF_KITESURF_STATELESS`, `CHROMIUM_LOCAL_PLAYWRIGHT`, `CF_BROWSER_RUN_CHROMIUM` and existing `LOCAL_EXISTING_BROWSER` / `DESKTOP_RUNNER` targets. Production Moli selection remains disabled until SPEC-208 isolation/compatibility work is resolved. Default first-pilot route remains Chromium/Playwright on Debian; Kitesurf is evaluated for stateless extraction where eligible.
- Cloudflare Kitesurf is stateless; it does not provide persistent tabs, live view, recording or human takeover. WebMCP in Kitesurf has experimental limitations including permissions/origin filtering. For sensitive stateful WebMCP or human takeover, use tested Chromium/Chrome Lab and canonical server authorization.
- User's preferred **final-result-only** interaction is first class: Chat displays `queued/running/needs-human/completed`, concise final answer and links to persistent artifacts. Browser panels and live view open only on demand and can close without canceling the job. No fake live status when the executor is offline.
- Native Windows/Linux Computer Use via the existing SmartAIHub Runner has explicit device, session and capability selection. Never confuse Cloudflare Browser Run with a full operating-system computer. Cloudflare Sandbox SDK's former built-in desktop API is removed (v0.10.2); a cloud GUI requires independently built/isolation-tested desktop environment.
- Theme Light/Dark/Balance remains UI projection. OpenUI inline interactive blocks may control declared actions but cannot bypass authenticated authorization, payment mandate, effect policy or job settlement.

See `docs/architecture/COMPUTER-USE-CLEF-BROWSER-ROUTING-ADR.md` and SPEC-208.

---

## R1.4 — Cross-SPEC owner reconciliation and execution contract (2026-11-01)

> **Historical R1.4 provenance:** retained as the 2026-11-01 proposal record. For conflicting current requirements, R1.5 controls; see [R1.5 owner-decision precedence](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md).

> **Historical R1.4 cross-spec review (2026-11-01):** This was the controlling addendum for the R1.4 proposal. It remains historical provenance; current conflicts follow R1.5 and the [R1.5 owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md). Earlier sections remain for context and are not deployment or implementation evidence.


### R1.4 shared invariants (normative)

1. **Identity and domains.** `smartsihub.com` is the confirmed Cloudflare **production** hostname; `aimarkethubs.com` is the Debian-first new-platform development + real-human UAT; `smartaihub.app` is the still-running legacy system AND the sole initial user-facing development-command center, to be retired as a controller only after proven selective handover. Hostname, `NODE_ENV`, public link or site labels MUST NOT be used as substitute for verified runtime target, role or payment authority.
2. **No parallel financial or job authority.** PostgreSQL `smartspec` continues to own canonical identity, tenancy, wallet/credits, subscriptions, marketplace/app IDs, and `worker_jobs`; registered **legacy-migrated data** may stay there. New stateful Mini App business data MUST use an app-specific store outside Core; stateless Apps need none. Rust, TypeScript, Mini App, Browser and external Agent MUST access central financial/job effects through the versioned authorized contracts, not invent private settlement or job ledgers.
3. **Technical baseline.** Fresh minimal **TypeScript/Hono Core Workers**, **React/TypeScript fixed shell + optional OpenUI interactive renderers**, **Astro public marketplace** built from scratch, **Rust-native long-running supervisor** and TypeScript Queue transports. Never convert/copy the legacy server wholesale or require Rust/Wasm in every Core API. Optimize JS/asset/bundle size and queries using measurements, without blocking unrelated UAT on advisory targets.
4. **User-centric autonomy.** P0 repairs and exercises existing `smartaihub.app` Autonomous Implements / Creator; P1 new Core; P2 Chat; P3 Mini App Creator; P4 new Autonomous Implements; P5 selected authority handover; P6 portfolio/public marketplace; P7 remaining modules. Priorities allow parallel safe preparation, never global step-by-step approval loops. Scope only actual unauthorized data/finance, wrong-target deployments, unsafe effects or unavailable nondelegable authority.
5. **Chat-first, always-on when truly hosted.** Human Chat is the front door; direct HTTPS/MCP enables Agent use without UI. Dynamic inline diagrams/interactive forms/OpenUI and artifact/browser side-panels render one canonical action/run identity. `worker_jobs` persists independently of user browser sessions, but **do not claim cloud 24/7 persistence** for a job whose only authorized executor is an offline user device.
6. **Browser and Computer Use.** SPEC-208 remains authoritative: deterministic eligible-route policy then optional Clef bounded decision; direct API/MCP first, Chromium/Playwright dependable pilot, **Moli explicitly unqualified for production pending isolation/security evidence**, Kitesurf only supported beta profiles, Windows/Linux desktop via approved Runner. Browser snapshots/session state are not durable Job authority. WebMCP browser tools are optional early-preview projections, not a headless server API or permission escalator.
7. **Economic and commercial identity.** 1 USD = 10,000 **new** credits; preserve old purchased/earned value by atomic denomination-versioned x10 migration for old units, avoid historical ledger rewrite and mixed unit writers. Only four revenue roles (Platform, Tenant Infra, Mini App, Skill) credit verified owner user wallets. One-time referral bonus is Platform-funded, not a fifth share. SmartSIHub **platform** subscription (monthly credits) is distinct from Mini App subscription (only new **exclusive** in-app Skills included); all shared/external Skills charged per distinct invocation. Pay-as-you-go reserve/actual settle/unused release and per-class overdraft default **zero** unless authorized. Users must have a SmartSIHub account; paid platform subscription is not universally mandatory.
8. **Cross-provider portability and idempotency.** Core remains PostgreSQL; independent new Mini Apps use app-owned **D1** / independent PostgreSQL or self-hosted storage under **BYOC** or managed deployment. **Idempotency** is required for job admission, shared Skill usage, credit reservation/settlement, subscription grants, referral bonuses and replayed webhooks; this is a business-effect invariant rather than a new global approval gate.
9. **Visual product contract.** Include Light, Dark, and Balance theme tokens and three **reference** mockups. Public Website link appears when available; Admin/Back Office is capability-gated and hidden for ordinary users. These concept pictures are non-executable, illustrative screens: never fake percentages, status or receipts as real run telemetry. No generated UI may invent a valid payment, deploy, DB or browser action without typed server-side registration and authorization.

### SPEC-319 targeted closure

**Chat UI contract:** Fixed React shell + OpenUI allowed-component streaming renderer. Inline blocks support Mermaid/source fallback, code/YAML copy, table/chart, interactive multiple choice/form and live read-only Run Cards; mutations invoke approved typed Action IDs via Core. Artifacts open in inspector/panel/detached window with version and access checks; browser panel shows session evidence and optional takeover, not silently transferable cookies. Every panel follows user-visible thread/run refs; theme `light|dark|balance` must persist across routes, inline components, artifact inspector and mobile. [Three mockups and design rules](../../../docs/architecture/R1.4-THREE-THEME-MOCKUPS.md). Admin link requires server-authoritative admin rights; Public Website link visible when ready, never a fake live address.

---

## R1.5 — Chat-first workspace and unified Companion contract (2026-11-02)

After login, Chat is the primary workspace. It presents the persistent Agent roster/status, schedules, scoped action previews, artifacts and thread/run inspector. Complex tasks open Mission Control, Task Control, Mini App Creator or Media routes that reference the same tenantId, threadId, agentId, goalId, jobId, runId, attemptId, deviceId, artifactId, actionId and policyEpoch. Chat, browser UI, desktop Companion and headless HTTPS/MCP use one server-authorized typed action registry and the same receipts.

Inline UI is selected from a controlled component registry; model output cannot provide executable HTML/JavaScript or direct privileged IPC. Use authenticated WebSockets with bounded reconnect, replay protection, fresh authorization and cursor-based replay; use Secure HttpOnly session cookies and CSRF protections for browser mutations. User session identity is distinct from device identity and service proof. Closing a view only hides UI; server-authorized work continues. The floating Companion uses the same frontend components and state as the web app; it is not a screenshot/video mirror or second frontend. Require compact and expanded accessibility, Light/Dark/Balance continuity, truthful offline/locked states and cross-tenant tests. See SPEC-325 and the [secure Chat ADR](../../../docs/architecture/CHAT-NATIVE-INTERACTIVE-WORKSPACE-ADR.md).

The Companion reports Cloud Agent/Goal state separately from device Core/Executor readiness. It opens compact shared Chat and expands to Task or Mission Control without changing thread/Goal/Run/action identity. Closing UI, expiring a browser cookie or losing an overlay cannot disconnect the boot service or revoke an otherwise valid bounded grant. Native IPC is limited to documented convenience methods and cannot execute jobs directly.
