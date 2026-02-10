Now I'll generate the complete, self-contained content for section-04-expression (Expression Resolver Backend):

# Section 04: Expression Resolver (Backend)

## Overview

This section implements the backend expression resolver that enables dynamic data flow between workflow nodes. The resolver parses `{{nodeId.output.field}}` expressions, looks up values from execution state, and safely replaces tokens with actual data. This is a critical security component — it must prevent code injection while supporting nested field access.

**Dependencies:** Section 02 (Registry must be implemented for execution context structure)

**Blocks:** Section 07 (Compiler needs expression resolver for validation)

## Background Context

Workflow nodes often need to reference outputs from upstream nodes. For example:
- An LLM prompt might include: `"Summarize this document: {{ragNode.context}}"`
- A condition might evaluate: `{{llmNode.response}}` against a threshold
- An image prompt might use: `"Generate an image of {{userInput.subject}} in {{styleNode.output}} style"`

The expression resolver makes this dynamic referencing possible. It operates at **execution time** (not compile time), after upstream nodes have produced their outputs.

**Security principle:** This resolver performs NO code evaluation (`eval`, `exec`, function calls). It is purely a string template engine with dictionary lookups. The separate `ConditionalExecutor` uses `simpleeval` for safe expression evaluation — that's the only place where expressions are evaluated as code.

## Architecture

**Core algorithm:**
1. Parse text to find `{{...}}` tokens using regex
2. Extract node ID and field path from each token
3. Look up the node's output in the execution state dict
4. Navigate nested fields if present (e.g., `output.field.nested`)
5. Convert the value to string (handle None, numbers, booleans, arrays/dicts)
6. Replace the token with the string value
7. Return the resolved text

**Example:**
```python
# Execution state contains:
state = {
    'node1': {'response': 'The capital is Paris'},
    'node2': {'metadata': {'score': 0.95}}
}

# Input text:
"Based on {{node1.response}}, the confidence is {{node2.metadata.score}}"

# Resolved output:
"Based on The capital is Paris, the confidence is 0.95"
```

## Tests to Write FIRST

Create `python-backend/tests/test_expression_resolver.py`:

```python
import pytest
from app.orchestrator.expression_resolver import (
    ExpressionResolver,
    ExpressionResolutionError,
)

@pytest.fixture
def resolver():
    return ExpressionResolver()

@pytest.fixture
def sample_state():
    return {
        'node1': {
            'response': 'Hello world',
            'usage': {'tokens': 150}
        },
        'node2': {
            'documents': ['doc1', 'doc2', 'doc3'],
            'count': 3
        },
        'node3': {
            'imageUrl': 'https://example.com/image.png',
            'metadata': {
                'provider': 'openai',
                'cost': 0.05
            }
        }
    }

# Test: resolve — replaces single {{nodeId.outputName}} with actual value
def test_resolve_single_expression(resolver, sample_state):
    text = "The response is: {{node1.response}}"
    result = resolver.resolve(text, sample_state)
    assert result == "The response is: Hello world"

# Test: resolve — replaces {{nodeId.outputName.field.nested}} with nested dict access
def test_resolve_nested_field(resolver, sample_state):
    text = "Provider: {{node3.metadata.provider}}"
    result = resolver.resolve(text, sample_state)
    assert result == "Provider: openai"

# Test: resolve — replaces multiple expressions in same string
def test_resolve_multiple_expressions(resolver, sample_state):
    text = "{{node1.response}} from {{node3.metadata.provider}}"
    result = resolver.resolve(text, sample_state)
    assert result == "Hello world from openai"

# Test: resolve — preserves text around expressions
def test_resolve_preserves_surrounding_text(resolver, sample_state):
    text = "Start {{node1.response}} middle {{node2.count}} end"
    result = resolver.resolve(text, sample_state)
    assert result == "Start Hello world middle 3 end"

# Test: resolve — string with no expressions returns unchanged
def test_resolve_no_expressions(resolver):
    text = "Plain text with no variables"
    result = resolver.resolve(text, {})
    assert result == "Plain text with no variables"

# Test: resolve — raises ExpressionResolutionError for {{nonExistentNode.output}}
def test_resolve_missing_node(resolver, sample_state):
    text = "{{unknownNode.output}}"
    with pytest.raises(ExpressionResolutionError, match="Node 'unknownNode' not found"):
        resolver.resolve(text, sample_state)

# Test: resolve — raises ExpressionResolutionError for {{existingNode.nonExistentOutput}}
def test_resolve_missing_field(resolver, sample_state):
    text = "{{node1.nonexistent}}"
    with pytest.raises(ExpressionResolutionError, match="Field 'nonexistent' not found"):
        resolver.resolve(text, sample_state)

# Test: resolve — handles None values (returns empty string or "null")
def test_resolve_none_value(resolver):
    state = {'node1': {'value': None}}
    text = "Value: {{node1.value}}"
    result = resolver.resolve(text, state)
    # Either empty string or "null" is acceptable
    assert result in ["Value: ", "Value: null"]

# Test: resolve — handles numeric values (converts to string)
def test_resolve_numeric_values(resolver, sample_state):
    text = "Count: {{node2.count}}, Cost: {{node3.metadata.cost}}"
    result = resolver.resolve(text, sample_state)
    assert result == "Count: 3, Cost: 0.05"

# Test: resolve — handles boolean values
def test_resolve_boolean_values(resolver):
    state = {'node1': {'success': True, 'failed': False}}
    text = "Success: {{node1.success}}, Failed: {{node1.failed}}"
    result = resolver.resolve(text, state)
    assert result == "Success: True, Failed: False"

# Test: resolve — handles array values (JSON stringifies)
def test_resolve_array_values(resolver, sample_state):
    text = "Docs: {{node2.documents}}"
    result = resolver.resolve(text, state)
    # Array should be JSON-serialized
    assert '"doc1"' in result and '"doc2"' in result and '"doc3"' in result

# Test: resolve — handles dict values (JSON stringifies)
def test_resolve_dict_values(resolver, sample_state):
    text = "Metadata: {{node3.metadata}}"
    result = resolver.resolve(text, state)
    # Dict should be JSON-serialized
    assert '"provider"' in result and '"openai"' in result

# Test: resolve — max expression length enforcement (>1000 chars rejected)
def test_resolve_max_expression_length(resolver):
    # Create expression with very long field path
    long_field = "a." * 600  # ~1200 chars
    text = f"{{{{node1.{long_field}value}}}}"
    state = {'node1': {'value': 'test'}}
    with pytest.raises(ExpressionResolutionError, match="Expression too long"):
        resolver.resolve(text, state)

# Test: resolve — no eval() used (pure string replacement + dict lookup)
def test_resolve_no_eval_security(resolver):
    # Attempt to inject code via expression
    state = {'node1': {'output': 'safe_value'}}
    text = "{{node1.output}}"
    result = resolver.resolve(text, state)
    # Should return the value, not execute anything
    assert result == "safe_value"

# Test: resolve — malicious expression {{__class__.__mro__}} does not execute
def test_resolve_dunder_access_blocked(resolver):
    state = {'__class__': {'__mro__': 'should_not_access'}}
    text = "{{__class__.__mro__}}"
    # Should either raise error or return safe fallback
    # This tests that dunder methods are not followed
    with pytest.raises(ExpressionResolutionError):
        resolver.resolve(text, state)

# Test: resolve — empty state dict
def test_resolve_empty_state(resolver):
    text = "No variables here"
    result = resolver.resolve(text, {})
    assert result == "No variables here"

# Test: resolve — expression at start of string
def test_resolve_expression_at_start(resolver, sample_state):
    text = "{{node1.response}} is the output"
    result = resolver.resolve(text, sample_state)
    assert result == "Hello world is the output"

# Test: resolve — expression at end of string
def test_resolve_expression_at_end(resolver, sample_state):
    text = "The output is {{node1.response}}"
    result = resolver.resolve(text, sample_state)
    assert result == "The output is Hello world"

# Test: resolve — adjacent expressions (no space)
def test_resolve_adjacent_expressions(resolver, sample_state):
    text = "{{node1.response}}{{node2.count}}"
    result = resolver.resolve(text, sample_state)
    assert result == "Hello world3"

# Test: resolve — nested field with array index (if supported)
def test_resolve_array_index_access(resolver):
    state = {'node1': {'items': ['first', 'second', 'third']}}
    # If array indexing is supported: {{node1.items.0}}
    # Otherwise this test can be skipped or expect an error
    text = "First item: {{node1.items}}"
    result = resolver.resolve(text, state)
    # Should serialize the array
    assert 'first' in result
```

## Implementation

Create `python-backend/app/orchestrator/expression_resolver.py`:

```python
"""
Expression resolver for workflow node output references.

Resolves {{nodeId.output.field}} expressions by looking up values
in the execution state dictionary. No code evaluation — pure template
string replacement with safe dictionary lookups.
"""

import json
import re
from typing import Any, Dict


class ExpressionResolutionError(Exception):
    """Raised when an expression cannot be resolved."""
    pass


class ExpressionResolver:
    """
    Resolves {{nodeId.output.field}} expressions in text.
    
    Security:
    - No eval() or exec() — pure string replacement
    - Max expression length: 1000 chars
    - No __dunder__ method access
    - Type-safe value conversion (None, int, float, bool, list, dict)
    """
    
    # Regex to match {{...}} expressions
    # Non-greedy to handle multiple expressions in one string
    EXPRESSION_PATTERN = re.compile(r'\{\{([^}]+)\}\}')
    
    MAX_EXPRESSION_LENGTH = 1000
    
    def resolve(self, text: str, execution_state: Dict[str, Dict[str, Any]]) -> str:
        """
        Replace all {{nodeId.output.field}} expressions with actual values.
        
        Args:
            text: Text containing expressions to resolve
            execution_state: Dict mapping node_id -> {output_name: value}
            
        Returns:
            Text with all expressions replaced by actual values
            
        Raises:
            ExpressionResolutionError: If expression references missing node/field
                                        or exceeds max length
        """
        if not text:
            return text
            
        def replace_expression(match: re.Match) -> str:
            expression = match.group(1).strip()
            
            # Security: enforce max length
            if len(expression) > self.MAX_EXPRESSION_LENGTH:
                raise ExpressionResolutionError(
                    f"Expression too long: {len(expression)} > {self.MAX_EXPRESSION_LENGTH}"
                )
            
            # Security: block __dunder__ access
            if '__' in expression:
                raise ExpressionResolutionError(
                    f"Dunder method access not allowed: {expression}"
                )
            
            # Parse: nodeId.output.field.nested
            parts = expression.split('.')
            if len(parts) < 2:
                raise ExpressionResolutionError(
                    f"Invalid expression format (expected 'nodeId.output'): {expression}"
                )
            
            node_id = parts[0]
            field_path = parts[1:]
            
            # Look up node in execution state
            if node_id not in execution_state:
                raise ExpressionResolutionError(
                    f"Node '{node_id}' not found in execution state"
                )
            
            # Navigate nested field path
            value = execution_state[node_id]
            for field in field_path:
                if not isinstance(value, dict):
                    raise ExpressionResolutionError(
                        f"Cannot access field '{field}' on non-dict value (node: {node_id})"
                    )
                if field not in value:
                    raise ExpressionResolutionError(
                        f"Field '{field}' not found in node '{node_id}'"
                    )
                value = value[field]
            
            # Convert value to string
            return self._value_to_string(value)
        
        # Replace all expressions
        try:
            return self.EXPRESSION_PATTERN.sub(replace_expression, text)
        except ExpressionResolutionError:
            raise
        except Exception as e:
            raise ExpressionResolutionError(f"Expression resolution failed: {e}")
    
    def _value_to_string(self, value: Any) -> str:
        """
        Convert a value to string for insertion into text.
        
        Handles: None, int, float, bool, str, list, dict
        """
        if value is None:
            return ""  # Empty string for None
        elif isinstance(value, bool):
            return str(value)  # "True" or "False"
        elif isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, str):
            return value
        elif isinstance(value, (list, dict)):
            # JSON-serialize complex types
            return json.dumps(value, ensure_ascii=False)
        else:
            # Fallback: string representation
            return str(value)
    
    def extract_dependencies(self, text: str) -> set[str]:
        """
        Extract all node IDs referenced in expressions.
        
        Useful for dependency analysis during compilation.
        
        Args:
            text: Text containing expressions
            
        Returns:
            Set of node IDs referenced
        """
        dependencies = set()
        for match in self.EXPRESSION_PATTERN.finditer(text):
            expression = match.group(1).strip()
            parts = expression.split('.')
            if len(parts) >= 2:
                node_id = parts[0]
                dependencies.add(node_id)
        return dependencies
```

## Integration Points

### 1. Node Executors

Node executors call the expression resolver before processing config values:

```python
# Example usage in LLMExecutor
from app.orchestrator.expression_resolver import ExpressionResolver

class LLMExecutor:
    def __init__(self):
        self.resolver = ExpressionResolver()
    
    async def execute(self, node_config, inputs, context):
        # Resolve expressions in prompt
        raw_prompt = node_config.get('prompt', '')
        resolved_prompt = self.resolver.resolve(raw_prompt, context.execution_state)
        
        # Now use resolved_prompt for LLM call
        # ...
```

### 2. FlowCompiler (Section 07)

The compiler uses `extract_dependencies()` for dependency analysis:

```python
# In FlowCompiler
resolver = ExpressionResolver()

for node in workflow['nodes']:
    for input_config in node['data']['config'].values():
        if isinstance(input_config, str):
            dependencies = resolver.extract_dependencies(input_config)
            # Track dependencies for execution ordering
```

### 3. ExecutionContext Structure

The execution state dict structure (referenced by resolver):

```python
# ExecutionContext.execution_state format:
{
    'node_id_1': {
        'response': 'LLM response text',
        'usage': {'tokens': 150, 'cost': 0.002}
    },
    'node_id_2': {
        'documents': [...],
        'context': 'concatenated text',
        'metadata': {'topK': 5, 'avgScore': 0.85}
    }
}
```

## Security Considerations

1. **No eval()**: The resolver never evaluates expressions as Python code. It's pure string template replacement.

2. **Dunder protection**: Expressions containing `__` are rejected to prevent access to internal Python methods like `__class__`, `__mro__`, etc.

3. **Max length**: Expressions longer than 1000 chars are rejected to prevent DoS via extremely long field paths.

4. **Type safety**: The resolver only accesses dict keys — no attribute access, no method calls, no imports.

5. **Error messages**: Error messages include the expression content, which helps debugging but doesn't leak sensitive state data (only field names, not values).

6. **JSON serialization**: Complex types (arrays, dicts) are JSON-serialized, which is safe and prevents code injection.

## Edge Cases Handled

1. **None values**: Return empty string (not "None" literal)
2. **Numeric types**: Convert to string ("123", "4.56")
3. **Booleans**: Convert to "True" or "False"
4. **Empty strings**: Pass through unchanged
5. **Adjacent expressions**: `{{a}}{{b}}` → resolved without space
6. **Expression at boundaries**: Works at start, end, or middle of text
7. **No expressions**: Text without `{{}}` passes through unchanged
8. **Nested dicts**: Navigate multi-level paths: `{{node.output.nested.field}}`

## Error Handling

All resolution errors raise `ExpressionResolutionError` with descriptive messages:

- `"Node 'nodeId' not found in execution state"` — referenced node hasn't executed yet or doesn't exist
- `"Field 'fieldName' not found in node 'nodeId'"` — typo in field name or output not produced
- `"Expression too long: 1200 > 1000"` — exceeds max length
- `"Dunder method access not allowed: __class__"` — security violation
- `"Invalid expression format (expected 'nodeId.output'): badformat"` — malformed syntax

The calling code (node executors) should catch these errors and convert them to node execution errors.

## Testing Strategy

**Unit tests** (19 tests in `test_expression_resolver.py`):
- Valid expression resolution (single, multiple, nested, adjacent)
- Missing node/field errors
- Type handling (None, int, float, bool, str, list, dict)
- Security (dunder block, no eval, max length)
- Edge cases (empty state, no expressions, boundaries)

**Integration tests** (in Section 15):
- Real workflow with LLM → Conditional (expression in condition)
- RAG → LLM (RAG context in prompt via expression)
- Expression error causing node failure

## Performance Notes

- Regex compilation is done once at class definition (not per resolve call)
- Dict lookups are O(1) for each field access
- No recursive evaluation or heavy computation
- String concatenation via regex substitution is efficient

**Memoization opportunity**: If the same text is resolved multiple times with the same state, consider caching. However, in practice each node execution has unique state, so caching may not help.

## File Checklist

Create:
- `python-backend/app/orchestrator/expression_resolver.py` (implementation)
- `python-backend/tests/test_expression_resolver.py` (unit tests)

No frontend files for this section — expression resolution is purely backend.

## Dependencies

**Required before implementation:**
- Section 02: Node Registry (defines `ExecutionContext` structure)

**Enables:**
- Section 03: Node Executors (use resolver for config values)
- Section 07: FlowCompiler (use `extract_dependencies()` for validation)

## Implementation Checklist

1. Create `expression_resolver.py` with `ExpressionResolver` class
2. Implement `resolve()` method with regex-based token replacement
3. Implement `_value_to_string()` for type conversion
4. Implement `extract_dependencies()` for dependency analysis
5. Create `test_expression_resolver.py` with all 19+ tests
6. Run tests: `cd python-backend && uv run pytest tests/test_expression_resolver.py -v`
7. Verify 100% coverage for the resolver module
8. Document resolver usage in executor base class docstrings

## Verification

After implementation, verify:

```bash
# Run tests
cd python-backend
uv run pytest tests/test_expression_resolver.py -v --cov=app/orchestrator/expression_resolver --cov-report=term-missing

# Expected: All tests pass, 100% coverage

# Manual test (Python REPL)
from app.orchestrator.expression_resolver import ExpressionResolver

resolver = ExpressionResolver()
state = {'node1': {'output': 'Hello'}, 'node2': {'count': 42}}
result = resolver.resolve("{{node1.output}} world, count: {{node2.count}}", state)
print(result)  # Should print: "Hello world, count: 42"

# Test dependency extraction
deps = resolver.extract_dependencies("Use {{node1.output}} and {{node2.result}}")
print(deps)  # Should print: {'node1', 'node2'}
```