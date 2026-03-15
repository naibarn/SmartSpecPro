# Section 01 Code Review

## HIGH
1. **Handler swallows errors returning HTTP 200 instead of 500**: `suggestModel()` catch block makes all errors look like "no models". Handler will address this in Section 03. By-design per plan — deferred.
2. **`creditCostToTier(m.creditCost)` has no null guard**: If `creditCost` is undefined, this throws inside `toEntry()`, silently swallowed by catch. Need to verify registry type.

## MEDIUM
3. **`catch {}` has no logging**: Plan says "log internally". Empty catch means silent failures in production.
4. **`priority ?? 99` test vacuously passes**: If no-priority model falls out of top-4, the ordering assertion is skipped.
5. **`ModelEntry`/`SuggestResult` not exported**: Section 05 consumer needs these types.

## LOW
6. **balanced vs quality test only checks `recommended`**: Full alternatives array comparison would be more robust.
7. **`as never` mock casts**: Type gaps not surfaced in tests.
