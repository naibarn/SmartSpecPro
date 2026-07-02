# Chat UI Browser Evidence

Date: 2026-07-02

## Environment
- Build: `npm --prefix apps/web run build`
- Server: `PORT=3018 npm --prefix apps/web run start`
- Route: `http://127.0.0.1:3018/chat?c=102`
- Data: Playwright mocked auth, tenant, chat, model, and skill tRPC responses to isolate UI layout from local database state.

## Viewports
| Viewport | Size | Selected chat | Skills panel | Horizontal overflow | Composer visible | Console errors |
|---|---:|---|---|---|---|---|
| Mobile | 390x844 | pass | pass | no | yes | none |
| Tablet | 834x1112 | pass | pass | no | yes | none |
| Desktop | 1440x1000 | pass | pass | no | yes | none |

## Artifacts
- `artifacts/ui/chat/chat-responsive-evidence.json`
- `artifacts/ui/chat/selected-mobile-after.png`
- `artifacts/ui/chat/selected-tablet-after.png`
- `artifacts/ui/chat/selected-desktop-after.png`
- `artifacts/ui/chat/skills-panel-mobile-after.png`
- `artifacts/ui/chat/skills-panel-tablet-after.png`
- `artifacts/ui/chat/skills-panel-desktop-after.png`

## Notes
- The Vite dev server hit an OS file-watch `ENOSPC` limit in this workspace, so final browser verification used a production build/server.
- The first-run language picker was disabled in the Playwright context via the app's existing locale localStorage key so the test targeted the chat workspace itself.
