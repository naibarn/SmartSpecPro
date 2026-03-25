# Section-08 Review: Locale JSON Files Migration

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `generate-locale-json.mjs:17-31` / `en/help.json:288` | **Key collision: `bsHelp.*` overwrites `help.*` in help.json.** Both `bsHelp` and `help` map to the `"help"` namespace. After stripping their respective prefixes, shared key suffixes collide. Confirmed: `help.title` ("Complete User Guide") is silently overwritten by `bsHelp.title` ("Browser Session Help"). The final `help.json` shows `"title": "Browser Session Help"` — the original value is permanently lost. Any other shared suffix (e.g., `help.description` vs `bsHelp.description`, `help.quickStart.*` vs any future `help.quickStart.*`) will collide silently. | Assign `bsHelp` its own namespace key with a unique scope prefix, e.g., `bsHelp.*` → `"help"` namespace but stored as `"bs.title"`, `"bs.description"`, etc. (strip only `bsHelp.` and keep a `bs.` sub-namespace). Alternatively, map `bsHelp` to a dedicated file like `browserSession.json`. Add a post-generation duplicate-key detection step to the script. |
| HIGH | `generate-locale-json.mjs:184-190` | **Unknown source prefixes fall through to `"misc"` namespace silently.** `keyToNamespace()` returns `"misc"` for any prefix not in `NAMESPACE_MAP`. Any future key added to en.ts or th.ts under a new prefix (e.g., `marketplace.*`, `social.*`) is written to `misc.json` — a file that is not in the 17-file manifest, not registered with i18next, and not tested. Keys would be silently dropped from the runtime. Currently no `misc.json` appears in the output directory, which means every key in en.ts does have a known prefix — but there is no guard enforcing this. | Add a hard error: `if (ns === "misc") throw new Error(\`Unmapped prefix: ${prefix} (key: ${key})\`)` and emit a warning/fail the generation. Add a test that asserts no `misc.json` is written. |
| MEDIUM | `generate-locale-json.mjs:392-398` | **`ensureCommonKeys` condition `if (!data[k])` is falsy-checked, not `null`/`undefined`-checked.** If a migrated value is `"0"`, `""`, or any other falsy string, the required fallback would overwrite it. More critically: the script seeds `"copied": "Copied!"` as a fallback while the migrated value is `"Copied to clipboard"` (from `common.copied` in en.ts). Since the migration runs first and the key already exists, the fallback is skipped — so the output is correct today. But if the migration were ever re-ordered or the key were absent, the two sources would produce different values with no test catching the divergence. | Change to `if (data[k] === undefined || data[k] === null)`. Reconcile the `"copied"` value: the script's `requiredCommonEn` has `"Copied!"` but the migrated value is `"Copied to clipboard"` — pick one and align both sources. |
| MEDIUM | `localeFiles.test.ts:81-103` | **`filePrefixMap` in the "no namespace prefix" test does not cover `bsHelp` → `help.json`.** The test checks that `help.json` keys don't start with `"help."` but does not check for `"bsHelp."`. Since `bsHelp.title` is correctly stripped to `"title"` (no prefix remaining), this test would not catch a regression where stripping is skipped for `bsHelp`. Also absent from `filePrefixMap`: `common.json` → `"notifications."`, `"common."`. | Extend `filePrefixMap` to cover all source prefixes for every target namespace: `"common.json": ["notifications.", "common."]`, and similarly add `"help.json": ["bsHelp."]` as a secondary prefix to verify stripping worked. |
| MEDIUM | `localeFiles.test.ts` (no test exists) | **No key-count completeness test for migrated namespaces other than `help`.** The spec requires "sum of all JSON keys must equal source `.ts` key count (no dropped keys)" (spec §Transformation Rules point 6). Only `help` namespace has the completeness assertion. Namespaces `chat`, `settings`, `billing`, `workflow`, `media`, `admin`, `presentation` are not verified for completeness. A dropped key in any of these would not be caught. | Add per-namespace key-count tests (or a single cross-namespace test) that reads en.ts, groups keys by prefix, and asserts the total count in each target JSON matches. Mirror of the existing `help` completeness test. |
| MEDIUM | `localeFiles.test.ts:105-116` | **Interpolation test only checks for Python-style `%(...)s` syntax; it does not assert that `{0}` or `%s` style interpolation is absent.** More importantly, it does not assert that `{{...}}` interpolation is _correct_ (e.g., it would not catch `{ name }` with single braces, which i18next would not substitute). | Extend to also reject `\{[^{][^}]*\}` (single-brace `{var}`) and `%[sd]` patterns. Optionally add a positive assertion that every `{{...}}` placeholder is well-formed (no spaces around the variable name). |
| LOW | `generate-locale-json.mjs:256-258` | **`ensureThNamespaceFiles` uses a try/catch over `readFileSync` to check existence.** `try { readFileSync(thFile) } catch { writeJson(...) }` is a common but fragile pattern — it will also silently suppress read errors unrelated to file absence (permissions, encoding errors). | Use `existsSync(thFile)` from the already-imported `fs` module. |
| LOW | `generate-locale-json.mjs:70` | **Keys without a dot are silently skipped.** The script skips any key where `!key.includes(".")`. The spec implies all keys are namespaced, so this is likely correct. But if en.ts ever has a top-level non-dot key (e.g., `"version": "1.0"`), it is silently dropped with no warning. | Log a warning when a non-dot key is encountered so the operator knows it was excluded: `console.warn(\`Skipping non-namespaced key: "${key}"\`)`. |
| LOW | `wave1-keys.test.ts:111-130` | **th/ Wave 1 tests cover nav, auth, errors but not `th/common.json` required keys.** `localeFiles.test.ts` tests that every th/common.json key exists in en/common.json (subset alignment) but neither test verifies that th/common.json has the required 40+ keys that `REQUIRED_COMMON_KEYS` specifies. | Add a `"th/common.json has all required common keys"` test in `wave1-keys.test.ts` parallel to the existing `th/nav.json` and `th/auth.json` tests. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All 17 `en/*.json` files exist | PASS | Confirmed by `localeFiles.test.ts` and direct directory listing |
| At least 10 `th/*.json` files exist | PASS | 17 th/ files present |
| Empty placeholders contain `{}` | PASS | `agency.json`, `marketplace.json`, `profile.json`, `social.json`, `dashboard.json` all empty placeholders |
| Required Wave 1 keys: `en/nav.json` | PASS | All `sidebar.*`, `header.*`, `navbar.*` keys present and correct |
| Required Wave 1 keys: `en/auth.json` | PASS | All `signIn.*`, `signUp.*`, `mfa.*`, `resetPassword.*`, `callback.*` keys present |
| Required Wave 1 keys: `en/errors.json` | PASS | All 14 required keys present with correct values |
| Required Wave 1 keys: `en/common.json` | PASS | All ~40 required keys present |
| Namespace prefix stripping | PARTIAL PASS | Correctly strips `help.`, `bsHelp.`, `chat.`, `settings.`, `mediaStudio.`, `credits.`, `workflows.`, `notifications.`, `common.`, `invite.`, `editor.`, `teams.`. HIGH finding: `bsHelp.` collision with `help.` creates data loss. |
| No HTML markup in values | PASS | Grep across all 17 `en/*.json` files found no `<tag>` patterns |
| `{{...}}` interpolation preserved | PASS | `{{page}}`, `{{from}}`, `{{to}}`, `{{total}}`, `{{count}}`, `{{name}}` confirmed in output files |
| Keys sorted alphabetically | PASS | `writeJson()` sorts via `localeCompare` |
| UTF-8, no BOM, no trailing commas | PASS | Standard `JSON.stringify(..., null, 2)` output with `\n` terminator |
| Source `.ts` files not deleted | PASS | en.ts and th.ts remain in `lib/i18n/locales/` |
| th/en key alignment (common, nav, help) | PASS | Tests enforce th keys are a subset of en |
| No `misc.json` written | PASS (runtime) | No `misc.json` exists in output, but no guard prevents future regression |
| Key-count completeness (all namespaces) | FAIL | Only `help` namespace has completeness test; 8 other migrated namespaces unverified |
| Generation script idempotent | PASS | Re-running produces same output since `ensureCommonKeys` is additive-only |

---

### Summary

The core migration is largely correct: all 34 JSON files are present and valid, required Wave 1 keys are complete, no HTML appears in values, and `{{...}}` interpolation is preserved. The two HIGH findings are: (1) a silent data loss bug where `bsHelp.*` and `help.*` keys collide in `help.json` after prefix-stripping, causing `help.title` ("Complete User Guide") to be overwritten by `bsHelp.title` ("Browser Session Help"), and (2) a structural gap in the generation script where any future key with an unknown prefix falls through to a `misc.json` that is never registered with i18next. Both issues must be fixed before section-12 and section-13 can safely consume this data layer.
