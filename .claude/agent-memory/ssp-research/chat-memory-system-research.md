---
name: Chat Memory System Architecture Research
description: Complete analysis of SmartSpecPro's memory system, message attachments, context building, and data flow
type: research
---

# Chat Memory System Architecture Research Brief

## Executive Summary

SmartSpecPro implements a **three-tier memory system** for chat context:
1. **Buffer Memory** — Recent 20 messages (most recent first)
2. **Summary Memory** — LLM-generated summaries of older messages
3. **Entity Memory** — Long-term facts about users, projects, preferences, and technical details

**Attachments** are stored in messages as a JSON array with type, URL, and metadata. **Context building** uses budget-aware assembly with token estimation, relevance scoring, and persona integration.

**Current gaps**: No vector/embedding infrastructure, no multimodal attachment processing, no attachment embeddings for semantic retrieval.

---

## Current Architecture

### 1. Database Schema (apps/web/drizzle/schema.ts)

#### Messages Table (line 1347-1423)
```typescript
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  role: messageRoleEnum("role"),  // "user", "assistant", "system"
  content: text("content").notNull(),  // Main text content

  // Token & cost tracking
  inputTokens: integer("inputTokens").default(0),
  outputTokens: integer("outputTokens").default(0),
  creditsUsed: numeric("creditsUsed", { precision: 10, scale: 4 }).default("0"),
  modelUsed: varchar("modelUsed", { length: 100 }),

  // ATTACHMENTS: JSON array of multimodal content
  attachments: json("attachments").$type<Array<{
    type: "image" | "file" | "audio" | "video";
    url: string;
    key?: string;        // S3/R2 key reference
    name?: string;       // Filename
    size?: number;       // Bytes
    mimeType?: string;   // Content type
    thumbnail?: string;  // Thumbnail URL (images only)
  }>>().default([]),

  // Artifacts: Extracted content from assistant responses
  artifacts: json("artifacts").$type<Array<{
    id: string;
    type: "code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table" | "mermaid" | "svg" | "react" | "html";
    title?: string;
    content: string | string[];
    language?: string;
    metadata?: Record<string, any>;
  }>>().default([]),

  // Skill execution metadata
  skillUsed: varchar("skillUsed", { length: 100 }),
  skillArgs: json("skillArgs").$type<Record<string, any>>(),

  // Message state
  error: text("error"),
  isRegenerated: boolean("isRegenerated").default(false),
  parentMessageId: integer("parentMessageId"),

  // External channel tracking
  sourceChannel: varchar("sourceChannel", { length: 20 }),
  sourceConnectionId: varchar("sourceConnectionId", { length: 36 }),
  externalSourceId: varchar("externalSourceId", { length: 64 }),

  // Traceability
  traceId: varchar("traceId", { length: 32 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

**Key attributes:**
- `attachments` is stored as a JSON array (no separate table)
- No attachment embedding or vector representation
- Attachments are referenced by full URL (http/https) or relative path (/uploads/...)
- No metadata for attachment processing (dimensions, duration, etc.)

#### Conversations Table (line 1273-1338)
```typescript
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull().default("New Chat"),

  // LLM settings
  model: varchar("model", { length: 100 }).default("gpt-4o-mini"),
  temperature: numeric("temperature", { precision: 3, scale: 2 }).default("0.7"),
  systemPrompt: text("systemPrompt"),

  // Memory control
  memoryMode: varchar("memory_mode", { length: 20 }).default("full"),  // "full" | "no_long" | "off"

  // Project linking (for cross-session memory)
  projectId: varchar("project_id", { length: 100 }),

  // Skill preferences
  skillSettings: json("skillSettings").$type<{
    autoDetect: boolean;
    enabledSkills: string[];
    detectionMode: "ask" | "auto" | "explicit";
  }>().default({ autoDetect: true, enabledSkills: [], detectionMode: "auto" }),

  // Persona (AI personality)
  personaId: varchar("personaId", { length: 36 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Conversation Summaries Table (line 1432-1457)
```typescript
export const conversationSummaries = pgTable("conversation_summaries", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  summary: text("summary").notNull(),  // LLM-generated text summary

  // Message range being summarized
  messageRangeStart: integer("messageRangeStart").notNull(),
  messageRangeEnd: integer("messageRangeEnd").notNull(),
  messageCount: integer("messageCount").notNull(),

  // Metadata
  tokensUsed: integer("tokensUsed"),
  projectId: varchar("project_id", { length: 100 }),  // Cross-session sharing

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
```

#### Entity Memories Table (line 1466-1504)
```typescript
export const entityMemories = pgTable("entity_memories", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),

  // Entity metadata
  entityType: entityTypeEnum("entityType").notNull(),
  // Types: "user", "project", "preference", "technical", "decision", "plan", "architecture", "component", "task", "code_knowledge", "rule"
  entityName: varchar("entityName", { length: 255 }).notNull(),

  // Facts storage: Array of strings, deduplicated
  facts: json("facts").$type<string[]>().notNull().default([]),

  // Scope & sourcing
  sourceConversationId: integer("sourceConversationId"),
  projectId: varchar("projectId", { length: 100 }),  // null = global memory

  // Scoring & lifecycle
  confidence: numeric("confidence", { precision: 3, scale: 2 }).default("0.8"),
  importance: integer("importance").default(5),  // 1-10
  source: varchar("source", { length: 20 }).default("auto"),  // "auto" | "manual" | "suggested"
  reinforcementCount: integer("reinforcementCount").default(1),
  lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }).defaultNow(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});
```

---

### 2. Memory Service (apps/web/server/services/memoryService.ts)

**Configuration Constants:**
```typescript
const BUFFER_SIZE = 20;                    // Recent messages in buffer
const SUMMARIZE_THRESHOLD_PERCENT = 0.70;  // Trigger at 70% of context
const DEFAULT_CONTEXT_LENGTH = 8000;       // Token fallback
const CHARS_PER_TOKEN = 4;                 // Approximation for token estimation
const MAX_SUMMARIES_IN_CONTEXT = 5;        // Summary limit
const MAX_ENTITIES_IN_CONTEXT = 10;        // Entity limit
```

#### Buffer Memory Functions

**`getBufferMessages(conversationId, limit=20)`**
- Retrieves last N messages from conversation (most recent first)
- Returns in chronological order (reversed)
- No filtering of attachments
- Used as the "recent context" tier

**`getMessageCount(conversationId)`**
- Returns total message count for conversation
- Used for capacity planning

#### Summary Memory Functions

**`needsSummarization(conversationId): boolean`**
- Checks if unsummarized message characters exceed 70% of model context window
- Flow:
  1. Get conversation's model from database
  2. Look up model's context length in `modelProviderMap`
  3. Calculate threshold: `contextLength * 4 * 0.70` (chars)
  4. Sum unsummarized messages (ID > last_summarized_id)
  5. Return true if sum exceeds threshold

**`getMessagesToSummarize(conversationId): Message[]`**
- Returns oldest unsummarized messages (excluding recent BUFFER_SIZE)
- Preserves recent 20 messages in buffer
- Orders by creation time (ascending)

**`generateSummaryPrompt(messages: Message[]): string`**
- Formats messages as "ROLE: content" pairs
- Includes sanitization to mitigate prompt injection
- System instruction: "Focus on key topics, decisions, conclusions, action items, technical details"
- Wrapped in `<conversation>` tags

**`saveSummary(...)`**
- Stores generated summary in `conversationSummaries` table
- Tracks message range and count
- Returns ConversationSummary row

**`getSummaries(conversationId, limit=5): ConversationSummary[]`**
- Fetches summaries for current conversation
- Ordered by messageRangeEnd (desc) — newest first
- Limit: up to 5

**`getProjectSummaries(projectId, userId, limit=5): ConversationSummary[]`**
- Fetches summaries from all conversations in a project (same user)
- Uses project_id field in conversationSummaries
- Enables cross-session memory within a project

#### Entity Memory Functions

**`extractEntitiesFromMessage(content: string)`**
- Pattern-matching based extraction (regex, not LLM)
- **Supported entity types with patterns:**
  - **preference**: "I prefer/like/use/always", "my favorite X is Y"
  - **technical**: "using X language", "project/app is/uses Y"
  - **project**: "project called/named X"
  - **decision**: "we/I decided to", "decision:", "chose to use"
  - **plan**: "the plan is", "we plan to", "roadmap:", "milestone:", "phase X"
  - **architecture**: "architecture:", "system design", "design pattern"
  - **component**: "component:", "module:", "service:", "created a"
  - **task**: "todo:", "task:", "action item:", "need to"
  - **code_knowledge**: "note:", "important:", "remember:"

- Includes PII filtering via `sanitizeEntityForStorage()`
- Returns array of {type, name, fact, importance}

**`generateEntityExtractionPrompt(messages: Message[]): string`**
- LLM-based alternative (not currently used)
- Prompts for JSON-formatted entity extraction
- Categories match the enum types

**`upsertEntityMemory(...)`**
- Creates or updates entity memory
- **Upsert logic:**
  - Check if (userId, entityType, entityName) exists
  - If yes: merge facts (deduplicate), increment reinforcementCount
  - If no: create new record
- Resolves projectId if conversation has one
- Sets default importance by type: rule(10), plan/architecture(9), technical(8), decision(8), component(7), task(6), others(5)

**`getEntityMemoriesForContext(userId, limit=10, projectId?): EntityMemory[]`**
- Fetches entity memories for context building
- **Scoping:**
  - If projectId: returns memories with projectId=X OR projectId=null (project + global)
  - If no projectId: returns only global memories (projectId=null)
- Ordered by: importance (desc) → reinforcementCount (desc) → lastAccessedAt (desc)

**`touchEntityMemories(entityIds[])`**
- Updates lastAccessedAt timestamp
- Called after context building (tracks which memories are actively used)

#### Context Building Function

**`buildChatContext(conversationId, userId, systemPrompt?, options?): ChatContext`**

**Returned type:**
```typescript
interface ChatContext {
  systemPrompt?: string;
  entityContext: string | null;
  summaryContext: string | null;
  bufferMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  totalTokenEstimate: number;
}
```

**Assembly order (budget-aware):**

1. **Persona Resolution** (0% budget, always included)
   - Loads conversation's personaId and builds persona prompt segments
   - Prepends to system prompt (prefix + styleInstructions + restrictionsBulletPoints)
   - Handles persona service unavailability gracefully

2. **System Prompt** (variable, never trimmed)
   - Uses tokens but doesn't count toward budget
   - Effective system prompt = persona prefix + style + restrictions + user systemPrompt

3. **Entity Memory** (40% of budget, only in "full" mode)
   - Fetches 50 entity memories for potential inclusion
   - Separates "rule" type (always included) from others
   - Rules: `[RULE] fact1; fact2; fact3`
   - Ranks non-rule entities by relevance to `currentUserMessage` (if provided)
   - Uses `rankMemories()` from relevanceScorer service
   - Includes entities while budget allows
   - Format: `[RULES]\n[rules]\n\n[MEMORY]\n[entity1]\n[entity2]`
   - Touches accessed entity IDs
   - Returns in `[MEMORY_START]...[MEMORY_END]` block

4. **Summary Memory** (60% of budget cumulative, available in "full" & "no_long" modes)
   - Fetches 10 summaries from current conversation
   - Also fetches 5 project summaries (if projectId set)
   - Deduplicates by ID
   - Reverses order (oldest first in context)
   - Packs summaries while budget allows
   - Format: `Previous conversation context:\n[summary1]\n\n[summary2]`

5. **Buffer Messages** (remaining budget)
   - Fetches last 50 messages
   - Filters out system messages
   - Packs from most recent backward
   - Stops when budget exhausted
   - Returns in chronological order (oldest first)

**Memory modes:**
- **"full"**: All three tiers (entity + summary + buffer)
- **"no_long"**: Summary + buffer only (skips entity memory)
- **"off"**: Buffer only (skips entity + summary)

#### Context-to-Messages Conversion

**`contextToMessages(context: ChatContext)`**
- Assembles final message array for LLM API
- **Order:**
  1. System message: systemPrompt + entityContext + summaryContext
  2. Buffer messages (user/assistant messages in order)

---

### 3. Chat Router (apps/web/server/routers/chat.ts)

#### Attachment Schema (line 192-204)
```typescript
const attachmentSchema = z.object({
  type: z.enum(["image", "file", "audio", "video"]),
  url: z.string().refine(
    (val) => val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/uploads/"),
    { message: "URL must be http/https or relative /uploads/" }
  ),
  key: z.string().optional(),
  name: z.string().optional(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  thumbnail: z.string().optional(),
});

type MessageAttachment = z.infer<typeof attachmentSchema>;
```

#### sendMessage Procedure (line 664-723)
- Input: conversationId, content, attachments (optional array)
- Flow:
  1. Verify conversation ownership
  2. Create user message with attachments
  3. Return user message immediately (response via streaming endpoint)
- Attachments are passed through to `createMessage()` and stored in JSON

#### Media Generation with Attachments (line 1749-1786)
```typescript
// After skill execution generates media:
let attachments: MessageAttachment[] = [];

if (result.type === "image" && result.resultUrls?.length > 0) {
  content = `Generated image(s):\n\n${result.resultUrls.map(url => `![Generated Image](${url})`).join("\n\n")}`;
  attachments = result.resultUrls.map((url, i) => ({
    type: "image",
    url,
    name: `generated-image-${i + 1}.png`,
  }));
}

await createMessage({
  conversationId: input.conversationId,
  role: "assistant",
  content,
  attachments: attachments.length > 0 ? attachments : undefined,
  skillUsed: input.skillId,
  creditsUsed: result.creditsUsed ? String(result.creditsUsed) : undefined,
});
```

---

### 4. Data Flow

```
User sends message with attachments
    ↓
chat.sendMessage procedure
    ↓
Validate attachments (type, URL format)
    ↓
createMessage() → INSERT into messages table
    ↓
Attachments stored as JSON in messages.attachments
    ↓
[Optional] Process conversation memory
    ├─→ Check if summarization needed
    ├─→ Extract entities from message
    └─→ Save summaries & entities
    ↓
[Later] buildChatContext for next turn
    ├─→ Load entity memories
    ├─→ Load conversation summaries
    └─→ Load recent buffer messages
    ↓
contextToMessages() → Format for LLM
    ↓
LLM API call (messages array without attachments being processed)
```

---

## Findings: Current State

### What Works

1. **Three-tier memory system is fully implemented**
   - Buffer (recent messages) ✅
   - Summary (LLM-generated) ✅
   - Entity (long-term facts) ✅

2. **Attachments are stored and retrieved**
   - JSON array in messages table ✅
   - Type, URL, metadata fields ✅
   - Validated URL format (http/https or /uploads/) ✅

3. **Context building is budget-aware**
   - Token estimation via character count ✅
   - Persona integration ✅
   - Project-scoped memory ✅
   - Memory mode toggle (full/no_long/off) ✅

4. **Entity extraction works (pattern-based)**
   - 11 entity types supported ✅
   - PII filtering included ✅
   - Reinforcement tracking ✅

5. **Multi-modal support in schema**
   - Messages support attachments (image, file, audio, video) ✅
   - Artifacts support multiple types (code, markdown, media, etc.) ✅

### Gaps & Limitations

1. **No vector/embedding infrastructure**
   - ❌ pgvector extension not installed
   - ❌ No embeddings table
   - ❌ No semantic similarity search
   - ❌ All retrieval is by ID/time-based

2. **Attachments not processed or included in context**
   - ❌ Attachments loaded from DB but never passed to LLM
   - ❌ No attachment content extraction or summarization
   - ❌ No image description/OCR integration
   - ❌ No audio transcription
   - ❌ No video frame extraction

3. **Entity extraction is pattern-based, not ML-based**
   - ✅ Works but brittle (regex-dependent)
   - ❌ LLM-based extraction exists but is unused (generateEntityExtractionPrompt)
   - ❌ No confidence scoring for extracted entities (hard-coded by type)

4. **No attachment metadata or processing**
   - ❌ No image dimensions stored
   - ❌ No video duration stored
   - ❌ No file type detection beyond user input
   - ❌ No attachment indexing for retrieval

5. **Relevance scoring depends on external service**
   - rankMemories() imported from "relevanceScorer" but not shown in this analysis
   - ❌ Likely uses simple keyword matching, not semantic
   - ❌ No learned relevance weights

6. **Summary generation uses basic LLM call**
   - ✅ Works but no caching
   - ❌ No summarization of attachments (only text)
   - ❌ Re-summarization if messages change (not idempotent)

---

## Options for Multimodal Memory Enhancement

### Option A: Text-Only Enhancement (2-3 weeks)
- Use existing pattern-matching + LLM-based entity extraction
- No vector embeddings
- Pros: Low effort, fits current architecture
- Cons: Limited semantic understanding, no attachment processing
- **Recommendation**: Not sufficient for multimodal memory

### Option B: Add Vector Embeddings + Attachment Processing (5-8 weeks)
- Install pgvector extension
- Create embeddings table for messages/summaries/entities
- Process attachments: image→OCR, audio→transcription, video→frames+captions
- Implement semantic search for context retrieval
- Update context building to use semantic relevance
- **Recommendation**: Best for future-proof multimodal support

### Option C: Hybrid Approach — Phase 1 (3-4 weeks, Option B foundation)
- Phase 1A: Install pgvector, create embedding infrastructure (no embeddings generation yet)
- Phase 1B: Add attachment metadata table (dimensions, duration, etc.)
- Phase 1C: Route attachments through summarization (generate descriptions)
- Phase 1D: Store attachment descriptions as text for entity extraction
- Later (Phase 2): Add actual embedding generation and semantic search
- **Recommendation**: Unblocks immediate features, prepares for Phase 2

---

## Key Implementation Points

### Token Budget Calculation
```
- Total budget: 8000 tokens (configurable via contextBudget)
- Chars per token: 4 (approximation)
- System prompt: never trimmed
- Entity context: 40% of budget
- Summary context: 60% of budget (cumulative)
- Buffer messages: remaining budget
```

### Memory Mode Control
**Set per-conversation:**
```typescript
conversation.memoryMode = "full" | "no_long" | "off"
```
- Can be toggled by user via settings
- Affects what gets included in context

### Attachment URL Handling
- **Full URLs**: `http://...`, `https://...` (from external storage)
- **Relative paths**: `/uploads/...` (from local storage, Nginx will route)
- **No file:// protocol** (security)
- Attachments never validated for existence before message creation

### Entity Type Importance Hierarchy
```typescript
rule: 10              // Rules for behavior/constraints
decision: 8           // Important architectural decisions
plan: 9
architecture: 9
code_knowledge: 8
technical: 7
component: 7
task: 6
user: 5
project: 6
preference: 5
```

### Project Scoping
- `conversations.projectId` — links to external project system
- `conversationSummaries.projectId` — can fetch summaries from other conversations in same project
- `entityMemories.projectId` — null means global (user-level)
- Enables "cross-conversation" memory within a project

---

## Critical Gaps Blocking Multimodal Memory

1. **No attachment content extraction**
   - Images: No OCR, no description generation
   - Videos: No frame extraction, no transcription
   - Audio: No transcription
   - Files: No parsing/summarization

2. **No attachment retrieval strategy**
   - Can't search for "show me the diagram I uploaded 3 weeks ago"
   - No way to find attachments by content
   - Only by message ID/timestamp

3. **Attachments not included in LLM context**
   - buildChatContext() doesn't process attachments
   - LLM never sees attachment descriptions/content
   - Memory system doesn't learn from multimodal content

4. **No multimodal embedding space**
   - Can't find semantically similar images
   - Can't cross-reference similar code/architecture
   - Can't summarize visual patterns across attachments

---

## Database Readiness Assessment

| Requirement | Status | Notes |
|---|---|---|
| pgvector extension | ❌ Not installed | Would need DB migration |
| Messages table supports attachments | ✅ Yes | JSON column exists |
| Embeddings table | ❌ None | Would need new table |
| Attachment metadata | ⚠️ Partial | Basic fields (url, type, name, size, mimeType, thumbnail) |
| Message indexing | ✅ Partial | createdAt index exists, no full-text search on attachments |
| Cross-conversation retrieval | ✅ Yes | projectId column supports it |
| Traceability | ✅ Yes | traceId for audit logs |

---

## Files Summary

| File | Purpose | Key Functions |
|---|---|---|
| `drizzle/schema.ts` | Database schema | messages, conversations, conversationSummaries, entityMemories tables |
| `services/memoryService.ts` | Memory operations | buildChatContext, getBufferMessages, getSummaries, upsertEntityMemory, extractEntitiesFromMessage |
| `routers/chat.ts` | Chat endpoints | sendMessage, message attachment handling, media generation with attachments |
| `services/personaService.ts` | Persona system | resolvePersona, buildPersonaPromptSegments (imported by memoryService) |
| `services/relevanceScorer.ts` | Relevance ranking | rankMemories (imported by memoryService, not analyzed) |

---

## Recommendations for Next Steps

1. **Research relevanceScorer.ts** — Understand how memories are currently ranked
2. **Map attachment processing pipeline** — Where could descriptions be generated?
3. **Plan vector embedding strategy** — Which models? When generated?
4. **Design multimodal entity extraction** — How to include image/video content?
5. **Prototype Phase 1C** — Attachment descriptions in entity memory (unblocks immediate value)

