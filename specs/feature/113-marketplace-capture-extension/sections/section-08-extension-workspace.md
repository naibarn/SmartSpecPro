# Section 08 - Extension Workspace

## Objective

Create the Chrome MV3 extension workspace and typed runtime foundation.

## Scope

- `apps/extension`
- MV3 manifest
- Vite build
- service worker
- content script shell
- side panel shell
- typed shared messages/schemas

## Implementation Notes

- Use npm workspace conventions.
- Prefer existing dependencies. Add only extension build/testing dependencies if necessary.
- Manifest should use:
  - `manifest_version: 3`
  - `sidePanel`
  - `activeTab`
  - `scripting`
  - `storage`
  - `tabs` only if needed
  - explicit Shopee/TikTok/SmartSpecPro host permissions
- Content scripts read DOM and send typed messages.
- Service worker handles screenshot capture, API calls, token storage, retry state, and preview opening.
- Side panel displays connection state and current page type.
- Do not expose extension web-accessible resources unless necessary.
- Validate every message between page/content script/service worker/panel. Do not trust `window.postMessage` without source, type, and schema checks.
- Persist lightweight resumable operation state so service worker suspension can resume or safely cancel upload/analyze flow.
- Add manifest/CSP checks for no remote code, no eval, and narrow host permissions.
- Add release packaging checks that scan compiled output for remote hosted code strings, unexpected secrets, broad host permissions, and source-map leakage.
- Define dev, staging, and production base URL modes with visible environment labels in the panel.
- Prefer optional host permissions where practical; MVP host permissions must stay explicit and explainable.

## Tests First

- Manifest snapshot has narrow permissions.
- Message validators reject malformed cross-context messages.
- API client attaches bearer token and handles normalized errors.
- Token store clears tokens and queued drafts on logout/revoke.
- Service worker recovery resumes or cancels interrupted upload safely.
- Forged page-origin messages and unknown message types are rejected.
- Built extension bundle scan fails on remote hosted code patterns or leaked secrets.
- Environment labels prevent accidental production/local upload mixups.

## Acceptance Criteria

- Extension dev build compiles.
- Side panel opens on user gesture.
- Service worker/content script/panel can exchange typed messages.
