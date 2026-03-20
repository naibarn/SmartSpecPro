# Section 06 Code Review Interview

## Review Summary
Reviewer verdict: APPROVE_WITH_FIXES (8 findings)

## Triage & Decisions

### Auto-fixed (applied without interview)

1. **HIGH: Vacuous security test guards (imageExtension.test.ts, audioExtension.test.ts)**
   - `if (imageNode)` / `if (audioNode)` guards made XSS rejection tests pass vacuously
   - Fixed: unconditional assertion `expect(node?.attrs?.src ?? "").toBe("")`

2. **MEDIUM: Missing `data-alignment` in MEDIA_DATA_ATTRS (mediaSerializationRules.ts)**
   - Would cause Section 11 DOMPurify to strip alignment from images
   - Fixed: added `"data-alignment"` to the constant

3. **MEDIUM: Video width/height dropped in markdown serialization (videoExtension.ts)**
   - Save→reload round-trip lost video dimensions
   - Fixed: added `width` and `height` to serialize function

4. **MEDIUM: Imprecise `toBeFalsy()` assertion (videoExtension.test.ts)**
   - Changed to `toBe("")` to pin exact contract

5. **LOW: Commands augmentation key (imageExtension.ts)**
   - Changed `imageExtension:` to `image:` to override base declaration cleanly

### Let go (not fixed)

6. **LOW: addNodeView placeholder** — Section 07 will add node views naturally as part of its scope
7. **LOW: Caption XSS test** — DOM `setAttribute` encodes, `escapeAttr` covers markdown; can add in Section 13 hardening
8. **MEDIUM: Parameterized sanitization tests for all blocked protocols** — Deferred to Section 13 (hardening tests)
