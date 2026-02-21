"""Loop node executor with full iteration and body execution support.

Supports three execution strategies:
  1. body_node_type: Instantiate and execute another node executor per item
  2. body_expression: Evaluate a safe expression per item
  3. pass-through: Emit item metadata only (default, backward compatible)
"""

import ast
import asyncio
import structlog
from typing import Any, Dict, List

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# AST-based expression safety constants (used by LoopExecutor._execute_expression)
# ---------------------------------------------------------------------------

# Safe AST node types — NO Attribute, NO Call (except whitelisted), NO Import
SAFE_NODES: frozenset[type] = frozenset({
    ast.Expression, ast.Constant, ast.Name, ast.Load,
    ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare,
    ast.IfExp, ast.Subscript, ast.Index, ast.Slice,
    ast.Tuple, ast.List, ast.Dict, ast.Set,
    # Operators
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.FloorDiv, ast.Pow,
    ast.USub, ast.UAdd, ast.Not, ast.Invert,
    ast.And, ast.Or,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.Is, ast.IsNot,
    # For starred in list/dict unpacking
    ast.Starred,
})

# Names that may appear as ast.Name references in expressions
SAFE_NAMES: frozenset[str] = frozenset({
    "item", "index", "True", "False", "None",
    "len", "str", "int", "float", "bool", "round", "abs", "min", "max", "sum",
    "list", "dict", "tuple", "range", "sorted", "enumerate", "zip",
    "isinstance",
})

# Builtins exposed to the eval namespace
SAFE_BUILTINS: dict[str, Any] = {
    "len": len, "str": str, "int": int, "float": float, "bool": bool,
    "round": round, "abs": abs, "min": min, "max": max, "sum": sum,
    "list": list, "dict": dict, "tuple": tuple, "range": range,
    "sorted": sorted, "enumerate": enumerate, "zip": zip,
    "True": True, "False": False, "None": None,
    "isinstance": isinstance,
}

MAX_EXPRESSION_LENGTH: int = 2000


class LoopExecutor:
    """Executor for loop nodes with count and data iteration modes.

    Iterates over items (array or count) and executes a configurable body
    for each iteration.
    """

    ABSOLUTE_MAX_ITERATIONS = 10000

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """
        Execute loop iteration.

        Supports two modes:
        - Count mode: Iterate N times (config.count)
        - Data mode: Iterate over array (inputs.data)

        Config options (all optional):
            body_node_type   : str   -- node type to execute per item
            body_config      : dict  -- config passed to the body executor
            body_expression  : str   -- safe expression per item
            continue_on_error: bool  -- skip failed items (default True)
            delay_ms         : int   -- milliseconds to sleep between iterations
            collect_results  : bool  -- accumulate results (default True)

        Returns:
            dict with loop results
        """
        config = data.config
        inputs = data.inputs

        # Determine loop mode and iteration bounds
        loop_data: List[Any] | None = None

        if "count" in config and config["count"]:
            mode = "count"
            count = int(config["count"])
            user_max = min(
                int(config.get("maxIterations", 1000)),
                self.ABSOLUTE_MAX_ITERATIONS,
            )
            max_iterations = min(count, user_max)
        elif "data" in inputs and inputs["data"]:
            mode = "data"
            loop_data = inputs["data"]
            if not isinstance(loop_data, list):
                loop_data = [loop_data]
            max_iterations = min(len(loop_data), self.ABSOLUTE_MAX_ITERATIONS)
        else:
            return {
                "mode": "none",
                "iterations": 0,
                "results": [],
                "errors": [],
                "completed": True,
                "item": None,
                "index": -1,
                "total": 0,
                "error": "Loop node requires either 'count' config or 'data' input",
            }

        # Body execution configuration
        body_node_type: str | None = config.get("body_node_type")
        body_config: Dict[str, Any] = config.get("body_config", {})
        body_expression: str | None = config.get("body_expression")
        continue_on_error: bool = config.get("continue_on_error", True)
        delay_ms: int = int(config.get("delay_ms", 0))
        collect_results: bool = config.get("collect_results", True)

        # Resolve body executor once if using body_node_type
        body_executor_instance: Any | None = None
        if body_node_type:
            body_executor_instance = self._resolve_body_executor(body_node_type)

        # Iterate
        results: List[Any] = []
        errors: List[Dict[str, Any]] = []

        for idx in range(max_iterations):
            if mode == "data":
                item = loop_data[idx]  # type: ignore[index]
            else:
                item = idx

            # Emit progress if callback available
            self._emit_progress(context, idx, max_iterations, data.node_id)

            try:
                if body_executor_instance is not None:
                    # Strategy 1: Execute body node per item
                    result = await self._execute_body_node(
                        executor=body_executor_instance,
                        body_node_type=body_node_type,  # type: ignore[arg-type]
                        body_config=body_config,
                        item=item,
                        index=idx,
                        total=max_iterations,
                        state=data.state,
                        context=context,
                        parent_node_id=data.node_id,
                    )
                elif body_expression is not None:
                    # Strategy 2: Evaluate safe expression per item
                    result = self._execute_expression(
                        body_expression, item, idx
                    )
                else:
                    # Strategy 3: Pass-through (backward compatible)
                    if mode == "data":
                        result = {
                            "index": idx,
                            "item": item,
                            "value": item,
                        }
                    else:
                        result = {
                            "index": idx,
                            "value": idx,
                        }

                if collect_results:
                    results.append(result)

            except Exception as exc:
                error_entry: Dict[str, Any] = {
                    "index": idx,
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                }
                if mode == "data":
                    error_entry["item"] = _safe_repr(item)
                errors.append(error_entry)

                logger.warning(
                    "Loop iteration failed",
                    iteration=idx,
                    max_iterations=max_iterations,
                    error=str(exc),
                    node_id=data.node_id,
                    workflow_id=context.workflow_id,
                )

                if not continue_on_error:
                    break

            # Rate-limit between iterations
            if delay_ms > 0 and idx < max_iterations - 1:
                await asyncio.sleep(delay_ms / 1000.0)

        # Final progress
        self._emit_progress(
            context, max_iterations, max_iterations, data.node_id
        )

        return {
            "mode": mode,
            "iterations": len(results),
            "results": results,
            "errors": errors,
            "completed": len(errors) == 0 or continue_on_error,
            "item": results[-1] if results else None,
            "index": len(results) - 1 if results else -1,
            "total": max_iterations,
        }

    # ------------------------------------------------------------------
    # Strategy 1: Body node execution
    # ------------------------------------------------------------------

    def _resolve_body_executor(self, node_type: str) -> Any:
        """Resolve and instantiate the executor for the body node type."""
        from app.orchestrator.node_registry import get_executor

        executor_class = get_executor(node_type)
        if executor_class is None:
            raise ValueError(
                f"Loop body_node_type '{node_type}' is not a registered node type"
            )
        return executor_class()

    async def _execute_body_node(
        self,
        executor: Any,
        body_node_type: str,
        body_config: Dict[str, Any],
        item: Any,
        index: int,
        total: int,
        state: Dict[str, Any],
        context: ExecutionContext,
        parent_node_id: str,
    ) -> Any:
        """Execute the body executor for a single iteration."""
        from app.orchestrator.expression_resolver import ExpressionResolver

        expr_resolver = ExpressionResolver()

        # Build iteration-scoped state for template resolution
        iteration_state = dict(state)
        iteration_state["item"] = item
        iteration_state["index"] = index
        iteration_state["total"] = total

        # Resolve templates in body_config
        resolved_config = self._resolve_config_templates(
            body_config, iteration_state, expr_resolver
        )

        iteration_data = NodeExecutionData(
            node_id=f"{parent_node_id}_iteration_{index}",
            node_type=body_node_type,
            config=resolved_config,
            inputs={
                "data": item,
                "item": item,
                "index": index,
                "total": total,
            },
            state=iteration_state,
        )

        return await executor.execute(iteration_data, context)

    def _resolve_config_templates(
        self,
        config: Dict[str, Any],
        state: Dict[str, Any],
        resolver: Any,
    ) -> Dict[str, Any]:
        """Recursively resolve {{expression}} templates in config values."""
        resolved: Dict[str, Any] = {}
        for key, value in config.items():
            if isinstance(value, str):
                resolved[key] = resolver.resolve(value, state)
            elif isinstance(value, dict):
                resolved[key] = self._resolve_config_templates(
                    value, state, resolver
                )
            elif isinstance(value, list):
                resolved[key] = [
                    resolver.resolve(v, state) if isinstance(v, str) else v
                    for v in value
                ]
            else:
                resolved[key] = value
        return resolved

    # ------------------------------------------------------------------
    # Strategy 2: Safe expression evaluation
    # ------------------------------------------------------------------

    def _execute_expression(
        self,
        expression: str,
        item: Any,
        index: int,
    ) -> Any:
        """Evaluate a safe expression for a single item using AST validation.

        Parses the expression into an AST, validates every node against a
        strict allowlist, then evaluates only if the tree is safe.  This
        prevents sandbox-escape attacks that exploit ``__class__``,
        ``__bases__``, ``__subclasses__()`` etc.

        Supported operations:
            - Arithmetic, comparisons, boolean logic
            - Dict/list subscript access
            - Calls to a small set of safe builtins (len, str, int, ...)
            - References to ``item`` and ``index`` loop variables
        """
        source = expression.strip()
        if not source:
            return None

        if len(source) > MAX_EXPRESSION_LENGTH:
            raise ValueError(
                f"Expression too long ({len(source)} > {MAX_EXPRESSION_LENGTH} chars)"
            )

        # Handle "result = expr" assignment syntax — extract the RHS
        if source.startswith("result") and "=" in source:
            eq_idx = source.index("=")
            # Make sure it's not "==" (comparison)
            if eq_idx + 1 < len(source) and source[eq_idx + 1] != "=":
                source = source[eq_idx + 1:].strip()

        # Parse as a single expression
        try:
            tree = ast.parse(source, mode="eval")
        except SyntaxError as exc:
            raise ValueError(f"Invalid expression syntax: {exc}") from exc

        # Validate every node in the AST against the allowlist
        for node in ast.walk(tree):
            node_type = type(node)

            if node_type == ast.Call:
                # Only allow calls to safe builtin names (by Name, not Attribute)
                func = node.func
                if isinstance(func, ast.Name) and func.id in SAFE_BUILTINS:
                    continue
                raise ValueError(
                    "Function calls are not allowed in expressions "
                    f"(except: {', '.join(sorted(SAFE_BUILTINS.keys()))})"
                )
            elif node_type == ast.Attribute:
                raise ValueError(
                    "Attribute access is not allowed in expressions"
                )
            elif node_type not in SAFE_NODES:
                raise ValueError(
                    f"Unsafe expression element: {node_type.__name__}"
                )

            # Ensure Name references only point to known safe identifiers
            if node_type == ast.Name and isinstance(node.ctx, ast.Load):
                if node.id not in SAFE_NAMES:
                    raise ValueError(f"Unknown variable: '{node.id}'")

        # Build a restricted namespace and evaluate
        safe_env: Dict[str, Any] = dict(SAFE_BUILTINS)
        safe_env["item"] = item
        safe_env["index"] = index

        try:
            return eval(  # noqa: S307  — AST validated above
                compile(tree, "<loop_expr>", "eval"),
                {"__builtins__": {}},
                safe_env,
            )
        except Exception as exc:
            raise ValueError(
                f"Expression evaluation failed at iteration {index}: {exc}"
            ) from exc

    # ------------------------------------------------------------------
    # Progress tracking
    # ------------------------------------------------------------------

    @staticmethod
    def _emit_progress(
        context: ExecutionContext,
        current: int,
        total: int,
        node_id: str,
    ) -> None:
        """Emit a progress event if the context has a progress callback."""
        callback = context.extra_data.get("on_progress")
        if callback is None:
            return
        try:
            callback(
                {
                    "node_id": node_id,
                    "current": current,
                    "total": total,
                    "percent": (
                        round(current / total * 100, 1) if total else 0
                    ),
                }
            )
        except Exception:
            pass


def _safe_repr(obj: Any, max_len: int = 200) -> str:
    """Return a truncated repr safe for inclusion in error dicts."""
    try:
        r = repr(obj)
        if len(r) > max_len:
            return r[: max_len - 3] + "..."
        return r
    except Exception:
        return "<unrepresentable>"


# Legacy API
async def execute_loop(
    data: NodeExecutionData, context: ExecutionContext
) -> Dict[str, Any]:
    """Legacy function wrapper for loop execution."""
    executor = LoopExecutor()
    return await executor.execute(data, context)
