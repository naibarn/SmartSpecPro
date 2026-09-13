# Application tool contracts v1

This is an application contract version, not a WebMCP protocol version. Names are developer-controlled. Adapter serialization must be verified against the tested native implementation; do not assume remote MCP content blocks are required.

| Name | Registered scope | Input | Result / UI effect |
|---|---|---|---|
| public.discover | all ready public routes | optional query <=200 chars, limit 1–20 | Eligible public route metadata, no private links |
| public.read_page | all ready public routes | offset integer >=0; limit 1–12000 chars, default 6000 | Current public view model text with nextOffset/truncated/source/locale |
| public.navigate | all ready public routes | path <=512 chars | Open validated public route visibly; success only after route resolves, otherwise error; native navigation may end execution |
| public.search | all ready public routes | query 1–200 chars, scope enum site/docs/help/blog/marketplace/gallery, limit 1–20, opaque cursor <=512 chars | Bounded public metadata matches, coverage and partial/unavailable sources |
| public.list_packages | /pricing | no properties | Current public packages with currency and original pricing fields; no checkout |
| public.search_marketplace | marketplace routes | query <=200 chars, category from existing UI options, limit 1–20, cursor <=512 chars | Update visible filters; await matching query result; public catalog summaries |
| public.read_marketplace_item | marketplace routes | slug <=200 chars from catalog format | Open the existing detail UI, return its public projection; never install/like/comment |
| public.search_gallery | /gallery | optional type enum all/image/video/website, query <=200 chars, limit 1–20, cursor <=512 chars | Update visible gallery filter/search; published public metadata only |
| public.read_gallery_item | /gallery | id positive integer | Open the existing gallery detail UI, return published public metadata; never view/like/download |
| public.prepare_contact | /contact | optional name 1–120, email valid/max255, company max160, subject 3–255, message 1–5000, contactType enum general/support/sales/bug/feature | Fill supplied compatible fields, focus form; status prepared, requiresHumanSubmit=true |

All inputs are objects with additionalProperties=false, validated at runtime as well as described by JSON Schema. Tool names must remain 1–128 characters and contain only ASCII letters, digits, `_`, `-`, or `.`. Omitted Contact fields remain unchanged. At least one valid Contact field is required. Read-only hints apply only to tools without UI/state changes; navigation, filter, detail opening and preparation must not claim read-only. Untrusted CMS/catalog/help/gallery text receives untrustedContentHint as appropriate; hints never replace validation or authorization.

## Result semantics

Use a JSON-serializable application envelope: contractVersion=1, status (ok/prepared/error), data, and optional error {code,message,retryable}, plus source metadata. The adapter maps this to the browser's supported callback result. Bound total serialized result to 32 KiB; page text uses nextOffset; list sources use cursors, not silent omission. Escape/strip active HTML using existing safe content utilities. Do not echo Contact PII, cookies, tokens, raw request URLs or stack traces in outputs/logs.

Error codes: INVALID_INPUT, NOT_FOUND, UNAVAILABLE, RATE_LIMITED, STALE_CONTEXT, CANCELLED, FIELD_CONFLICT. Empty search is a successful empty result, not an error. A partial search must name unavailable sources and must not present itself as exhaustive. Cursors are opaque, validated and scoped to origin, locale, query and corpus revision; invalid/stale cursors yield INVALID_INPUT.

## Data and search implementation

Prefer current page query caches and helpers. A small server-side public metadata search endpoint/service is permitted for site/blog/docs aggregation when existing endpoints cannot provide bounded metadata. It must resolve tenant from request context, use explicit selected public fields and published filters, respect existing public rate limiting, and paginate without expensive full-table body scans. No schema change or search infrastructure is assumed. Query bounds also apply on the server. Catalog/help adapters reuse their existing anonymous data policies; no client-selected visibility escalation.

Use a 10-second configurable read timeout and cancellation. Never retry writes; there are no server writes in these tools, and public gallery counters are explicitly outside the tool set. Apply a per-tab invocation budget (default: 30 read/search executions per minute, 4 concurrent reads, and 5 Contact preparations per minute); server-side public rate limits remain authoritative. A tool failure must leave ordinary UI usable. Pending navigation/preparation invalidates on route/locale/tenant epoch change. Search coverage is metadata-based, not full-text article-body search.

At integration time, adapt the application contract to the exact browser IDL observed in the tested build. The draft's internal model describes a serialized input schema while current Chrome examples pass an object to `registerTool`; this plan must not hard-code one representation without a native registration test. If `tools` Permissions Policy is explicitly sent, it must allow `self` for top-level pages and must not broaden cross-origin access. The enabled response must not use `Origin-Agent-Cluster: ?0` or `document.domain`; cross-origin iframe exposure remains disabled unless explicitly designed and tested.
