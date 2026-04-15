# Section 06: Unified UX, Cross-Surface Handoff, and Run Labels

## Ownership

This section owns the user-visible product coherence between web and desktop.

## Target files and modules

- `apps/web/client/src/features/desktop-host/*`
- `apps/web/client/src/features/desktop-host/useDesktopHostStatus.ts`
- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/pages/Settings.tsx`
- run-detail and package-detail UI modules already used by web control-plane screens
- desktop bootstrap and handoff components rendered inside the Tauri-hosted web UI
- `apps/web/client/src/features/desktop-host/__tests__/*`

## Scope

- align package cards, trust badges, run labels, and runtime labels across surfaces
- add handoff flows:
  - Open in Desktop
  - View on Web
  - resume/view same run on both surfaces
- add first-run desktop bootstrap UX for sign-in, device registration, policy validation, root selection, and package sync
- expose runtime provenance clearly so users know what happened locally versus on the server
- surface enrolled-device posture and local parser isolation posture inside the same managed-mode settings experience

## Implementation notes

- prefer shared UI components and shared enum/label helpers instead of separate desktop-only copies
- the Tauri-hosted workbench should feel like SmartAIHub, not like a generic shell console
- required run labels:
  - surface
  - runtime
  - trust
  - locality
  - workspace
- package views should surface:
  - source
  - signer
  - trust class
  - revocation state
  - capability summary
- managed-mode settings should surface:
  - enrolled device health
  - proof-of-possession / attestation posture
  - local parser isolation mode, format coverage, and bounded limits

## TDD expectations

- add label-rendering tests before page integration
- add bootstrap state tests before provisioning/network calls
- add cross-surface deep-link tests before shipping handoff buttons
- add role-visibility tests where desktop controls depend on tenant or admin policy

## Acceptance checks

- users can understand where execution happened without reading raw logs
- web and desktop use the same trust and package vocabulary
- desktop onboarding feels like the same product as the web surface
- cross-surface handoff works for projects, runs, skills, and agencies

## Risks and coordination notes

- do not let desktop-specific implementation details leak into user-facing labels when a stable product label exists
- make sure the UX still distinguishes local, external, and server execution truthfully

## Implementation status

- Added shared desktop-host label and handoff helpers in:
  - `apps/web/client/src/features/desktop-host/labels.ts`
- Added reusable UI building blocks in:
  - `apps/web/client/src/features/desktop-host/DesktopHostBootstrapCard.tsx`
  - `apps/web/client/src/features/desktop-host/DesktopHostRolloutGatePanel.tsx`
  - `apps/web/client/src/features/desktop-host/DesktopHostSettingsPanel.tsx`
  - `apps/web/client/src/features/desktop-host/useDesktopHostStatus.ts`
  - `apps/web/client/src/features/desktop-host/useDesktopDeviceControlPlaneState.ts`
  - `apps/web/client/src/features/desktop-host/useDesktopPackageCatalog.ts`
  - `apps/web/client/src/features/desktop-host/local-files/LocalFileRootsPanel.tsx`
  - `apps/web/client/src/features/desktop-host/runs/DesktopRunBadgeRow.tsx`
  - `apps/web/client/src/features/desktop-host/agencies/DesktopAgencyHandoffLinks.tsx`
- Integrated Desktop Host surfaces into:
  - `apps/web/client/src/pages/Settings.tsx`
  - `apps/web/client/src/pages/Chat.tsx`
  - `apps/web/client/src/pages/Dashboard.tsx`
  - `apps/web/client/src/pages/Admin/AdminCommandCenter.tsx`
  - `apps/web/client/src/pages/AdminSettings.tsx`
- Added concrete handoff and admin surfaces in:
  - `apps/web/client/src/pages/DesktopOpen.tsx`
  - `apps/web/client/src/pages/DesktopView.tsx`
  - `apps/web/client/src/pages/AdminDesktopHost.tsx`
  - `apps/web/client/src/App.tsx`
- Added device and parser posture visibility to the settings surface:
  - enrolled device list with owner identity, health, access state, presence/stale posture, PoP posture, attestation mode, attestation provider/claims, broker posture, and last-seen timestamps
  - device selector plus selected-device control-plane state, rollout gates, and workspace posture
  - live package sync summaries and desktop package catalog cards with trust / signer / state
  - managed local-root cards with reindex / purge / revoke actions
  - device-disable action plus per-device policy overrides and remote governance actions that drive the new governed offboarding and quarantine flows
  - isolated rich-document parser posture with bounded input/timeout, supported format summary, extractor backend, OCR provider, macro/media inspection posture, layout-analysis posture, and extraction-only vs full-render posture
- Added TDD coverage in:
  - `apps/web/client/src/features/desktop-host/__tests__/desktopHostUi.test.tsx`
  - `apps/web/client/src/pages/__tests__/Settings.desktopHostTab.test.tsx`
  - `apps/web/client/src/pages/__tests__/DesktopHandoffPages.test.tsx`
  - `apps/web/client/src/pages/__tests__/AdminDesktopHost.test.tsx`
  - `apps/web/client/src/pages/__tests__/Dashboard.test.tsx`

## Final status

- Section 06 is implemented for shared labels, desktop bootstrap and control-plane visibility, enrolled-device posture, root/package governance UI, cross-surface deep-link handoff routes, tenant admin desktop governance screens, and clearer admin discoverability from a dedicated Dashboard governance panel, Dashboard next-best-actions, Admin Command Center, and Settings surfaces.
