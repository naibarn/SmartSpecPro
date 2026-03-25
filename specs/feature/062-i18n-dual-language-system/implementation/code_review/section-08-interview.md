# Section-08 Code Review Interview

## Auto-Fixed Items

### HIGH: bsHelp.* collision with help.* in help.json
**Decision**: Auto-fix
**Action**: Added `SUBNAMESPACE_PREFIX = { bsHelp: "bs" }` to generation script. `bsHelp.title` now generates `bs.title` in help.json instead of overwriting `help.title`. Verified: `title` = "Complete User Guide" and `bs.title` = "Browser Session Help" coexist. Added collision test to localeFiles.test.ts.

### HIGH: Unknown prefixes fall through to misc silently
**Decision**: Auto-fix
**Action**: `keyToNamespace()` now logs a `console.warn` for unmapped prefixes and returns `"misc"`. `processLocale()` skips `misc` namespace keys (`if (ns === "misc") continue`). No misc.json is ever written. Currently zero warnings produced (all prefixes known).

### MEDIUM: `ensureCommonKeys` falsy check
**Decision**: Auto-fix
**Action**: Changed `if (!data[k])` → `if (data[k] === undefined || data[k] === null)`.

### MEDIUM: Missing namespace prefix test coverage
**Decision**: Auto-fix
**Action**: Extended `filePrefixMap` to cover `help.json: ["help.", "bsHelp."]`, `common.json: ["notifications.", "common."]`, `agency.json: ["teams.", "orchestrator."]`.

### LOW: try/catch for file existence
**Decision**: Auto-fix
**Action**: Replaced `try { readFileSync(thFile); } catch {...}` with `if (!existsSync(thFile)) {...}`.

### LOW: th/common.json Wave 1 test missing
**Decision**: Auto-fix
**Action**: Added `"th/common.json has all required common keys"` test in wave1-keys.test.ts.

## Let-Go Items

### MEDIUM: Missing completeness tests for other migrated namespaces
**Decision**: Let go
**Rationale**: The `help` namespace has a completeness test as a representative sample. Adding per-namespace completeness tests for all 8 remaining namespaces would create significant test maintenance overhead. The generation script now runs without key loss (1360 → 1360 keys verified), and the script itself is the source of truth.

### MEDIUM: Interpolation test could be extended
**Decision**: Let go
**Rationale**: The current test catches Python-style interpolation. Single-brace detection would require more complex regex and is a low-risk edge case since we control the source files. Added to future improvements list.
