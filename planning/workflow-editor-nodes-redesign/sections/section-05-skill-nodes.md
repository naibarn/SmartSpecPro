Now I'll generate the complete, self-contained content for section-05-skill-nodes based on the context files.

# Section 05: Skill Node Auto-Generation

## Overview

This section implements automatic generation of workflow nodes from the existing skills registry. Instead of manually defining node types for each skill, the system scans the skills directory, reads each skill's `schemas/input.schema.json` file, and dynamically generates a `NodeTypeSpec` with properly typed inputs. This ensures skills are immediately available in the workflow editor without additional configuration.

## Background Context

**Skills Registry Location:** The existing skills are registered and available through the SmartSpecPro skills engine. Skills are defined with markdown descriptions (`skill.md`) and JSON Schema input definitions (`schemas/input.schema.json`).

**Important Path Detail:** The schema file is located at `schemas/input.schema.json` (in a `schemas/` subdirectory), NOT at the root of the skill directory.

**Skill Discovery:** Not all skills have schemas — some may be code-only or legacy. The discovery process must skip skills without `schemas/input.schema.json` rather than failing.

**Integration Point:** The auto-generated skill nodes are returned by the same `GET /api/v1/workflow/node-types` endpoint as core nodes, allowing the frontend to treat all node types uniformly.

## Dependencies

**Required Sections:**
- `section-02-registry` — Node type registry must exist with `NodeTypeSpec`, `InputSpec`, `OutputSpec` data classes and registration mechanism

**Services Already Available:**
- Skills engine with skill definitions
- Skill execution pipeline

## Architecture

### Schema-to-Node Mapping

Each field in a skill's `schemas/input.schema.json` maps to a workflow node input:

| JSON Schema Type | data_type | ui_type | Notes |
|------------------|-----------|---------|-------|
| `string` | text | text | Basic text input |
| `string` with `enum` array | text | select | Dropdown with predefined options |
| `number` or `integer` | number | number | Numeric input with validation |
| `boolean` | boolean | toggle | Switch/checkbox control |
| `string` with `format: "textarea"` | text | textarea | Multi-line text |
| `array` of strings | array | multiselect | Multi-select with tags |
| `object` | json | json_editor | JSON editor component |

**Dual-mode inputs:** Every generated input has `accepts_connection: true`, allowing users to either manually configure values OR connect them from upstream nodes.

### Node Type Generation

For each discovered skill:
- `type`: `skill_{skill_id}` (e.g., `skill_enhance_prompt`)
- `display_name`: From skill metadata
- `category`: `'skills'`
- `icon`: `'Zap'` (generic skill icon)
- `color`: `'purple'` (consistent skill node color)
- `inputs`: Generated from schema fields
- `outputs`: Standard outputs for all skills:
  - `result` (data_type: text) — Skill execution result
  - `metadata` (data_type: json) — Execution metadata (timing, cost, etc.)
- `executor`: `'app.orchestrator.node_executors.skill_executor:SkillExecutor'`

### Skill Executor

All skill nodes share a single `SkillExecutor` class that:
1. Receives input values from connections and/or manual configuration
2. Validates inputs against the skill's `schemas/input.schema.json`
3. Calls the existing skill execution pipeline with validated inputs
4. Returns standardized outputs (result text + metadata json)

## Tests to Write FIRST

**File:** `python-backend/tests/test_skill_nodes.py`

```python
# Test: discover_skills — scans skills registry and finds skills with schemas/input.schema.json
# Test: discover_skills — skips skills without schemas/input.schema.json (no error raised)
# Test: schema_to_node_mapping — string field maps to (data_type: text, ui_type: text)
# Test: schema_to_node_mapping — string field with enum maps to (data_type: text, ui_type: select) with options
# Test: schema_to_node_mapping — number field maps to (data_type: number, ui_type: number)
# Test: schema_to_node_mapping — boolean field maps to (data_type: boolean, ui_type: toggle)
# Test: schema_to_node_mapping — array of strings maps to (data_type: array, ui_type: multiselect)
# Test: schema_to_node_mapping — object field maps to (data_type: json, ui_type: json_editor)
# Test: schema_to_node_mapping — all generated inputs have accepts_connection: true
# Test: skill_executor — validates inputs against schema before execution
# Test: skill_executor — calls existing skill execution pipeline
# Test: skill_executor — returns result text and metadata json
# Test: skill_executor — raises validation error for missing required field
# Test: skill_executor — raises validation error for wrong field type
# Test: GET /api/v1/workflow/skill-nodes — returns list of auto-generated skill node types
# Test: GET /api/v1/workflow/skill-nodes — response format matches NodeTypeSpec structure
# Test: GET /api/v1/workflow/node-types — includes skill nodes alongside core nodes
```

**Expected Skills:** Based on the skills registry, expect nodes for: Video Skill, Image Skill, Enhance Prompt, Image & Video Skill, Document Generate, Slide Generate, Graphic Info, and others.

## Implementation Files

### 1. Skill Discovery Module

**File:** `python-backend/app/orchestrator/skill_discovery.py`

```python
"""
Auto-generate workflow node types from skills registry.
"""
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import json
from app.orchestrator.node_registry import NodeTypeSpec, InputSpec, OutputSpec

# Stub: discover_skills
def discover_skills() -> list[NodeTypeSpec]:
    """
    Scan skills registry, read schemas/input.schema.json for each skill,
    generate NodeTypeSpec for each.
    
    Returns:
        List of auto-generated skill node type specs
    """
    pass

# Stub: map_schema_to_inputs
def map_schema_to_inputs(schema: dict[str, Any]) -> list[InputSpec]:
    """
    Convert JSON Schema fields to InputSpec list.
    
    Args:
        schema: Parsed JSON Schema object
        
    Returns:
        List of InputSpec objects
    """
    pass

# Stub: _map_field_type
def _map_field_type(field_schema: dict[str, Any]) -> tuple[str, str]:
    """
    Map JSON Schema field type to (data_type, ui_type) tuple.
    
    Args:
        field_schema: Single field schema definition
        
    Returns:
        (data_type, ui_type) tuple
    """
    pass

# Stub: get_skill_node_specs (cached)
def get_skill_node_specs() -> list[NodeTypeSpec]:
    """
    Get all skill node specs with caching.
    Results cached on startup, invalidated when skills change.
    
    Returns:
        List of skill NodeTypeSpec objects
    """
    pass
```

**Implementation Notes:**
- Use `Path` to navigate skill directory structure
- Read `schemas/input.schema.json` with error handling (skip if not found)
- Extract skill metadata (name, description) from skill definition files
- Cache results using function-level cache decorator (e.g., `@lru_cache`)
- Provide cache invalidation mechanism for skill updates

### 2. Skill Executor

**File:** `python-backend/app/orchestrator/node_executors/skill_executor.py`

```python
"""
Generic executor for all skill nodes.
"""
from typing import Any
from app.orchestrator.node_executors.base import NodeExecutor, ExecutionContext, NodeExecutionData
import jsonschema

class SkillExecutor:
    """
    Generic executor for skill nodes.
    Validates inputs against skill schema, calls skill execution pipeline.
    """
    
    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute a skill node.
        
        Steps:
        1. Extract skill_id from node_config
        2. Load skill's schemas/input.schema.json
        3. Validate inputs against schema
        4. Call existing skill execution pipeline
        5. Return result + metadata
        
        Returns:
            {
                'result': NodeExecutionData(json={'text': '...'}, ...),
                'metadata': NodeExecutionData(json={'duration_ms': 123, ...}, ...)
            }
        """
        pass
    
    def _validate_inputs(self, inputs: dict, schema: dict) -> None:
        """
        Validate inputs against JSON Schema.
        
        Raises:
            jsonschema.ValidationError: If validation fails
        """
        pass
    
    async def _execute_skill(
        self, 
        skill_id: str, 
        inputs: dict, 
        context: ExecutionContext
    ) -> dict[str, Any]:
        """
        Call the existing skill execution pipeline.
        
        Args:
            skill_id: Skill identifier
            inputs: Validated input data
            context: Execution context
            
        Returns:
            Skill execution result
        """
        pass
```

**Implementation Notes:**
- Use `jsonschema` library for validation
- Integrate with existing skill execution pipeline (locate via codebase exploration)
- Handle skill execution errors gracefully
- Include execution timing in metadata
- Support both connected inputs (NodeExecutionData) and manual config values

### 3. API Integration

**File:** `python-backend/app/api/workflow.py` (add endpoint)

```python
# Add to existing workflow.py

@router.get("/skill-nodes")
async def get_skill_nodes(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """
    Get auto-generated skill node types.
    
    Returns:
        List of skill NodeTypeSpec objects as dicts
    """
    pass
```

**Implementation Notes:**
- Import `get_skill_node_specs` from `skill_discovery`
- Convert `NodeTypeSpec` dataclasses to dicts for JSON response
- Ensure authentication via `get_current_user` dependency
- No tenant scoping needed (skills are global)

### 4. Registry Integration

**File:** `python-backend/app/orchestrator/node_registry.py` (update)

```python
# Update get_all_node_types to include skill nodes

def get_all_node_types() -> list[NodeTypeSpec]:
    """
    Get all registered node types (core + skills).
    
    Returns:
        Combined list of core and skill node types
    """
    core_types = _get_core_node_types()  # Existing core nodes
    skill_types = get_skill_node_specs()  # New skill nodes
    return core_types + skill_types
```

**Implementation Notes:**
- Merge core and skill nodes into single list
- Preserve existing core node registration logic
- Ensure no duplicate type IDs between core and skill nodes

## Validation

After implementation, verify:

1. **Schema Discovery:**
   - Run discovery function and confirm skill nodes are generated
   - Verify skills without schemas are skipped without errors
   - Check that all expected skills appear (Video Skill, Image Skill, Enhance Prompt, etc.)

2. **Field Mapping:**
   - Confirm all JSON Schema field types map correctly
   - Verify all inputs have `accepts_connection: true`
   - Check that enum fields have options array populated

3. **Executor Integration:**
   - Execute a skill node via the orchestrator
   - Verify inputs are validated against schema
   - Confirm skill execution pipeline is called correctly
   - Check that result and metadata are returned in correct format

4. **API Response:**
   - Call `GET /api/v1/workflow/node-types`
   - Verify skill nodes appear alongside core nodes
   - Confirm response structure matches `NodeTypeSpec` format

5. **Error Handling:**
   - Test with missing schema file (should skip skill)
   - Test with invalid schema JSON (should handle gracefully)
   - Test with invalid input values (should raise validation error)

## Security Considerations

- **Schema Validation:** Always validate inputs against schema before execution to prevent unexpected data types
- **Path Traversal:** When reading skill schemas, sanitize skill IDs to prevent directory traversal attacks
- **Skill Isolation:** Skills execute with tenant context — ensure skill execution respects tenant boundaries
- **Credit Enforcement:** Skills may consume credits (LLM calls, media generation) — ensure credit checks occur

## File Paths Summary

**New Files:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/skill_discovery.py`
- `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/skill_executor.py`
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_skill_nodes.py`

**Modified Files:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflow.py`

## Completion Checklist

- [ ] All tests in `test_skill_nodes.py` written and passing
- [ ] Skill discovery function scans registry and generates node specs
- [ ] Schema-to-input mapping handles all field types correctly
- [ ] All generated inputs have `accepts_connection: true`
- [ ] `SkillExecutor` validates inputs against schema
- [ ] `SkillExecutor` calls existing skill execution pipeline
- [ ] Standard outputs (result + metadata) returned
- [ ] API endpoint returns skill nodes
- [ ] Registry includes skill nodes in `get_all_node_types()`
- [ ] Skills without schemas are gracefully skipped
- [ ] Expected skills (Video, Image, Enhance Prompt, etc.) all appear
- [ ] Error handling tested (missing schema, invalid inputs)
- [ ] Security validated (path traversal, input sanitization)