# SmartSpecWeb Chat Feature - Comprehensive Implementation Plan

**Date:** 22 January 2026
**Version:** 1.0.0
**Status:** Planning

---

## 1. Overview

This document outlines the comprehensive implementation plan for an advanced chat feature in SmartSpecWeb, inspired by modern AI chat interfaces like open-claude-cowork. The feature integrates with the existing LLM Gateway and Credit System while adding support for skills, multi-modal content, memory systems, and rich media display.

---

## 2. Requirements Summary

### Core Requirements
1. **LLM Integration** - Connect to LLM Gateway with real-time credit calculation and deduction
2. **Skill System** - Full support for extensible skills with automatic/manual detection
3. **Modern UI** - Multi-chat interface similar to open-claude-cowork
4. **Multi-Modal** - Support for images, documents, and rich content
5. **Memory System** - Three-tier memory (buffer, summary, entity)

### Extended Requirements
1. **Image Display** - View images with zoom/expand lightbox
2. **Document Rendering** - Inline .md and .pdf rendering
3. **Skill-Generated Images** - Display images from Nano Banana Pro (Gemini 3.0)
4. **Skill-Generated Videos** - Display videos from VEO 3.1, Sora 2, Kling 2.6
5. **Artifact Display** - Code blocks, markdown preview, file downloads
6. **Slideshow Artifacts** - Multi-image sequence display (carousel)
7. **User Skill Preferences** - Per-chat skill detection toggle

---

## 3. Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SmartSpecWeb Frontend                             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Chat Sidebar │  │  Chat View   │  │  Artifact    │  │   Media     │ │
│  │  (History)   │  │  (Messages)  │  │   Panel      │  │  Lightbox   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                           │                                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Chat Service Layer                            │  │
│  │  - Message streaming       - Skill detection                      │  │
│  │  - Memory management       - Media handling                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SmartSpecWeb Backend                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   tRPC API   │  │  LLM Gateway │  │   Credit     │                  │
│  │   (Chat)     │  │ (OpenRouter) │  │   Service    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│         │                 │                 │                           │
│         ▼                 ▼                 ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       PostgreSQL Database                         │  │
│  │  - conversations    - messages    - summaries    - entities       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Python Backend (Media)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Media Gen  │  │    Celery    │  │     S3       │                  │
│  │   (kie.ai)   │  │    Tasks     │  │   Storage    │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

```
User Message → Skill Detection → LLM Gateway → Credit Check →
→ Stream Response → Memory Update → Artifact Extraction → UI Render
```

---

## 4. Technology Stack

### Frontend Libraries

| Category | Library | Purpose |
|----------|---------|---------|
| **Chat UI** | Assistant UI | shadcn-based chat components, streaming, attachments |
| **Markdown** | Streamdown | Real-time streaming markdown renderer |
| **Image Zoom** | Yet Another React Lightbox | Full-screen image viewer with zoom |
| **PDF Viewer** | react-pdf | Inline PDF rendering |
| **Video Player** | react-player | Universal video player |
| **Carousel** | Swiper | Slideshow/multi-image artifacts |
| **Code Highlight** | Shiki/Prism | Syntax highlighting in artifacts |

### Existing Infrastructure (Reuse)

| Component | Location | Status |
|-----------|----------|--------|
| LLM Gateway | `server/_core/llmRoutes.ts` | Ready |
| Credit System | `server/services/creditService.ts` | Ready |
| tRPC Router | `server/routers/credits.ts` | Ready |
| Media Generation | `python-backend/app/api/v1/media_generation.py` | Ready |
| kie.ai Provider | `python-backend/app/services/generation/kie_provider.py` | Ready |

---

## 5. Database Schema

### New Tables

```sql
-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Settings
    model VARCHAR(100) DEFAULT 'gpt-4o-mini',
    temperature DECIMAL(3,2) DEFAULT 0.7,
    system_prompt TEXT,

    -- Skill preferences (JSONB)
    skill_settings JSONB DEFAULT '{"autoDetect": true, "enabledSkills": []}'
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,

    -- Token tracking
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    credits_used DECIMAL(10,4) DEFAULT 0,

    -- Media attachments (JSONB array)
    attachments JSONB DEFAULT '[]',
    -- [{type: 'image', url: '...', thumbnail: '...'}, ...]

    -- Artifacts (JSONB array)
    artifacts JSONB DEFAULT '[]',
    -- [{type: 'code', language: 'python', content: '...'}, ...]

    -- Skill metadata
    skill_used VARCHAR(100),
    skill_args JSONB,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Conversation summaries (for Summary Memory)
CREATE TABLE conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    message_range_start INTEGER NOT NULL,
    message_range_end INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Entity memory (facts about user/project)
CREATE TABLE entity_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    entity_type VARCHAR(50) NOT NULL, -- 'user', 'project', 'preference'
    entity_name VARCHAR(255) NOT NULL,
    facts JSONB NOT NULL DEFAULT '[]',
    -- ['prefers TypeScript', 'works on SmartSpecPro', ...]

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id, entity_type, entity_name)
);

-- Skill detection preferences per conversation
CREATE TABLE skill_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    skill_id VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,

    UNIQUE(conversation_id, skill_id)
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC);
CREATE INDEX idx_entity_memories_user ON entity_memories(user_id, entity_type);
```

---

## 6. Memory System

### 6.1 Three-Tier Memory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Memory System                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │  Buffer Memory  │  ← Recent N messages (configurable)        │
│  │  (Short-term)   │    Default: Last 20 messages               │
│  └─────────────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │  Summary Memory │  ← LLM-generated summaries of old messages │
│  │  (Medium-term)  │    Triggered when buffer exceeds threshold │
│  └─────────────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │  Entity Memory  │  ← Persistent facts about user/project     │
│  │  (Long-term)    │    Extracted during conversations          │
│  └─────────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Memory Flow

1. **New Message Arrives**
   - Add to buffer memory
   - Check if buffer exceeds threshold (e.g., 30 messages)

2. **Buffer Overflow**
   - Generate summary of oldest 10 messages using LLM
   - Store summary in `conversation_summaries`
   - Remove summarized messages from buffer

3. **Entity Extraction** (Background)
   - Periodically analyze conversation for facts
   - Extract entities: user preferences, project details, technical choices
   - Store in `entity_memories`

4. **Context Building**
   - When sending to LLM:
     ```
     [System Prompt]
     [Entity Memory Facts] (if any)
     [Relevant Summaries]
     [Buffer Messages]
     [New User Message]
     ```

---

## 7. Skill System

### 7.1 Skill Detection Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │     │   Skill     │     │   Skill     │
│   Message   │ ──▶ │  Detector   │ ──▶ │  Executor   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   User      │
                    │ Preferences │
                    └─────────────┘
```

### 7.2 Skill Types

| Type | Examples | Output |
|------|----------|--------|
| **Image Generation** | Nano Banana Pro | Image URL, prompt used |
| **Video Generation** | VEO 3.1, Sora 2, Kling 2.6 | Video URL, generation time |
| **Code Assistant** | Code review, refactor | Code artifacts |
| **Document** | PDF summary, file analysis | Text + attachments |
| **Search** | Web search, RAG | Formatted results |

### 7.3 User Skill Preferences UI

```
┌─────────────────────────────────────────────────┐
│  Skill Detection Settings                   ⚙️  │
├─────────────────────────────────────────────────┤
│                                                 │
│  [✓] Auto-detect skills from messages          │
│                                                 │
│  Enabled Skills:                                │
│  ┌─────────────────────────────────────────┐   │
│  │ [✓] Image Generation (Nano Banana Pro) │   │
│  │ [✓] Video Generation (VEO, Sora, Kling)│   │
│  │ [✓] Code Assistant                      │   │
│  │ [ ] Web Search                          │   │
│  │ [✓] Document Analysis                   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Detection Mode:                                │
│  ( ) Always ask before running skill           │
│  (•) Run automatically when detected           │
│  ( ) Only run when explicitly requested        │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 8. UI Components

### 8.1 Chat Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  SmartSpecWeb                                          [User] ▼   ⚙️  🌙   │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────────────────────────────────────┐ ┌─────────────┐ │
│ │ Sidebar  │ │             Chat Messages                 │ │  Artifact   │ │
│ │          │ │                                           │ │   Panel     │ │
│ │ [+ New]  │ │ ┌─────────────────────────────────────┐  │ │  (Optional) │ │
│ │          │ │ │ 👤 User                              │  │ │             │ │
│ │ Today    │ │ │ Create an image of a sunset...      │  │ │ ┌─────────┐ │ │
│ │ • Chat 1 │ │ └─────────────────────────────────────┘  │ │ │  Code   │ │ │
│ │ • Chat 2 │ │                                           │ │ │ Preview │ │ │
│ │          │ │ ┌─────────────────────────────────────┐  │ │ │         │ │ │
│ │ Yesterday│ │ │ 🤖 Assistant                         │  │ │ └─────────┘ │ │
│ │ • Chat 3 │ │ │ [Using: Nano Banana Pro]             │  │ │             │ │
│ │ • Chat 4 │ │ │                                       │  │ │ ┌─────────┐ │ │
│ │          │ │ │ ┌───────────────────────────────┐    │  │ │ │  Image  │ │ │
│ │ Older    │ │ │ │ 🖼️  Generated Image           │    │  │ │ │ Gallery │ │ │
│ │ • Chat 5 │ │ │ │ [Click to expand]            │    │  │ │ │         │ │ │
│ │          │ │ │ └───────────────────────────────┘    │  │ │ └─────────┘ │ │
│ │          │ │ │                                       │  │ │             │ │
│ │          │ │ │ Here's your sunset image...          │  │ │             │ │
│ │          │ │ └─────────────────────────────────────┘  │ │             │ │
│ │          │ │                                           │ │             │ │
│ │          │ ├───────────────────────────────────────────┤ │             │ │
│ │          │ │ 📎 [Type a message...]         [Send] 📷 │ │             │ │
│ │          │ └───────────────────────────────────────────┘ │             │ │
│ └──────────┘                                               └─────────────┘ │
│ Credits: 450 / 1000                                    Skill Settings ⚙️   │
└────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Artifact Types

```typescript
type ArtifactType =
  | 'code'        // Syntax-highlighted code with copy button
  | 'markdown'    // Rendered markdown preview
  | 'image'       // Single image with lightbox
  | 'slideshow'   // Multi-image carousel
  | 'video'       // Video player
  | 'pdf'         // PDF viewer
  | 'file'        // Downloadable file
  | 'chart'       // Data visualization
  | 'table';      // Formatted table

interface Artifact {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string | string[];  // string[] for slideshow
  language?: string;           // For code artifacts
  metadata?: Record<string, any>;
}
```

### 8.3 Media Display Components

#### Image Lightbox
```typescript
// Using Yet Another React Lightbox
<Lightbox
  open={lightboxOpen}
  close={() => setLightboxOpen(false)}
  slides={images.map(img => ({ src: img.url }))}
  plugins={[Zoom, Thumbnails, Download]}
/>
```

#### Video Player
```typescript
// Using react-player
<ReactPlayer
  url={videoUrl}
  controls
  width="100%"
  height="auto"
  config={{
    file: {
      attributes: { controlsList: 'nodownload' }
    }
  }}
/>
```

#### Slideshow Carousel
```typescript
// Using Swiper
<Swiper
  modules={[Navigation, Pagination, Thumbs]}
  spaceBetween={10}
  navigation
  pagination={{ clickable: true }}
  thumbs={{ swiper: thumbsSwiper }}
>
  {images.map((img, idx) => (
    <SwiperSlide key={idx}>
      <img src={img.url} alt={`Slide ${idx + 1}`} />
    </SwiperSlide>
  ))}
</Swiper>
```

---

## 9. API Design

### 9.1 tRPC Routes

```typescript
// server/routers/chat.ts

export const chatRouter = router({
  // Conversations
  createConversation: protectedProcedure
    .input(z.object({
      title: z.string().optional(),
      model: z.string().default('gpt-4o-mini'),
      systemPrompt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => { ... }),

  listConversations: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => { ... }),

  getConversation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => { ... }),

  deleteConversation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Messages
  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      content: z.string(),
      attachments: z.array(AttachmentSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Skill detection enabled streaming endpoint
  streamChat: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      content: z.string(),
    }))
    .subscription(async function* ({ ctx, input }) {
      // 1. Check credits
      // 2. Detect skills
      // 3. Stream response
      // 4. Extract artifacts
      // 5. Update memory
      yield* streamResponse();
    }),

  // Memory
  getEntityMemories: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => { ... }),

  // Skills
  updateSkillPreferences: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      skillSettings: SkillSettingsSchema,
    }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Media generation (proxy to Python backend)
  generateImage: protectedProcedure
    .input(z.object({
      prompt: z.string(),
      model: z.enum(['nano_banana_pro']),
      conversationId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => { ... }),

  generateVideo: protectedProcedure
    .input(z.object({
      prompt: z.string(),
      model: z.enum(['veo_3_1', 'sora_2', 'kling_2_6']),
      conversationId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => { ... }),
});
```

### 9.2 Credit Integration

```typescript
// Credit calculation per message
const calculateCredits = (inputTokens: number, outputTokens: number): number => {
  // 1 credit = 1000 input tokens OR 500 output tokens
  const inputCredits = inputTokens / 1000;
  const outputCredits = outputTokens / 500;
  return inputCredits + outputCredits;
};

// Before sending message
const checkCredits = async (userId: string, estimatedTokens: number) => {
  const balance = await creditService.getBalance(userId);
  const estimatedCost = estimatedTokens / 1000;

  if (balance < estimatedCost) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Insufficient credits',
    });
  }
};

// After response complete
const deductCredits = async (userId: string, inputTokens: number, outputTokens: number) => {
  const credits = calculateCredits(inputTokens, outputTokens);
  await creditService.deduct(userId, credits, 'chat_completion', {
    inputTokens,
    outputTokens,
  });
};
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1-2)

#### Tasks
- [ ] Database schema creation and migrations
- [ ] Basic tRPC chat router
- [ ] Conversation CRUD operations
- [ ] Message persistence
- [ ] Credit integration

#### Deliverables
- Working database schema
- API endpoints for conversations and messages
- Credit checking and deduction

---

### Phase 2: Chat UI (Week 2-3)

#### Tasks
- [ ] Install Assistant UI and Streamdown
- [ ] Chat sidebar component (conversation list)
- [ ] Chat view component (message list)
- [ ] Message input with attachments
- [ ] Streaming response display

#### Deliverables
- Functional chat interface
- Multi-conversation support
- Real-time message streaming

---

### Phase 3: Memory System (Week 3-4)

#### Tasks
- [ ] Buffer memory implementation
- [ ] Summary generation service
- [ ] Entity extraction service
- [ ] Memory-aware context building
- [ ] Memory management UI

#### Deliverables
- Three-tier memory working
- Automatic summarization
- Entity memory storage and retrieval

---

### Phase 4: Skill System (Week 4-5)

#### Tasks
- [ ] Skill detection engine
- [ ] Skill registry and loader
- [ ] Integration with existing skills (`/.claude/skills/`)
- [ ] User skill preferences UI
- [ ] Skill execution in chat flow

#### Deliverables
- Working skill detection
- User preference management
- Skill-enhanced responses

---

### Phase 5: Media & Artifacts (Week 5-6)

#### Tasks
- [ ] Image display with lightbox
- [ ] Video player integration
- [ ] PDF viewer integration
- [ ] Slideshow/carousel component
- [ ] Code artifact display
- [ ] Artifact panel UI

#### Deliverables
- Rich media display
- Artifact extraction and rendering
- Export/download capabilities

---

### Phase 6: Media Generation (Week 6-7)

#### Tasks
- [ ] Image generation skill (Nano Banana Pro)
- [ ] Video generation skills (VEO, Sora, Kling)
- [ ] Async generation with progress
- [ ] Generation history
- [ ] Credit tracking for media

#### Deliverables
- Working image generation
- Working video generation
- Async status tracking

---

## 11. File Structure

```
SmartSpecWeb/
├── src/
│   ├── components/
│   │   └── chat/
│   │       ├── ChatLayout.tsx
│   │       ├── ChatSidebar.tsx
│   │       ├── ChatView.tsx
│   │       ├── ChatInput.tsx
│   │       ├── MessageList.tsx
│   │       ├── MessageItem.tsx
│   │       ├── StreamingMessage.tsx
│   │       ├── ArtifactPanel.tsx
│   │       ├── artifacts/
│   │       │   ├── CodeArtifact.tsx
│   │       │   ├── ImageArtifact.tsx
│   │       │   ├── VideoArtifact.tsx
│   │       │   ├── PdfArtifact.tsx
│   │       │   ├── SlideshowArtifact.tsx
│   │       │   └── MarkdownArtifact.tsx
│   │       ├── media/
│   │       │   ├── ImageLightbox.tsx
│   │       │   ├── VideoPlayer.tsx
│   │       │   └── MediaCarousel.tsx
│   │       └── settings/
│   │           ├── SkillSettings.tsx
│   │           └── ModelSettings.tsx
│   │
│   ├── hooks/
│   │   ├── useChat.ts
│   │   ├── useConversations.ts
│   │   ├── useStreaming.ts
│   │   ├── useSkills.ts
│   │   └── useMediaGeneration.ts
│   │
│   ├── services/
│   │   ├── chatService.ts
│   │   ├── memoryService.ts
│   │   ├── skillService.ts
│   │   └── artifactService.ts
│   │
│   └── pages/
│       └── chat/
│           └── index.tsx
│
└── server/
    ├── routers/
    │   └── chat.ts
    │
    └── services/
        ├── chatService.ts
        ├── memoryService.ts
        ├── skillDetector.ts
        └── artifactExtractor.ts
```

---

## 12. Dependencies to Install

### Frontend
```bash
npm install @assistant-ui/react @assistant-ui/react-markdown
npm install streamdown
npm install yet-another-react-lightbox
npm install react-pdf pdfjs-dist
npm install react-player
npm install swiper
npm install @shikijs/core shiki
```

### Backend (already available)
- LLM Gateway: OpenRouter integration
- Credit Service: Fully implemented
- Media Generation: kie.ai integration via Python backend

---

## 13. Existing Media Generation Models

| Model | Provider | Type | Config Location |
|-------|----------|------|-----------------|
| Nano Banana Pro | Google (Gemini 3.0) | Image | `python-backend/app/core/media_models.py` |
| VEO 3.1 | Google | Video | `python-backend/app/core/media_models.py` |
| Sora 2 | OpenAI | Video | `python-backend/app/core/media_models.py` |
| Kling 2.6 | Kuaishou | Video | `python-backend/app/core/media_models.py` |

### API Endpoints (Ready)
- `POST /api/v1/media/image` - Sync image generation
- `POST /api/v1/media/video` - Sync video generation
- `POST /api/v1/media/async/image` - Async with task ID
- `POST /api/v1/media/async/video` - Async with task ID
- `GET /api/v1/media/task/{task_id}` - Check task status

---

## 14. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM costs exceed budget | Medium | High | Credit system with limits |
| Memory system complexity | Medium | Medium | Start with buffer only, add others incrementally |
| Media generation failures | Low | Medium | Retry logic, fallback models |
| UI performance with long chats | Medium | Medium | Virtualized lists, pagination |
| Skill detection accuracy | Medium | Low | User confirmation for ambiguous cases |

---

## 15. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Chat response latency | < 500ms TTFB | P95 monitoring |
| Credit accuracy | 100% | Audit logs |
| Memory retrieval relevance | > 80% | User feedback |
| Skill detection accuracy | > 90% | Confusion matrix |
| User satisfaction | > 4.0/5 | Survey |

---

## 16. References

- [open-claude-cowork](https://github.com/claude-cowork/open-claude-cowork) - UI reference
- [Assistant UI](https://github.com/assistant-ui/assistant-ui) - Chat components
- [Streamdown](https://github.com/nicholasgriffintn/streamdown) - Streaming markdown
- [LangChain Memory](https://python.langchain.com/docs/modules/memory/) - Memory patterns
- [Yet Another React Lightbox](https://yet-another-react-lightbox.com/) - Image viewer
- [React PDF](https://react-pdf.org/) - PDF rendering
- [Swiper](https://swiperjs.com/) - Carousel/slideshow

---

## Appendix A: Skill Configuration Example

```typescript
// skills/image-generation.ts
export const imageGenerationSkill = {
  id: 'image-generation',
  name: 'Image Generation',
  description: 'Generate images using AI models',

  triggers: [
    /สร้าง(รูป|ภาพ)/i,
    /generate.*image/i,
    /create.*picture/i,
    /draw/i,
  ],

  models: ['nano_banana_pro'],

  execute: async (prompt: string, model: string) => {
    const result = await mediaService.generateImage(prompt, model);
    return {
      type: 'image',
      url: result.url,
      prompt: prompt,
      model: model,
    };
  },
};
```

---

## Appendix B: Memory Context Building

```typescript
// services/memoryService.ts
export const buildContext = async (conversationId: string, newMessage: string) => {
  // 1. Get entity memories for user
  const entities = await getEntityMemories(userId);

  // 2. Get relevant summaries
  const summaries = await getSummaries(conversationId);

  // 3. Get buffer messages
  const recentMessages = await getRecentMessages(conversationId, 20);

  // 4. Build context
  return [
    { role: 'system', content: systemPrompt },
    ...formatEntities(entities),
    ...formatSummaries(summaries),
    ...recentMessages,
    { role: 'user', content: newMessage },
  ];
};
```

---

**Document maintained by:** SmartSpecPro Team
**Last updated:** 22 January 2026
