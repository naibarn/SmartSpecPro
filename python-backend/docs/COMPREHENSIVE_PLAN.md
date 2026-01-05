# Comprehensive Plan: LangChain, Memory System & Kilo CLI Integration

**Author:** Manus AI  
**Date:** January 2, 2026  
**Version:** 2.0

---

## 1. Executive Summary

This document presents a unified technical plan to significantly enhance the SmartSpec platform by integrating a sophisticated, multi-layered memory system and providing first-class support for the Kilo Code CLI. This will transform SmartSpec from a stateless workflow engine into a context-aware, learning-capable agentic engineering platform. The plan details a phased approach, prioritizing foundational memory capabilities and then building Kilo CLI integration on top of this new architecture.

## 2. Current Architecture & Integration Points

- **Orchestration:** LangGraph with a non-persistent `MemorySaver` [1].
- **State Management:** A simple in-memory `state_manager`.
- **Kilo CLI Support:** A placeholder `_execute_kilo_step` method exists but is not implemented [2].
- **Dependencies:** `langchain`, `langgraph`, `redis`, and `psycopg2-binary` are already installed, providing a strong starting point [3].

## 3. Proposed Architecture

We will implement a dual-memory system and refactor the core execution logic to support both LangChain and Kilo Code CLI workflows.

### 3.1. Core Services

- **MemoryService:** A new service to manage long-term memory (Semantic and Episodic).
- **KiloSessionManager:** A new service to manage Kilo CLI sessions, including workspace setup, skill injection, and state tracking.

### 3.2. Memory System

| Type | Storage | Use Case |
|---|---|---|
| **Short-Term** | PostgreSQL (Checkpoints) | Durable workflow state, conversation history. |
| **Semantic** | PostgreSQL/Redis | User preferences, project facts, Kilo CLI settings. |
| **Episodic** | Vector DB (ChromaDB) | Successful past interactions, code snippets, Kilo CLI command sequences. |

### 3.3. Kilo CLI Integration

Kilo CLI will be integrated as a first-class tool within the orchestrator. The `KiloSessionManager` will handle:

- **Workspace Management:** Creating and managing temporary workspaces for Kilo's `--parallel` mode.
- **Skill Injection:** Dynamically creating `.kilocode/skills/` directories and injecting `SKILL.md` files based on the current context and user profile.
- **Process Execution:** Invoking the `kilocode` CLI using `subprocess` and capturing its output.
- **State Sync:** Using Kilo's checkpoint system to sync state with SmartSpec's own checkpoint manager.

## 4. Implementation Plan & Roadmap

This is a comprehensive roadmap, broken down by priority. Phases can be executed sequentially or in parallel where feasible.

### **Priority 1: Foundational Memory (18-25 Hours)**

| Phase | Task | Key Activities | Estimated Time |
|---|---|---|---|
| **1.1** | **Short-Term Memory** | - Install `langgraph-checkpoint-postgres`.<br>- Replace `MemorySaver` with `AsyncPostgresSaver`.<br>- Write integration tests for persistence. | 3-4 Hours |
| **1.2** | **Long-Term: Semantic** | - Design `semantic_memory` table.<br>- Implement `upsert/get` in `MemoryService`.<br>- Create background task to save facts. | 4-6 Hours |
| **1.3** | **Long-Term: Episodic** | - Install `chromadb`.<br>- Implement `add/search` in `MemoryService`.<br>- Create background task to embed summaries. | 5-7 Hours |
| **1.4** | **LCEL Integration** | - Refactor `_execute_llm_step` to use LCEL.<br>- Integrate `MemoryService` into the chain. | 6-8 Hours |

### **Priority 2: Kilo Code CLI Integration (12-18 Hours)**

| Phase | Task | Key Activities | Estimated Time |
|---|---|---|---|
| **2.1** | **KiloSessionManager** | - Create `KiloSessionManager` service.<br>- Implement workspace setup and cleanup logic. | 3-4 Hours |
| **2.2** | **CLI Execution** | - Implement `_execute_kilo_step` in `WorkflowOrchestrator`.<br>- Use `subprocess` to run `kilocode` in `--auto` and `--parallel` modes.<br>- Parse JSON output from Kilo CLI. | 4-6 Hours |
| **2.3** | **Skill Injection** | - Implement logic to dynamically create `SKILL.md` files from semantic memory.<br>- Test skill loading in Kilo CLI sessions. | 3-4 Hours |
| **2.4** | **State & Checkpoint Sync** | - Integrate Kilo's git-based checkpoints with SmartSpec's checkpoint system.<br>- Write tests for state restoration and synchronization. | 2-4 Hours |

### **Priority 3: Fixes & Enhancements (5-7 Hours)**

| Phase | Task | Key Activities | Estimated Time |
|---|---|---|---|
| **3.1** | **Fix Skipped Tests** | - Refactor `OllamaProvider` to use `ProviderConfig`.<br>- Un-skip the 3 tests in `test_llm_proxy_v2.py`. | 1-2 Hours |
| **3.2** | **Implement Middleware** | - Implement `RateLimitMiddleware`, `RequestValidationMiddleware`, and `SecurityHeadersMiddleware`. | 2-3 Hours |
| **3.3** | **Orchestrator TODOs** | - Implement parallel execution logic in `_add_parallel_edges`.<br>- Implement `resume_from_checkpoint`. | 2-2 Hours |

**Total Estimated Time:** 35-50 Hours

## 5. Dependencies

- **New Python Packages:** `langgraph-checkpoint-postgres`, `chromadb`, `tiktoken`
- **System Dependencies:** `npm` (for `kilocode` CLI), `git`

## 6. Risks and Mitigation

- **Kilo CLI API Changes:** The Kilo CLI is under active development and its API may change. **Mitigation:** Pin to a specific version of `@kilocode/cli` and build an abstraction layer (`KiloSessionManager`) to isolate our code from direct CLI calls.
- **Performance:** Running multiple Kilo instances in parallel could be resource-intensive. **Mitigation:** Implement resource monitoring and limit the maximum number of parallel sessions. Use lightweight containers (e.g., Docker) for isolation if needed.
- **Security:** Executing external commands (`kilocode`) and writing to the filesystem requires careful security considerations. **Mitigation:** Run Kilo CLI with restricted user permissions. Validate all inputs and sanitize all outputs. Use the `autoApproval` settings in Kilo to enforce a strict security policy.

---

## 7. References

[1] LangGraph Documentation. (2025). *Persistence*. [https://docs.langchain.com/oss/python/langgraph/persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

[2] SmartSpec Project. (2026). `app/orchestrator/orchestrator.py`.

[3] SmartSpec Project. (2026). `requirements.txt`.

[4] Kilo Code Documentation. (2026). *Kilo Code CLI*. [https://kilo.ai/docs/cli](https://kilo.ai/docs/cli)
