# ADR — Chat-native Interactive Workspace, OpenUI + Artifacts + Browser

> **Current profile note (R1.6, 2026-11-15):** R1.5 continues to govern secure Chat-first behavior. R1.6 records the additive private Chat output-artifact implementation and its Task/Mission projection boundaries; it does not change authentication, execution authority or the earlier secure profile. See SPEC-319/SPEC-325, [SPEC-312 R1.21](../../specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/amendments/assistant-ui-chat-shell/r1.21/spec.md) and the [current owner-decision register](R1.5-OWNER-DECISION-PRECEDENCE.md).

**Date:** 2026-11-01<br>
**Decision:** Proposed, additive; applies to SmartSIHub new Core/Chat, not the old UI.<br>
**Authority:** SPEC-319 R1.2. Prior SPEC-270/287 design governance; SPEC-224/318 durable jobs; SPEC-207/280/321/322 commercial actions; SPEC-261/304/323 Apps and portability.

## Problem

Legacy Chat forces most results into plain text or separate pages. The accepted screenshot references show that diagrams, YAML/code and single-choice prompts are much more useful when interactive *inside* a conversation. Larger generated documents, code, apps and browser activities need a side pane or separate window, without losing conversation context or rerunning the model. Always-on Agents must remain functional even with the browser closed.

## Decision

Three surfaces share **one canonical action/job/artifact state**:

1. **Inline message blocks** — text, code+copy, Mermaid/React Flow, tables, charts, choice, form, action cards, progress, inline artifact/browser previews.
2. **Artifact workspace** — right dock, expanded panel, detachable browser window with durable `artifactId`, versions, source SHA, storage, previews, editing history and Download. Save only on real side-effect receipt; no invented links.
3. **Browser workspace** — real remote headless browser behind a `BrowserSessionProvider`; display view/step/screenshot/control in a right panel or detached window, with an option to open URL externally in Chrome/Edge.

UI/presentation does not execute business actions by itself. All mutations call verified backend action IDs with actor, tenant, idempotency, user spending grant, confirmed effect scope and current policy epochs. Browser pages and model-generated UI are untrusted; no arbitrary script injection or direct DB access.

## Key design decisions

- **OpenUI** is optional in-message dynamic UI renderer; all generated components use the owned three-theme design tokens; preview HTML is isolated. Query/Mutation are allowlisted and server-authorized. Do not dynamically generate permanent App Shell nav or account settings UI each visit.
- **Static fallbacks** for every structured block: text, accessible table/summary, downloadable original file, or source as appropriate. No need for LLM to process every click.
- **Artifact Identity** stable across chat/panel/window: message/run/thread links, immutable revision pointer, versioned updates and safe cross-window sync via backend. Never pin a sandbox/file URL as a canonical production identity.
- **Browser Runtime** is a *provider*, not a persistent database and not user-facing desktop browser. Long agent run continuity is guaranteed only to the extent of durable job/recovery design; active browser process may expire and be re-created.
- **First Pilot** picks Chromium/Playwright, with Cloudflare Browser Run when managed remote rendering/human handoff needed; Moli is measured experimental Rust adapter for DOM-first throughput/low-memory tasks. Browser provider fallback cannot silently change permissions or pricing.
- **Open in Browser** opens a verified URL locally and does not transfer cookies/auth. **Take Control** is a scoped temporary control of remote browser. Admin back office remains hidden and inaccessible to non-admin users.

## Browser provider matrix

| Provider | Best initial use | Key limitations |
|---|---|---|
| Debian/Runner Chromium + Playwright | Full JS, site workflows, Mini App UAT, test assertions | Native process footprint, operator-managed scaling |
| Cloudflare Browser Run | On-demand managed Chrome, Live View, user handoff, recorded diagnostics | Time-limited sessions, per-use cost, availability/capability constraints |
| Moli (Rust headless) | DOM-first extraction, semantic trees, agent automation with lower memory | No GUI or Chrome pixel parity; some CDP/Canvas/WebGL/browser features limited; benchmark before rollout |
| User Chrome/Edge | Familiar hands-on browsing via verified URL | Different session; no implied authenticated takeover |

## Stream/interaction protocol

`ChatMessage -> versioned RenderBlock[] -> renderer allowlist`.

Renderer actions use `actionId`, `args`, `idempotencyKey` and `effectClass`; server resolves true actor/tenant/entitlement/price. Snapshot data is labeled historical; dynamic Query refresh requires valid auth/expiry. All interactions are keyboard usable and available in Light/Dark/Balance; dense content can expand to side panel.

## Selected acceptance journeys (not global gates)

- Mermaid diagram and YAML code are readable in chat, expand and persist across refresh.
- Choice widget submits once; supports selected/disabled/error state and accessible keyboard.
- Real file artifact: inline preview -> side panel -> detached window, preserving versions and conversation context.
- Browser Job: start in Chat -> visible live preview/steps -> user control request -> optional open in external browser, no cookie transfer.
- Browser crash/disconnect: job remains in `worker_jobs` and shows honest recovery state.
- Moli fallback on unsupported rendering to Chromium.
- All three themes, including responsive compact views.

## Official references (verified 2026-11-01)

- OpenUI: https://github.com/thesysdev/openui
- OpenUI Query/Mutation: https://www.openui.com/docs/openui-lang/queries-mutations
- Cloudflare Browser Run: https://developers.cloudflare.com/browser-run/
- Cloudflare Live View: https://developers.cloudflare.com/browser-run/features/live-view/
- Cloudflare Human in the Loop: https://developers.cloudflare.com/browser-run/features/human-in-the-loop/
- Moli: https://github.com/lexmount/moli

## R1.5 — Chat-first secure shared workspace (2026-11-02)

After login, Chat is the primary workspace. Desktop Companion compact Chat and expanded Task/Mission views reuse the shared frontend components, routes, typed server-side actions and canonical thread/goal/job/run/device IDs. UI does not own durable job state, device keys or provider credentials; closing it does not cancel authorized work. Browser, desktop, HTTPS and MCP clients call the same action authority. Enforce Secure/HttpOnly sessions, CSRF, trusted Origin checks, authenticated WebSocket reconnect/replay and policy-epoch validation. Render controlled typed components; do not execute model-generated HTML/JavaScript or expose generic native IPC. See [SPEC-325](../../specs/feature/325-smartaihub-zero-trust-always-on-agent-security/spec.md), [Runner device trust ADR](SECURE-RUNNER-CONNECTION-AND-DEVICE-TRUST-ADR.md) and [Unified Desktop Companion ADR](ALWAYS-ON-RUNNER-AND-UNIFIED-DESKTOP-COMPANION-ADR.md).

## R1.6 — Private completed Chat outputs and truthful control projections (2026-11-15)

- A successful canonical Chat Job may register the actual completed provider response as an output artifact. The writer uses a dedicated private development R2 binding and registers ownership metadata in the existing `worker_artifacts` table as part of the canonical completion transaction. Input attachments are not output artifacts; no parallel artifact byte store or Job ledger is introduced.
- Artifact metadata/content reads validate the authenticated user, environment tenant, workspace, conversation, canonical Job and expiry. The content resolver enforces the current 128 KiB Chat viewer limit and verifies persisted byte length and SHA-256 before delivery. Private storage keys remain server-side. Responses are private/no-store, nosniff and sandboxed; the Chat UI uses controlled media/text previews or a download/fallback and never executes returned HTML/script.
- The artifact capability is enabled only in the development target when the dedicated binding and complete producer, registration, authorized retrieval and Chat viewer path are configured. This does not claim a signed-in live artifact journey until authenticated UAT completes.
- Task Control remains a versioned read-only projection of canonical Jobs. Missing canonical workspace/attempt/event/Agent/Harness/Executor/Machine identities remain null; a tenant scope is not relabeled as a workspace. The Modular Chat adapter reads its own canonical Chat Jobs and does not import legacy credentials or create a second dispatch path.
- SPEC-294's available platform project/run catalog is not a tenant Mission source. The nullable Mission projection contract does not enable Mission navigation or permit generated Mission/Run IDs; tenant runtime integration waits for SPEC-294's canonical identity, source, authorization and Chat/Job relationship.
- Evidence and traceability: [SPEC-312 R1.21](../../specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/amendments/assistant-ui-chat-shell/r1.21/spec.md), [implementation traceability](../../specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/amendments/assistant-ui-chat-shell/r1.21/implementation/IMPLEMENTATION_TRACEABILITY.md), and [DEV release receipt](../../specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/amendments/assistant-ui-chat-shell/r1.21/implementation/r1.21-dev-release.md). SPEC-312 remains PARTIAL; authenticated UAT and Mission runtime dependencies remain open.
