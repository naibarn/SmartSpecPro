---
name: Chat Memory System Quick Reference
description: Fast lookup for memory system components, config, and flow
type: reference
---

# Chat Memory System — Quick Reference

## Configuration Constants

```typescript
BUFFER_SIZE = 20                          // Recent messages kept
SUMMARIZE_THRESHOLD_PERCENT = 0.70        // Trigger summarization at 70% of context
DEFAULT_CONTEXT_LENGTH = 8000             // Default token budget
CHARS_PER_TOKEN = 4                       // Token estimation
MAX_SUMMARIES_IN_CONTEXT = 5              // Max summaries per context
MAX_ENTITIES_IN_CONTEXT = 10              // Max entities per context
```

## Three-Tier Memory Tiers

| Tier | Source | Size | Budget | Refresh | Use |
|------|--------|------|--------|---------|-----|
| **Buffer** | Recent messages | 20 | Remaining | Each turn | Most relevant recent context |
| **Summary** | LLM-generated | 5 | 60% | Auto-compact | Long-term conversation arc |
| **Entity** | Pattern + LLM | 10 | 40% | Per message | Long-term facts about user/project |

## Memory Modes (Conversation Setting)

- **"full"**: All three tiers (entity + summary + buffer)
- **"no_long"**: Summary + buffer only
- **"off"**: Buffer only

Set in `conversations.memoryMode`.

## Attachment Types & Structure

```typescript
interface MessageAttachment {
  type: "image" | "file" | "audio" | "video";
  url: string;               // http/https or /uploads/ path
  key?: string;              // S3/R2 reference
  name?: string;             // Filename
  size?: number;             // Bytes
  mimeType?: string;         // Content type
  thumbnail?: string;        // Image thumbnail URL
}

// Stored in: messages.attachments (JSON array)
// Retrieved via: chat.getMessages() → message.attachments
// NOT currently processed or passed to LLM context
```

## Entity Types & Importance

```typescript
// entityTypeEnum
"user" | "project" | "preference" | "technical" |
"decision" | "plan" | "architecture" | "component" |
"task" | "code_knowledge" | "rule"

// Default importance by type (1-10)
rule: 10,
decision: 8, plan: 9, architecture: 9,
component: 7, task: 6, code_knowledge: 8,
user: 5, project: 6, preference: 5, technical: 7
```

## Context Building Flow

```
buildChatContext(conversationId, userId, systemPrompt?, options?)
    ↓
1. Resolve persona → prepend to systemPrompt
    ↓
2. Get entity memories (40% budget, "full" mode only)
   ├─ Rules always included
   ├─ Others ranked by relevance to currentUserMessage
    ↓
3. Get summaries (60% budget cumulative)
   ├─ Current conversation + project summaries
    ↓
4. Get buffer messages (remaining budget)
   ├─ Fill from most recent backward
    ↓
5. Return ChatContext
   ├─ systemPrompt
   ├─ entityContext
   ├─ summaryContext
   ├─ bufferMessages
   └─ totalTokenEstimate

contextToMessages(context)
    ↓
1. System message: [systemPrompt + entityContext + summaryContext]
2. Buffer messages: [user, assistant, user, ...]
```

## Key Functions by Purpose

### Get Messages
| Function | What | Returns |
|----------|------|---------|
| `getBufferMessages(convId, limit?)` | Last N messages | Message[] |
| `getMessageCount(convId)` | Count total | number |
| `getMessages(convId)` | All messages | Message[] |

### Manage Summaries
| Function | What | Returns |
|----------|------|---------|
| `needsSummarization(convId)` | Check if needed | boolean |
| `getMessagesToSummarize(convId)` | Get old messages | Message[] |
| `saveSummary(...)` | Store generated | ConversationSummary |
| `getSummaries(convId, limit?)` | Get stored | ConversationSummary[] |
| `getProjectSummaries(projId, userId, limit?)` | Cross-session | ConversationSummary[] |

### Extract Entities
| Function | What | Returns |
|----------|------|---------|
| `extractEntitiesFromMessage(content)` | Pattern-match | {type, name, fact, importance}[] |
| `generateEntityExtractionPrompt(messages)` | LLM template | string |

### Manage Entity Memory
| Function | What | Returns |
|----------|------|---------|
| `upsertEntityMemory(...)` | Create/update | EntityMemory |
| `getEntityMemoriesForContext(userId, limit?, projectId?)` | Fetch for context | EntityMemory[] |
| `touchEntityMemories(entityIds)` | Update lastAccessedAt | void |
| `deleteEntityMemory(id)` | Remove | void |
| `cleanupExpiredMemories(userId)` | Auto-delete old | number (deleted count) |

### Build Context
| Function | What | Returns |
|----------|------|---------|
| `buildChatContext(...)` | Full context assembly | ChatContext |
| `contextToMessages(context)` | Format for LLM | Array<{role, content}> |

## Context Budget Allocation

```
Total budget = 8000 tokens (default, from option.contextBudget)

System prompt: uncounted (never trimmed)
  ├─ User's systemPrompt
  ├─ Persona prefix + style + restrictions
  └─ ALL always included

Remaining budget split:
  ├─ Entity context: ≤ 40% of budget
  ├─ Summary context: ≤ 60% of budget (cumulative)
  └─ Buffer messages: all remaining
```

## Memory Mode Decision Tree

```
if (conversation.memoryMode === "off")
  → Buffer only

else if (conversation.memoryMode === "no_long")
  → Summary + Buffer (skip entity)

else // "full"
  → Entity + Summary + Buffer
```

## Project Scoping

- `conversations.projectId` — Link to external project
- `conversationSummaries.projectId` — Can share across conversations
- `entityMemories.projectId` — null = global (user-level)

**Effect**: When building context with projectId:
- Summaries: fetch from all conversations in that project
- Entities: fetch project-specific + global memories

## Attachment Processing Status

| Feature | Status | Details |
|---------|--------|---------|
| Store attachments | ✅ | JSON in messages.attachments |
| Retrieve attachments | ✅ | Via getMessages() |
| Include in LLM context | ❌ | Not passed to buildChatContext |
| Image OCR/description | ❌ | No integration |
| Audio transcription | ❌ | No integration |
| Video summarization | ❌ | No integration |
| Semantic search | ❌ | No embeddings |

## File Locations

```
apps/web/
├── drizzle/schema.ts                        # Tables: messages, conversations, conversationSummaries, entityMemories
├── server/services/memoryService.ts         # All memory logic
├── server/services/relevanceScorer.ts       # rankMemories (imported, not analyzed)
├── server/services/personaService.ts        # Persona resolution
├── server/routers/chat.ts                   # sendMessage, attachment handling
└── server/services/chatService.ts           # Message CRUD (createMessage, getMessages, etc.)
```

## SQL Indexes for Performance

```
messages:
  - messages_created_at_idx (createdAt)
  - idx_messages_traceid (traceId)

conversations:
  - idx_conversations_tenant (tenantId)

conversationSummaries:
  - (implicit on conversationId FK)

entityMemories:
  - (implicit on userId FK, entityType)
```

## Critical Gaps for Multimodal Memory

- No pgvector extension (can't do semantic search)
- No attachment metadata table (dimensions, duration, etc.)
- No attachment description/transcription pipeline
- No vector embeddings for messages or attachments
- Entity extraction is pattern-based, not ML-based
- Attachments never included in LLM context

## Next Steps for Enhancement

1. **Prototype**: Add attachment descriptions to entity memory (quick win)
2. **Research**: Understanding relevanceScorer.ts (how memories are ranked)
3. **Plan**: Vector embeddings strategy (which models, when generated)
4. **Implement**: Phase 1C (attachment descriptions) before full Phase 2 (embeddings)

