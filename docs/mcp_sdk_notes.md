# MCP Python SDK Notes

## Installation
```bash
uv add "mcp[cli]"
# or
pip install "mcp[cli]"
```

## Core Concepts

### FastMCP Server
```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Demo", json_response=True)
```

### Tools (POST-like, execute code/side effects)
```python
@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b
```

### Resources (GET-like, provide data)
```python
@mcp.resource("file://documents/{name}")
def read_document(name: str) -> str:
    """Read a document by name."""
    return f"Content of {name}"
```

### Prompts (reusable templates)
```python
@mcp.prompt()
def greet_user(name: str, style: str = "friendly") -> str:
    """Generate a greeting prompt"""
    return f"Please greet {name} in a {style} way."
```

## Transport Options
- stdio (standard input/output)
- SSE (Server-Sent Events)
- Streamable HTTP

## Running Server
```python
if __name__ == "__main__":
    mcp.run(transport="streamable-http")
```

## Context in Tools
```python
from mcp.server.fastmcp import Context

@mcp.tool()
def query_db(ctx: Context) -> str:
    """Tool that uses context."""
    return ctx.request_context.lifespan_context.db.query()
```
