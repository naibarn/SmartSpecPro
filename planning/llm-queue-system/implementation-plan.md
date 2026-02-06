# LLM Queue System Implementation Plan

## Overview

Implement a production-grade queue system using **BullMQ (Redis)** + **Bottleneck** for:
1. Distributed rate limiting across multiple Node instances
2. Background task processing with retry/backoff
3. Queue monitoring and management via Admin UI
4. Future support for long-running multi-step skills

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HTTP Request Layer                               │
│  /api/llm/stream, /api/llm/chat, /api/llm/brainstorm                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Bottleneck (Redis Reservoir)                          │
│  Per-Provider Rate Limiting with Distributed State                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│  │ opencode-zen    │ │ openrouter      │ │ anthropic       │            │
│  │ max: 2          │ │ max: 10         │ │ max: 5          │            │
│  │ delay: 1500ms   │ │ delay: 50ms     │ │ delay: 100ms    │            │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Synchronous LLM Streaming                             │
│  Fetch → Stream → SSE Response (stays synchronous for real-time)        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BullMQ Background Queues                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│  │ llm:credits     │ │ llm:usage       │ │ llm:skills      │            │
│  │ Credit deduct   │ │ Usage logging   │ │ Multi-step jobs │            │
│  │ Retry: 3x       │ │ Low priority    │ │ Long-running    │            │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Admin Monitoring Dashboard                            │
│  /admin/queues - Real-time queue stats, history, clear stuck jobs       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
apps/web/server/
├── services/
│   ├── redis.ts              # Redis connection singleton
│   ├── rateLimiter.ts        # Bottleneck limiters per provider
│   ├── queueService.ts       # BullMQ queues and workers
│   └── queueStats.ts         # Queue statistics tracking
├── routers/
│   └── queues.ts             # tRPC endpoints for queue monitoring
└── _core/
    └── llmRoutes.ts          # Updated to use new rate limiter

apps/web/client/src/pages/
└── AdminQueues.tsx           # Queue monitoring UI
```

---

## Phase 1: Redis + Bottleneck Rate Limiting

### 1.1 Dependencies
```bash
npm install bullmq bottleneck ioredis
npm install -D @types/ioredis
```

### 1.2 Redis Service (services/redis.ts)
- Singleton Redis connection
- Connection health check
- Graceful shutdown

### 1.3 Rate Limiter Service (services/rateLimiter.ts)
- Bottleneck instances per provider
- Redis reservoir for distributed state
- Per-model multipliers for free models
- Queue position tracking

### 1.4 Provider Configurations
```typescript
const PROVIDER_LIMITS = {
  'opencode-zen': {
    maxConcurrent: 2,
    minTime: 1500,
    reservoir: 2,
    freeModelMultiplier: 2,
  },
  'openrouter': {
    maxConcurrent: 10,
    minTime: 50,
    reservoir: 10,
    freeModelMultiplier: 1.5,
  },
  'anthropic': {
    maxConcurrent: 5,
    minTime: 100,
    reservoir: 5,
    freeModelMultiplier: 1,
  },
  'openai': {
    maxConcurrent: 10,
    minTime: 50,
    reservoir: 10,
    freeModelMultiplier: 1,
  },
};
```

---

## Phase 2: BullMQ Background Queues

### 2.1 Queue Definitions (services/queueService.ts)
```typescript
// Queue names
const QUEUES = {
  CREDITS: 'llm:credits',      // Credit deduction after LLM calls
  USAGE: 'llm:usage',          // Usage logging to database
  SKILLS: 'llm:skills',        // Multi-step skill processing
  MEDIA: 'llm:media',          // Image/video generation
  RETRY: 'llm:retry',          // Failed job retry queue
};
```

### 2.2 Job Types
```typescript
interface CreditJob {
  userId: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

interface UsageJob {
  userId: number;
  conversationId: number;
  messageId: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  timestamp: Date;
}

interface SkillJob {
  userId: number;
  skillId: string;
  conversationId: number;
  steps: SkillStep[];
  currentStep: number;
  context: Record<string, any>;
}
```

### 2.3 Worker Configuration
```typescript
const WORKER_CONFIG = {
  CREDITS: {
    concurrency: 5,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
  USAGE: {
    concurrency: 10,
    attempts: 2,
    backoff: { type: 'fixed', delay: 500 },
  },
  SKILLS: {
    concurrency: 3,
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  },
};
```

---

## Phase 3: Queue Statistics & History

### 3.1 Statistics Tracking (services/queueStats.ts)
- Per-provider success/failure rates
- Average wait times
- Queue depth over time
- Error patterns by provider/model

### 3.2 Database Schema (if needed)
```sql
CREATE TABLE queue_stats (
  id SERIAL PRIMARY KEY,
  queue_name VARCHAR(50) NOT NULL,
  provider_name VARCHAR(50),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  jobs_completed INT DEFAULT 0,
  jobs_failed INT DEFAULT 0,
  jobs_waiting INT DEFAULT 0,
  avg_wait_ms INT,
  avg_process_ms INT,
  error_types JSONB
);

CREATE INDEX idx_queue_stats_time ON queue_stats(timestamp DESC);
CREATE INDEX idx_queue_stats_queue ON queue_stats(queue_name, timestamp DESC);
```

### 3.3 Metrics Collection
- Collect every 60 seconds
- Aggregate hourly/daily
- Identify bottlenecks automatically

---

## Phase 4: Admin Queue Monitoring UI

### 4.1 Dashboard Features
1. **Real-time Queue Status**
   - Active jobs per queue
   - Waiting jobs count
   - Failed jobs count
   - Completed jobs (last hour)

2. **Per-Provider Stats**
   - Current concurrency usage
   - Rate limit status
   - Success/failure rates
   - Average response times

3. **Historical Charts**
   - Queue depth over time
   - Error rates by provider
   - Wait time trends
   - Throughput graphs

4. **Management Actions**
   - Clear stuck jobs
   - Retry failed jobs
   - Pause/resume queues
   - Drain queue (graceful stop)

### 4.2 tRPC Endpoints (routers/queues.ts)
```typescript
export const queuesRouter = router({
  // Get all queue statuses
  getStatus: adminProcedure.query(),

  // Get provider rate limiter status
  getProviderStatus: adminProcedure.query(),

  // Get historical stats
  getHistory: adminProcedure.input(z.object({
    queue: z.string().optional(),
    provider: z.string().optional(),
    hours: z.number().default(24),
  })).query(),

  // Clear stuck jobs
  clearStuck: adminProcedure.input(z.object({
    queue: z.string(),
    olderThanMs: z.number().default(300000), // 5 min
  })).mutation(),

  // Retry failed jobs
  retryFailed: adminProcedure.input(z.object({
    queue: z.string(),
    jobIds: z.array(z.string()).optional(), // specific jobs or all
  })).mutation(),

  // Pause/resume queue
  toggleQueue: adminProcedure.input(z.object({
    queue: z.string(),
    paused: z.boolean(),
  })).mutation(),
});
```

---

## Phase 5: Integration with llmRoutes.ts

### 5.1 Replace In-Memory Rate Limiter
```typescript
// Before
await acquireProviderSlot(provider.providerName, isFreeModel);
// ... fetch ...
releaseProviderSlot(provider.providerName);

// After
const limiter = getProviderLimiter(provider.providerName);
await limiter.schedule({ priority: isFreeModel ? 5 : 1 }, async () => {
  // Streaming happens inside scheduled slot
  const upstream = await fetch(url, { ... });
  // Process response...
});
// Slot auto-released when function returns
```

### 5.2 Move Credit Deduction to Background
```typescript
// Before (synchronous)
await deductCreditsForModel({ userId, model, inputTokens, outputTokens });

// After (background job)
await creditQueue.add('deduct', {
  userId,
  model,
  provider: provider.providerName,
  inputTokens,
  outputTokens,
  costUsd: providerCostUsd,
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
});
```

---

## Deadlock Prevention

### 6.1 Timeout Handling
- Bottleneck: `timeout` option for slot acquisition
- BullMQ: `jobTimeout` for stuck jobs
- Auto-release slots after max duration

### 6.2 Stale Job Detection
- Mark jobs as stale after 5 minutes of no progress
- Automatic cleanup of stale jobs
- Alert in admin dashboard

### 6.3 Circuit Breaker
- Track consecutive failures per provider
- Temporarily skip unhealthy providers
- Auto-recover after cooldown

---

## Future: Multi-Step Skill Processing

### 7.1 Skill Job Structure
```typescript
interface MultiStepSkillJob {
  skillId: string;
  userId: number;
  conversationId: number;
  steps: Array<{
    id: string;
    type: 'llm' | 'code' | 'api' | 'wait';
    config: Record<string, any>;
    dependsOn?: string[];
  }>;
  currentStep: number;
  results: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

### 7.2 Step Execution
- Execute steps in order (respecting dependencies)
- Store intermediate results
- Resume from failure point
- Progress updates via SSE or WebSocket

---

## Implementation Order

1. **Week 1: Foundation**
   - [ ] Add dependencies
   - [ ] Redis service
   - [ ] Bottleneck rate limiter
   - [ ] Basic integration

2. **Week 2: Background Jobs**
   - [ ] BullMQ setup
   - [ ] Credit queue + worker
   - [ ] Usage logging queue
   - [ ] Retry logic

3. **Week 3: Admin UI**
   - [ ] Queue status endpoint
   - [ ] Admin dashboard page
   - [ ] Real-time updates
   - [ ] Management actions

4. **Week 4: Statistics & Polish**
   - [ ] Historical stats collection
   - [ ] Charts and graphs
   - [ ] Deadlock prevention
   - [ ] Documentation

---

## Environment Variables

```env
# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Queue Settings
QUEUE_STATS_INTERVAL_MS=60000
QUEUE_STALE_JOB_MS=300000
QUEUE_MAX_RETRIES=3

# Rate Limiter Fallback (if Redis unavailable)
RATE_LIMITER_FALLBACK_ENABLED=true
```

---

## Monitoring Alerts (Future)

- Queue depth exceeds threshold
- Error rate spikes
- Provider health degradation
- Stale jobs detected
