# Complete Specification — RAG Maturity Upgrade with Multi-Tenant Guardrails

## Source Documents
- Initial spec: `spec.md` (RAG Five Levels assessment and upgrade plan)
- Research: `claude-research.md` (codebase analysis + SOTA best practices)
- Interview: `claude-interview.md` (user decisions on architecture, models, rules)
- Multi-tenant rules: `multi-tenant-rag-rules.md` (scope-based ACL for RAG)

---

## 1. Project Goal

Upgrade SmartSpecPro's RAG system from **72% maturity** to **90%+** across all 5 levels, while adding a **Phase 0: Multi-Tenant ACL Foundation** that enforces tenant isolation and scope-based access control throughout the entire pipeline.

### Final Phase Structure (6 phases)

| Phase | Name | Key Deliverables |
|-------|------|-----------------|
| **0** | Multi-Tenant ACL Foundation | `allowed_scopes[]` on docs/chunks, scope-based filtering, group membership invite+accept |
| **1** | Smart Chunking | Token-based recursive/markdown/code splitting, parent-child chunk pattern (256/1024 tokens) |
| **2** | Hybrid Search Enhancements | Metadata + scope filtering in BM25/Vector, query rewriting (HyDE, multi-query) |
| **3** | Reranking Upgrade | bge-reranker-v2-m3 cross-encoder (multilingual), Cohere Rerank API fallback |
| **4** | Production RAG Hardening | Guardrails (configurable per tenant), citations, grounding check, query routing, RAG executor integration |
| **5** | Evaluation & Observability | Auto-generated eval dataset, Precision@K/MRR/NDCG/Faithfulness metrics, CLI evaluation |

---

## 2. User Decisions (from Interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chunking strategy | Parent-child pattern | 256-token children for retrieval, 1024-token parents for LLM context |
| Primary reranker | bge-reranker-v2-m3 | SOTA open-source, 100+ languages including Thai, free self-hosted |
| Retrieval failure handling | Configurable per tenant | Enterprise default: refuse. General default: caveat + partial |
| Document scale | Medium (100-10K docs per tenant) | Proper indexing needed, chunk dedup matters |
| Multi-tenant placement | Phase 0 (before everything) | All other phases build on tenant-aware foundation |
| Schema status | Groups exist, allowed_scopes missing | Need to add allowed_scopes[] to documents and chunks |
| Evaluation dataset | Auto-generate from existing docs | LLM generates QA pairs, saves ~90% effort |

---

## 3. Multi-Tenant RAG Rules (MANDATORY — applies to ALL phases)

### 3.1 Tenant Boundary (Hard Rule)
- **NEVER cross tenant boundaries** in retrieval, reranking, or context generation
- Exception only: `p:global` documents (system/public docs if the feature exists)
- Every chunk MUST carry `tenant_id` and `allowed_scopes[]`

### 3.2 Scope-Based ACL
- `u:<user_id>` — personal/private documents
- `g:<group_id>` — shared within a group
- `t:<tenant_id>` — tenant-wide (enterprise policy documents)
- `p:global` — public/system documents

**Access check**: `doc.allowed_scopes INTERSECT user.effective_scopes != empty`

**effective_scopes** for a user = `{u:<me>}` + `{g:<id> for each accepted group}` + `{t:<tenant_id> if tenant has shared docs}` + `{p:global}`

### 3.3 Group Membership
- Invite + accept flow (no direct adding)
- Invite via verified email/username or token link
- Only `accepted` members gain group scope rights
- Enterprise: no cross-tenant member adding

### 3.4 RAG Pipeline Guardrails
1. **Retrieval**: Filter by `tenant_id` AND `allowed_scopes` intersection BEFORE scoring
2. **Reranker**: Only receives scope-verified candidates
3. **Parent-child expansion**: Re-verify access on parent chunk (inheritance is NOT assumed)
4. **Failure mode**: NEVER expand search to other tenants or cross scope boundaries
5. **Metadata leakage**: Never expose titles/content of inaccessible docs in responses
6. **Audit**: Log doc_ids/chunk_ids accessed per request

### 3.5 Data Structure Requirements
- `allowed_scopes[]` denormalized on chunks for fast vector DB filtering
- New docs default to `u:<owner>` (private)
- Revoke sharing must have immediate effect on retrieval

---

## 4. Technical Decisions (from Research)

### 4.1 Chunking
- **Token-based sizing** using `tiktoken` (already in deps)
- **Recursive splitting** as default: paragraphs → lines → sentences → words
- **400-512 token** children for retrieval, **1024 token** parents for LLM context
- **50-100 token overlap** (10-20%) on children
- Auto-detect strategy: markdown headings → MARKDOWN, `def`/`class` → CODE, default → RECURSIVE

### 4.2 Reranking
- Primary: `bge-reranker-v2-m3` (local cross-encoder, multilingual, free)
- Fallback chain: bge-reranker → Cohere Rerank → LLM → Heuristic
- Retrieve 25-50 candidates, rerank to top 5
- Cross-encoder 512-token max — truncate documents accordingly

### 4.3 Guardrails
- Multi-signal confidence: retrieval score + reranker score + coverage signal + query specificity
- Thresholds: <0.15 refuse, 0.15-0.4 low/warn, 0.4-0.7 medium, >0.7 high confidence
- Configurable per tenant: `failure_mode` = "strict" (refuse) | "permissive" (caveat + partial)
- System prompt suffix varies by quality level

### 4.4 Query Processing
- Default: PASSTHROUGH (no overhead)
- Opt-in: REWRITE, HyDE, MULTI_QUERY, STEP_BACK
- FAST mode skips query processing entirely

### 4.5 Evaluation
- Auto-generate QA pairs from existing indexed documents
- Metrics: Precision@K, Recall@K, MRR, NDCG@K, Faithfulness (RAGAS)
- Quality gates: Context recall > 90%, Faithfulness > 80%
- CLI command for offline evaluation

---

## 5. Constraints

- **No breaking changes** — all upgrades additive, backward compatible
- **No new vector DB** — use existing pgvector/ChromaDB/Cloudflare Vectorize
- **Minimal new dependencies** — only `cohere>=5.0.0` (optional), rest already in requirements.txt
- **Follow existing patterns** — lazy loading, structlog, async-first, pytest markers
- **80% test coverage** enforced on all new Python code
- **All server-side enforcement** — ACL checks must be server-side, never trust client
