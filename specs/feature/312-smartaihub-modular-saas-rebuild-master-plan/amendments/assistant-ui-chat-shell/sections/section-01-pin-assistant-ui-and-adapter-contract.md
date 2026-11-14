# Section 01 — pin assistant-ui and define adapter boundary

## Deliverable

Add the exact React-compatible `@assistant-ui/react` version selected by the plan to `modules/chat` only. Inspect the installed exports/types for `useExternalStoreRuntime`, runtime provider, thread and composer primitives. Create a narrow module-owned adapter contract/mapping helper without changing backend APIs or moving canonical state into the library.

## Owned paths

- `smartaihub-platform/modules/chat/package.json`
- `smartaihub-platform/pnpm-lock.yaml`
- New `smartaihub-platform/modules/chat/src/ui/assistantUi*` adapter/mapping files
- Planning research/evidence in this amendment only

## Acceptance

- Exact dependency pin and React peer compatibility are recorded.
- No Assistant Cloud, AI SDK, Cloudflare Agents or server-only/Express dependency is added.
- A focused Chat typecheck/build or type-level proof confirms the runtime API is available.
- Current build and behavior remain unchanged until the adapter is mounted.

## Prerequisites and gaps

The source Chat package is clean at start. The External Store API is documented as unstable; isolate it and do not let its API become a persistence contract. Runtime output must remain independently buildable.
