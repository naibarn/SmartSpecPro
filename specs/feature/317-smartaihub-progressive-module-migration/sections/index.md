<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter <changed-package> test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-package-boundaries-and-builds
section-02-react-shell-login-and-routing
section-03-chat-worker-auth-data-and-provider-contract
section-04-chat-independent-ui-and-artifacts
section-05-browser-pilot-and-runtime-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 package boundaries/builds | - | 02, 03, 04, 05 | Foundation |
| 02 React Shell/login/routing | 01 | 04, 05 | After 01 |
| 03 Chat Worker auth/data/provider | 01 | 04, 05 | Parallel with 02 after 01 |
| 04 Chat independent UI/artifacts | 01, 02, 03 | 05 | No |
| 05 browser pilot/runtime proof | 01–04 | - | Final integration |

## Execution Order

1. Section 01 establishes independent package builds, manifests and tiny contracts.
2. Sections 02 and 03 proceed from that boundary; section 03 must finish a read-only live schema/writer audit before any persistence implementation.
3. Section 04 consumes Shell routing and Chat API contracts but remains independently built and served.
4. Section 05 adds only the authorized browser adapter/job projection, runs scoped local checks and records target/UAT gaps truthfully.

## Section Summaries

### section-01-package-boundaries-and-builds
Remove default aggregate build, add explicit Core/Shell/Chat workspace commands and validate the module manifest/build boundary.

### section-02-react-shell-login-and-routing
Create fresh React/Vite account Shell; login success and authenticated root land on `/chat`, with no Legacy dashboard.

### section-03-chat-worker-auth-data-and-provider-contract
Add the Chat Hono Worker with Core-derived principal and verified shared-data/provider boundaries; do not invent DDL or credentials.

### section-04-chat-independent-ui-and-artifacts
Build the Chat SPA independently and lazy-load it from Shell; include basic streaming UI, a typed structured block and persistent artifact panel.

### section-05-browser-pilot-and-runtime-proof
Connect the authorized Chromium/Playwright adapter and durable job contract when configured; verify package-only build/Worker behavior and document remaining UAT/deployment gaps.
