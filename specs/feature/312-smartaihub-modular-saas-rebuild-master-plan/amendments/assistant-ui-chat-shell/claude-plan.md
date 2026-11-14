# Implementation plan — assistant-ui Chat Shell

## Guardrails

- Work in `/mnt/SmartSpecDev/projects/smartaihub-platform` on its canonical `main`; keep all unrelated dirty paths in the SmartSpecPro source checkout untouched.
- Use exact `@assistant-ui/react` pin `0.15.36`, React 19 peer compatibility, pnpm and module-scoped checks. Keep assistant-ui confined to `modules/chat`.
- SmartSIHub Core owns conversation/thread/message/job/attachment/credit/auth state. Existing APIs remain the transport; no Assistant Cloud/AI SDK/Cloudflare Agents or alternate orchestration.
- Astryx remains the visual foundation. Preserve current dark/light theme modules, localization, navigation/history tabs, workspace selection and attachment preview/Lightbox.
- Do not fabricate provider streaming, Agent/Run/Attempt/Task/Mission status, tools, artifacts, execution state or cancellation. Keep unsupported views explicit and safe.
- Development target is `modular-debian-dev` (`aimarkethubs.com`) per `apps/web/scripts/deployment-targets.json`; do not touch legacy `smartaihub.app` or production `smartsihub.com`.

## Work order

1. Inspect assistant-ui 0.15.36 package exports/types and Astryx Chat template/layout/component guidance. Add the exact dependency and minimal runtime setup; verify only the Chat package.
2. Add pure mapping between Core conversation/message DTOs and assistant-ui ExternalStoreRuntime message/thread types, preserving IDs and all available metadata.
3. Build an isolated React adapter that exposes existing chat state/callbacks to `useExternalStoreRuntime`, centralizes selected thread ID, and uses existing APIs for send, attachment upload and status polling. Preserve idempotency, retry and auth/workspace boundaries.
4. Migrate central transcript and composer to assistant-ui primitives with custom Astryx rendering for Markdown/code, status, attachment gallery and model/credit metadata. Keep existing data flow and capabilities.
5. Connect assistant-ui multi-thread UI to the existing conversation list and IDs. Make selected conversation, runtime thread and URL/session selection coherent; add authorized reload/job recovery only if an existing server contract supports it. Otherwise guarantee refresh never re-dispatches and keep reconnect limitation documented.
6. Retain and tune left navigation/history, central Chat and right inspector with responsive Astryx layout. Replace any ungrounded live/Always-On claims with capability-backed status or neutral availability. Keep current settings, themes, locale and footer behavior.
7. Add focused tests for mapping, stable IDs, send/error/retry, switching, attachments, refresh/reconnect no-duplicate behavior and responsive navigation/control accessibility. Run Chat tests (requested), Chat typecheck/build, bundle dry-run and exact-SHA release checks.
8. Deploy only to `modular-debian-dev`; run authenticated browser UAT if session exists. Record implemented/tested/deployed/not-completed status and backend streaming/Agent contract gaps in SPEC-312 handoff.

## Dependency and execution decisions

`@assistant-ui/react` is the required reusable React runtime/presentation foundation. Its npm metadata currently reports version 0.15.36 with React/React DOM `^18 || ^19` peers. Use only public ExternalStoreRuntime/primitives and isolate experimental surfaces. The current queue API is request/poll, not Assistant Transport; introducing transport/streaming is deferred until the canonical backend protocol exists. Keep ESM/Vite output and Worker package boundaries.

## Risks and mitigations

- **Runtime API drift:** exact pin, package type inspection, adapter isolation and focused component tests.
- **ExternalStore API marked unstable:** constrain use to the adapter; add compatibility tests and avoid storing canonical state in runtime.
- **Optimistic UI duplication:** use server IDs and reconcile before appending completed messages; preserve request idempotency; never auto-submit on mount/reconnect.
- **False runtime claims:** no stream/run/tool/artifact/cancel UI unless backed by Core response capabilities.
- **Large dependency/bundle:** use tree-shaken primitives, inspect package and built entry size, retain modular build.
- **Cross-tenant leakage:** keep current authenticated API headers and server authorization; never treat frontend selected thread IDs as permissions.
- **Theme/locale regression:** continue using Astryx `Theme`/`InternationalizationProvider` and existing locale context.

## Completion evidence

Record source SHA and package pin; focused test/typecheck/build output; artifact/bundle and Wrangler dry-run; target identity and release receipt; live health/manifest evidence; authenticated UAT separately. Do not mark R1.18 complete until applicable criteria and open-contract limitations are honestly recorded.
