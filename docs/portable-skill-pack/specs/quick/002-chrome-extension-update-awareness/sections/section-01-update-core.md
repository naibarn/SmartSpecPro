# Section 01: Update Core

## Ownership

- `apps/extension/src/shared/extensionUpdate.ts`
- `apps/extension/src/shared/extensionUpdate.test.ts`
- `apps/extension/package.json` test script only

## Work

Write tests first, then implement strict version parsing/comparison, release parsing, same-origin HTTPS URL enforcement, cache freshness scoped to origin, native metadata validation, and notice derivation. Keep all browser-independent logic pure and dependency-free.

## Proof

`cd apps/extension && npm run test:update`

## Implemented

- Added strict one-to-four segment Chrome version handling, HTTPS same-origin release parsing, origin-scoped six-hour cache validation, native-update persistence, version-specific dismissal, and notice precedence.
- Added seven focused Node tests covering comparison, malformed input, URL fallback, cache freshness, native metadata persistence, dismissal, and native precedence.
- No dependency was added; the existing workspace `tsx` runtime executes the tests.
- Final proof: 7/7 tests passed.
