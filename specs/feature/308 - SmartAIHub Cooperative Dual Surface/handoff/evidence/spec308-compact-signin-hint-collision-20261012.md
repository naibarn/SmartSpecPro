# SPEC-308 compact sign-in hint collision

- Checked live UI only at `https://smartaihub.app` after deployment of Main `74e593891092b8a12f528db6d7e78a9370d75774`.
- At 320×740 and 390×740, the onboarding hint occupied y=566–652 and overlapped the Sign In action (at 320px, the button occupied y=553–589). The mobile mascot label was hidden and the launcher remained 64×64; the page had no horizontal overflow.
- At 768px and wider, the full launcher footprint returned and the page had no horizontal overflow. Guest Chat still opened the existing sign-in gate. Browser console and failed-request checks were clean.
- The desktop gear shortcut remained hidden at rest and Settings redirected to Sign In, as expected without an authenticated tenant session.
- PR #892's first browser run (head `5658f218a8fee4d15b5bc740ddaa167914899819`, run `38266992109`) passed the new 320px sign-in regression and all existing route-surface cases, but failed four reminder-balloon cases because treating every static page action as an obstacle hid reminders across other routes.
- Follow-up on `codex/spec308-hint-collision-20261012`, commit `8b065eb51d87192e39284ef585ce2dfb261633fe`: scope static interactive collision detection to `/login`; other routes retain the existing fixed/sticky collision behavior. PR checks must rerun on the updated head before integration.
- Open acceptance: authenticated tenant Bell/unread state, reminder CTA, five appearance styles, Settings persistence, and authenticated Chat behavior still require a live tenant session.
