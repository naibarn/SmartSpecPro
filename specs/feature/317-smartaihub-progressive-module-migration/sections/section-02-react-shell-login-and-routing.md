# Section 02 — React Shell login and Chat-first routing

## Requirement IDs

`REQ-4BB581C90577`, `REQ-2B7D77E6D086`, `REQ-AB16939A3F52`, `REQ-C8D3AE2138BD`, SPEC-317 R1.6.

## Objective

Create a fresh, small React/Vite Shell for account/session UX. Successful login lands on `/chat`; authenticated `/` and `/dashboard` route to `/chat`. Unauthenticated deep links preserve only a safe same-origin return route. The Shell owns no Legacy Dashboard, provider secrets or business authorization.

## Owned paths

In `/mnt/SmartSpecDev/projects/smartaihub-platform`: `apps/saas-shell/**` and only required named root script/workspace declarations. Do not import or edit `apps/web` runtime.

## Prerequisites

Section 01 package/build boundary. Consume existing Core login/session APIs and small public contracts; do not change account storage.

## UI/UX Contract

### Target User / JTBD
- Role: existing SmartAIHub user.
- Goal: use their existing account and start a Chat immediately.
- Entry point: new Modular app root or `/login`.
- Success outcome: authenticated user sees Chat as the first work surface.

### Existing Pattern Reference
- Searched (rg query): `rg -n "login|auth|ChatPage|conversation" apps/web/client/src/pages apps/web/client/src/components`.
- Found: Legacy `apps/web/client/src/pages/Login.tsx` and auth tests; `UnifiedWorkspace.tsx`, `Chat.tsx`, and Chat components.
- Decision: diverge in implementation and visual shell; preserve tested interaction expectations only.
- Reason: the Legacy bundle/runtime is explicitly excluded, and the new product removes the Dashboard as its primary information architecture.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Sign-in | `/login` | Fresh form calling Core |
| Root | `/` | Authenticated → `/chat`; unauthenticated → `/login` |
| Chat route | `/chat` | Resolve manifest and lazy-load module |
| Legacy dashboard alias | `/dashboard` | Redirect to `/chat`; never render Legacy UI |
| Account controls | Shell header/menu | Show canonical identity; logout via Core |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| AppRouter | `apps/saas-shell/src/router.tsx` | Root/login/chat/alias routes | Session state, module registry |
| LoginPage | `apps/saas-shell/src/pages/LoginPage.tsx` | Form and validation display | Core auth API |
| SessionProvider | `apps/saas-shell/src/session/SessionProvider.tsx` | `/me`, expiry, logout | Core auth contract |
| ModuleLoader | `apps/saas-shell/src/modules/ModuleLoader.tsx` | Manifest validation and lazy load | versioned module artifact |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Small neutral progress state; no dashboard flash | route test |
| empty | N/A on login | N/A |
| error | Generic sign-in/session message; no internal details | Core failure test |
| success | Direct Chat navigation | route test |
| disabled/focus/hover | Explicit disabled during submit; visible focus; semantic controls | component/a11y check |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Single-column login; no horizontal overflow | Browser check |
| tablet 768x1024 | Centered compact account panel | Browser check |
| desktop 1440x900 | Login remains focused; Chat module gets main canvas | Browser check |
| small-mobile 360x800 | Form controls fit | Extended if layout risk |
| laptop 1024x768 | No clipped session/menu controls | Extended if route risk |
| wide-desktop 1280x800 | N/A: no dense dashboard/table | N/A |

### Accessibility Acceptance
- Keyboard path: email → password → submit; focus moves to meaningful error or next route heading.
- Focus visibility: visible and not covered by dialogs/menus.
- Labels/semantics: real form labels, autocomplete hints, button semantics, live-region errors.
- Contrast: semantic tokens with accessible text/control contrast.
- Reduced motion: no required animation; respect user preference.

### Copy Contract
- Tone: concise and calm.
- Primary language(s): Thai and English through the existing localization contract.
- Required labels: `เข้าสู่ระบบ` / `Sign in`, `อีเมล` / `Email`, `รหัสผ่าน` / `Password`, `แชต` / `Chat`, `ออกจากระบบ` / `Sign out`.
- Validation/error copy: generic invalid credentials, unavailable service, and expired session; do not reveal account existence.
- Empty/loading/success copy: loading sign-in; successful entry moves to Chat without a dashboard welcome screen.
- Localization/fallback notes: prefer saved locale; fall back to Thai.

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md`; required viewport evidence is mobile 390x844, tablet 768x1024, desktop 1440x900. Real login evidence requires a supplied approved credential and must redact password/session data.

## Completion predicate

Core auth uses the existing canonical account ID; successful flow lands on Chat. No dashboard component is imported. Shell builds independently and Shell `/dashboard` alias cannot show the Legacy dashboard. Core response errors are sanitized and tenant authority remains server-side.

## Verification/evidence

Shell-only build, route/component checks, auth API contract check and browser evidence where credentials/tooling permit. Record any skipped real account UAT without claiming a pass.

## Fallback and blocker strategy

Use the existing Core `/login` and `/me` interface; adapt only the typed client if needed. If actual test credentials are unavailable, prove routes with an auth stub and leave real-account UAT explicitly pending; do not reset the account or expose credentials.
