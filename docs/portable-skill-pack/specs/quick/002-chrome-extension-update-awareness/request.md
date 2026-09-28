# Chrome Extension Update Awareness

## Request

Add version awareness to the SmartAIHub Marketplace Capture Chrome extension. When a newer release exists, notify the user and use automatic installation only when Chrome has already delivered a native extension update. Otherwise, open the existing Dashboard download route. Build version `0.1.137` into the existing Dashboard releases directory and keep prior ZIPs intact.

## Constraints

- Reuse `GET /api/desktop-releases/marketplace-extension/latest` and the existing download route.
- Do not add a polling timer, `update_url`, dependency, deployment, or Chrome Web Store publication.
- Keep update failures non-blocking for capture and media workflows.
- Trust only same-origin HTTPS download URLs.
- Preserve unrelated dirty-worktree changes, especially the existing edits in `panel/App.tsx`.

## Non-goals

- Building a signed CRX update server.
- Forcing reload while the user is working.
- Removing release `0.1.136` or other rollback artifacts.
