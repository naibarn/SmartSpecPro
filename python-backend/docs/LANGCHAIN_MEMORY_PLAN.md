# Technical Plan: LangChain & Advanced Memory Integration

**Author:** Manus AI  
**Date:** January 2, 2026  
**Version:** 1.0

---

## 1. Executive Summary

This document outlines a technical plan to integrate LangChain more deeply into the SmartSpec platform and implement a sophisticated, multi-layered memory system. The current prototype uses LangGraph for orchestration but lacks a robust, persistent memory, limiting its ability to learn from interactions and personalize user experiences. This plan proposes a new architecture that introduces both short-term and long-term memory, leveraging persistent storage (PostgreSQL, Redis) and vector databases to create a more intelligent and context-aware agent.

## 2. Current Architecture Analysis

The existing system is built on a solid foundation but has key limitations:

- **Orchestration:** Uses LangGraph with a basic in-memory checkpointer (`MemorySaver`) [1]. This is not suitable for production as all state is lost on restart.
- **State Management:** A `state_manager` handles the lifecycle of a single execution but does not persist memory across different sessions.
- **Dependencies:** The project already includes `langchain`, `langgraph`, and `redis`, which we can leverage for the new architecture [2].

## 3. Proposed Architecture

We propose a dual-memory architecture that separates conversational context from long-term knowledge, integrated through a refactored LangChain-based execution layer.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SmartSpec Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────┐         ┌──────────────────┐         ┌──────────────────┐    │
│   │  User   │ ──────> │  SmartSpec API   │ ──────> │    Orchestrator  │    │
│   └─────────┘         │    (FastAPI)     │         │   (LangGraph)    │    │
│                       └──────────────────┘         └────────┬─────────┘    │
│                                                             │              │
│                       ┌─────────────────────────────────────┼──────────┐   │
│                       │                                     │          │   │
│                       ▼                                     ▼          │   │
│              ┌────────────────┐                   ┌────────────────┐   │   │
│              │ Memory Service │                   │   LLM Proxy    │   │   │
│              └───────┬────────┘                   └────────────────┘   │   │
│                      │                                                 │   │
│       ┌──────────────┼──────────────┐                                  │   │
│       │              │              │                                  │   │
│       ▼              ▼              ▼                                  │   │
│  ┌─────────┐   ┌─────────┐   ┌─────────────┐                          │   │
│  │PostgreSQL│   │  Redis  │   │ Vector DB   │                          │   │
│  │(Semantic)│   │ (Cache) │   │ (Episodic)  │                          │   │
│  └─────────┘   └─────────┘   └─────────────┘                          │   │
│                                                                        │   │
└────────────────────────────────────────────────────────────────────────┘   │
```

### 3.1. Short-Term (Conversational) Memory

This layer will manage the context for a single, continuous user interaction or workflow.

- **Technology:** We will replace the `MemorySaver` with `langgraph_checkpoint_postgres.AsyncPostgresSaver`.
- **Implementation:** The `checkpointer` in `WorkflowOrchestrator` will be configured to use the `AsyncPostgresSaver`. This provides durable, restart-proof state management for ongoing workflows, enabling features like time-travel debugging and resuming failed executions.

### 3.2. Long-Term (Persistent) Memory

This layer will store knowledge across multiple sessions, enabling true learning and personalization. It will be managed by a new `MemoryService` and be composed of two sub-types, mirroring human memory [3].

#### 3.2.1. Semantic Memory

- **Purpose:** To store structured facts and preferences about the user and their projects (e.g., preferred coding style, project goals, tech stack).
- **Technology:** A dedicated PostgreSQL table or a Redis Hash.
- **Implementation:** The `MemoryService` will provide methods like `upsert_semantic_memory(user_id, key, value)` and `get_semantic_memory(user_id, key)`. These facts will be retrieved at the start of a workflow and injected into the system prompt.

#### 3.2.2. Episodic Memory

- **Purpose:** To store successful or noteworthy past interactions (workflow summaries, code snippets, final reports) as few-shot examples.
- **Technology:** A vector database. We will start with a self-hosted **ChromaDB** instance for ease of setup and later evaluate cloud-native options like Pinecone or Weaviate for scalability.
- **Implementation:** The `MemoryService` will use a `VectorStore` (e.g., `Chroma`) to store embeddings of past interactions. It will provide a `search_episodic_memory(user_id, query, top_k)` method that retrieves the most relevant examples based on the current user prompt, enabling dynamic few-shot learning.

### 3.3. LangChain Integration Refactor

To seamlessly integrate the new memory system, we will refactor the core execution logic in `WorkflowOrchestrator`.

- **Current:** `_execute_llm_step` directly calls `llm_proxy.invoke`.
- **Proposed:** We will replace this with a **LangChain Expression Language (LCEL)** chain. This allows us to compose the prompt, model, output parser, and memory retrieval steps in a more modular and maintainable way.

```python
# Example of a new LCEL chain
from langchain_core.runnables import RunnablePassthrough
from langchain_core.prompts import ChatPromptTemplate

# ... inside WorkflowOrchestrator

prompt_template = ChatPromptTemplate.from_messages([...])

chain = (
    {"context": memory_service.retrieve_context, "question": RunnablePassthrough()}
    | prompt_template
    | llm_proxy_as_runnable  # llm_proxy wrapped as a LangChain Runnable
    | StrOutputParser()
)
```

## 4. Implementation Plan & Roadmap

This project will be broken down into four main phases.

| Phase | Task | Key Activities | Estimated Time |
|---|---|---|---|
| **1** | **Foundation & Short-Term Memory** | - Install `langgraph-checkpoint-postgres` and `psycopg2-binary`.<br>- Set up PostgreSQL schema for checkpoints.<br>- Replace `MemorySaver` with `AsyncPostgresSaver` in `WorkflowOrchestrator`.<br>- Write integration tests to verify persistence. | 3-4 Hours |
| **2** | **Long-Term Memory: Semantic** | - Design `semantic_memory` table schema in PostgreSQL.<br>- Implement `upsert/get` methods in `MemoryService`.<br>- Create a background task (Dramatiq) to extract and save semantic facts post-workflow. | 4-6 Hours |
| **3** | **Long-Term Memory: Episodic** | - Install `chromadb` and `tiktoken`.<br>- Set up ChromaDB client.<br>- Implement `add/search` methods in `MemoryService` for episodic memory.<br>- Add a background task to embed and store successful workflow summaries. | 5-7 Hours |
| **4** | **LCEL & Agent Integration** | - Refactor `_execute_llm_step` to use an LCEL chain.<br>- Integrate `MemoryService` calls into the chain to retrieve context dynamically.<br>- Create a `save_memory` tool for the agent to use "in the hot path".<br>- End-to-end testing of the complete memory system. | 6-8 Hours |

**Total Estimated Time:** 18-25 Hours

## 5. Risks and Mitigation

- **Schema Complexity:** The database schema for memory could become complex. **Mitigation:** Start with a simple, flexible schema (e.g., JSONB fields) and iterate.
- **Performance Overhead:** Memory retrieval could add latency. **Mitigation:** Use efficient indexing in PostgreSQL and Redis. Optimize vector search parameters. Perform load testing.
- **Data Privacy:** Storing user interactions requires careful handling. **Mitigation:** All memory data must be strictly namespaced by `user_id`. Implement data retention policies and a mechanism for users to view/delete their memory.

---

## 6. References

[1] LangGraph Documentation. (2025). *Persistence*. [https://docs.langchain.com/oss/python/langgraph/persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

[2] SmartSpec Project. (2026). `requirements.txt`.

[3] LangChain Blog. (2024). *Memory for agents*. [https://blog.langchain.com/memory-for-agents/](https://blog.langchain.com/memory-for-agents/)
