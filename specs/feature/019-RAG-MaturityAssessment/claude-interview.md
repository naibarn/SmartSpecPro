# Interview Transcript — RAG Maturity Upgrade

## Round 1

### Q1: Smart chunking — single-level with overlap or parent-child pattern?
**Answer:** Parent-child pattern.
Use 256-token children for retrieval (more precise matches) and 1024-token parents for LLM context (broader context for generation).

### Q2: Primary cross-encoder reranking model?
**Answer:** bge-reranker-v2-m3 (Recommended).
SOTA open-source, supports 100+ languages including Thai, free self-hosted, medium latency. The project already supports Thai content via Cohere multilingual embeddings.

### Q3: What should happen when retrieval quality is LOW or FAILED?
**Answer:** Configurable per tenant.
Each tenant chooses their own threshold behavior (strict vs permissive). Default for enterprise: refuse to answer. Default for general: caveat + partial.

### Q4: What scale of documents do tenants typically have?
**Answer:** Medium (100-10K documents). Also noted need for additional "iron rules" (กฎเหล็ก) to be provided separately.

## Round 2 — Multi-tenant RAG Rules

User provided a comprehensive document: `multi-tenant-rag-rules.md`

Key rules from the document:

**1. Tenant boundary vs Sharing boundary:**
- Tenant = data boundary per organization/company or general tenant
- HARD RULE: Never cross tenant boundaries (except public global documents if they exist)
- Sharing boundary = within a single tenant, docs can be private / shared via group / tenant-wide / public-global

**2. Scope-based ACL model:**
- `u:<user_id>` — owner/personal documents
- `g:<group_id>` — shared within a group
- `t:<tenant_id>` — tenant-wide (enterprise policy)
- `p:global` — public/system documents (if applicable)
- Access check: `doc.allowed_scopes INTERSECT user.effective_scopes != empty`
- New documents default to `u:<owner>` (private)

**3. General tenant (individual users) + user-created groups:**
- Group membership must be invite + accept (prevent abuse)
- Invite via verified email/username or invite link with token
- Group roles: owner/admin (manage members, share docs, delete) and member (read shared docs, optionally upload/share per policy)
- Quotas: max groups per user, max invites per day, max members per group

**4. Enterprise tenant:**
- Same as general but with: no cross-tenant member adding, group creation restricted by role, tenant-wide policy documents use `t:<tenant_id>` scope

**5. RAG Guardrails for multi-tenancy:**
- Retrieval MUST filter by `chunk.tenant_id == user.tenant_id` AND `chunk.allowed_scopes INTERSECT user.effective_scopes`
- Reranker must only receive candidates that passed access check
- Parent-child expansion must re-verify access on parent chunk
- On retrieval failure: NEVER expand to other tenants or cross scope boundaries
- Never leak metadata (e.g. doc titles) of inaccessible documents in responses

**6. Required data structures:**
- `users(id, tenant_id, ...)`
- `groups(id, tenant_id, owner_id, ...)`
- `group_members(group_id, user_id, role, status)` — status: invited/accepted
- `documents(id, tenant_id, owner_id, allowed_scopes[], ...)`
- `chunks(id, doc_id, tenant_id, allowed_scopes[], text, embedding, ...)`
- Denormalize `allowed_scopes[]` into chunks for fast vector DB filtering

**7. Document sharing UX:**
- Private → Share to group(s) → Tenant-wide → Public-global
- Must confirm who sees the document
- Revoke sharing must have immediate effect

**8. Failure mode with multiple tenants:**
- Configurable per tenant (enterprise = strict refuse, general = caveat + partial)
- On caveat mode: must communicate "limited information" — never claim answer is in inaccessible docs
- Log doc_ids/chunk_ids per request for audit

## Round 3

### Q5: Current schema status for groups, group_members, allowed_scopes?
**Answer:** Groups table exists but `allowed_scopes` column does not exist yet. Need to add `allowed_scopes[]` to documents and chunks tables, and integrate with RAG pipeline.

### Q6: Who creates the evaluation dataset?
**Answer:** Auto-generate from existing docs (Recommended). Use LLM to create QA pairs from existing documents, saving ~90% of manual effort.

### Q7: Where should multi-tenant rules fit in the phase plan?
**Answer:** Insert as Phase 0 (before Smart Chunking). Create the schema + ACL layer first, then every subsequent phase builds on top of tenant-aware foundations.
