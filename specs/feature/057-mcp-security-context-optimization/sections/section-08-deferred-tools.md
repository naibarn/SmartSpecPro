# Section 08 — Deferred Tool Registry

## Section ID
`section-08-deferred-tools`

## Dependencies
- **section-01-python-ssrf-auth**: agency_tools.py callers updated with tenant_id

## Overview

Implements `DeferredToolRegistry` — when an agent has more than 10 tools configured, switch from binding all tool schemas to the LLM (consuming ~285 tokens/tool × 25 tools = 7,125 tokens/turn) to showing only tool names and a `tool_search` meta-tool (~800 tokens total). The LLM calls `tool_search("select:web-search")` to fetch the full schema on demand. This mirrors DeerFlow's `DeferredToolFilterMiddleware` + `tool_search` pattern.

## File to Create

`python-backend/app/services/agency_deferred_tools.py`

## Files to Modify

| File | Path |
|------|------|
| agency_tools.py | `python-backend/app/services/agency_tools.py` |

## Test File to Create

`python-backend/tests/unit/services/test_agency_deferred_tools.py`

---

## TDD Specification

```
# Test: prepare_tools passes through when tools <= threshold
  - Input: 5 tools, threshold=10
  - Assert all 5 tools returned in bind_tools list, no tool_search added

# Test: prepare_tools activates deferred mode when tools > threshold
  - Input: 15 tools, threshold=10
  - Assert bind_tools list contains only tool_search meta-tool
  - Assert execution_tools list contains all 15 original tools

# Test: search with "select:name1,name2" returns exact matches
  - Register tools: web-search, rag-knowledge, email-notify
  - Search "select:web-search,email-notify"
  - Assert returns exactly [web-search, email-notify] schemas

# Test: search with free text returns top 5 by relevance
  - Register 20 tools with varied names/descriptions
  - Search "search the web for information"
  - Assert returns max 5 results, web-search ranked highest

# Test: search with "+keyword rest" requires keyword in name
  - Register: web-search, web-scraper, email-notify
  - Search "+web information"
  - Assert only web-search and web-scraper returned, not email-notify

# Test: search returns empty for no matches
  - Search "nonexistent_tool_xyz"
  - Assert returns []

# Test: tool_search schema is valid for LLM binding
  - Assert tool_search has name, description, inputSchema with query parameter
```

---

## Implementation Guidance

### DeferredToolRegistry Class

```python
from dataclasses import dataclass, field

@dataclass
class PreparedTools:
    bind_tools: list  # Tools to bind to LLM (all or just tool_search)
    execution_tools: list  # All tools available for execution
    deferred: bool  # Whether deferred mode is active
    available_names: str  # Formatted list of tool names for system prompt

class DeferredToolRegistry:
    THRESHOLD: int = 10
    MAX_SEARCH_RESULTS: int = 5

    def __init__(self):
        self._tools: dict[str, Any] = {}  # name -> {tool, description}

    def prepare_tools(self, tools: list) -> PreparedTools:
        if len(tools) <= self.THRESHOLD:
            return PreparedTools(bind_tools=tools, execution_tools=tools, deferred=False, available_names="")
        # Register all tools, return only tool_search for binding
        for t in tools:
            self._tools[t.name] = {"tool": t, "description": getattr(t, "description", "")}
        tool_search = self._build_tool_search()
        names = "\n".join(f"- {t.name}: {getattr(t, 'description', '')[:80]}" for t in tools)
        return PreparedTools(bind_tools=[tool_search], execution_tools=tools + [tool_search],
                           deferred=True, available_names=names)

    def search(self, query: str) -> list[dict]:
        if query.startswith("select:"):
            names = [n.strip() for n in query[7:].split(",")]
            return [self._schema(n) for n in names if n in self._tools][:self.MAX_SEARCH_RESULTS]
        if query.startswith("+"):
            parts = query[1:].split(None, 1)
            keyword = parts[0] if parts else ""
            candidates = {n: t for n, t in self._tools.items() if keyword.lower() in n.lower()}
            rest = parts[1] if len(parts) > 1 else ""
            return self._rank(candidates, rest)
        return self._rank(self._tools, query)
```

### Integration with agency_tools.py

In `resolve_mcp_tools_for_agent()`, after building the full tool list:

```python
registry = DeferredToolRegistry()
prepared = registry.prepare_tools(all_tools)
if prepared.deferred:
    # Inject available tool names into agent system prompt
    agent_instructions += f"\n<available-deferred-tools>\n{prepared.available_names}\n</available-deferred-tools>"
# Use prepared.bind_tools for LLM binding, prepared.execution_tools for execution
```

### Security Considerations

1. **Tool description injection**: External MCP server tool descriptions could contain prompt injection. Apply `fewShotSanitizer` strip-injection patterns to descriptions before including in the `<available-deferred-tools>` block.
2. **Schema cache staleness**: Tool schemas are cached at registration time. If an MCP server changes its schema between registration and search, the stale schema is returned. This is acceptable for security (prevents runtime schema injection) but may cause tool call failures if parameters changed.
3. **tool_search scope restriction (NEW-03)**: `tool_search` must ONLY return schemas for tools in the agent's pre-authorized tool list — not all tools in the registry. A prompt injection in an MCP response could craft `tool_search("select:dangerous_tool")` to discover and call tools the agent was not assigned. The `search()` method must filter against the agent's `execution_tools` list, not the global registry. Additionally, `tool_search` return values should go through the same guardrail scrubbing as MCP responses to prevent schema-level injection.
