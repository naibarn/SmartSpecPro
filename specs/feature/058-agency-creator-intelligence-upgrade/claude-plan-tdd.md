# TDD Plan — 058: AI Agency Creator Intelligence Upgrade

## Testing Framework
- Python: pytest with asyncio auto mode, existing test_agency_creator_v2.py
- TypeScript: Vitest (apps/web)

## Section Tests

### Section 01: Discover Enhancement
```python
# test: _llm_discover returns capability analysis fields
# test: complexity_level is one of simple/moderate/complex
# test: recommended_capabilities is a list of valid capability names
# test: fallback returns safe defaults when LLM fails
```

### Section 02: Interview Replacement
```python
# test: discover generates only goal-clarification questions (not technical)
# test: skip_interview=True bypasses all questions
# test: design task receives discover analysis with capabilities
# test: no questions about executionMode/planningStrategy/model
```

### Section 03: Memory-Informed Planning
```python
# test: _fetch_relevant_memories returns formatted learnings
# test: empty memories returns empty string (no error)
# test: memories are filtered by tenant_id
# test: memories limited to 10 results
# test: planning prompt includes past learnings when available
```

### Section 04: Review Enhancement
```python
# test: review_plan checks for executionMode on every agent node
# test: review_plan checks for capability alignment
# test: review_design checks for enableLongTermMemory
# test: review catches missing objective
# test: max 3 review iterations (existing behavior preserved)
```

### Section 05: Post-Creation Suggestions
```python
# test: _llm_suggest_improvements returns list of suggestions
# test: each suggestion has category, description, impact
# test: suggestions stored in Redis status
# test: fallback returns empty suggestions on LLM failure
# test: max 5 suggestions
```

### Section 06: Template Save
```typescript
// test: saveAsTemplate creates agencyTemplates record
// test: saveAsTemplate copies nodes + edges + config
// test: saveAsTemplate requires agency ownership
// test: template does not copy memories or run history
```

### Section 07: Internal API Update
```typescript
// test: internal create accepts objective field
// test: internal create accepts sharedInstructions field
// test: objective is saved to agencies table
// test: sharedInstructions is saved to agencies table
```

### Section 08: Frontend Suggestions UI
```typescript
// test: suggestion cards render after creation
// test: Apply button calls saveBuilder with modification
// test: Skip dismisses suggestion
// test: Save as Template button appears on completion
```

## Integration Tests
```python
# test: full pipeline: requirement → agency with executionMode on every agent
# test: full pipeline: agency has modelRequirements (not hardcoded model)
# test: full pipeline: agency has objective set
# test: full pipeline: agency has enableLongTermMemory=true on agents
# test: full pipeline: suggestions generated after creation
# test: memory-informed: past learnings appear in planning prompt when available
```
