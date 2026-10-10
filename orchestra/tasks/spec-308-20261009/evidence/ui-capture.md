# SPEC-308 UI capture record

Capture date: 2026-10-09. Source commit `64dc5fb3c9c2fec61b909a1c956346d7476258ef` contains the mobile width/breakpoint fixes recorded in QA round 13. Vite client returned HTTP 200. Captures used a mocked `GET /api/tenant/current` response enabling the SPEC-308 tenant flag; the app session was unauthenticated/guest. The deployment visual allow was set to `true` for the local Vite process only.

The crops hide the unrelated transient system-error toast caused by the unavailable backend; no product styles were changed to hide it. These captures establish responsive component geometry and generic text only. They do not establish authenticated Bell behavior, Settings, theme contrast, or full-page runtime acceptance.

| Viewport | Launcher bounds | Notification balloon bounds | Onboarding hint | Files |
|---|---:|---:|---|---|
| 320×844 | 44×44 at (16, 784) | 216×66 at (16, 698) | 216×66 at (16, 698); CTA opened guest Chat dialog | `320x844-launcher-crop.png`, `320x844-balloon-crop.png`, `320x844-onboarding-crop.png` |
| 360×844 | 44×44 at (16, 784) | 216×66 at (16, 698) | 216×66 at (16, 698) | `360x844-*` |
| 375×844 | 44×44 at (16, 784) | 216×66 at (16, 698) | 216×66 at (16, 698) | `375x844-*` |
| 390×844 | 44×44 at (16, 784) | 216×66 at (16, 698) | 216×66 at (16, 698) | `390x844-*` |
| 767×844 | 44×44 at (707, 784) | 216×66 at (535, 698) | 216×66 at (535, 698) | `767x844-*` |
| 768×900 | 165.4×32 at (586.6, 852) | 453.8×58 at (298.2, 762) | hidden | `768x900-launcher-crop.png`, `768x900-balloon-crop.png` |
| 1024×900 | 165.4×32 at (842.6, 852) | 453.8×58 at (554.2, 762) | hidden | `1024x900-launcher-crop.png`, `1024x900-balloon-crop.png` |
| 1440×900 | 165.4×32 at (1258.6, 852) | 453.8×58 at (970.2, 762) | hidden | `1440x900-launcher-crop.png`, `1440x900-balloon-crop.png` |

At widths below 768px, both reminder surfaces fit within the viewport and remain at or below 216px wide (the selected token-derived limit under the spec's ~220px target). The long launcher label is hidden below 768px and visible at 768px and above, independent of the optional onboarding setting. The onboarding hint appears only for the mobile guest capture and is suppressed when the notification balloon is shown. The app's own notification toast is not represented by these crops.
