# SPEC-308 live public UI audit — 2026-10-13

- Canonical Main at audit start: `8a328777a43afebbba0ca07becaa5153613d9799`.
- Deployed UI source: `e57a01616337b638529430662057bed62577c26b`, as recorded by the existing deployment evidence. Main's later SPEC-308 commits are handoff-only; the current browser still serves the deployed UI bundle.
- Browser URL: `https://smartaihub.app/login` only. No IP, localhost, or loopback URL was used.
- Served JavaScript: `/assets/index-BBtGZNor.js`, SHA-256 `1218f5049ff82daf38f90123ea09f414e0a80cf81e63cf25c75b568ee48e82a1`, matching the prior exact-source deployment evidence.
- Chromium viewport checks: 320×740, 390×844, 768×900, 1024×900, and 1440×900; all routes returned HTTP 200, with no horizontal overflow, page errors, or failed requests.
- At 320×740 and 390×844 the mascot launcher is 64×64, has an accessible `Open AI Chat & Feedback` name, and does not cover Sign In or the Terms/Privacy links. At 768px and wider it is 180×124 and shows the full `AI Chat & Feedback` label.
- Clicking the launcher at each viewport opens the existing guest Chat sign-in gate. At desktop width, hovering/focusing the launcher reveals the Assistant appearance gear; clicking it routes to the protected appearance section, which correctly redirects an unauthenticated browser to `/login`. Direct navigation to `/settings` also redirects to `/login`.
- The public login surface has no authenticated Notification Bell or real notification event. Therefore Bell/unread state, a real reminder balloon/CTA, all five persisted appearance choices, authenticated Settings, and signed-in Chat/task controls remain unverified. No synthetic event was treated as tenant acceptance.
- Evidence is limited to unauthenticated responsive and route behavior. Keep all 66 requirement rows OPEN until tenant-authenticated evidence is captured.
- Next action: use the existing authorized session for tenant `tenant-ZCSKEM9s` at `https://smartaihub.app` to verify the Bell/unread state, real reminder CTA routing, five appearance styles and persistence, Settings, and signed-in Chat/task controls. Continue only independent source fixes meanwhile.
