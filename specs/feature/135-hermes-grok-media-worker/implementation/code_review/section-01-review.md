# Section-01 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **APPROVE_WITH_FIXES** → all fixes applied (see interview file).

## Findings

1. **MAJOR — AdminMediaModels.tsx L1725-1793 + L1951-1954:** fail-closed
   transport coercion fed `formData.transport`, which the Save mutation
   writes back to `configJson.transport` → opening Edit on a future
   `hermes_worker` row and saving would silently corrupt it to
   `gateway_api`. FIXED: local types widened to `MediaTransport`, real
   transport passed through (both handleEditModel/handleDuplicateModel),
   comment pointing at sections 10/12.
2. **MEDIUM — shared/hermesMedia.ts maskTokenLike:** unused-in-diff,
   untested, doc comment falsely claimed parity with `maskApiKey`
   (different threshold/reveal). FIXED: own-convention comment + 5 tests.
3. **NIT — workerRuntime.ts:** missing `hermesMediaCapabilityFamilySchema`
   z.enum vs sibling convention. FIXED.
4. **LOW — StoryboardReviewPage.tsx:** display-only mislabel risk
   ("API" instead of "Hermes") — resolved by the same type widening.
5. **NIT — maskTokenLike surrogate pairs:** let go (ASCII token shapes;
   malformed-not-unsafe).

## Clean categories
- Correctness: contract schema superRefine (bounds → continuity →
  uniqueness), effectiveHermesCapability min/AND + no-opinion defaults,
  parseHermesErrorMessage rejects unknown codes, TTL cache-trio de-dupes.
- Spec fidelity: 22 codes byte-exact vs spec §13.7 (order + retryability
  set of 9); frozen wire constants exact; systemSettings hooks in BOTH
  branches (delete L775-781, set L853-859).
- Client-safety: zod-only imports.
- Conventions: tightly scoped hunks, lazy-import pattern respected.
- Impact ripple: untouched `=== "mcp"` call sites degrade safely.
