# Section 13 — Dashboard Runner Download and Version UI

## Goal

Expose SmartAIHub Runner distribution and update controls in the existing
Dashboard/control surfaces, clearly separate Runner from Worker App and keep
GitHub implementation details hidden from normal users.

## Ownership and files

- `apps/web/client/src/features/runner-releases/useRunnerReleaseCatalog.ts`
- `apps/web/client/src/features/runner-releases/RunnerReleasePanel.tsx`
- `apps/web/client/src/features/desktop-releases/RunnerReleaseAdminPanel.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`
- `apps/web/client/src/pages/AdminDesktopHost.tsx`
- `apps/web/client/src/locales/en/dashboard.json`
- `apps/web/client/src/locales/th/dashboard.json`
- focused Vitest/component tests and a focused Playwright journey

Before creating UI code, run `npm run astryx -- build "SmartAIHub Runner release download and update card"` and use the result as a component/layout reference. Preserve existing application primitives and do not add a global Astryx reset.

## User UI contract

Add one Dashboard Runner card, visible at mobile/tablet/desktop breakpoints,
with:

- detected compatible platform/architecture and package size/version;
- `ตรวจสอบเวอร์ชัน`, `ดาวน์โหลด Runner` and conditional `อัปเดต Runner`;
- connected Runner list with display name, profile, current version, status,
  last seen and safe capability/tool readiness counts;
- explicit loading, empty, offline, busy, queued, downloading, verifying,
  draining, restarting, completed, permission-required, failed and rollback
  states;
- expandable safe details without absolute paths, tokens, prompts or GitHub
  URLs;
- keyboard-accessible controls, stable focus, semantic status/live regions and
  reduced-motion behavior.

The panel must use same-origin release APIs and the existing Runner status
projection. It must not navigate to `/chat` or any GitHub page for download or
update. Worker App cards retain their existing copy and routes.

Add the admin panel to the existing release console for build status, sync,
publish/withdraw and validation summary. Do not expose admin GitHub settings in
the normal Dashboard card.

## TDD steps

1. Add shared client types/fixtures and component tests for platform selection,
   latest-version comparison, redaction and every update state.
2. Run the focused component tests and observe the missing panel/hook failure.
3. Implement the catalog/status/update hooks with abort, stale-response and
   error handling; never cache mutable update status as a successful result.
4. Implement the responsive accessible card and admin panel using existing
   Dashboard surfaces/buttons/badges.
5. Add Thai/English translations for labels, state copy and errors.
6. Add focused tests for launcher-free inline Dashboard access, keyboard
   operation, profile labels and GitHub redaction.
7. Run the focused Vitest files and the focused Playwright journey if browser
   dependencies are available; otherwise record that external gate.

## Acceptance

- Normal users can download the correct native Runner only through SmartAIHub.
- Version check shows current/latest/last checked without inventing Runner
  liveness from a Job row.
- Update is disabled for offline, revoked, incompatible or busy states and
  shows command progress once queued.
- Runner and Worker App remain visibly and semantically distinct.
- UI is usable on mobile and keyboard accessible without raw secret/path output.
