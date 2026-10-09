# SPEC-308 UI capture record

Capture date: 2026-10-09. Source commit `a430a747cf4991cbb7fbbdf5351dad984f29231b`. Vite client returned HTTP 200. The server-backed app could not start because `DATABASE_URL` was missing, so the screenshots were captured from the client dev server with a mocked `GET /api/tenant/current` response enabling the SPEC-308 tenant flag. Session is unauthenticated/guest.

The global visual allow was set to `true` in the local Vite process only. Screenshot crops hide the unrelated transient system-error toast caused by the unavailable backend; no product CSS/state was changed for capture. These component crops establish size/placement/copy only. They do not establish authenticated Bell behavior, Settings, theme contrast, or full-page runtime acceptance.

| Viewport | Launcher bounds | Reminder bounds | Files |
|---|---:|---:|---|
| 320×800 | 44×44 at x=16, y=740 | 288×66 at x=16, y=654 | `320x800-launcher-crop.png`, `320x800-balloon-crop.png` |
| 390×844 | 44×44 at x=16, y=784 | 358×66 at x=16, y=698 | `390x844-launcher-crop.png`, `390x844-balloon-crop.png` |
| 768×1024 | 165.4×32 at x=586.6, y=976 | 453.8×58 at x=298.2, y=886 | `768x1024-launcher-crop.png`, `768x1024-balloon-crop.png` |
| 1440×900 | 165.4×32 at x=1258.6, y=852 | 453.8×58 at x=970.2, y=762 | `1440x900-launcher-crop.png`, `1440x900-balloon-crop.png` |

The mobile launcher keeps a 44×44 hit target and compact mascot icon. At 768px and 1440px, `AI Chat & Feedback` is visible. The reminder remains within each captured viewport, including 320px width. The app's own notification toast was not included in these crops; the crop is not a claim that it is absent in a full page.
