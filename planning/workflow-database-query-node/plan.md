# Database Query Workflow Node Executor - Implementation Plan

## Problem Statement

The workflow engine needs a `database_query` node that lets users execute SQL queries (SELECT, INSERT, UPDATE, DELETE) against PostgreSQL databases from within a workflow. This node must be production-ready with strong SQL injection prevention, statement type validation, timeout handling, and proper output structure.

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/orchestrator/node_executors/data_executors/database_query_executor.py` | CREATE | Core executor implementation |
| `python-backend/app/orchestrator/node_registry.py` | MODIFY | Register `database_query` node type |
| `python-backend/app/orchestrator/node_executors/data_executors/__init__.py` | MODIFY | Export new executor |
| `python-backend/tests/test_database_query_executor.py` | CREATE | Unit and integration tests |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| SQL injection via user-provided query | CRITICAL | Parameterized queries only; regex-based DDL blocking; `{{param}}` resolved before binding |
| DDL execution (DROP TABLE, etc.) | CRITICAL | Whitelist allowed statement prefixes; reject anything not SELECT/INSERT/UPDATE/DELETE |
| Unbounded SELECT results causing OOM | HIGH | Enforce `maxRows` via `LIMIT` injection; default 1000 |
| Query timeout causing worker starvation | HIGH | `statement_timeout` SET per-session; asyncio.wait_for wrapper |
| Connection pool exhaustion | MEDIUM | Dedicated short-lived session; explicit close in finally block |
| Privilege escalation via GRANT/REVOKE | HIGH | Block all DCL statements in validation |

---

## 1. File Structure and Imports

### `python-backend/app/orchestrator/node_executors/data_executors/database_query_executor.py`

```python
"""Database Query Executor - Execute SQL queries against PostgreSQL."""
import re
import time
import asyncio
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.exc import (
    DBAPIError,
    IntegrityError,
    OperationalError,
    ProgrammingError,
    StatementError,
)

from app.core.database import AsyncSessionLocal, get_db_context
from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()
```

**Key design decisions:**
- Uses `AsyncSessionLocal` from existing `app.core.database` (not creating new engines).
- Uses `sqlalchemy.text()` for all query execution (parameterized binding).
- Uses `ExpressionResolver` for `{{param}}` template resolution in the query string before execution.
- Does NOT use string interpolation or f-strings for any user-supplied values in SQL.

---

## 2. SQL Injection Prevention Strategy

### Layer 1: Statement Type Validation (blocklist + allowlist)

Before any query reaches the database engine, validate it at the string level:

```python
class SQLValidator:
    """Validates and classifies SQL statements for safe execution."""

    # Allowed statement types (case-insensitive, after stripping comments/whitespace)
    ALLOWED_PREFIXES = {"SELECT", "INSERT", "UPDATE", "DELETE", "WITH"}

    # Explicitly blocked keywords that must NEVER appear in user queries
    BLOCKED_KEYWORDS = re.compile(
        r"\b("
        r"CREATE|ALTER|DROP|TRUNCATE|RENAME|"            # DDL
        r"GRANT|REVOKE|"                                  # DCL
        r"EXEC|EXECUTE|CALL|"                             # Stored procedures
        r"COPY|LOAD|INTO\s+OUTFILE|INTO\s+DUMPFILE|"     # File I/O
        r"pg_sleep|pg_terminate_backend|"                 # Dangerous functions
        r"SET\s+ROLE|SET\s+SESSION|RESET\s+ROLE|"         # Role switching
        r"LISTEN|NOTIFY|UNLISTEN|"                        # Async notifications
        r"VACUUM|ANALYZE|REINDEX|CLUSTER|"                # Maintenance
        r"DO\s*\$|BEGIN(?!\s)"                            # Anonymous code blocks
        r")\b",
        re.IGNORECASE,
    )

    # SQL comment patterns to strip before validation
    COMMENT_PATTERN = re.compile(
        r"(--[^\n]*)|(/\*[\s\S]*?\*/)",
        re.MULTILINE,
    )

    @classmethod
    def strip_comments(cls, query: str) -> str:
        """Remove SQL comments to prevent bypass via comment injection."""
        return cls.COMMENT_PATTERN.sub("", query).strip()

    @classmethod
    def validate(cls, query: str, declared_type: str) -> tuple[bool, str]:
        """
        Validate a SQL query for safety.

        Args:
            query: The raw SQL string (after expression resolution).
            declared_type: The query type declared by the user config
                           ("select", "insert", "update", "delete").

        Returns:
            (is_valid, error_message) tuple.
        """
        if not query or not query.strip():
            return False, "Query cannot be empty"

        cleaned = cls.strip_comments(query)
        if not cleaned:
            return False, "Query cannot be empty after removing comments"

        # Check for blocked keywords
        blocked_match = cls.BLOCKED_KEYWORDS.search(cleaned)
        if blocked_match:
            return False, (
                f"Blocked SQL keyword detected: '{blocked_match.group()}'. "
                f"Only SELECT, INSERT, UPDATE, DELETE statements are allowed."
            )

        # Check for multiple statements (prevent piggyback injection)
        # Allow semicolons only at the very end
        stripped_trailing = cleaned.rstrip(";").strip()
        if ";" in stripped_trailing:
            return False, (
                "Multiple SQL statements are not allowed. "
                "Remove semicolons between statements."
            )

        # Validate statement prefix matches declared type
        first_keyword = cleaned.split()[0].upper() if cleaned.split() else ""

        # WITH ... SELECT is valid for CTEs
        if first_keyword == "WITH" and declared_type == "select":
            # Ensure it ends in a SELECT, not INSERT/UPDATE/DELETE
            # (WITH ... INSERT is valid SQL but we restrict it)
            pass  # Allow CTEs for SELECT
        elif first_keyword != declared_type.upper():
            return False, (
                f"Query type mismatch: declared '{declared_type}' but "
                f"query starts with '{first_keyword}'"
            )

        # Verify the prefix is in our allowed set
        if first_keyword not in cls.ALLOWED_PREFIXES:
            return False, (
                f"Statement type '{first_keyword}' is not allowed. "
                f"Only SELECT, INSERT, UPDATE, DELETE are permitted."
            )

        return True, ""
```

### Layer 2: Parameterized Queries via SQLAlchemy `text()`

User-supplied parameter values are NEVER interpolated into the query string. They are bound via SQLAlchemy's `:param_name` syntax:

```python
# User provides:
#   query: "SELECT * FROM users WHERE id = :user_id AND status = :status"
#   parameters: {"user_id": 42, "status": "active"}

# Execution:
result = await session.execute(
    text(query),         # <-- query string with :param placeholders
    parameters,          # <-- dict of param values, bound safely by driver
)
```

### Layer 3: Expression Resolution BEFORE Parameter Binding

The `{{node.output.field}}` expressions are resolved first (they produce literal values from the workflow state). These resolved values are then placed into the `parameters` dict, NOT into the SQL string:

```python
# Config provides:
#   query: "SELECT * FROM orders WHERE customer_id = :cid"
#   parameters: {"cid": "{{previous_node.customerId}}"}

# Step 1: Resolve expressions in parameters dict
resolver = ExpressionResolver()
resolved_params = {}
for key, value in raw_parameters.items():
    if isinstance(value, str):
        resolved_params[key] = resolver.resolve(value, state)
    else:
        resolved_params[key] = value

# Step 2: Execute with resolved params (never in the SQL string)
result = await session.execute(text(query), resolved_params)
```

### Layer 4: Query String Expression Resolution

If `{{expressions}}` appear in the query text itself (e.g., table names from dynamic context), they are resolved but then re-validated through the full SQL validation pipeline:

```python
# Resolve expressions in query text
resolved_query = resolver.resolve(raw_query, state)

# Re-validate after resolution (expressions could have injected SQL)
is_valid, error = SQLValidator.validate(resolved_query, query_type)
if not is_valid:
    raise ValueError(error)
```

---

## 3. Statement Type Validation Logic

The validation follows a defense-in-depth approach:

```
User Input
    |
    v
[1. Strip SQL comments]  -- Prevents /* */ and -- based bypass
    |
    v
[2. Resolve {{expressions}}]  -- Template variables become concrete values
    |
    v
[3. Check blocked keywords]  -- CREATE, DROP, ALTER, TRUNCATE, etc.
    |
    v
[4. Check multi-statement]  -- No semicolons except trailing
    |
    v
[5. Match declared type]  -- "select" config must start with SELECT
    |
    v
[6. Verify allowed prefix]  -- Must be SELECT|INSERT|UPDATE|DELETE|WITH
    |
    v
[7. Inject LIMIT for SELECT]  -- Enforce maxRows cap
    |
    v
[8. Set statement_timeout]  -- Per-session PostgreSQL timeout
    |
    v
[9. Execute via text() + params]  -- Parameterized, no interpolation
```

### LIMIT Injection for SELECT

For SELECT queries, if the user has not already included a LIMIT clause, one is injected:

```python
def _inject_limit(self, query: str, max_rows: int) -> str:
    """Inject LIMIT clause for SELECT queries if not already present."""
    cleaned = query.rstrip(";").strip()
    # Check if LIMIT already exists (case-insensitive)
    if re.search(r"\bLIMIT\s+\d+", cleaned, re.IGNORECASE):
        # User already has LIMIT -- ensure it doesn't exceed maxRows
        def cap_limit(match):
            user_limit = int(match.group(1))
            return f"LIMIT {min(user_limit, max_rows)}"
        return re.sub(
            r"\bLIMIT\s+(\d+)",
            cap_limit,
            cleaned,
            flags=re.IGNORECASE,
        )
    else:
        return f"{cleaned} LIMIT {max_rows}"
```

---

## 4. Registry Spec with All Config Fields

Add to `_register_core_nodes()` in `node_registry.py`:

```python
# Database Query Node
self.register_node_type(
    NodeTypeSpec(
        type="database_query",
        display_name="Database Query",
        description="Execute SQL queries against a PostgreSQL database",
        icon="database",
        color="teal",
        category="data",
        inputs=[
            InputSpec(
                name="queryType",
                display_name="Query Type",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="select",
                options=[
                    {"label": "SELECT (Read)", "value": "select"},
                    {"label": "INSERT (Create)", "value": "insert"},
                    {"label": "UPDATE (Modify)", "value": "update"},
                    {"label": "DELETE (Remove)", "value": "delete"},
                ],
            ),
            InputSpec(
                name="query",
                display_name="SQL Query",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder=(
                    "SELECT * FROM users WHERE status = :status\n"
                    "-- Use :param_name for parameters"
                ),
            ),
            InputSpec(
                name="parameters",
                display_name="Query Parameters",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                default={},
                placeholder='{"status": "active", "limit": 10}',
            ),
            InputSpec(
                name="database",
                display_name="Database",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="primary",
                options=[
                    {"label": "Primary (Default)", "value": "primary"},
                    {"label": "Secondary (Read Replica)", "value": "secondary"},
                ],
            ),
            InputSpec(
                name="timeout",
                display_name="Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=30,
                validation={"min": 1, "max": 300},
            ),
            InputSpec(
                name="maxRows",
                display_name="Max Rows (SELECT only)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1000,
                validation={"min": 1, "max": 10000},
            ),
        ],
        outputs=[
            OutputSpec(name="rows", display_name="Result Rows", data_type="array"),
            OutputSpec(name="affectedRows", display_name="Affected Rows", data_type="number"),
            OutputSpec(name="lastInsertId", display_name="Last Insert ID", data_type="number"),
            OutputSpec(name="executionTime", display_name="Execution Time (ms)", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.database_query_executor.DatabaseQueryExecutor",
    )
)
```

---

## 5. Complete Executor Implementation

```python
class DatabaseQueryExecutor:
    """
    Executor for database_query workflow nodes.

    Executes parameterized SQL queries against PostgreSQL with:
    - SQL injection prevention (parameterized queries, no string interpolation)
    - Statement type validation (only SELECT/INSERT/UPDATE/DELETE)
    - DDL/DCL blocking (no CREATE, DROP, ALTER, GRANT, etc.)
    - Timeout enforcement (PostgreSQL statement_timeout + asyncio)
    - Row limit enforcement for SELECT queries
    - Structured error handling for all SQL error categories
    """

    def __init__(self):
        self._resolver = ExpressionResolver()

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute a database query node."""
        config = data.config
        inputs = data.inputs
        state = data.state

        # Extract configuration
        query_type = (config.get("queryType") or inputs.get("queryType", "select")).lower()
        raw_query = config.get("query") or inputs.get("query", "")
        raw_parameters = config.get("parameters") or inputs.get("parameters", {})
        database = config.get("database", "primary")
        timeout_seconds = int(config.get("timeout", 30))
        max_rows = int(config.get("maxRows", 1000))

        # Validate query type
        if query_type not in ("select", "insert", "update", "delete"):
            return self._error_result(
                f"Invalid query type: '{query_type}'. "
                f"Must be one of: select, insert, update, delete"
            )

        # Resolve {{expressions}} in query text
        try:
            resolved_query = self._resolver.resolve(raw_query, state)
        except ValueError as e:
            return self._error_result(f"Expression resolution failed: {e}")

        # Resolve {{expressions}} in parameter values
        resolved_params = self._resolve_parameters(raw_parameters, state)

        # Validate SQL statement
        is_valid, error_msg = SQLValidator.validate(resolved_query, query_type)
        if not is_valid:
            return self._error_result(f"SQL validation failed: {error_msg}")

        # Inject LIMIT for SELECT queries
        if query_type == "select":
            resolved_query = self._inject_limit(resolved_query, max_rows)

        # Execute query
        start_time = time.monotonic()
        try:
            result = await asyncio.wait_for(
                self._execute_query(
                    query=resolved_query,
                    params=resolved_params,
                    query_type=query_type,
                    timeout_seconds=timeout_seconds,
                    database=database,
                ),
                timeout=timeout_seconds + 5,  # asyncio timeout slightly longer than DB timeout
            )
            execution_time_ms = round((time.monotonic() - start_time) * 1000, 2)
            result["executionTime"] = execution_time_ms

            logger.info(
                "database_query_executed",
                node_id=data.node_id,
                query_type=query_type,
                execution_time_ms=execution_time_ms,
                workflow_id=context.workflow_id,
                affected_rows=result.get("affectedRows", 0),
                row_count=len(result.get("rows", [])),
            )

            return result

        except asyncio.TimeoutError:
            execution_time_ms = round((time.monotonic() - start_time) * 1000, 2)
            return self._error_result(
                f"Query timed out after {timeout_seconds} seconds",
                execution_time_ms=execution_time_ms,
            )
        except Exception as e:
            execution_time_ms = round((time.monotonic() - start_time) * 1000, 2)
            return self._handle_db_error(e, execution_time_ms)

    async def _execute_query(
        self,
        query: str,
        params: dict[str, Any],
        query_type: str,
        timeout_seconds: int,
        database: str,
    ) -> dict[str, Any]:
        """Execute the actual SQL query within an async session."""
        # Get session factory (currently only 'primary' is supported)
        session_factory = AsyncSessionLocal  # TODO: support secondary/custom

        async with session_factory() as session:
            try:
                # Set statement timeout for this session
                await session.execute(
                    text(f"SET statement_timeout = '{timeout_seconds * 1000}'")
                )

                # Execute the query
                result = await session.execute(text(query), params)

                if query_type == "select":
                    # Fetch all rows as dicts
                    rows = [dict(row._mapping) for row in result.fetchall()]
                    await session.rollback()  # SELECT should not commit
                    return {
                        "rows": rows,
                        "affectedRows": 0,
                        "lastInsertId": None,
                    }
                else:
                    # INSERT/UPDATE/DELETE
                    affected_rows = result.rowcount or 0

                    # For INSERT with RETURNING, capture returned rows
                    last_insert_id = None
                    returned_rows = []
                    if query_type == "insert":
                        try:
                            returned = result.fetchall()
                            returned_rows = [dict(row._mapping) for row in returned]
                            if returned_rows and "id" in returned_rows[0]:
                                last_insert_id = returned_rows[0]["id"]
                        except Exception:
                            # No RETURNING clause -- that's fine
                            pass

                    await session.commit()

                    return {
                        "rows": returned_rows,
                        "affectedRows": affected_rows,
                        "lastInsertId": last_insert_id,
                    }

            except Exception:
                await session.rollback()
                raise

    def _resolve_parameters(
        self, raw_params: dict[str, Any], state: dict[str, Any]
    ) -> dict[str, Any]:
        """Resolve {{expressions}} in parameter values."""
        if not raw_params or not isinstance(raw_params, dict):
            return {}

        resolved = {}
        for key, value in raw_params.items():
            if isinstance(value, str):
                resolved[key] = self._resolver.resolve(value, state)
            else:
                resolved[key] = value
        return resolved

    def _inject_limit(self, query: str, max_rows: int) -> str:
        """Inject or cap LIMIT clause for SELECT queries."""
        cleaned = query.rstrip(";").strip()

        if re.search(r"\bLIMIT\s+\d+", cleaned, re.IGNORECASE):
            def cap_limit(match):
                user_limit = int(match.group(1))
                return f"LIMIT {min(user_limit, max_rows)}"
            return re.sub(
                r"\bLIMIT\s+(\d+)",
                cap_limit,
                cleaned,
                flags=re.IGNORECASE,
            )
        else:
            return f"{cleaned} LIMIT {max_rows}"

    def _error_result(
        self, message: str, execution_time_ms: float = 0
    ) -> dict[str, Any]:
        """Return a standardized error result."""
        return {
            "rows": [],
            "affectedRows": 0,
            "lastInsertId": None,
            "executionTime": execution_time_ms,
            "error": message,
        }

    def _handle_db_error(
        self, exc: Exception, execution_time_ms: float
    ) -> dict[str, Any]:
        """Convert database exceptions to structured error results."""
        if isinstance(exc, IntegrityError):
            # Unique constraint, foreign key, check constraint violations
            return self._error_result(
                f"Constraint violation: {self._sanitize_error(exc)}",
                execution_time_ms,
            )
        elif isinstance(exc, ProgrammingError):
            # SQL syntax errors, invalid column/table references
            return self._error_result(
                f"SQL error: {self._sanitize_error(exc)}",
                execution_time_ms,
            )
        elif isinstance(exc, OperationalError):
            # Connection errors, timeout, permission denied
            error_str = str(exc).lower()
            if "timeout" in error_str or "cancel" in error_str:
                return self._error_result(
                    "Query execution timed out",
                    execution_time_ms,
                )
            return self._error_result(
                f"Database connection error: {self._sanitize_error(exc)}",
                execution_time_ms,
            )
        elif isinstance(exc, StatementError):
            # Parameter binding errors
            return self._error_result(
                f"Parameter binding error: {self._sanitize_error(exc)}",
                execution_time_ms,
            )
        else:
            logger.error(
                "database_query_unexpected_error",
                error=str(exc),
                error_type=type(exc).__name__,
            )
            return self._error_result(
                f"Unexpected database error: {type(exc).__name__}",
                execution_time_ms,
            )

    def _sanitize_error(self, exc: Exception) -> str:
        """
        Sanitize database error messages to avoid leaking internal details.
        Remove connection strings, file paths, and internal PostgreSQL details.
        """
        msg = str(exc)
        # Remove connection string details
        msg = re.sub(r"postgresql://[^\s]+", "postgresql://***", msg)
        # Remove file paths
        msg = re.sub(r"/[^\s]*\.py", "<internal>", msg)
        # Truncate to reasonable length
        if len(msg) > 500:
            msg = msg[:500] + "..."
        return msg
```

---

## 6. Example Queries for Testing

### 6.1 SELECT Queries

```python
# Basic SELECT
{
    "queryType": "select",
    "query": "SELECT id, name, email FROM users WHERE status = :status",
    "parameters": {"status": "active"},
    "maxRows": 100,
}
# Expected output: {"rows": [...], "affectedRows": 0, "lastInsertId": None, "executionTime": 12.5}

# SELECT with expression parameter
{
    "queryType": "select",
    "query": "SELECT * FROM orders WHERE customer_id = :cid",
    "parameters": {"cid": "{{previous_node.customerId}}"},
    "maxRows": 50,
}

# SELECT with CTE
{
    "queryType": "select",
    "query": "WITH recent AS (SELECT * FROM logs WHERE created_at > :since) SELECT count(*) FROM recent",
    "parameters": {"since": "2026-01-01"},
}
```

### 6.2 INSERT Queries

```python
# INSERT with RETURNING
{
    "queryType": "insert",
    "query": "INSERT INTO audit_log (action, user_id, details) VALUES (:action, :uid, :details) RETURNING id",
    "parameters": {"action": "workflow_run", "uid": 42, "details": "test run"},
}
# Expected output: {"rows": [{"id": 123}], "affectedRows": 1, "lastInsertId": 123, "executionTime": 5.2}
```

### 6.3 UPDATE Queries

```python
# UPDATE with affected row count
{
    "queryType": "update",
    "query": "UPDATE users SET last_login = NOW() WHERE id = :uid",
    "parameters": {"uid": "{{trigger.userId}}"},
}
# Expected output: {"rows": [], "affectedRows": 1, "lastInsertId": None, "executionTime": 3.1}
```

### 6.4 DELETE Queries

```python
# DELETE with constraint check
{
    "queryType": "delete",
    "query": "DELETE FROM temp_tokens WHERE expires_at < NOW()",
    "parameters": {},
}
# Expected output: {"rows": [], "affectedRows": 15, "lastInsertId": None, "executionTime": 8.7}
```

### 6.5 Rejection Cases (Must Fail Validation)

```python
# DDL attempt
{"queryType": "select", "query": "DROP TABLE users; SELECT 1", "parameters": {}}
# Expected: error "Blocked SQL keyword detected: 'DROP'"

# Multi-statement injection
{"queryType": "select", "query": "SELECT 1; DELETE FROM users", "parameters": {}}
# Expected: error "Multiple SQL statements are not allowed"

# Type mismatch
{"queryType": "select", "query": "DELETE FROM users WHERE id = 1", "parameters": {}}
# Expected: error "Query type mismatch: declared 'select' but query starts with 'DELETE'"

# Comment bypass attempt
{"queryType": "select", "query": "SELECT 1 /* ; DROP TABLE users */", "parameters": {}}
# Expected: passes (comments stripped, remaining is valid SELECT)

# Comment-hidden DDL
{"queryType": "select", "query": "-- legitimate query\nDROP TABLE users", "parameters": {}}
# Expected: error "Blocked SQL keyword detected: 'DROP'" (comment stripped, DROP exposed)
```

---

## 7. Security Validation Checklist

### Pre-Implementation Review

- [ ] All user-supplied values go through SQLAlchemy `text()` parameter binding -- never string concatenation
- [ ] `{{expression}}` values resolve into the parameters dict, not into the SQL string (except for dynamic table/column references which are re-validated)
- [ ] SQL comments are stripped before validation to prevent bypass
- [ ] Multiple statements (`;` in middle of query) are rejected
- [ ] DDL keywords (CREATE, ALTER, DROP, TRUNCATE, RENAME) are blocked
- [ ] DCL keywords (GRANT, REVOKE) are blocked
- [ ] Dangerous functions (pg_sleep, pg_terminate_backend) are blocked
- [ ] Role switching (SET ROLE, SET SESSION) is blocked
- [ ] File I/O (COPY, LOAD, INTO OUTFILE) is blocked
- [ ] Anonymous code blocks (DO $$ ... $$) are blocked
- [ ] Statement type prefix must match declared `queryType`
- [ ] SELECT queries always have LIMIT enforcement (default 1000, max 10000)
- [ ] Per-session `statement_timeout` is set before every query
- [ ] asyncio.wait_for provides a secondary timeout safety net
- [ ] Database error messages are sanitized (no connection strings, file paths)
- [ ] Session is always closed in finally block (via async context manager)
- [ ] Session is always rolled back on error
- [ ] SELECT queries use rollback (not commit) to prevent accidental writes

### Post-Implementation Testing

- [ ] Parameterized query with `:param` binding works correctly
- [ ] `{{expression}}` resolution in parameters works correctly
- [ ] DDL injection is blocked (DROP TABLE, CREATE INDEX, etc.)
- [ ] Multi-statement injection is blocked
- [ ] Comment-based bypass is blocked
- [ ] Query type mismatch is detected
- [ ] LIMIT is injected for SELECT without LIMIT
- [ ] LIMIT is capped for SELECT with excessive LIMIT
- [ ] Timeout fires correctly for slow queries
- [ ] IntegrityError (unique constraint) returns structured error
- [ ] ProgrammingError (bad SQL) returns structured error
- [ ] OperationalError (connection failure) returns structured error
- [ ] Empty query is rejected
- [ ] Empty-after-comment-stripping query is rejected
- [ ] Node registers correctly in NodeRegistry
- [ ] Node appears in `/api/v1/workflow/node-types` endpoint

---

## 8. Test Plan

### `python-backend/tests/test_database_query_executor.py`

```python
"""Tests for DatabaseQueryExecutor."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.data_executors.database_query_executor import (
    DatabaseQueryExecutor,
    SQLValidator,
)


# ===== SQLValidator Unit Tests =====

class TestSQLValidator:
    """Test SQL validation logic in isolation."""

    def test_valid_select(self):
        valid, err = SQLValidator.validate("SELECT * FROM users", "select")
        assert valid is True

    def test_valid_insert(self):
        valid, err = SQLValidator.validate(
            "INSERT INTO logs (msg) VALUES (:msg)", "insert"
        )
        assert valid is True

    def test_valid_update(self):
        valid, err = SQLValidator.validate(
            "UPDATE users SET name = :name WHERE id = :id", "update"
        )
        assert valid is True

    def test_valid_delete(self):
        valid, err = SQLValidator.validate(
            "DELETE FROM sessions WHERE expired = true", "delete"
        )
        assert valid is True

    def test_valid_cte_select(self):
        valid, err = SQLValidator.validate(
            "WITH cte AS (SELECT 1) SELECT * FROM cte", "select"
        )
        assert valid is True

    def test_rejects_empty_query(self):
        valid, err = SQLValidator.validate("", "select")
        assert valid is False
        assert "empty" in err.lower()

    def test_rejects_ddl_drop(self):
        valid, err = SQLValidator.validate("DROP TABLE users", "select")
        assert valid is False
        assert "DROP" in err

    def test_rejects_ddl_create(self):
        valid, err = SQLValidator.validate("CREATE TABLE foo (id int)", "select")
        assert valid is False

    def test_rejects_ddl_alter(self):
        valid, err = SQLValidator.validate("ALTER TABLE users ADD COLUMN x int", "select")
        assert valid is False

    def test_rejects_ddl_truncate(self):
        valid, err = SQLValidator.validate("TRUNCATE users", "delete")
        assert valid is False

    def test_rejects_dcl_grant(self):
        valid, err = SQLValidator.validate("GRANT ALL ON users TO public", "select")
        assert valid is False

    def test_rejects_multi_statement(self):
        valid, err = SQLValidator.validate("SELECT 1; DELETE FROM users", "select")
        assert valid is False
        assert "Multiple" in err

    def test_rejects_type_mismatch(self):
        valid, err = SQLValidator.validate("DELETE FROM users", "select")
        assert valid is False
        assert "mismatch" in err.lower()

    def test_strips_comments_before_validation(self):
        # DDL hidden in comment should be stripped, revealing just SELECT
        valid, err = SQLValidator.validate(
            "SELECT 1 /* DROP TABLE users */", "select"
        )
        assert valid is True

    def test_strips_line_comments(self):
        valid, err = SQLValidator.validate(
            "-- comment\nSELECT 1", "select"
        )
        assert valid is True

    def test_comment_hidden_ddl_exposed(self):
        # After comment stripping, DROP is the actual statement
        valid, err = SQLValidator.validate(
            "-- safe query\nDROP TABLE users", "select"
        )
        assert valid is False

    def test_rejects_pg_sleep(self):
        valid, err = SQLValidator.validate(
            "SELECT pg_sleep(100)", "select"
        )
        assert valid is False

    def test_rejects_set_role(self):
        valid, err = SQLValidator.validate(
            "SET ROLE admin", "select"
        )
        assert valid is False

    def test_rejects_copy(self):
        valid, err = SQLValidator.validate(
            "COPY users TO '/tmp/out.csv'", "select"
        )
        assert valid is False

    def test_allows_trailing_semicolon(self):
        valid, err = SQLValidator.validate("SELECT 1;", "select")
        assert valid is True


# ===== DatabaseQueryExecutor Unit Tests =====

class TestDatabaseQueryExecutor:
    """Test executor logic with mocked database."""

    @pytest.fixture
    def executor(self):
        return DatabaseQueryExecutor()

    @pytest.fixture
    def context(self):
        return ExecutionContext(
            user_id=1,
            tenant_id="test",
            workflow_id="wf-1",
            execution_id="exec-1",
        )

    def _make_data(self, **overrides):
        defaults = {
            "node_id": "node-1",
            "node_type": "database_query",
            "config": {
                "queryType": "select",
                "query": "SELECT 1",
                "parameters": {},
                "timeout": 30,
                "maxRows": 1000,
            },
            "inputs": {},
            "state": {},
        }
        defaults.update(overrides)
        return NodeExecutionData(**defaults)

    @pytest.mark.asyncio
    async def test_rejects_invalid_query_type(self, executor, context):
        data = self._make_data(config={"queryType": "drop", "query": "DROP TABLE x"})
        result = await executor.execute(data, context)
        assert "error" in result
        assert "Invalid query type" in result["error"]

    @pytest.mark.asyncio
    async def test_rejects_ddl_in_query(self, executor, context):
        data = self._make_data(config={
            "queryType": "select",
            "query": "DROP TABLE users",
        })
        result = await executor.execute(data, context)
        assert "error" in result
        assert "Blocked" in result["error"] or "mismatch" in result["error"]

    @pytest.mark.asyncio
    async def test_limit_injection(self, executor, context):
        query = "SELECT * FROM users"
        limited = executor._inject_limit(query, 100)
        assert "LIMIT 100" in limited

    @pytest.mark.asyncio
    async def test_limit_capping(self, executor, context):
        query = "SELECT * FROM users LIMIT 99999"
        capped = executor._inject_limit(query, 1000)
        assert "LIMIT 1000" in capped

    @pytest.mark.asyncio
    async def test_expression_resolution_in_params(self, executor, context):
        state = {"prev": {"userId": 42}}
        resolved = executor._resolve_parameters(
            {"uid": "{{prev.userId}}"}, state
        )
        assert resolved["uid"] == "42"
```

---

## 9. Implementation Steps (Ordered)

### Step 1: Create `database_query_executor.py`
- Implement `SQLValidator` class
- Implement `DatabaseQueryExecutor` class
- All methods as documented above

### Step 2: Update `data_executors/__init__.py`
- Add import for `DatabaseQueryExecutor`

### Step 3: Register node in `node_registry.py`
- Add `database_query` NodeTypeSpec to `_register_core_nodes()`
- Place it in the "PHASE 2.2: Data Manipulation" section

### Step 4: Create test file
- `test_database_query_executor.py` with all tests from section 8

### Step 5: Run tests and verify
```bash
cd python-backend
pytest tests/test_database_query_executor.py -v
```

### Step 6: Type check
```bash
cd python-backend
mypy app/orchestrator/node_executors/data_executors/database_query_executor.py
```

---

## 10. Future Enhancements (Out of Scope)

These are documented for future consideration but are NOT part of this implementation:

1. **Secondary/custom database support** -- Add connection registry for multiple databases
2. **Read-only role enforcement** -- Use a separate PostgreSQL role with SELECT-only grants for SELECT queries
3. **Query audit logging** -- Log all executed queries to audit table with user_id, tenant_id, execution_id
4. **Query plan analysis** -- EXPLAIN before execution to estimate cost and reject expensive queries
5. **Result streaming** -- For very large result sets, stream via SSE instead of buffering
6. **Prepared statement caching** -- Cache parsed statements for repeated queries in loops
7. **Schema introspection endpoint** -- Allow users to browse available tables/columns in the workflow UI
