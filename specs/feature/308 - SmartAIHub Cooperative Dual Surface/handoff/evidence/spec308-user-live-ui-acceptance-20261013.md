# SPEC-308 user-confirmed live UI acceptance — 2026-10-13

- Acceptance source: direct user confirmation in this task on 2026-10-13: “ใช้งานได้ครบจริง” (“works fully for real”), in response to the requested live tenant checklist.
- The confirmed checklist covered the authenticated tenant Notification Bell and real unread state; a real reminder balloon shown once with CTA routing to Notifications without marking the item read; all five appearance choices (`droplet`, `star`, `shield`, `chat`, `orbit`) and persistence after reload; authenticated Settings; signed-in Chat/task controls; and responsive checks at 320, 390, 768, and 1024px.
- The public UI source previously verified live at `https://smartaihub.app` is `e57a01616337b638529430662057bed62577c26b`; its served JavaScript SHA-256 was `1218f5049ff82daf38f90123ea09f414e0a80cf81e63cf25c75b568ee48e82a1`.
- This is user-reported acceptance, not an independently captured browser trace. No screenshot, credentials, notification content, or session data were collected.
- This acceptance records the requested user-visible checklist as PASS. It does not close the 66 individual requirement-ledger rows: those still need their exact-source implementation and verification evidence, including the separate privacy, event-authority, accessibility, performance, rollback, and integration criteria.
