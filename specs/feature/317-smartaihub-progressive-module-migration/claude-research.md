# Research — Chat-first Modular front door

## Source of truth and current code

- SPEC-317 R1.5 makes existing source a behavior/data reference only and prohibits Legacy runtime dependencies.
- SPEC-317 R1.2/R1.3 require Chat-first interaction, a typed structured response, persistent Artifact Panel, an authorized Chromium/Playwright pilot and durable work where applicable.
- SPEC-314 R1.5 specifies `apps/saas-core`, `apps/saas-shell`, `modules/chat`, small shared packages, versioned module manifests, independent assets, package-filtered builds, no all-module build and no cross-module implementation imports.
- SPEC-312 R1.2 says new SaaS UX is Chat-first; SPEC-317 R1.6 records the owner's direct `/chat` and no-Legacy-dashboard clarification.
- `smartaihub-platform` currently contains only `apps/saas-core`; its workspace patterns include `apps/*`, `modules/*`, `packages/*`. It has a root `build: turbo run build` aggregate and `build:core`, `test:core`, `typecheck:core` filtered scripts. There is no Shell or Chat package.
- Current Core is Hono/TypeScript on local Worker port 3200 and already has login/session routes and canonical DB auth repository. It has no Shell or Chat API.
- `deployment-targets.json` maps `aimarkethubs.com` to `modular-debian-dev`, port 3200, `applicationAvailable:false`, `deployable:false`, and explicitly preserves its currently serving service until a healthy replacement is handed over. Production `smartsihub.com` is not activated.

## Legacy reference patterns (behavior only)

- `apps/web/client/src/pages/Login.tsx` and its auth tests: established login interactions and validation/error cases; reuse the behavior expectations, not components, CSS, dependencies, or server runtime.
- `apps/web/client/src/pages/UnifiedWorkspace.tsx`, `Chat.tsx`, and `components/chat/ChatView.tsx`/`ChatSidebar.tsx`: existing conversation navigation, message, and loading/error behavior; use as a feature inventory only. Rebuild the new route in the independent `modules/chat` package.
- No Legacy dashboard content or navigation is a valid starting surface for the new Shell.

## Gaps that need implementation proof

1. The screenshot's old dashboard is still what aimarkethubs.com serves; no user-visible handover has occurred.
2. Root's aggregate build and absent package boundaries contradict the user's explicit separate-build requirement.
3. No live schema evidence for existing Chat records or provider writer semantics is included in current source. Perform a read-only catalog/contract audit before implementing persistence; no DDL by assumption.
4. The existing Core signing key must remain private. Chat must authenticate through a versioned Core-to-module audience-bound assertion or an equivalent trusted Service Binding contract.
5. Provider and browser secrets are not part of this source checkout. Implement typed adapters and honest unavailable states; do not claim a live model/browser execution without authorized configuration.
6. A browser-generated artifact must reference canonical artifact/job identity. Do not introduce a private queue, duplicate job ledger, or `waitUntil`-only long task.

## Decision

Build Shell and Chat fresh. Keep Core's existing Hono package separate. Use a versioned manifest and lazy Chat asset load from the Shell; do not compile Chat implementation into the Shell bundle. Implement only thin contracts shared by these packages. Preserve all legacy service/domain routing until the modular target is independently healthy and intentionally handed over.
