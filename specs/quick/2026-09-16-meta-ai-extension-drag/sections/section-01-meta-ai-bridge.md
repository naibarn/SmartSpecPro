# Section 1 — Meta.ai drag bridge

## Ownership

Files: `apps/extension/public/manifest.json`,
`apps/extension/src/content/dragBridge.ts`,
`apps/extension/src/background/serviceWorker.ts`.

Add HTTPS Meta.ai target recognition and a provider-specific file-input-first
delivery path. Preserve existing sender validation, TTL, and fallback behavior.

## TDD/acceptance

- Built manifest contains Meta.ai in host permissions and dragBridge matches.
- Source and bundle contain target detection and delivery branch.
- Existing provider target branches remain intact.

