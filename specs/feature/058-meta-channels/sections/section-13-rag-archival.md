# Section 13 — RAG Archival

## Dependencies
- **section-01-db-schema**: `socialConversations`, `socialMessages` tables
- **section-06-inbox-backend**: Conversation status management

## Overview

This section implements the conversation archival pipeline: a Celery task that periodically processes resolved conversations, chunks them into Q&A pairs, generates embeddings, and stores them in a per-tenant pgvector collection. This enables RAG retrieval by the AI draft service (section-08), workflow nodes (section-11), and agency tools (section-12).

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/tasks/social_archive_task.py` | Create | Celery beat task |
| `python-backend/tests/unit/tasks/test_social_archive.py` | Create | Task tests |
| `python-backend/app/core/celery_app.py` | Modify | Add beat schedule entry |
| `python-backend/app/tasks/__init__.py` | Modify | Import task |

---

## Tests First

**File:** `python-backend/tests/unit/tasks/test_social_archive.py`

```
# Test: archive_resolved_conversations queries conversations with status "resolved" not yet archived
# Test: archive chunks conversation into Q&A turn pairs (customer question + agent response)
# Test: archive concatenates multi-message customer turns into single question chunk
# Test: archive includes metadata (pageId, conversationId, customerDisplayName, timestamp)
# Test: archive truncates chunks exceeding 1000 tokens (keeps first + last 200 tokens)
# Test: archive generates embeddings via internal embedding endpoint
# Test: archive stores embeddings in collection social-conversations-{tenantId}
# Test: archive sets conversation status to "archived" after successful processing
# Test: archive skips already-archived conversations
# Test: archive handles empty conversations gracefully (no messages)
# Test: archive does not process conversations with fewer than 2 messages
```

---

## Implementation Guidance

### Celery Task: `social_archive_task.py`

**`archive_resolved_conversations`** — Celery beat task, runs every 6 hours:

```python
@celery_app.task(bind=True, max_retries=2)
def archive_resolved_conversations(self) -> dict:
    """Archive resolved social conversations into pgvector for RAG retrieval."""
```

**Flow:**

1. **Query**: Select `socialConversations` WHERE `status = "resolved"` (not "archived"), `updatedAt < now() - 1 hour` (cooldown to avoid archiving during active resolution). Limit 50 per run.

2. **For each conversation:**
   a. Load all `socialMessages` ordered by `createdAt ASC`
   b. Skip if fewer than 2 messages
   c. Chunk into Q&A turn pairs:
      - Group consecutive inbound messages as one "question"
      - The first outbound message after a question group is the "answer"
      - Result: `[{question: str, answer: str, timestamp: str}]`
   d. For each chunk:
      - Truncate to 1000 tokens max (keep first 200 + last 200 tokens if exceeding)
      - Add metadata: `{pageId, conversationId, customerDisplayName, timestamp, intent}`
   e. Generate embeddings via `POST /api/internal/embeddings/batch` (existing endpoint from `python-backend/app/api/internal_embeddings.py`)
   f. Store in pgvector collection `social-conversations-{tenantId}` using existing embedding storage pattern

3. **Update**: Set `socialConversations.status = "archived"`

4. **Return**: `{processed: N, skipped: M, errors: K}`

### Chunking Strategy

```python
def chunk_conversation_to_qa_pairs(messages: list[dict]) -> list[dict]:
    """Split conversation into question-answer turn pairs.

    Groups consecutive inbound messages as one question.
    The first outbound response after a question group is the answer.
    """
```

Example:
```
Customer: "Hi, I need help"          ─┐
Customer: "My order hasn't arrived"   ─┘ → Question chunk
Agent: "I'll look into that for you"  → Answer chunk
Customer: "Order #12345"             → Next question
Agent: "Found it, shipping tomorrow" → Next answer
```

### Collection Naming

Pattern: `social-conversations-{tenantId}`

This matches the existing collection naming in the document library system. The collection is auto-created on first embedding insert.

### Embedding Integration

Use the existing internal embeddings endpoint at `POST /api/internal/embeddings/batch`:
```json
{
  "texts": ["chunk1 text", "chunk2 text"],
  "collection": "social-conversations-tenant123",
  "metadata": [{"pageId": 1, "conversationId": 42}, ...]
}
```

### Beat Schedule Registration

Add to `celery_app.py`:
```python
'archive-social-conversations': {
    'task': 'app.tasks.social_archive_task.archive_resolved_conversations',
    'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
},
```

Route to `social` queue in `task_routes`.
