# Section 03 — Web Search Grounding Integration for Skills

## Objective

When a skill declares `requires_web_search: true`, the system automatically enables web search tools for the LLM call and extracts citations from search results into the standard CitationEntry format.

## Scope

1. Inject web search tool when skill policy requires it
2. Extract citations from tool results per provider (OpenAI, Gemini, Claude, Kimi)
3. Prepend citation instruction to system prompt when web search is active
4. Integrate with existing `searchResultCache.ts` for caching

## Primary files

- `apps/web/server/routers/skills.ts` — skill execution, check execution_policy
- `apps/web/server/_core/responsesRoutes.ts` — inject web_search tool into tools array
- `apps/web/server/_core/llmRoutes.ts` — inject google_search grounding for Gemini
- `apps/web/server/services/citationExtractor.ts` — NEW: extract citations from tool results
- `apps/web/server/services/searchResultCache.ts` — enhance citation extraction

## How it works

### Tool injection

In `skills.ts`, when building the LLM request:
1. Read `skill.execution_policy?.requires_web_search`
2. If true, add `{ type: "web_search" }` to the tools array (Responses API)
3. For Gemini via google_search: add `{ google_search: {} }` to tools
4. For Claude: add `{ type: "web_search_20250305", name: "web_search" }` to tools

### Citation extraction

New `citationExtractor.ts`:

```typescript
export interface ExtractedCitation {
  citation_id: string;
  title: string;
  url_or_id: string;
  retrieved_at: string;  // ISO datetime
  snippet?: string;
}

export function extractCitationsFromResponse(
  response: unknown,
  provider: "openai" | "gemini" | "anthropic" | "kimi"
): ExtractedCitation[];
```

Provider-specific extraction:
- **OpenAI**: Parse `output[].content` for `web_search_call` tool results, extract from `sources[]`
- **Gemini**: Parse `groundingMetadata.webSearchQueries` and `groundingChunks`
- **Claude**: Parse tool results from `web_search` tool use blocks
- **Kimi**: Parse `$web_search` tool results (OpenAI-compatible format)

### System prompt injection

When web search is active, prepend to system prompt:
```
สำคัญ: คุณต้องอ้างอิงแหล่งข้อมูลสำหรับทุก claim ที่สำคัญ
- ใช้เครื่องมือค้นหาเว็บเพื่อตรวจสอบข้อมูลที่ไม่แน่ใจ
- ทุก claim ระดับ critical/major ต้องมีหลักฐานจากแหล่งที่ตรวจสอบได้
- ระบุแหล่งที่มาอย่างชัดเจนในส่วน citations ของ output
```

## Acceptance criteria

1. Skill with `requires_web_search: true` gets web search tool injected automatically
2. Skill without `requires_web_search` behaves as before (no tool injection)
3. Citations extracted from OpenAI web_search tool results correctly
4. Citations extracted from Gemini grounding metadata correctly
5. Citations extracted from Claude web search results correctly
6. Citations cached in existing searchResultCache
7. System prompt injection added when web search is active
8. Cost tracking records web search calls in providerUsageLog

## Test file

`apps/web/server/services/citationExtractor.test.ts`

Test cases:
- Extract citations from mock OpenAI web_search response
- Extract citations from mock Gemini grounding response
- Extract citations from mock Claude web_search response
- Empty tool results → empty citations array
- Deduplication: same URL from multiple search calls → single citation
- citation_id generation is deterministic (hash of URL)
