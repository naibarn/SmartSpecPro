# Section 03: Dashboard, Connect, and Release

Status: Complete with production/browser smoke pending

## Ownership

- `apps/web/client/src/features/desktop-releases/` and locale copy
- `apps/web/client/src/pages/MarketplaceCaptureConnect.tsx` plus focused helper/tests
- `apps/web/server/services/marketplaceCaptureConfig.ts` plus tests
- root `.env.example`
- generated canonical `0.1.138` ZIP

## Work and TDD

Make Dashboard release consumers canonical, present Companion product copy, and preserve the Marketplace Capture feature action. Implement/test canonical-first token delivery with legacy fallback only when Chrome reports no receiver. Add canonical origin-allowlist precedence with legacy fallback. Package and inspect the final ZIP.

## UI/UX Contract

- Target: users downloading or connecting the multi-purpose extension.
- Surfaces: Dashboard release card and Marketplace Capture connect/download card.
- States: release loading/available/unavailable; token sending/sent/manual/failed; canonical success and legacy compatibility.
- Responsive: preserve existing Dashboard/connect layouts at mobile, tablet, and desktop widths; only copy and behavior change.
- Accessibility: retain labelled text actions, focus styles, status messaging, and non-color error/success copy.
- Copy: Thai and English Dashboard descriptions call the product `SmartAIHub Companion`; `Open Marketplace Capture` remains capability-specific. Connect copy names Companion while explaining the Marketplace token purpose.
- Browser evidence: record manual/automated browser results when a Chrome session is available; otherwise mark skipped with the blocker.

## Acceptance

- Dashboard calls canonical release API and downloads canonical ZIP.
- Old installed extension still connects through message fallback.
- Explicit auth/security rejection is surfaced without legacy retry.
- Canonical config wins; legacy config still works.
- `0.1.138` ZIP is verified and `0.1.137` remains.

## Verification

- Focused web suite: 5 files and 16 passing tests.
- Canonical package:
  `apps/web/client/public/releases/smartaihub-companion-extension-0.1.138.zip`.
- Archive size: 167845 bytes.
- SHA-256:
  `60e52758a1c1beb9c5c1aa2796c6e2cc7eb81775b1cb5b82b84a2ad7619dce53`.
- Legacy `smartaihub-marketplace-capture-extension-0.1.137.zip` remains present.
- Full web TypeScript check was run and remains blocked by unrelated baseline
  errors outside the Companion files; focused tests and extension checks pass.
- Authenticated production endpoint smoke and Chrome side-panel smoke were not
  available in this local session.
