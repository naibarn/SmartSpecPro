# SmartSpecPro Chat System Architecture

## Overview

SmartSpecPro implements a multi-faceted chat system supporting:
- Multi-conversation per user (chat history)
- Skill detection and execution (image, video, code generation)
- Memory system (short-term in conversation, long-term across sessions)
- LLM provider routing with credit tracking
- Media generation (images, videos) with async job handling

## Database Schema

### Core Chat Tables

#### `conversations` (pgTable)
**Purpose**: User chat sessions with settings and memory context
- `id` (serial) - Primary key
- `userId` (int, FK users) - Conversation owner
- `title` (varchar 255) - Chat name (auto or user-set)
- `model` (varchar 100) - Default LLM model (e.g., "gpt-4o-mini")
- `temperature` (numeric 3,2) - Default 0.7
- `systemPrompt` (text) - Custom system prompt for conversation
- `skillSettings` (json) - Skill configuration
  - `autoDetect` (boolean) - Auto-detect skills in user input
  - `enabledSkills` (string[]) - Explicit skill whitelist
  - `detectionMode` ("ask" | "auto" | "explicit")
- `isArchived` (boolean) - Soft flag for hiding
- `isPinned` (boolean) - Pin to top of sidebar
- `trashedAt` (timestamp nullable) - Soft-delete, auto-purge after 30 days
- `totalCreditsUsed` (numeric 12,4) - Cumulative cost
- `messageCount` (int) - Message counter (incremented on create)
- `projectId` (varchar 100) - Link to projects for cross-session summaries
- `memoryMode` ("full" | "no_long" | "off") - Memory retention strategy
- `brainstormPartnerModel` (varchar 100) - Model B for debate mode
- `brainstormMaxRounds` (int) - Default 3
- `createdAt`, `updatedAt` (timestamp)

#### `messages` (pgTable)
**Purpose**: Individual chat messages (user, assistant, system)
- `id` (serial) - Primary key
- `conversationId` (int, FK conversations) - Which chat
- `role` (messageRoleEnum) - "user", "assistant", or "system"
- `content` (text) - Message body
- `inputTokens`, `outputTokens` (int) - Usage metrics
- `creditsUsed` (numeric 10,4) - Cost for this message
- `modelUsed` (varchar 100) - Which LLM generated this (null for user messages)
- `attachments` (json array) - User uploads
  - `type` ("image" | "file" | "audio" | "video")
  - `url`, `key`, `name`, `size`, `mimeType`, `thumbnail`
- `artifacts` (json array) - Extracted outputs from response
  - `id`, `type` ("code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table")
  - `title`, `content` (string or string[]), `language`, `metadata`
- `skillUsed` (varchar 100) - Which skill generated this (null for regular LLM)
- `skillArgs` (json) - Skill parameters passed
- `error` (text) - Error if generation failed
- `isRegenerated` (boolean) - Regenerated message flag
- `parentMessageId` (int) - Points to original message if regenerated
- `createdAt` (timestamp)
- Index: `messages_created_at_idx`

#### `conversationSummaries` (pgTable)
**Purpose**: LLM-generated abstracts for memory compression
- `id` (serial)
- `conversationId` (int, FK conversations) - Which chat
- `summary` (text) - The abstract
- `messageRangeStart`, `messageRangeEnd` (int) - Message IDs summarized
- `messageCount` (int) - How many messages were in the range
- `tokensUsed` (int) - Cost to generate summary
- `projectId` (varchar 100) - Optional project context
- `createdAt` (timestamp)

#### `entityMemories` (pgTable)
**Purpose**: Long-term facts persisting across conversations
- `id` (serial)
- `userId` (int, FK users) - Memory owner
- `entityType` (entityTypeEnum) - "user", "project", "preference", "technical", "decision", "plan", "architecture", "component", "task", "code_knowledge", "rule"
- `entityName` (varchar 255) - What this memory is about
- `facts` (json string[]) - List of facts to include in context
- `sourceConversationId` (int, FK conversations nullable) - Where learned
- `projectId` (varchar 100) - Scope (null = global/user-level)
- `confidence` (numeric 3,2) - 0-1 reliability score
- `lastAccessedAt` (timestamp) - Updated on access
- `importance` (int) - 1-10 priority (higher = included first)
- `source` ("auto" | "manual" | "suggested") - How created
- `reinforcementCount` (int) - How many times reinforced
- `createdAt`, `updatedAt` (timestamp)

#### `skillPreferences` (pgTable)
**Purpose**: Per-conversation skill settings
- `id` (serial)
- `conversationId` (int, FK conversations) - Which chat
- `skillId` (varchar 100) - Skill identifier
- `enabled` (boolean) - Whether active in this chat
- `priority` (int) - Sort order (higher = checked first)
- `customSettings` (json) - Skill-specific overrides
- `createdAt` (timestamp)

## tRPC Router Endpoints (`apps/web/server/routers/chat.ts`)

### Conversation Management
- `createConversation` (mutation) - Create new chat
  - Input: `{ title?, model?, systemPrompt?, projectId? }`
- `listConversations` (query) - Fetch user's chats
  - Input: `{ limit, offset, isArchived?, search? }`
- `getConversation` (query) - Fetch one chat with settings
- `updateConversation` (mutation) - Update title, model, settings
- `deleteConversation` (mutation) - Soft-delete (trash)
- `deleteEmptyConversations` (mutation) - Auto-clean 0-message chats
- `deleteMultipleConversations` (mutation) - Batch trash
- `listTrashedConversations` (query) - Show trash
- `restoreConversation` (mutation) - Restore from trash
- `permanentlyDeleteConversation` (mutation) - Hard-delete
- `emptyTrash` (mutation) - Purge all trash

### Message Operations
- `sendMessage` (mutation) - User sends text/attachments
  - Input: `{ conversationId, content, attachments? }`
  - Non-streaming; full response returned at end
- `getMessages` (query) - Fetch messages for chat
  - Input: `{ conversationId, limit?, offset? }`
- `getRecentMessages` (query) - Quick fetch of latest N messages
- `updateMessage` (mutation) - Edit message
- `deleteMessage` (mutation) - Remove message
- `getMessageById` (query) - Single message fetch

### Memory & Context
- `buildChatContext` (function, not exposed) - Assembles LLM context
  - Includes: system prompt + entity memories + Google Drive tools
- `getEntityMemories` (function) - Fetch user's long-term facts
- `upsertEntityMemory` (function) - Create/update memory fact
- `deleteEntityMemory` (function) - Remove memory
- `getSummaries` (query) - List conversation summaries
- `updateConversationCredits` (function) - Increment total cost

### Skill System
- `detectSkill` (mutation) - Analyze user input for skill triggers
  - Input: `{ conversationId, content }`
  - Returns: `{ detected: true, skillId, confidence, params }`
- `executeSkill` (mutation) - Run detected skill
  - Input: `{ skillId, prompt?, model?, aspectRatio?, numImages?, duration?, voice?, quality?, ... }`
  - Handles: LLM skills, media generation (image/video), Python skills, sandbox jobs
- `estimateSkillCost` (mutation) - Predict credit cost before execution
- `getSkillPreferences` (query) - Fetch per-conversation skill settings
- `updateSkillPreference` (mutation) - Enable/disable skills per chat

### Skill Preferences
- `getSkillPreferences` (query) - Fetch skill toggle state for conversation
- `updateSkillPreferences` (mutation) - Update multiple skill settings at once

## Message Processing Pipeline

### User sends message
```
Frontend (ChatView.tsx)
  ↓
  trpc.chat.sendMessage
  ↓
Backend (chat.ts:sendMessage procedure)
  1. Verify conversation ownership
  2. Create user message in DB
  3. Check user credits (hasEnoughCredits)
  4. Detect skill (detectSkill)
     - If skill match + auto-trigger: dispatch to executeSkill
  5. Build LLM context (buildChatContext)
     - Includes system prompt + entity memories
  6. Call LLM provider API
  7. Parse response, extract artifacts
  8. Create assistant message in DB
  9. Deduct credits (calculateCreditsForLLM)
  10. Update conversation stats (messageCount, totalCreditsUsed)
  11. Return full message to client
```

### Skill Execution Path
```
User input → detectSkill (NLP classifier + DB lookup)
  ↓
If skill detected:
  - LLM skill: Add skill system prompt, call LLM, save response
  - Media skill: Call skillExecutor → S3/media provider (async via Celery)
  - Python skill: Send to python-backend via startPythonSkillTask
  - Sandbox job: Dispatch to OpenSandbox, return job ID + polling link
```

### Memory Assembly (`buildChatContext`)
1. **System prompt** (from conversation.systemPrompt)
2. **Entity memories** (top 10 most relevant facts about user/project)
3. **Google Drive tools** (if user connected Google Drive)
4. **Recent messages** (conversation history)
5. **LLM sees**: `[system prompt] [memories] [tools] [chat history]`

## Key Services

### `chatService.ts`
- **Database layer** for conversations, messages, memories
- **Conversation lifecycle**: create, read, update, soft-delete, restore, permanently delete
- **Message CRUD**: insert, fetch (paginated, filtered), update, delete
- **Memory operations**: upsert facts, retrieve top-N
- **Context building**: assemble system prompts + memories for LLM
- **Auto-trash cleanup**: purge conversations >30 days old

### `skillDetector.ts`
- **Skill matching**: NLP + regex detection from user input
- **Confidence scoring**: 0-1 value indicates match strength
- **Parameter extraction**: Parse user input for skill arguments
- **Rate limiting**: Prevent abuse of detection endpoint

### `skillExecutor.ts`
- **Skill routing**: Dispatch to correct executor based on skill type
- **Media generation**: Image/video via providers (Kie.ai, fal.ai)
- **Python skills**: Async task via startPythonSkillTask
- **LLM skills**: Simple system prompt injection
- **Credit estimation**: Predict cost before execution

### `creditService.ts`
- **Balance check**: hasEnoughCredits(userId, required)
- **Cost calculation**: calculateCreditsForLLM(tokens, model, provider)
- **Transaction logging**: Audit trail via creditTransactions table

## Data Flow Examples

### Example 1: User asks for image
```
User input: "Create a sunset over mountains"
  ↓
detectSkill() → "image_prompt_engineer" (confidence 0.92)
  ↓
executeSkill("image_prompt_engineer", { prompt: "sunset..." })
  ↓
Call Kie.ai API (async, returns task_id)
  ↓
Save message: role=assistant, skillUsed="image_prompt_engineer", artifacts=[task_id]
  ↓
Frontend polls for completion via taskId
  ↓
On webhook callback: Update message.artifacts with final image URL
```

### Example 2: User asks a question
```
User input: "What's the capital of France?"
  ↓
detectSkill() → null (no skill match)
  ↓
Build context:
  - System: "You are a helpful assistant"
  - Memories: user.facts (e.g., "interested in geography")
  - History: recent messages
  ↓
Call LLM provider (e.g., GPT-4o) with context
  ↓
Parse response → "The capital of France is Paris"
  ↓
Save message: role=assistant, modelUsed="gpt-4o", content="The capital..."
  ↓
Deduct credits from user.credits
  ↓
Return to client immediately
```

### Example 3: User saves memory
```
User marks "I prefer detailed explanations"
  ↓
Call upsertEntityMemory({
  entityType: "preference",
  entityName: "communication_style",
  facts: ["Prefer detailed explanations over summaries"],
  sourceConversationId: 42
})
  ↓
Next conversation: buildChatContext includes this fact
  ↓
LLM sees user preference in system context
```

## Type Definitions

### Core Types (from drizzle schema)
```typescript
type Conversation = {
  id: number;
  userId: number;
  title: string;
  model: string;
  temperature: string; // numeric stored as string
  systemPrompt?: string;
  skillSettings: { autoDetect: boolean; enabledSkills: string[]; detectionMode: "ask" | "auto" | "explicit" };
  isArchived: boolean;
  isPinned: boolean;
  trashedAt?: Date;
  totalCreditsUsed: string;
  messageCount: number;
  projectId?: string;
  memoryMode: string;
  brainstormPartnerModel?: string;
  brainstormMaxRounds: number;
  createdAt: Date;
  updatedAt: Date;
}

type Message = {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: string;
  modelUsed?: string;
  attachments: Array<{
    type: "image" | "file" | "audio" | "video";
    url: string;
    key?: string;
    name?: string;
    size?: number;
    mimeType?: string;
    thumbnail?: string;
  }>;
  artifacts: Array<{
    id: string;
    type: "code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table";
    title?: string;
    content: string | string[];
    language?: string;
    metadata?: Record<string, any>;
  }>;
  skillUsed?: string;
  skillArgs?: Record<string, any>;
  error?: string;
  isRegenerated: boolean;
  parentMessageId?: number;
  createdAt: Date;
}

type EntityMemory = {
  id: number;
  userId: number;
  entityType: string;
  entityName: string;
  facts: string[];
  sourceConversationId?: number;
  projectId?: string;
  confidence: string; // numeric
  lastAccessedAt: Date;
  importance: number;
  source: "auto" | "manual" | "suggested";
  reinforcementCount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

## Key Design Patterns

1. **Soft-delete with TTL**: Conversations trashed but kept 30 days for recovery
2. **Denormalized counts**: messageCount tracked in conversation (avoid JOIN on every list)
3. **JSON for extensibility**: skillSettings, artifacts, attachments allow future schema evolution
4. **Role-based context**: System prompts per conversation enable personalization
5. **Memory stratification**:
   - Short-term: Recent messages in conversation history
   - Long-term: Entity memories across all conversations
6. **Skill precedence**: Conversation.skillSettings overrides user defaults
7. **Async media**: Media jobs return task_id immediately, webhook updates message later

## File Locations
- **Router**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts` (1,800+ lines)
- **Service**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts`
- **Schema**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (lines 1111-1350)
- **Frontend**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Chat.tsx`
- **ChatView**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.tsx`

## Integration Points

### With LLM System
- Chat router calls `createProviderContext()` to get available models
- Deducts credits via `creditService`
- Routes to provider via `llmRouter`

### With Skill System
- `skillDetector` identifies skill matches
- `skillRegistry` loads skill definitions
- `skillExecutor` runs skills (media, Python, LLM)

### With Memory System
- `entityMemories` stores cross-session facts
- `conversationSummaries` compress old messages
- `buildChatContext` assembles memories + history for LLM

### With Media System
- Media skills dispatch async jobs to Celery/OpenSandbox
- Message.artifacts stores result URLs and metadata
- Webhook callbacks update message state

## Current Limitations & Notes
- Streaming responses via SSE not fully documented in chat.ts (see llmRoutes.ts)
- Memory assembly excludes old messages beyond 30 days (configured threshold)
- Skill detection is best-effort, user can override with explicit slash commands
- Media generation is fully async, requires polling or webhook integration
- No built-in conversation branching (regenerate is a new message with parentMessageId link)
