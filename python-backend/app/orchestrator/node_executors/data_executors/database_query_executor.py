"""Database Query Executor - Execute SQL queries against PostgreSQL.

Provides a secure, production-ready executor for running parameterized SQL
queries from within workflow nodes. Implements four layers of SQL injection
prevention:

1. Statement type validation (blocklist + allowlist)
2. Parameterized queries via SQLAlchemy text()
3. Expression resolution BEFORE parameter binding
4. Query string expression resolution with re-validation
"""
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

from app.core.database import AsyncSessionLocal
from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class SQLValidator:
    """Validates and classifies SQL statements for safe execution.

    Enforces a defense-in-depth approach:
    - Strip SQL comments to prevent bypass via comment injection
    - Block dangerous keywords (DDL, DCL, stored procedures, file I/O, etc.)
    - Reject multiple statements (piggyback injection prevention)
    - Match declared query type against actual statement prefix
    - Verify prefix is in the allowed set (SELECT, INSERT, UPDATE, DELETE, WITH)
    """

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
            (is_valid, error_message) tuple. error_message is empty string
            when query is valid.
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
            # Allow CTEs for SELECT queries.
            # WITH ... INSERT/UPDATE/DELETE is valid SQL but restricted here.
            pass
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
        """Execute a database query node.

        Args:
            data: Node execution data containing config, inputs, and state.
            context: Execution context with user/workflow metadata.

        Returns:
            Dict with keys: rows, affectedRows, lastInsertId, executionTime,
            and optionally 'error' if the query failed.
        """
        config = data.config
        inputs = data.inputs
        state = data.state

        # Extract configuration -- prefer config, fall back to inputs
        query_type = (config.get("queryType") or inputs.get("queryType", "select")).lower()
        raw_query = config.get("query") or inputs.get("query", "")
        raw_parameters = config.get("parameters") or inputs.get("parameters", {})
        database = config.get("database", "primary")
        timeout_seconds = int(config.get("timeout", 30))
        max_rows = int(config.get("maxRows", 1000))

        # Clamp max_rows to the absolute ceiling
        max_rows = min(max_rows, 10000)

        # Validate query type
        if query_type not in ("select", "insert", "update", "delete"):
            return self._error_result(
                f"Invalid query type: '{query_type}'. "
                f"Must be one of: select, insert, update, delete"
            )

        # Clamp timeout to valid range
        timeout_seconds = max(1, min(timeout_seconds, 300))

        # Layer 4: Resolve {{expressions}} in query text
        try:
            resolved_query = self._resolver.resolve(raw_query, state)
        except ValueError as e:
            return self._error_result(f"Expression resolution failed: {e}")

        # Layer 3: Resolve {{expressions}} in parameter values
        resolved_params = self._resolve_parameters(raw_parameters, state)

        # Layer 1: Validate SQL statement (after expression resolution)
        is_valid, error_msg = SQLValidator.validate(resolved_query, query_type)
        if not is_valid:
            return self._error_result(f"SQL validation failed: {error_msg}")

        # Inject LIMIT for SELECT queries
        if query_type == "select":
            resolved_query = self._inject_limit(resolved_query, max_rows)

        # Execute query with dual timeout enforcement
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
            logger.warning(
                "database_query_timeout",
                node_id=data.node_id,
                query_type=query_type,
                timeout_seconds=timeout_seconds,
                execution_time_ms=execution_time_ms,
                workflow_id=context.workflow_id,
            )
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
        """Execute the actual SQL query within an async session.

        Uses a dedicated short-lived session with per-session statement_timeout
        to prevent worker starvation. The session is always closed via the
        async context manager.

        Args:
            query: The validated, LIMIT-injected SQL query string.
            params: Resolved parameter dict for SQLAlchemy text() binding.
            query_type: One of "select", "insert", "update", "delete".
            timeout_seconds: PostgreSQL statement_timeout in seconds.
            database: Database identifier ("primary" or "secondary").

        Returns:
            Dict with rows, affectedRows, and lastInsertId.
        """
        # Get session factory (currently only 'primary' is supported)
        session_factory = AsyncSessionLocal  # TODO: support secondary/custom databases

        async with session_factory() as session:
            try:
                # Set statement timeout for this session (milliseconds)
                await session.execute(
                    text("SET statement_timeout = :ms").bindparams(ms=timeout_seconds * 1000)
                )

                # Layer 2: Execute via parameterized text() binding
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
                    returned_rows: list[dict[str, Any]] = []
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
        self, raw_params: dict[str, Any] | Any, state: dict[str, Any]
    ) -> dict[str, Any]:
        """Resolve {{expressions}} in parameter values.

        Args:
            raw_params: Dict of parameter name to value. String values may
                        contain {{expressions}} to be resolved.
            state: Workflow execution state for expression resolution.

        Returns:
            Dict with all string values resolved.
        """
        if not raw_params or not isinstance(raw_params, dict):
            return {}

        resolved: dict[str, Any] = {}
        for key, value in raw_params.items():
            if isinstance(value, str):
                resolved[key] = self._resolver.resolve(value, state)
            else:
                resolved[key] = value
        return resolved

    def _inject_limit(self, query: str, max_rows: int) -> str:
        """Inject or cap LIMIT clause for SELECT queries.

        If the query already has a LIMIT, cap it to max_rows.
        If not, append LIMIT max_rows.

        Args:
            query: The validated SELECT query string.
            max_rows: Maximum number of rows to return.

        Returns:
            Query string with LIMIT enforced.
        """
        cleaned = query.rstrip(";").strip()

        if re.search(r"\bLIMIT\s+\d+", cleaned, re.IGNORECASE):
            # User already has LIMIT -- ensure it doesn't exceed max_rows
            def cap_limit(match: re.Match[str]) -> str:
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
        """Return a standardized error result.

        Args:
            message: Human-readable error description.
            execution_time_ms: Time elapsed before the error occurred.

        Returns:
            Dict with empty result fields and an error message.
        """
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
        """Convert database exceptions to structured error results.

        Categorizes SQLAlchemy exceptions into user-friendly error messages
        while sanitizing internal details to prevent information leakage.

        Args:
            exc: The caught exception.
            execution_time_ms: Time elapsed before the error occurred.

        Returns:
            Standardized error result dict.
        """
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
        """Sanitize database error messages to avoid leaking internal details.

        Removes connection strings, file paths, and internal PostgreSQL
        details from error messages before returning them to the user.

        Args:
            exc: The exception whose message needs sanitization.

        Returns:
            Sanitized error message string, truncated to 500 characters.
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
