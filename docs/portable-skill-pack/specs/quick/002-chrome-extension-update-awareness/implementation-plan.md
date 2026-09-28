# Implementation Plan

## Objective

Provide non-blocking update awareness in the extension and package verified release `0.1.137` into the Dashboard's existing releases directory.

## Approach

1. Add a shared update module containing strict Chrome-version parsing/comparison, six-hour origin-scoped cache validation, release-response parsing, same-origin HTTPS download enforcement, native metadata validation, and deterministic notice derivation.
2. Add focused Node tests first for newer/equal/older/malformed versions, cache expiry/origin changes, URL fallback, exact-version dismissal, and native precedence.
3. Wire the service worker to persist `runtime.onUpdateAvailable` metadata and clear stale metadata after installation/update.
4. Wire the panel to read cached/dismissed/native state, fetch the existing public latest route when stale, and show a compact accessible banner. Dashboard releases open in a new tab; native updates reload only after a click.
5. Synchronize `0.1.137` across extension package, manifest, panel constant, and workspace lock metadata. Build/package with the existing script and inspect the ZIP.

## Affected files

- `apps/extension/src/shared/extensionUpdate.ts` and test
- `apps/extension/src/background/serviceWorker.ts`
- `apps/extension/src/panel/App.tsx`
- `apps/extension/src/panel/style.css`
- `apps/extension/package.json`
- `apps/extension/public/manifest.json`
- `package-lock.json`
- generated `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.137.zip`

## Risks and mitigations

- Stale/off-origin release metadata: validate every value and bind cache to the current HTTPS origin.
- Interrupted work: never auto-reload or block capture; native reload requires explicit action.
- Excess requests: cache successful checks for six hours and avoid `requestUpdateCheck()` polling.
- Dirty worktree: patch only focused hunks and verify explicit diffs.

## Acceptance criteria

- No banner when current/equal/older, malformed, failed, or exact-version-dismissed.
- New Dashboard version shows current/latest version and download/dismiss actions.
- Native-ready update shows restart action and takes precedence.
- A newer version after dismissal appears again.
- Update failures do not alter panel status or existing workflows.
- Version metadata and generated ZIP all report `0.1.137`; prior ZIP remains.
- Focused tests, typecheck/build, package verifier, ZIP inspection, and diff check pass.
