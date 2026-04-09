# Section 06 status

- Status: implemented, uncommitted
- Completed this round:
  - shared Desktop Host labels and handoff helpers
  - Settings tab integration for Desktop Host managed-mode plus live device, control-plane, package, and parser posture fetch
  - tenant admin desktop governance page and route
  - concrete `/desktop/open` and `/desktop/view` handoff pages with fallback UX
  - Chat surface handoff controls for agencies
  - reusable bootstrap / rollout / local-root UI panels
  - enrolled-device posture cards with PoP, attestation, and last-seen visibility
  - selected-device control-plane cards with real rollout gates, workspace posture, and package sync summaries
  - desktop package catalog cards with signer / trust / revocation-derived state
  - managed local-root action queue buttons for reindex / purge / revoke
  - disable-device action on the settings surface for governed offboarding
  - isolated rich-document parser capability cards with bounded format coverage, extractor backend, render backend, office renderer, rendered-preview coverage, and complex-document posture
- Targeted tests passed:
  - `npm --prefix apps/web test -- client/src/features/desktop-host/__tests__/desktopHostUi.test.tsx client/src/pages/__tests__/Settings.desktopHostTab.test.tsx client/src/pages/__tests__/DesktopHandoffPages.test.tsx client/src/pages/__tests__/AdminDesktopHost.test.tsx`
