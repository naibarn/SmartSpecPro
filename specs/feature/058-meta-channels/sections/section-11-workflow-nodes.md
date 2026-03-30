# Section 11 — Workflow Nodes

## Dependencies
- **section-01-db-schema**: `socialConversations`, `socialMessages`, `socialPages` tables
- **section-03-meta-graph-client**: `MetaGraphClient` for `send_message()`, `create_post()`
- **section-05-webhook-ingestion**: Redis Stream `social:stream:{pageId}` for real-time triggers
- **section-06-inbox-backend**: Outbound message creation pattern

## Overview

This section registers 6 workflow node types under a new `"social"` category in `NodeRegistry` and implements their executor classes. It also adds a dynamic options endpoint for connected pages and the real-time/batch trigger wiring.

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/orchestrator/node_registry.py` | Modify | Register 6 social node types in `_register_core_nodes()` |
| `python-backend/app/orchestrator/node_executors/social/__init__.py` | Create | Package init |
| `python-backend/app/orchestrator/node_executors/social/meta_message_trigger.py` | Create | Trigger executor |
| `python-backend/app/orchestrator/node_executors/social/classify_intent_executor.py` | Create | Intent classification |
| `python-backend/app/orchestrator/node_executors/social/draft_reply_executor.py` | Create | RAG-grounded draft |
| `python-backend/app/orchestrator/node_executors/social/send_reply_executor.py` | Create | Outbound message |
| `python-backend/app/orchestrator/node_executors/social/publish_post_executor.py` | Create | Post publishing |
| `python-backend/app/orchestrator/node_executors/social/approval_gate_executor.py` | Create | Human approval gate |
| `python-backend/app/api/workflows.py` | Modify | Add `/api/v1/social/connected-pages` endpoint |
| `python-backend/tests/unit/orchestrator/test_social_executors.py` | Create | Executor tests |

---

## Tests First

**File:** `python-backend/tests/unit/orchestrator/test_social_executors.py`

```
# --- MetaMessageTriggerExecutor ---
# Test: outputs conversationId, messageBody, senderName, senderExternalId from trigger event
# Test: filters messages by keywords when filterKeywords is configured
# Test: skips messages not matching keyword filter

# --- ClassifyIntentExecutor ---
# Test: returns intent, confidence, category, requiresHuman from LLM response
# Test: marks high-risk intents (billing, legal, harassment) as requiresHuman=True
# Test: defaults to "other" intent when LLM response is unparseable

# --- DraftReplyExecutor ---
# Test: generates reply text with confidence score
# Test: queries RAG collection when ragCollectionId is provided
# Test: includes toneGuide in system prompt
# Test: returns sourceDocuments from RAG results

# --- SendReplyExecutor ---
# Test: calls MetaGraphClient.send_message with correct params
# Test: returns providerMessageId on success
# Test: returns error output on MetaApiError

# --- PublishPostExecutor ---
# Test: calls MetaGraphClient.create_post with contentText and optional link
# Test: passes scheduledAt as Unix timestamp when provided
# Test: returns postId and status on success

# --- SocialApprovalGateExecutor ---
# Test: auto-approves when confidence > autoApproveThreshold
# Test: pauses workflow when confidence < autoApproveThreshold
# Test: returns edited content after human review
```

---

## Implementation Guidance

### Node Registration in `node_registry.py`

Add to `_register_core_nodes()` method, 6 `NodeTypeSpec` entries all with `category="social"`, `color="indigo"`.

**1. `incoming_meta_message`** (trigger)
- Inputs: `pageId` (select, options_endpoint `/api/v1/social/connected-pages`), `triggerMode` (select: realtime/batch, default batch), `filterKeywords` (text, optional)
- Outputs: `conversationId`, `messageBody`, `senderName`, `senderExternalId`, `messagePayload`
- Executor: `app.orchestrator.node_executors.social.meta_message_trigger.MetaMessageTriggerExecutor`

**2. `classify_social_intent`**
- Inputs: `messageBody` (textarea, accepts_connection), `conversationHistory` (json, optional), `model` (select, optional)
- Outputs: `intent`, `confidence`, `category`, `requiresHuman`
- Executor: `app.orchestrator.node_executors.social.classify_intent_executor.ClassifyIntentExecutor`

**3. `draft_social_reply`**
- Inputs: `messageBody` (textarea, accepts_connection), `intent` (text, optional), `ragCollectionId` (select, optional), `toneGuide` (textarea, optional), `model` (select, optional)
- Outputs: `draftReply`, `confidence`, `sourceDocuments`
- Executor: `app.orchestrator.node_executors.social.draft_reply_executor.DraftReplyExecutor`

**4. `send_meta_reply`**
- Inputs: `conversationId` (text, accepts_connection), `messageBody` (textarea, accepts_connection), `pageId` (select, accepts_connection)
- Outputs: `providerMessageId`, `deliveryStatus`, `error`
- Executor: `app.orchestrator.node_executors.social.send_reply_executor.SendReplyExecutor`

**5. `publish_meta_post`**
- Inputs: `pageId` (select, accepts_connection), `contentText` (textarea, accepts_connection), `contentLink` (text, optional), `scheduledAt` (text, optional)
- Outputs: `postId`, `providerPostId`, `status`, `error`
- Executor: `app.orchestrator.node_executors.social.publish_post_executor.PublishPostExecutor`

**6. `approve_social_action`**
- Inputs: `actionType` (select: reply/post/comment_action), `content` (textarea, accepts_connection), `confidence` (number, optional), `autoApproveThreshold` (slider 0-1, default 0.95)
- Outputs: `approved`, `content`, `reviewerNote`
- Executor: `app.orchestrator.node_executors.social.approval_gate_executor.SocialApprovalGateExecutor`

### Executor Pattern

All executors follow the `NodeExecutor` protocol:

```python
class MyExecutor:
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        config = data.config
        inputs = data.inputs
        # ... process ...
        return {"outputPort": value}
```

**Key implementation notes:**

- **MetaMessageTriggerExecutor**: For real-time mode, a FastAPI `lifespan` background task (`social_trigger_listener` in `main.py`) uses `XREADGROUP` on Redis Stream `social:stream:{pageId}` and dispatches Celery tasks. For batch mode, Celery beat task `poll_social_workflow_triggers` (30s) queries `socialMessages` WHERE `workflowTriggerStatus IS NULL`. After processing, sets `workflowTriggerStatus = "dispatched"`. **Rate limit:** Redis counter `social:trigger:ratelimit:{pageId}`, `INCR` + `EXPIRE 60`, skip if > 10.

- **ClassifyIntentExecutor**: Calls LLM via the **unified LLM client** (`python-backend/app/llm_proxy/unified_client.py`) to ensure credit accounting, audit logging, and provider routing. NEVER bypass the gateway with direct HTTP calls. Prompt asks for JSON with strict enum validation: `{intent, confidence, category}`. High-risk intents set `requiresHuman=True`.

- **DraftReplyExecutor**: Similar to section-08 AI draft logic but in executor context. Queries RAG if `ragCollectionId` provided.

- **SendReplyExecutor**: Decrypts page token via `smartspecweb_crypto`, creates `MetaGraphClient`, calls `send_message()`. Creates `socialMessages` outbound record.

- **PublishPostExecutor**: Decrypts page token, calls `create_post()`. Creates `socialPosts` record.

- **SocialApprovalGateExecutor**: Compares `confidence` against `autoApproveThreshold`. If exceeds, auto-approves and returns immediately. Otherwise, creates `socialHumanApprovals` record and pauses workflow (same pattern as existing `approval_gate` executor — sets `WorkflowState` to paused, waits for resume).

### Dynamic Options Endpoint

Add to `python-backend/app/api/workflows.py`:

```python
@router.get("/social/connected-pages")
async def get_connected_pages(request: Request, db: AsyncSession = Depends(get_db)):
    """Return connected pages for workflow node select inputs."""
```

Returns `[{label: "Page Name", value: "pageId"}]` filtered by tenant (from auth header).

### Trigger Wiring

**Real-time**: The Celery task in section-05 publishes to Redis Stream `social:stream:{pageId}`. A FastAPI `lifespan` background task in `main.py` consumes via `XREADGROUP` and dispatches workflow execution Celery tasks.

**Batch**: Add Celery beat task `poll_social_workflow_triggers` (runs every 30s) that queries unprocessed messages and dispatches workflow executions. Rate limit: max 10 triggers/min/page via Redis counter.
