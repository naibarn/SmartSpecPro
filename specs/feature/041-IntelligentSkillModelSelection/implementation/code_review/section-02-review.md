# Section 02 Code Review

## Findings

1. **[HIGH] Partial NaN pricing** — When one pricing field is null and the other valid, the code uses only the valid one. Spec doesn't define this. Reasonable behavior but needs a test.

2. **[MEDIUM] CAPABILITY_FLAGS typing** — `(keyof ModelPriorityInput)[]` allows non-boolean keys. Should be narrower.

3. **[LOW] JSDoc range '1-99'** — Actual max is 85. Misleading but harmless.

4. **[LOW] Missing edge-case tests** — epoch createdAt, isFree=null.
