# Section 08 — AI Draft Generation

## Dependencies
- **section-06-inbox-backend**: `socialInbox.generateDraft` mutation stub, `socialInboxService.ts` service layer
- **section-07-inbox-frontend**: AI Draft button in `ReplyComposer.tsx`

## Overview

This section implements the AI draft generation pipeline for social inbox replies. When a user clicks "AI Draft", the system loads conversation context, optionally queries RAG for similar past conversations, calls the LLM gateway, and returns a draft with confidence score. If the page's `aiActionMode` is `auto_send` and confidence exceeds the threshold, the reply is auto-sent.

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/services/socialDraftService.ts` | Create | Draft generation logic |
| `apps/web/server/services/__tests__/socialDraftService.test.ts` | Create | Tests |

The `generateDraft` procedure in `socialInbox.ts` (section-06) delegates to this service.

---

## Tests First

**File:** `apps/web/server/services/__tests__/socialDraftService.test.ts`

```
# Test: generateDraft loads last 20 messages from conversation
# Test: generateDraft builds system prompt with tone guide when available
# Test: generateDraft queries RAG collection social-conversations-{tenantId} for similar Q&A
# Test: generateDraft skips RAG query when collection does not exist
# Test: generateDraft calls LLM gateway with system prompt + conversation history
# Test: generateDraft returns { draft, confidence } from LLM response
# Test: generateDraft auto-sends when aiActionMode=auto_send AND confidence >= threshold
# Test: generateDraft does NOT auto-send for blocked categories (billing, legal, harassment)
# Test: generateDraft does NOT auto-send when confidence < threshold
# Test: generateDraft returns draft-only when aiActionMode=draft_only
# Test: generateDraft throws PRECONDITION_FAILED when aiActionMode=off
# Test: generateDraft creates socialHumanApprovals record when aiActionMode=approval_required
# Test: generateDraft writes audit log entry for AI draft generation
# Test: generateDraft writes audit log entry for auto-send
```

---

## Implementation Guidance

### socialDraftService.ts

**Exports:**

```typescript
async function generateSocialDraft(params: {
  conversationId: number;
  tenantId: string;
  userId: number;
  db: DrizzleDB;
}): Promise<DraftResult>
```

**DraftResult type:**
```typescript
interface DraftResult {
  draft: string;
  confidence: number;
  autoSent: boolean;
  sentMessage?: MessageItem;
  approvalId?: number;
  sourceDocuments?: Array<{ content: string; score: number }>;
}
```

**Flow:**

1. **Load context**: Query `socialPages` for `aiActionMode` and `autoSendConfidenceThreshold`. If `aiActionMode === "off"`, throw `PRECONDITION_FAILED`.

2. **Load conversation history**: Last 20 messages via `socialMessages` WHERE `conversationId`, ordered by `createdAt ASC`.

3. **Load tone guide**: Query `socialAutomationRules` WHERE `pageId` AND `triggerType = "new_message"`. Extract `policyConfig.toneGuide` if present. Default: "Professional, friendly, helpful".

4. **RAG retrieval** (optional): Check if pgvector collection `social-conversations-{tenantId}` exists via existing `queryEmbeddingService`. If yes, embed the last customer message and retrieve top 3 similar Q&A pairs. Include as context in the system prompt.

5. **Build LLM prompt**:
   - System prompt: tone guide + RAG context + "Generate a helpful reply. Respond with JSON: {reply, confidence, detected_intent}"
   - Messages: conversation history formatted as user/assistant turns
   - Use existing LLM gateway (`/api/v1/llm/chat` or internal service call)

6. **Parse LLM response**: Extract `reply`, `confidence` (0-1), `detected_intent` from JSON response.

7. **Auto-send decision**:
   - If `aiActionMode === "auto_send"` AND `confidence >= threshold` AND `detected_intent` NOT in `BLOCKED_AUTO_SEND_CATEGORIES`:
     - Send via `sendMessageViaPythonBackend()` (from section-06 service)
     - Create outbound message record
     - Write audit: `social.auto_send`
     - Return `{ draft, confidence, autoSent: true, sentMessage }`
   - If `aiActionMode === "approval_required"`:
     - Insert `socialHumanApprovals` record with `entityType="reply"`, `proposedContent=draft`, `confidence`, `status="pending"`
     - Return `{ draft, confidence, autoSent: false, approvalId }`
   - Otherwise (`draft_only`):
     - Return `{ draft, confidence, autoSent: false }`

**Blocked categories constant:**
```typescript
const BLOCKED_AUTO_SEND_CATEGORIES = ["billing", "legal", "harassment", "refund", "complaint"] as const;
```

### LLM Gateway Integration

Use the existing internal LLM call pattern from `apps/web/server/services/`. The service calls the Node.js LLM gateway which routes to the appropriate provider. System prompt template:

```
You are a customer support agent for this business. Respond to the customer's latest message.

Tone: {toneGuide}

{ragContext ? "Reference information from past conversations:\n" + ragContext : ""}

Rules:
- Be concise and helpful
- If unsure, say so honestly
- Never make promises you can't keep
- Respond in the same language as the customer

Output JSON: {"reply": "your reply text", "confidence": 0.0-1.0, "detected_intent": "inquiry|complaint|billing|legal|harassment|support|purchase|other"}
```

### Security

- Decrypted page tokens are never passed to the LLM
- Customer PII (PSID, external IDs) are not included in the LLM prompt
- Only message body text is sent to the LLM
- Audit log records every draft generation and auto-send action
