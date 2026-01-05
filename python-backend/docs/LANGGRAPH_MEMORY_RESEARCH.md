# LangGraph Memory & Persistence Research

## Key Findings from LangGraph Documentation

### 1. Persistence Layer

LangGraph has a built-in persistence layer implemented through **checkpointers**:
- Saves a `checkpoint` of graph state at every super-step
- Checkpoints are saved to a `thread` (unique ID)
- Enables: human-in-the-loop, memory, time travel, fault-tolerance

### 2. Checkpointer Libraries

| Library | Class | Use Case |
|---------|-------|----------|
| `langgraph-checkpoint` | `InMemorySaver` | Experimentation only |
| `langgraph-checkpoint-sqlite` | `SqliteSaver` / `AsyncSqliteSaver` | Local workflows |
| `langgraph-checkpoint-postgres` | `PostgresSaver` / `AsyncPostgresSaver` | **Production** |

### 3. Memory Store with Semantic Search

```python
from langchain.embeddings import init_embeddings
from langgraph.store.memory import InMemoryStore

# Create store with semantic search enabled
embeddings = init_embeddings("openai:text-embedding-3-small")
store = InMemoryStore(
    index={
        "embed": embeddings,
        "dims": 1536,
    }
)

# Store memories
store.put(("user_123", "memories"), "1", {"text": "I love pizza"})

# Search by semantic similarity
memories = store.search(("user_123", "memories"), query="food preferences", limit=5)
```

### 4. Memory Types

#### Short-term Memory (Conversation)
- Part of agent's state
- Enables multi-turn conversations
- Stored via checkpointers

#### Long-term Memory (Persistent)
- Stored in Memory Store
- Supports semantic search
- Cross-session persistence

### 5. Multi-vector Indexing

```python
store = InMemoryStore(
    index={
        "embed": embeddings, 
        "dims": 1536, 
        "fields": ["memory", "emotional_context"]  # Index multiple fields
    }
)
```

### 6. Using Memory in Agents

```python
def chat(state, *, store: BaseStore):
    # Search based on user's last message
    items = store.search(
        ("user_123", "memories"), 
        query=state["messages"][-1].content, 
        limit=2
    )
    memories = "\n".join(item.value["text"] for item in items)
    # ... use memories in prompt
```

### 7. Production Recommendations

1. **Use PostgresSaver** for checkpointing in production
2. **Use Redis** for caching and real-time state
3. **Use Vector Store** (Pinecone, Weaviate, Chroma) for semantic memory
4. **Implement TTL** for memory cleanup
5. **Use namespaces** for user isolation



## Memory Types (from CoALA Paper)

### 1. Procedural Memory
- **Human analogy**: Remembering how to ride a bike
- **Agent implementation**: LLM weights + agent code
- **Practical use**: Agent updating its own system prompt (rare)

### 2. Semantic Memory
- **Human analogy**: Facts learned in school, concepts and relationships
- **Agent implementation**: Repository of facts about the world
- **Practical use**: Personalization - extract info from conversations, store, retrieve for future
- **Update method**: LLM extracts information from interactions

### 3. Episodic Memory
- **Human analogy**: Recalling specific past events
- **Agent implementation**: Sequences of agent's past actions
- **Practical use**: Few-shot example prompting, dynamic few-shot selection
- **Best for**: When there's a "correct" way to perform specific actions

## Memory Update Strategies

### 1. "In the Hot Path"
- Agent explicitly decides to remember facts via tool calling
- **Pros**: Immediate memory update
- **Cons**: Added latency, memory logic mixed with agent logic
- **Example**: ChatGPT's memory feature

### 2. "In the Background"
- Background process runs during/after conversation
- **Pros**: No added latency, memory logic separate
- **Cons**: Memory not updated immediately, extra logic needed

### 3. User Feedback
- Save positive interactions for future recall
- Particularly relevant for episodic memory

