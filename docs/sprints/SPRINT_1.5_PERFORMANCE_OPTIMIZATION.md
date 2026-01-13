# Sprint 1.5: Performance Optimization

**Duration:** 1 สัปดาห์ (5-7 วันทำงาน)  
**Priority:** High  
**Dependencies:** Sprint 1.1-1.4 (Core features complete)  

---

## 🎯 Sprint Goal

ปรับปรุง performance ของ Desktop App ให้ทำงานได้เร็วและลื่นไหล โดยเน้น:
1. **Startup time** - เปิด app ได้เร็ว
2. **Memory efficiency** - ใช้ RAM น้อย
3. **UI responsiveness** - ไม่มี lag/freeze
4. **LLM streaming** - Response เร็วและต่อเนื่อง
5. **Database queries** - Query เร็ว

---

## 📊 Performance Targets

### Current vs Target

| Metric | Current (Est.) | Target | Improvement |
|--------|----------------|--------|-------------|
| App startup | ~3-5s | < 1.5s | 50-70% |
| Tab switch | ~500ms | < 200ms | 60% |
| File open | ~300ms | < 100ms | 67% |
| Memory (idle) | ~400MB | < 200MB | 50% |
| Memory (active) | ~800MB | < 500MB | 38% |
| LLM first token | ~2s | < 500ms | 75% |
| DB query (simple) | ~50ms | < 10ms | 80% |
| DB query (FTS) | ~200ms | < 50ms | 75% |
| UI frame rate | ~30fps | 60fps | 100% |

---

## 📋 User Stories

### US-1.5.1: Fast Startup
> **As a** developer  
> **I want** the app to start quickly  
> **So that** I can begin working immediately

**Acceptance Criteria:**
- [ ] Cold start < 1.5s
- [ ] Warm start < 500ms
- [ ] Splash screen with progress
- [ ] Background loading for non-critical features

### US-1.5.2: Smooth UI
> **As a** developer  
> **I want** the UI to be responsive  
> **So that** I don't experience lag while working

**Acceptance Criteria:**
- [ ] 60fps UI rendering
- [ ] No blocking operations on main thread
- [ ] Smooth scrolling in all lists
- [ ] Instant keyboard response

### US-1.5.3: Efficient Memory
> **As a** developer  
> **I want** the app to use minimal memory  
> **So that** I can run other applications alongside

**Acceptance Criteria:**
- [ ] Idle memory < 200MB
- [ ] Active memory < 500MB
- [ ] No memory leaks
- [ ] Automatic cleanup of unused resources

### US-1.5.4: Fast LLM Response
> **As a** developer  
> **I want** LLM responses to start quickly  
> **So that** I don't wait long for AI assistance

**Acceptance Criteria:**
- [ ] First token < 500ms
- [ ] Smooth streaming without stuttering
- [ ] Proper error handling without freezing

---

## 🏗️ Technical Architecture

### Performance Optimization Layers

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PERFORMANCE OPTIMIZATION                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  LAYER 1: STARTUP OPTIMIZATION                                               ││
│  │  • Lazy loading                                                              ││
│  │  • Code splitting                                                            ││
│  │  • Preload critical resources                                                ││
│  │  • Defer non-essential initialization                                        ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  LAYER 2: RENDERING OPTIMIZATION                                             ││
│  │  • Virtual scrolling                                                         ││
│  │  • React.memo / useMemo / useCallback                                        ││
│  │  • Debounce / throttle                                                       ││
│  │  • Web Workers for heavy computation                                         ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  LAYER 3: DATA OPTIMIZATION                                                  ││
│  │  • SQLite query optimization                                                 ││
│  │  • Caching layer                                                             ││
│  │  • Pagination / infinite scroll                                              ││
│  │  • Background data sync                                                      ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  LAYER 4: NETWORK OPTIMIZATION                                               ││
│  │  • Connection pooling                                                        ││
│  │  • Request batching                                                          ││
│  │  • Streaming optimization                                                    ││
│  │  • Retry with backoff                                                        ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  LAYER 5: MEMORY OPTIMIZATION                                                ││
│  │  • Object pooling                                                            ││
│  │  • Weak references                                                           ││
│  │  • Garbage collection hints                                                  ││
│  │  • Resource cleanup                                                          ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Startup Optimization Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              STARTUP FLOW                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

    0ms                     500ms                    1000ms                   1500ms
    │                        │                        │                        │
    ▼                        ▼                        ▼                        ▼
    ┌────────────────────────┬────────────────────────┬────────────────────────┐
    │    CRITICAL PATH       │    SECONDARY LOAD      │    BACKGROUND LOAD     │
    │                        │                        │                        │
    │ • Window creation      │ • Restore tabs         │ • Memory index         │
    │ • Core UI render       │ • Load workspace       │ • Git status           │
    │ • App database         │ • Recent files         │ • Extension init       │
    │ • Auth check           │ • Settings sync        │ • Analytics            │
    │                        │                        │ • Update check         │
    └────────────────────────┴────────────────────────┴────────────────────────┘
                │                        │                        │
                ▼                        ▼                        ▼
           INTERACTIVE              FULLY LOADED            BACKGROUND READY
           (User can start)         (All features)          (Optimizations)
```

### Caching Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CACHING LAYERS                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────┐
    │  L1: IN-MEMORY CACHE (Rust)                                                  │
    │  • LRU cache for hot data                                                    │
    │  • TTL: 5 minutes                                                            │
    │  • Size: 50MB max                                                            │
    │  • Hit rate target: > 80%                                                    │
    └─────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │  L2: SQLITE CACHE                                                            │
    │  • Query result cache                                                        │
    │  • FTS index cache                                                           │
    │  • TTL: 1 hour                                                               │
    │  • Invalidation on write                                                     │
    └─────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │  L3: REACT QUERY CACHE (Frontend)                                            │
    │  • API response cache                                                        │
    │  • Stale-while-revalidate                                                    │
    │  • Background refetch                                                        │
    │  • Optimistic updates                                                        │
    └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Implementation Tasks

### Day 1-2: Startup Optimization

#### Task 1.5.1: Lazy Loading Implementation
**Files:** Multiple

```typescript
// Before: Eager loading
import { HeavyComponent } from './HeavyComponent';

// After: Lazy loading
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

// With Suspense
<Suspense fallback={<Skeleton />}>
  <HeavyComponent />
</Suspense>
```

**Components to lazy load:**
- [ ] DockerSandbox page
- [ ] Settings page
- [ ] Job detail panel
- [ ] Checkpoint timeline
- [ ] Diff viewer
- [ ] Terminal component

**Deliverables:**
- [ ] Code splitting for all pages
- [ ] Lazy load heavy components
- [ ] Preload on hover/focus

#### Task 1.5.2: Startup Sequence Optimization
**File:** `desktop-app/src-tauri/src/startup.rs`

```rust
pub struct StartupManager {
    critical_tasks: Vec<Box<dyn StartupTask>>,
    secondary_tasks: Vec<Box<dyn StartupTask>>,
    background_tasks: Vec<Box<dyn StartupTask>>,
}

impl StartupManager {
    pub async fn run(&self) -> Result<()> {
        // Phase 1: Critical (blocking)
        for task in &self.critical_tasks {
            task.run().await?;
        }
        
        // Emit: App is interactive
        emit_event("app:interactive");
        
        // Phase 2: Secondary (parallel)
        let handles: Vec<_> = self.secondary_tasks
            .iter()
            .map(|t| tokio::spawn(t.run()))
            .collect();
        
        join_all(handles).await;
        
        // Emit: App is ready
        emit_event("app:ready");
        
        // Phase 3: Background (low priority)
        for task in &self.background_tasks {
            tokio::spawn(task.run());
        }
        
        Ok(())
    }
}

// Critical tasks (< 500ms total)
struct CriticalTasks {
    tasks: vec![
        CreateWindow,
        LoadAppDatabase,
        CheckAuth,
        RenderCoreUI,
    ]
}

// Secondary tasks (< 1000ms total)
struct SecondaryTasks {
    tasks: vec![
        RestoreTabs,
        LoadWorkspace,
        LoadRecentFiles,
        SyncSettings,
    ]
}

// Background tasks (no time limit)
struct BackgroundTasks {
    tasks: vec![
        BuildMemoryIndex,
        CheckGitStatus,
        InitExtensions,
        CheckUpdates,
        SendAnalytics,
    ]
}
```

**Deliverables:**
- [ ] Startup task prioritization
- [ ] Parallel loading
- [ ] Progress reporting

#### Task 1.5.3: Splash Screen with Progress
**File:** `desktop-app/src/components/SplashScreen.tsx`

```typescript
interface SplashScreenProps {
  progress: number;
  status: string;
  onComplete: () => void;
}

export function SplashScreen({ progress, status, onComplete }: SplashScreenProps) {
  return (
    <div className="splash-screen">
      <Logo />
      <ProgressBar value={progress} />
      <StatusText>{status}</StatusText>
    </div>
  );
}

// Progress stages
const STAGES = [
  { progress: 10, status: 'Initializing...' },
  { progress: 30, status: 'Loading database...' },
  { progress: 50, status: 'Restoring workspace...' },
  { progress: 70, status: 'Loading UI...' },
  { progress: 90, status: 'Almost ready...' },
  { progress: 100, status: 'Ready!' },
];
```

**Deliverables:**
- [ ] Animated splash screen
- [ ] Progress bar
- [ ] Status messages

---

### Day 2-3: Rendering Optimization

#### Task 1.5.4: Virtual Scrolling
**File:** `desktop-app/src/components/VirtualList.tsx`

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight: number;
  overscan?: number;
}

export function VirtualList<T>({ 
  items, 
  renderItem, 
  itemHeight,
  overscan = 5 
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan,
  });
  
  return (
    <div ref={parentRef} className="virtual-list-container">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Apply to:**
- [ ] File explorer tree
- [ ] Job list
- [ ] Task list
- [ ] Chat messages
- [ ] Checkpoint timeline
- [ ] Search results

**Deliverables:**
- [ ] VirtualList component
- [ ] Apply to all long lists
- [ ] Smooth scrolling

#### Task 1.5.5: React Optimization
**File:** Multiple components

```typescript
// 1. Memoize expensive components
const ExpensiveComponent = React.memo(({ data }) => {
  return <div>{/* ... */}</div>;
}, (prevProps, nextProps) => {
  return prevProps.data.id === nextProps.data.id;
});

// 2. useMemo for expensive calculations
const processedData = useMemo(() => {
  return expensiveCalculation(rawData);
}, [rawData]);

// 3. useCallback for stable references
const handleClick = useCallback((id: string) => {
  setSelected(id);
}, []);

// 4. Debounce rapid updates
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    search(query);
  }, 300),
  []
);

// 5. Throttle scroll handlers
const throttledScroll = useMemo(
  () => throttle((e: Event) => {
    handleScroll(e);
  }, 16), // ~60fps
  []
);
```

**Deliverables:**
- [ ] Audit all components
- [ ] Add React.memo where needed
- [ ] Optimize hooks usage
- [ ] Add debounce/throttle

#### Task 1.5.6: Web Worker for Heavy Tasks
**File:** `desktop-app/src/workers/heavyTask.worker.ts`

```typescript
// Worker file
self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  switch (type) {
    case 'PARSE_LARGE_FILE':
      const result = parseLargeFile(payload);
      self.postMessage({ type: 'PARSE_COMPLETE', result });
      break;
      
    case 'DIFF_FILES':
      const diff = computeDiff(payload.before, payload.after);
      self.postMessage({ type: 'DIFF_COMPLETE', diff });
      break;
      
    case 'SEARCH_INDEX':
      const matches = searchIndex(payload.query, payload.index);
      self.postMessage({ type: 'SEARCH_COMPLETE', matches });
      break;
  }
};

// Main thread usage
const worker = new Worker(new URL('./heavyTask.worker.ts', import.meta.url));

export function useDiffWorker() {
  const [result, setResult] = useState(null);
  
  const computeDiff = useCallback((before: string, after: string) => {
    worker.postMessage({ type: 'DIFF_FILES', payload: { before, after } });
  }, []);
  
  useEffect(() => {
    worker.onmessage = (e) => {
      if (e.data.type === 'DIFF_COMPLETE') {
        setResult(e.data.diff);
      }
    };
  }, []);
  
  return { computeDiff, result };
}
```

**Tasks to offload:**
- [ ] Large file parsing
- [ ] Diff computation
- [ ] Syntax highlighting
- [ ] Search indexing
- [ ] JSON/YAML parsing

**Deliverables:**
- [ ] Web Worker setup
- [ ] Offload heavy tasks
- [ ] Progress reporting

---

### Day 3-4: Database Optimization

#### Task 1.5.7: SQLite Query Optimization
**File:** `desktop-app/src-tauri/src/db/optimization.rs`

```rust
// 1. Add indexes
const INDEXES: &[&str] = &[
    "CREATE INDEX IF NOT EXISTS idx_memory_workspace ON memory(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(memory_type)",
    "CREATE INDEX IF NOT EXISTS idx_memory_created ON memory(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_knowledge_workspace ON knowledge(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_job ON tasks(job_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id)",
];

// 2. Query optimization
impl DatabaseManager {
    // Use prepared statements
    pub fn get_memory_by_id(&self, id: &str) -> Result<Memory> {
        let stmt = self.prepare_cached(
            "SELECT * FROM memory WHERE id = ?"
        )?;
        // ...
    }
    
    // Batch operations
    pub fn insert_memories(&self, memories: &[Memory]) -> Result<()> {
        let tx = self.conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO memory (id, content, ...) VALUES (?, ?, ...)"
            )?;
            for memory in memories {
                stmt.execute(params![memory.id, memory.content, ...])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
    
    // Pagination
    pub fn list_memories(
        &self, 
        workspace_id: &str, 
        limit: u32, 
        offset: u32
    ) -> Result<Vec<Memory>> {
        let stmt = self.prepare_cached(
            "SELECT * FROM memory 
             WHERE workspace_id = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?"
        )?;
        // ...
    }
}

// 3. Connection pooling
pub struct ConnectionPool {
    connections: Vec<Connection>,
    max_size: usize,
}

impl ConnectionPool {
    pub fn get(&self) -> Result<PooledConnection> {
        // Get available connection or create new
    }
}
```

**Deliverables:**
- [ ] Add all necessary indexes
- [ ] Use prepared statements
- [ ] Implement batch operations
- [ ] Add pagination
- [ ] Connection pooling

#### Task 1.5.8: Caching Layer
**File:** `desktop-app/src-tauri/src/cache/mod.rs`

```rust
use lru::LruCache;
use std::time::{Duration, Instant};

pub struct CacheEntry<T> {
    value: T,
    created_at: Instant,
    ttl: Duration,
}

impl<T> CacheEntry<T> {
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.ttl
    }
}

pub struct Cache<K, V> {
    inner: LruCache<K, CacheEntry<V>>,
    default_ttl: Duration,
    max_size: usize,
}

impl<K: Hash + Eq, V: Clone> Cache<K, V> {
    pub fn new(max_size: usize, default_ttl: Duration) -> Self {
        Self {
            inner: LruCache::new(NonZeroUsize::new(max_size).unwrap()),
            default_ttl,
            max_size,
        }
    }
    
    pub fn get(&mut self, key: &K) -> Option<V> {
        if let Some(entry) = self.inner.get(key) {
            if !entry.is_expired() {
                return Some(entry.value.clone());
            }
            self.inner.pop(key);
        }
        None
    }
    
    pub fn set(&mut self, key: K, value: V) {
        self.set_with_ttl(key, value, self.default_ttl);
    }
    
    pub fn set_with_ttl(&mut self, key: K, value: V, ttl: Duration) {
        let entry = CacheEntry {
            value,
            created_at: Instant::now(),
            ttl,
        };
        self.inner.put(key, entry);
    }
    
    pub fn invalidate(&mut self, key: &K) {
        self.inner.pop(key);
    }
    
    pub fn clear(&mut self) {
        self.inner.clear();
    }
    
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            size: self.inner.len(),
            max_size: self.max_size,
            hit_rate: self.hit_rate(),
        }
    }
}

// Usage
pub struct CachedDatabaseManager {
    db: DatabaseManager,
    memory_cache: Cache<String, Memory>,
    knowledge_cache: Cache<String, Knowledge>,
    query_cache: Cache<String, Vec<SearchResult>>,
}

impl CachedDatabaseManager {
    pub fn get_memory(&mut self, id: &str) -> Result<Memory> {
        // Check cache first
        if let Some(memory) = self.memory_cache.get(&id.to_string()) {
            return Ok(memory);
        }
        
        // Query database
        let memory = self.db.get_memory_by_id(id)?;
        
        // Cache result
        self.memory_cache.set(id.to_string(), memory.clone());
        
        Ok(memory)
    }
}
```

**Deliverables:**
- [ ] LRU cache implementation
- [ ] TTL support
- [ ] Cache invalidation
- [ ] Cache statistics

#### Task 1.5.9: FTS Optimization
**File:** `desktop-app/src-tauri/src/db/fts.rs`

```rust
// Optimize FTS5 configuration
const FTS_CONFIG: &str = r#"
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        title,
        content,
        tags,
        content='knowledge',
        content_rowid='rowid',
        tokenize='porter unicode61 remove_diacritics 1'
    );
    
    -- Triggers for auto-sync
    CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
        INSERT INTO knowledge_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
    END;
    
    CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
        INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
    END;
    
    CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
        INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO knowledge_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
    END;
"#;

impl FTSManager {
    // Optimized search with ranking
    pub fn search(&self, query: &str, limit: u32) -> Result<Vec<SearchResult>> {
        let sql = r#"
            SELECT 
                k.*,
                bm25(knowledge_fts, 1.0, 0.75, 0.5) as rank
            FROM knowledge k
            JOIN knowledge_fts ON k.rowid = knowledge_fts.rowid
            WHERE knowledge_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        "#;
        
        // Use prefix search for partial matches
        let search_query = format!("{}*", query);
        
        self.conn.prepare(sql)?
            .query_map(params![search_query, limit], |row| {
                // Map to SearchResult
            })
    }
    
    // Rebuild index (maintenance)
    pub fn rebuild_index(&self) -> Result<()> {
        self.conn.execute("INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')", [])?;
        Ok(())
    }
    
    // Optimize index
    pub fn optimize(&self) -> Result<()> {
        self.conn.execute("INSERT INTO knowledge_fts(knowledge_fts) VALUES('optimize')", [])?;
        Ok(())
    }
}
```

**Deliverables:**
- [ ] FTS5 configuration
- [ ] Auto-sync triggers
- [ ] Ranking optimization
- [ ] Index maintenance

---

### Day 4-5: Network & LLM Optimization

#### Task 1.5.10: LLM Streaming Optimization
**File:** `desktop-app/src/services/llmStreaming.ts`

```typescript
interface StreamingConfig {
  bufferSize: number;
  flushInterval: number;
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_CONFIG: StreamingConfig = {
  bufferSize: 10,        // Buffer 10 tokens before render
  flushInterval: 50,     // Flush every 50ms
  retryAttempts: 3,
  retryDelay: 1000,
};

export class LLMStreamingService {
  private buffer: string[] = [];
  private flushTimer: number | null = null;
  
  async streamChat(
    messages: Message[],
    onToken: (token: string) => void,
    onComplete: (fullResponse: string) => void,
    onError: (error: Error) => void,
    config: StreamingConfig = DEFAULT_CONFIG
  ) {
    let fullResponse = '';
    let retries = 0;
    
    const flush = () => {
      if (this.buffer.length > 0) {
        const tokens = this.buffer.splice(0);
        tokens.forEach(onToken);
      }
    };
    
    const startFlushTimer = () => {
      if (this.flushTimer === null) {
        this.flushTimer = window.setInterval(flush, config.flushInterval);
      }
    };
    
    const stopFlushTimer = () => {
      if (this.flushTimer !== null) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
    };
    
    const doStream = async () => {
      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
        });
        
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        
        startFlushTimer();
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            flush();
            stopFlushTimer();
            onComplete(fullResponse);
            break;
          }
          
          const chunk = decoder.decode(value);
          const tokens = parseSSETokens(chunk);
          
          for (const token of tokens) {
            fullResponse += token;
            this.buffer.push(token);
            
            // Immediate flush if buffer full
            if (this.buffer.length >= config.bufferSize) {
              flush();
            }
          }
        }
      } catch (error) {
        stopFlushTimer();
        
        if (retries < config.retryAttempts) {
          retries++;
          await delay(config.retryDelay * retries);
          return doStream();
        }
        
        onError(error as Error);
      }
    };
    
    return doStream();
  }
}

// Optimized SSE parsing
function parseSSETokens(chunk: string): string[] {
  const tokens: string[] = [];
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            tokens.push(token);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
  
  return tokens;
}
```

**Deliverables:**
- [ ] Token buffering
- [ ] Smooth rendering
- [ ] Retry logic
- [ ] Error handling

#### Task 1.5.11: Request Batching
**File:** `desktop-app/src/services/requestBatcher.ts`

```typescript
interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
}

export class RequestBatcher<T, R> {
  private queue: Array<{
    request: T;
    resolve: (result: R) => void;
    reject: (error: Error) => void;
  }> = [];
  
  private timer: number | null = null;
  
  constructor(
    private batchFn: (requests: T[]) => Promise<R[]>,
    private config: BatchConfig = { maxBatchSize: 10, maxWaitTime: 50 }
  ) {}
  
  async add(request: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      
      if (this.queue.length >= this.config.maxBatchSize) {
        this.flush();
      } else if (this.timer === null) {
        this.timer = window.setTimeout(
          () => this.flush(),
          this.config.maxWaitTime
        );
      }
    });
  }
  
  private async flush() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0);
    const requests = batch.map(b => b.request);
    
    try {
      const results = await this.batchFn(requests);
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (error) {
      batch.forEach(b => b.reject(error as Error));
    }
  }
}

// Usage: Batch memory lookups
const memoryBatcher = new RequestBatcher<string, Memory>(
  async (ids) => {
    return invoke('get_memories_batch', { ids });
  }
);

// Instead of multiple calls:
// const m1 = await getMemory('id1');
// const m2 = await getMemory('id2');

// Single batched call:
const [m1, m2] = await Promise.all([
  memoryBatcher.add('id1'),
  memoryBatcher.add('id2'),
]);
```

**Deliverables:**
- [ ] Request batching utility
- [ ] Apply to database queries
- [ ] Apply to API calls

#### Task 1.5.12: Connection Keep-Alive
**File:** `desktop-app/src-tauri/src/network/connection.rs`

```rust
use reqwest::Client;
use std::time::Duration;

pub fn create_http_client() -> Client {
    Client::builder()
        // Connection pooling
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))
        
        // Keep-alive
        .tcp_keepalive(Duration::from_secs(60))
        
        // Timeouts
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(300)) // 5 min for LLM
        
        // Compression
        .gzip(true)
        .brotli(true)
        
        .build()
        .expect("Failed to create HTTP client")
}

// Singleton client
lazy_static! {
    pub static ref HTTP_CLIENT: Client = create_http_client();
}
```

**Deliverables:**
- [ ] Connection pooling
- [ ] Keep-alive configuration
- [ ] Compression support

---

### Day 5-6: Memory Optimization

#### Task 1.5.13: Memory Monitoring
**File:** `desktop-app/src-tauri/src/memory/monitor.rs`

```rust
use sysinfo::{System, SystemExt, ProcessExt};

pub struct MemoryMonitor {
    system: System,
    warning_threshold: u64,  // 400MB
    critical_threshold: u64, // 600MB
}

impl MemoryMonitor {
    pub fn new() -> Self {
        Self {
            system: System::new_all(),
            warning_threshold: 400 * 1024 * 1024,
            critical_threshold: 600 * 1024 * 1024,
        }
    }
    
    pub fn get_memory_usage(&mut self) -> MemoryUsage {
        self.system.refresh_process(sysinfo::get_current_pid().unwrap());
        
        let process = self.system
            .process(sysinfo::get_current_pid().unwrap())
            .unwrap();
        
        MemoryUsage {
            used: process.memory(),
            virtual_memory: process.virtual_memory(),
            status: self.get_status(process.memory()),
        }
    }
    
    fn get_status(&self, used: u64) -> MemoryStatus {
        if used > self.critical_threshold {
            MemoryStatus::Critical
        } else if used > self.warning_threshold {
            MemoryStatus::Warning
        } else {
            MemoryStatus::Normal
        }
    }
    
    pub fn should_gc(&mut self) -> bool {
        let usage = self.get_memory_usage();
        matches!(usage.status, MemoryStatus::Warning | MemoryStatus::Critical)
    }
}

#[derive(Debug, Clone)]
pub struct MemoryUsage {
    pub used: u64,
    pub virtual_memory: u64,
    pub status: MemoryStatus,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MemoryStatus {
    Normal,
    Warning,
    Critical,
}
```

**Deliverables:**
- [ ] Memory monitoring
- [ ] Threshold alerts
- [ ] GC triggers

#### Task 1.5.14: Resource Cleanup
**File:** `desktop-app/src-tauri/src/memory/cleanup.rs`

```rust
pub struct ResourceCleaner {
    memory_monitor: MemoryMonitor,
    cache_manager: CacheManager,
    tab_manager: TabManager,
}

impl ResourceCleaner {
    // Run cleanup when memory is high
    pub async fn cleanup_if_needed(&mut self) -> Result<CleanupResult> {
        if !self.memory_monitor.should_gc() {
            return Ok(CleanupResult::NotNeeded);
        }
        
        let mut freed = 0u64;
        
        // 1. Clear expired cache entries
        freed += self.cache_manager.clear_expired();
        
        // 2. Close inactive tabs (LRU)
        if self.memory_monitor.get_memory_usage().status == MemoryStatus::Critical {
            freed += self.close_inactive_tabs(3).await?;
        }
        
        // 3. Clear undo history (keep last 10)
        freed += self.trim_undo_history(10);
        
        // 4. Clear old chat messages from memory (keep in DB)
        freed += self.unload_old_messages();
        
        // 5. Force garbage collection hint
        self.hint_gc();
        
        Ok(CleanupResult::Cleaned { freed_bytes: freed })
    }
    
    async fn close_inactive_tabs(&mut self, count: usize) -> Result<u64> {
        let inactive = self.tab_manager.get_least_recently_used(count);
        let mut freed = 0;
        
        for tab in inactive {
            // Save state before closing
            self.tab_manager.save_tab_state(&tab.id).await?;
            freed += self.tab_manager.close_tab(&tab.id).await?;
        }
        
        Ok(freed)
    }
    
    fn hint_gc(&self) {
        // Hint to allocator to release memory
        #[cfg(target_os = "linux")]
        unsafe {
            libc::malloc_trim(0);
        }
    }
}
```

**Deliverables:**
- [ ] Automatic cleanup
- [ ] LRU tab eviction
- [ ] History trimming
- [ ] Memory release

#### Task 1.5.15: Frontend Memory Optimization
**File:** `desktop-app/src/hooks/useMemoryOptimization.ts`

```typescript
import { useEffect, useRef } from 'react';

// Cleanup on unmount
export function useCleanup(cleanup: () => void) {
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  
  useEffect(() => {
    return () => cleanupRef.current();
  }, []);
}

// Weak reference for large objects
export function useWeakRef<T extends object>(value: T) {
  const ref = useRef<WeakRef<T>>();
  
  if (!ref.current || ref.current.deref() !== value) {
    ref.current = new WeakRef(value);
  }
  
  return ref.current;
}

// Dispose pattern for resources
export function useDisposable<T extends { dispose: () => void }>(
  factory: () => T,
  deps: any[]
) {
  const resourceRef = useRef<T>();
  
  useEffect(() => {
    resourceRef.current = factory();
    
    return () => {
      resourceRef.current?.dispose();
    };
  }, deps);
  
  return resourceRef;
}

// Image cleanup
export function useImageCleanup() {
  const imagesRef = useRef<Set<string>>(new Set());
  
  const trackImage = (url: string) => {
    imagesRef.current.add(url);
  };
  
  useEffect(() => {
    return () => {
      // Revoke object URLs on unmount
      imagesRef.current.forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);
  
  return { trackImage };
}
```

**Deliverables:**
- [ ] Cleanup hooks
- [ ] Weak references
- [ ] Resource disposal
- [ ] Object URL cleanup

---

### Day 6-7: Testing & Monitoring

#### Task 1.5.16: Performance Testing Suite
**File:** `desktop-app/tests/performance/`

```typescript
// Startup time test
describe('Startup Performance', () => {
  it('should start within 1.5s', async () => {
    const start = performance.now();
    await launchApp();
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(1500);
  });
  
  it('should be interactive within 500ms', async () => {
    const start = performance.now();
    await launchApp();
    await waitForInteractive();
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(500);
  });
});

// Rendering performance test
describe('Rendering Performance', () => {
  it('should maintain 60fps during scroll', async () => {
    const fps = await measureFPS(async () => {
      await scrollList(1000); // Scroll 1000 items
    });
    
    expect(fps).toBeGreaterThanOrEqual(55);
  });
  
  it('should switch tabs within 200ms', async () => {
    const duration = await measureDuration(async () => {
      await switchTab('tab-2');
    });
    
    expect(duration).toBeLessThan(200);
  });
});

// Memory test
describe('Memory Performance', () => {
  it('should use less than 200MB idle', async () => {
    const memory = await getMemoryUsage();
    expect(memory.heapUsed).toBeLessThan(200 * 1024 * 1024);
  });
  
  it('should not leak memory', async () => {
    const initial = await getMemoryUsage();
    
    // Perform operations
    for (let i = 0; i < 100; i++) {
      await openFile(`file-${i}.ts`);
      await closeFile(`file-${i}.ts`);
    }
    
    // Force GC
    await forceGC();
    
    const final = await getMemoryUsage();
    const growth = final.heapUsed - initial.heapUsed;
    
    // Allow 10% growth
    expect(growth).toBeLessThan(initial.heapUsed * 0.1);
  });
});

// Database performance test
describe('Database Performance', () => {
  it('should query within 10ms', async () => {
    const duration = await measureDuration(async () => {
      await db.getMemory('test-id');
    });
    
    expect(duration).toBeLessThan(10);
  });
  
  it('should FTS search within 50ms', async () => {
    const duration = await measureDuration(async () => {
      await db.searchKnowledge('test query');
    });
    
    expect(duration).toBeLessThan(50);
  });
});
```

**Deliverables:**
- [ ] Startup tests
- [ ] Rendering tests
- [ ] Memory tests
- [ ] Database tests

#### Task 1.5.17: Performance Dashboard
**File:** `desktop-app/src/pages/PerformanceDashboard.tsx`

```typescript
interface PerformanceMetrics {
  startup: {
    coldStart: number;
    warmStart: number;
    timeToInteractive: number;
  };
  memory: {
    current: number;
    peak: number;
    heapUsed: number;
  };
  rendering: {
    fps: number;
    frameTime: number;
    longTasks: number;
  };
  database: {
    queryTime: number;
    cacheHitRate: number;
    connectionCount: number;
  };
  network: {
    requestCount: number;
    avgLatency: number;
    errorRate: number;
  };
}

export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>();
  
  useEffect(() => {
    const interval = setInterval(async () => {
      const data = await invoke('get_performance_metrics');
      setMetrics(data);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="performance-dashboard">
      <MetricCard title="Memory" value={formatBytes(metrics?.memory.current)} />
      <MetricCard title="FPS" value={metrics?.rendering.fps} />
      <MetricCard title="Cache Hit" value={`${metrics?.database.cacheHitRate}%`} />
      {/* ... */}
    </div>
  );
}
```

**Deliverables:**
- [ ] Real-time metrics
- [ ] Performance graphs
- [ ] Alerts for issues

#### Task 1.5.18: Performance CI Integration
**File:** `.github/workflows/performance.yml`

```yaml
name: Performance Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup
        run: |
          npm ci
          cargo build --release
      
      - name: Run Performance Tests
        run: npm run test:performance
      
      - name: Check Thresholds
        run: |
          node scripts/check-performance-thresholds.js
      
      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: performance-report
          path: reports/performance/
      
      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const report = require('./reports/performance/summary.json');
            const comment = formatPerformanceReport(report);
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

**Deliverables:**
- [ ] CI performance tests
- [ ] Threshold checks
- [ ] PR comments

---

## 📊 Performance Checklist

### Startup
- [ ] Lazy load all pages
- [ ] Code split heavy components
- [ ] Defer non-critical initialization
- [ ] Preload critical resources
- [ ] Splash screen with progress

### Rendering
- [ ] Virtual scrolling for all lists
- [ ] React.memo for expensive components
- [ ] useMemo/useCallback optimization
- [ ] Debounce/throttle event handlers
- [ ] Web Workers for heavy tasks

### Database
- [ ] All necessary indexes created
- [ ] Prepared statements used
- [ ] Batch operations implemented
- [ ] Pagination for large datasets
- [ ] Connection pooling
- [ ] Query result caching
- [ ] FTS optimization

### Network
- [ ] Connection keep-alive
- [ ] Request batching
- [ ] Compression enabled
- [ ] Retry with backoff
- [ ] Streaming optimization

### Memory
- [ ] Memory monitoring
- [ ] Automatic cleanup
- [ ] LRU cache eviction
- [ ] Resource disposal
- [ ] No memory leaks

---

## ✅ Definition of Done

- [ ] App startup < 1.5s
- [ ] Tab switch < 200ms
- [ ] File open < 100ms
- [ ] Memory (idle) < 200MB
- [ ] Memory (active) < 500MB
- [ ] LLM first token < 500ms
- [ ] DB query < 10ms
- [ ] FTS search < 50ms
- [ ] 60fps UI rendering
- [ ] No memory leaks
- [ ] Performance tests pass
- [ ] CI integration complete

---

## 🚀 Next Phase

**Phase 2: Product Template Wizard**
- Template selection UI
- Project scaffolding
- Configuration wizard
- One-click setup

---

## 📝 Notes

### Performance Monitoring Tools

1. **Chrome DevTools** - Memory, Performance tabs
2. **React DevTools** - Component profiler
3. **Tauri DevTools** - Rust profiling
4. **SQLite Analyzer** - Query analysis

### Common Performance Issues

1. **Re-renders** - Missing memo/callback
2. **Large lists** - Missing virtualization
3. **Memory leaks** - Missing cleanup
4. **Slow queries** - Missing indexes
5. **Network** - Missing batching/caching

### Best Practices

1. **Measure first** - Don't optimize blindly
2. **Profile regularly** - Catch regressions early
3. **Set budgets** - Define performance budgets
4. **Automate tests** - CI performance checks
