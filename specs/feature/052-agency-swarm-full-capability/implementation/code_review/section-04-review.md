# Section 04 — OpenAPI Import — Code Review

**Reviewer**: SmartSpecPro Reviewer Agent (CMD-8)
**Date**: 2026-03-22
**Branch**: `codex/feature-044-multimodal-chat-memory`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `openApiToolFactory.ts:184–194` | **Wrong `$ref` guard in `buildInputSchema` for param schema resolution** — `param["$ref"]` is checked _after_ `rawParam` was already resolved (the `$ref` was consumed at line 184). By the time the `schema` branch is reached, `param` is already the resolved object and `param["$ref"]` will always be `undefined`. Any parameter whose `schema` itself is a `$ref` (e.g. `schema: { $ref: "#/components/schemas/PetId" }`) will be passed through _unresolved_ to `buildInputSchema`, then its `type` will be read as `undefined` and fall back to `"string"` silently. | Change the condition at line 190–193 to check `(param.schema as Record<string, unknown>)?.["$ref"]` instead of `param["$ref"]` to correctly detect when the schema itself is a `$ref`. |
| HIGH | `openApiToolFactory.ts:84–112` | **`resolveRef` does not detect sibling-path circular refs** — `visited` is cloned with `new Set(visited)` before each recursive call (line 111). This means two schemas that each reference the same third schema (`A→C`, `B→C`) will not be incorrectly flagged as circular, which is correct. However, the clone also means a genuine mutual cycle where A→B→A _at the same call depth_ cannot be detected if the two recursive calls are in separate sibling branches (e.g. allOf with two items both leading back to A). In practice the depth cap catches this, but the `visited` clone defeats the stated purpose of circular ref detection; the depth guard is the actual safety net. This creates a misleading "circular_ref" vs "max_depth_exceeded" distinction in the error codes — the spec states circular refs should throw `circular_ref`, but some circular patterns will instead throw `max_depth_exceeded`. This is a semantic contract violation, not a safety hole. | Keep the `visited` set non-cloned across sibling branches inside `checkSchemaDepth` (i.e. do not copy it for allOf/oneOf/anyOf array items at the same depth level). The set should only be forked when descending into a separate ref resolution chain, not for sibling subschemas. |
| HIGH | `agencyOpenApiImport.test.ts:182–185` | **Duplicate path key in test spec object silently drops an operation** — The test for "parses valid spec and returns previews" (line 174) constructs a JS object literal with `"/pets"` as a key twice (lines 180 and 183). JavaScript object literals with duplicate keys silently keep the last value; the `GET /pets` (listPets) operation is dropped and only `POST /pets` survives alongside `GET /pets/{id}`. The assertion `expect(result.previews.length).toBeGreaterThanOrEqual(1)` passes trivially with 2 entries, but the test's stated intent ("3 ToolPreview items") is not validated. This makes the test vacuous for its stated goal. | Use distinct paths (`/pets`, `/pets/{id}`, `/dogs`) or merge the two `/pets` operations into one `pathItem` object. Change the assertion to `toHaveLength(2)` (or 3 if merged). |
| HIGH | `agencyOpenApiImport.test.ts` | **Rate-limit test entirely absent** — The spec (section 4.2) requires: "Test: importOpenAPITools — applies rate limit 5/min per user — Call 6 times rapidly — Assert: 6th call throws TRPCError with code TOO_MANY_REQUESTS". No such test exists in `agencyOpenApiImport.test.ts`. | Add the rate-limit test. The existing mock for `createRateLimitMiddleware` (line 24) returns a pass-through; it would need to be overridden per-test to simulate the 6th-call rejection. |
| MEDIUM | `openApiToolFactory.ts:190–194` | **`buildInputSchema` flattens param schema to `{ type }` only** — The extracted parameter schema is simplified to `{ type: string, description: string }`, discarding format, enum, minimum/maximum, pattern, and other JSON Schema keywords from the original parameter schema. While this is arguably intentional for the v1 use case, it silently discards information the tool bridge will need for accurate validation. The spec's test assertion `expect(listPets.inputSchema.properties.limit).toMatchObject({ type: "integer" })` passes, but a parameter with `schema: { type: "integer", minimum: 1, maximum: 100 }` will become `{ type: "integer" }`, losing the range constraints. | Spread the full resolved schema object rather than picking only `type`: `properties[name] = { ...schema, description: param.description || undefined }`. |
| MEDIUM | `agency.ts:3207` | **50-tool cap counts only `isEnabled = true` rows** — `confirmOpenAPIImport` filters `eq(agencyTools.isEnabled, true)` when counting existing tools. The `createCustomTool` procedure at line 2852 does the same. However, this means a tenant at 49 enabled + 10 disabled tools can import 1 more and bypass the spirit of the cap. More critically, if a user disables tools to make room and then re-enables them, they can transiently exceed 50. The cap is defined as "50 per tenant", not "50 enabled per tenant". | Remove the `isEnabled` filter from the count query in both `createCustomTool` and `confirmOpenAPIImport`. Count all tenant tools regardless of enabled state. |
| MEDIUM | `agency.ts:3141–3176` | **`importOpenAPITools` accepts `apiKey` in its Zod input but does not use it** — `apiKey` is declared in the input schema (line 3147) and is forwarded to `handleParse` in the frontend (line 98 of `OpenAPIImportModal.tsx`). The procedure body never reads `input.apiKey` at all — the value is accepted, transported over the wire, and silently discarded. The API key should either (a) not be accepted at parse time and only accepted at confirm time, or (b) if it is needed for parse (e.g. to hit a secured spec URL), the handling must be explicitly documented. As written, users see an "API Key" field on step 1 and can assume the parse step uses it. | Remove `apiKey` from `importOpenAPITools` input schema, or add an explicit comment that it is accepted for UI continuity only and not used server-side during parse. The frontend should still hold the value in state for the confirm call. |
| MEDIUM | `OpenAPIImportModal.tsx:59–80` | **tRPC hooks accessed via `(trpc as any)` dynamic path with `??` fallback no-op** — Both `importMutation` and `confirmMutation` are obtained via optional chaining on `(trpc as any).agency?.importOpenAPITools?.useMutation?.(...)`. If the tRPC client is properly typed and the procedure exists, these will work at runtime, but the `?? { mutate: () => {}, isPending: false }` fallback silently swallows any hook-initialization failure. The `as any` cast also defeats TypeScript's end-to-end type safety for the mutation inputs — if the Zod schema on the server changes, the client will not get a type error at the call site. | Use a properly typed tRPC import: `trpc.agency.importOpenAPITools.useMutation(...)` without the `as any` cast. This requires the procedure to be registered in the tRPC router type, which it is. Remove the `??` no-op fallback; failures should surface as runtime errors, not silent no-ops. |
| MEDIUM | `openApiToolFactory.test.ts` | **`parseOpenApiSpec` SSRF test does not mock `validateSsrfUrl`** — The parser test file imports `parseOpenApiSpec` directly and expects the SSRF test (line 217) to throw `ssrf_blocked` when given `http://169.254.169.254/...`. This works only if `validateSsrfUrl` in `ssrfValidator.ts` is imported and executed in the test environment, which requires it to be a real dependency (not mocked). The test file has no `vi.mock` for the ssrfValidator. This is correct design (testing the real validator), but it creates an implicit dependency: if `ssrfValidator.ts` itself is broken, the parser test will fail for a reason unrelated to the parser. Add a comment stating this is intentional integration of the SSRF guard. Additionally, the test does not cover `baseUrlOverride` SSRF blocking — only `servers[0].url`. Add a test that passes a safe `servers[0].url` but a malicious `baseUrlOverride`. |
| LOW | `openApiToolFactory.ts:301–312` | **`parseOpenApiSpec` allows an empty `baseUrl` through SSRF validation** — When the spec has no `servers` array and no `baseUrlOverride`, `baseUrl` remains `""`. The guard at line 336 (`if (baseUrl)`) skips SSRF validation for the empty string, which is correct — but the returned `{ previews, baseUrl: "" }` will then be passed unchanged to `confirmOpenAPIImport` whose Zod input requires `baseUrl: z.string().url()`. An empty string will fail the `.url()` validator, producing a confusing Zod parse error on confirm rather than a clear error on parse. | Either (a) require at least one `servers` entry or a `baseUrlOverride` to be present, throwing `parse_error` if both are absent, or (b) document that the empty-string case fails at confirm time. |
| LOW | `openApiToolFactory.ts:44` | **`HTTP_METHODS` does not include `options` or `head`** — OpenAPI 3.x allows `options`, `head`, and `trace` operations. Specs that use these methods will silently skip those operations with no error or warning. This may be intentional but is undocumented. | Add a comment noting which methods are intentionally excluded, or add `"head"` and `"options"` to the `HTTP_METHODS` tuple. |
| LOW | `OpenAPIImportModal.tsx:271` | **`window.confirm()` used for delete confirmation in `ToolPicker.tsx`** — `ToolPicker.tsx` line 270 calls the browser native `confirm()` for delete confirmation. This is inconsistent with the Radix-based design system used elsewhere (AlertDialog) and blocks the main thread. This is a pre-existing issue in the section-03 changes carried forward to section-04's `ToolPicker.tsx` diff, but worth flagging as the file was modified in this section. | Replace `confirm()` with a Radix `AlertDialog` component. |
| LOW | `agencyOpenApiImport.test.ts:229–248` | **`confirmOpenAPIImport` "bulk creates" test does not assert `toolType === "openapi_import"` in the same test** — The `toolType` assertion is isolated in a separate test (`sets toolType to 'openapi_import'`), but the "bulk creates tools from selected previews" test only checks `result.created === 3` and that `mockDbInsert` was called. It does not verify the shape of the rows passed to `insert().values()`. A regression that inserts 3 rows with wrong fields (e.g. `toolType: "custom"`) would not be caught by this test. | In the "bulk creates" test, also capture and assert on `insertedValues` to verify `tenantId`, `toolType`, `isEnabled`, and `headersEncrypted === null` (since no apiKey is provided). |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| SSRF validation on `servers[0].url` at parse time | PASS | `parseOpenApiSpec` calls `validateSsrfUrl(baseUrl)` before extracting operations |
| SSRF validation on `baseUrl` override in `importOpenAPITools` procedure | PASS | Double-validated: once in the procedure body, once inside `parseOpenApiSpec` |
| SSRF validation on `baseUrl` at `confirmOpenAPIImport` time | PASS | Explicit `validateSsrfUrl(input.baseUrl)` at line 3198 before insert |
| API key stored encrypted via `encrypt()` from `crypto.ts` | PASS | Line 3216–3217 uses `encrypt(JSON.stringify({ Authorization: ... }))` |
| API key NOT stored in plaintext `config` JSONB column | PASS | `config` only contains `{ baseUrl, path }` — no credential values |
| API key NOT returned in any response | PASS | `importOpenAPITools` returns only previews and baseUrl; `confirmOpenAPIImport` returns only `{ created, toolIds }` |
| 500KB spec size limit enforced | PASS | Zod `.max(500_000)` in procedure input + `MAX_SPEC_SIZE` guard in service |
| 100-operation limit enforced | PASS | `operationCount > MAX_OPERATIONS` check during path iteration |
| Circular `$ref` detection | PARTIAL | Detected, but sibling-branch cycles fall through to `max_depth_exceeded` instead of `circular_ref` (see HIGH-2) |
| Max schema nesting depth (10) enforced | PASS | `checkSchemaDepth` throws `max_depth_exceeded` at depth > 10 |
| 50-tool-per-tenant cap enforced | PARTIAL | Enforced, but counts only `isEnabled=true` tools — see MEDIUM-2 |
| Tenant isolation in cap query | PASS | `eq(agencyTools.tenantId, tenantId)` present in count query |
| Tenant isolation in bulk insert | PASS | `tenantId` field set from `ctx.tenantId` on every row |
| Rate limit on `importOpenAPITools` | PASS | `createRateLimitMiddleware({ limit: 5, windowMs: 60_000 })` applied |
| Rate limit on `confirmOpenAPIImport` | PASS | Same middleware applied |
| Rate limit test for `importOpenAPITools` | FAIL | Test not written (see HIGH-4) |
| `toolType: "openapi_import"` set on created tools | PASS | Hardcoded at line 3226 |
| `protectedProcedure` used for both procedures | PASS | JWT enforcement inherited |
| `assertAgencyEnabled` called on both procedures | PASS | Feature flag gate applied to both |
| `baseUrl` validated as `.url()` in Zod schema | PASS | Both procedure inputs include `z.string().url()` for baseUrl |
| All 10 parser service tests from spec present | PASS | All 10 described test cases are implemented |
| All 8 tRPC procedure tests from spec present | PARTIAL | Rate-limit test is absent (see HIGH-4) |
| All 7 frontend component tests from spec present | PASS | All 7 described test cases are implemented |
| "Show error toast on parse failure" test present | PASS | Present in `OpenAPIImportModal.test.tsx` — however note the test does not exist in the reviewed file. The spec lists it as required but the test file has only 6 tests. The "shows error toast on parse failure" test from the spec is **absent** from the reviewed test file. |

> Correction to above row: re-reading `OpenAPIImportModal.test.tsx` — it contains exactly 6 tests, not 7. The "shows error toast on parse failure" test case from spec §4.3 is missing.

| Check | Status | Notes |
|---|---|---|
| "Shows error toast on parse failure" frontend test | FAIL | Not present in `OpenAPIImportModal.test.tsx`; only 6 of 7 spec-required tests implemented |
| `ToolPicker.tsx` "Import OpenAPI" button wired to modal | PASS | Button at line 311, `openApiOpen` state, `OpenAPIImportModal` rendered at line 333 |
| `listTools` cache invalidated on import complete | PASS | `utils?.agency?.listTools?.invalidate?.()` called in `onImportComplete` |
| No secret exposure in `importOpenAPITools` response | PASS | Response contains only `previews[]` and `baseUrl` |
| `httpMethod` constrained to valid values in `confirmOpenAPIImport` | PARTIAL | Zod schema uses `z.string()` for `httpMethod` — not constrained to `z.enum(["GET","POST","PUT","DELETE","PATCH"])`. An attacker could supply arbitrary HTTP methods that reach the database unvalidated. |

---

### Summary

The section-04 implementation is structurally sound and covers the most critical security properties: double SSRF validation, encrypted API key storage, the 50-tool cap, and spec size/operation count limits. The service layer is well-organized and its 10 unit tests comprehensively cover the happy-path and error-code contracts. Three issues require fixes before merge: a logic bug in `buildInputSchema` where parameter `$ref`-schemas are never resolved (HIGH-1), a test object with a duplicate property key that silently drops an operation and makes a core test vacuous (HIGH-3), and the entirely absent rate-limit test (HIGH-4). The `apiKey` field accepted but silently discarded by `importOpenAPITools` (MEDIUM-3) and the `(trpc as any)` cast defeating end-to-end type safety (MEDIUM-4) are the most important of the medium-severity items. The 50-tool cap counting only enabled tools (MEDIUM-2) and the missing `httpMethod` enum constraint (last row of compliance table) are small but correctness-affecting gaps worth closing before the feature ships.

---

*Review file: `specs/feature/052-agency-swarm-full-capability/implementation/code_review/section-04-review.md`*
