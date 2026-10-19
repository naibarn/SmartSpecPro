# Section 01 — Browser session correctness

Owner/paths: main implementer; `apps/web/server/_core/cookies.ts`, `apps/web/server/__tests__/auth-cookies.test.ts`, focused cookie CI step. Do not modify tenant resolution or deployment transport in this slice.

Prerequisite: latest canonical source and reproduced public-suffix cookie failure. Observable acceptance: Worker/version-host cookies are accepted as Secure/HttpOnly host-only cookies, absent on sibling Workers; production `.smartaihub.app` sharing remains intact. Focused repair is already implemented/integrated; read parent HANDOFF before repeating it.

TDD: actual helper inputs fail on Domain=.workers.dev before repair; focused unit suite passes afterward. Isolated Chromium response fixture verifies browser acceptance/rejection; this does not prove live login. No dependency needed.

UI/UX Contract: existing login/session flow, no new screen/layout/component; states anonymous, logged in after reload, logged out, expired and 2FA pending; desktop/mobile behavior and keyboard/form accessibility remain unchanged. Existing Thai/English copy stays unchanged. Browser evidence must distinguish isolated cookie fixtures from real staged authentication. Capture no user secrets.

Merge readiness: focused helper tests, clean exact-path diff and no secret. Can integrate before origin provisioning. Exposure/fallback: server helper only; no active Linux release implied. Rollback: revert the scoped change through normal integration/release if needed; retain existing production behavior. Before a custom-domain staging phase, separately address inherited parent-domain cookie collisions and cookie naming/scoping.


## UI/UX Contract

### Target User / JTBD

Existing users logging in through the staging browser host.

### Surface Inventory

Existing login, callback, 2FA and session-dependent pages; no new visual surface.

### Component Map

Existing Login inputs/buttons and useAuth session state; no component replacement.

### State Matrix

Anonymous, authenticated, reload, expired, logged out and pending 2FA.

### Responsive Matrix

Desktop 1440x1000 and mobile 390x844; cookie semantics identical.

### Accessibility Acceptance

Preserve labels, keyboard submission, focus and password visibility control.

### Copy Contract

No copy changes; preserve existing Thai/English localization.

### Browser Evidence Required

Isolated Chromium cookie proof now; real login/session/logout proof after origin release.
