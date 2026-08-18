# Section 02: Extension Identity

Status: Complete

## Ownership

- `apps/extension/` product identity, shared update logic/tests, service worker, verifier, and README
- focused `package-lock.json` workspace identity/version entries

## Work and TDD

Test canonical update paths and dual external token-message recognition, then rename the display/package identity. Switch packaging to `smartaihub-companion-extension-<version>.zip`, synchronize `0.1.138`, and keep Marketplace capability messages unchanged.

## Acceptance

- Manifest, panel, action title, package, update routes, README, and verifier use Companion identity.
- Service worker accepts canonical and legacy token messages with identical validation.
- Lockfile changes are focused; no unrelated regeneration.
- Extension tests and TypeScript/build pass.

## Verification

- Shared extension suite: 9 passing tests.
- Extension TypeScript check passed.
- Production Vite build and Dashboard package verifier passed.
- Archive inspection confirmed manifest name `SmartAIHub Companion`, version
  `0.1.138`, canonical update route, canonical and legacy token protocols, and
  product-name bundle marker.
