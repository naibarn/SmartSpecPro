# Implementation plan

## Baseline and boundaries

- UI source checkout: `/mnt/SmartSpecDev/projects/smartaihub-platform`, canonical `main`; observed base `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5`, clean at inspection.
- Spec/handoff checkout: SmartSpecPro; preserve all pre-existing dirty and untracked paths. New work is isolated under this task folder and the SPEC-294 handoff.
- Existing canonical Mission/Task DTOs are defined in `packages/saas-contracts/src/index.ts`. The current tenant Mission contract supports Job/Run/Agent/artifact IDs and null optional context. No live tenant Mission UI route exists in the shell; Chat contains only a small per-conversation Mission read/create panel.
- Add an authenticated, non-navigation prototype route to the shell App. Host guard allows only `aimarkethubs.com`, localhost and loopback. No services/API calls or production runtime changes.

## Sections

1. **Route and prototype fixture/view model** — isolate route; implement responsive shell, complete navigation and synthetic canonical-shaped fixtures, theme/mode changes, filters/sort/session selection, local navigation and scenario states.
2. **Execution inspector and interaction coverage** — implement mission/job distinction, all requested inspector tabs, null identity and unsupported evidence copy, accessible tablet/mobile drawers; focused shell tests prove core interactions and no backend dispatch.
3. **Spec mapping, screenshots and DEV delivery** — document interactions, component inventory, requirement matrix, gaps and proposed canonical-runtime integration; capture three specified viewport screenshots; build/deploy only through `modular-debian-dev` controller; verify existing routes remain healthy and prototype route HTTP/UI behavior; update existing SPEC-294 handoff with evidence and explicit pending acceptance.

## Verification

- Focused Vitest tests for the new page and shell route.
- `pnpm --filter @smartaihub/saas-shell build` (includes Wrangler dry-run) after focused tests.
- Browser evidence at 1440x900, 820x1180, 390x844; check navigation, responsive overflow, keyboard access, filters, detail tabs, theme/mode, null identity, all states and local related-view navigation.
- Confirm network-free component fixture behavior by asserting no fetch calls from the prototype component.
- DEV target preflight from `apps/web/scripts/deployment-targets.json`; use the registered `modular_debian_dev_release.py` path only after source is integrated. No Cloudflare, `smartaihub.app`, or `smartsihub.com` release.

## Definition of Done for this UX task

The standalone route is usable, interactions respond to user input, desktop/tablet/mobile are evidenced, synthetic data and unsupported evidence are truthful, existing routes remain unchanged, documents and handoff exist, and DEV preview path is reported. This does not mean owner visual acceptance, production integration, real execution evidence, SPEC-224 acceptance, or SPEC-312 completion.
