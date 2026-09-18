# Section 01 — Shared contracts

Implement the public, dependency-free contract in
`packages/shared/src/content-protection.ts` and export it from the shared
package. Define modalities (`image`, `video`, `audio`), user choice/source,
protection statuses, verification classifications, evidence strengths, worker
job type, route/menu IDs, and bounded request/result interfaces. Add pure
canonical JSON/hash helpers and `resolveEffectiveWatermarkChoice`.

Tests first in `packages/shared/src/content-protection.test.ts`: stable object
ordering, ordered compound input identity, stale identity changes, OFF override,
and invalid values. Do not include provider secrets, signing keys, or codewords
in any exported type.

Done when the shared package exports compile under existing package tests and
all tests meaningfully assert behavior.

## Implementation record

- Added `packages/shared/src/contentProtection.ts` and exported it from
  `packages/shared/src/index.ts`.
- Added `apps/web/shared/__tests__/contentProtectionContracts.test.ts`.
- Focused verification: 2 tests passed with Vitest.
