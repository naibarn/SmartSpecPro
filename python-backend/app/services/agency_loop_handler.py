"""
Loop / Retry handler for the Agency orchestrator.

Executes a target node repeatedly until an exit condition is met or
a safety guard (maxIterations, timeout, credit cap) triggers.
"""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any

import httpx
import structlog

from app.services.agency_conditional_branch import _compare, _extract_jsonpath

if TYPE_CHECKING:
    from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext, NodeRow
    from app.services.agency_run_context import AgencyRunContext
    from app.services.agency_trace_collector import TraceCollector

logger = structlog.get_logger(__name__)

MAX_ITERATIONS_CAP = 20
CREDIT_CAP_PER_LOOP = 50
LLM_CONSECUTIVE_FAIL_LIMIT = 3


class LoopHandler:
    """Executes a loop/retry node."""

    async def execute(
        self,
        node: NodeRow,
        ctx: ExecutionContext,
        orchestrator: AgencyOrchestrator,
        run_context: AgencyRunContext | None = None,
        trace_collector: TraceCollector | None = None,
    ) -> str:
        """Execute the loop. Returns final result text."""
        import json

        node_id = node["id"]
        cfg: dict = node.get("node_config") or {}
        target_node_id: str = cfg.get("loopTargetNodeId", "")
        exit_cfg: dict = cfg.get("exitCondition", {})
        mode = exit_cfg.get("mode", "max_iterations")
        max_iterations = min(exit_cfg.get("maxIterations", 5), MAX_ITERATIONS_CAP)
        rules: list[dict] = exit_cfg.get("rules", [])
        eval_prompt: str = exit_cfg.get("evaluationPrompt", "")
        context_key: str = exit_cfg.get("contextKey", "")
        feedback_mode: str = cfg.get("feedbackMode", "auto")
        feedback_prompt_template: str = cfg.get("feedbackPrompt", "")
        delay_ms: int = min(cfg.get("delayBetweenIterationsMs", 0), 30000)
        timeout_ms: int = cfg.get("timeoutMs", 300000)

        # Validate target node exists
        target_node = orchestrator.nodes.get(target_node_id)
        if not target_node:
            raise ValueError(f"loop_retry: loopTargetNodeId '{target_node_id}' not found in agency nodes")

        original_input = ctx.input
        last_result = ""
        iteration_count = 0
        exit_reason = "max_iterations"
        llm_fail_count = 0
        initial_step_count = len(ctx.step_attempts)

        async def _run_loop() -> str:
            nonlocal last_result, iteration_count, exit_reason, llm_fail_count

            for i in range(max_iterations):
                iteration_count = i + 1

                # Inject feedback
                if i > 0:
                    ctx.input = self._inject_feedback(
                        feedback_mode, feedback_prompt_template,
                        original_input, last_result, iteration_count,
                    )

                # Start trace span
                span_id: str | None = None
                if trace_collector:
                    span_id = trace_collector.start_span(
                        name=f"loop_iteration:{node_id}:{iteration_count}",
                        type="tool_call",
                        input_data=ctx.input[:200],
                    )

                iter_start = time.monotonic()

                # Execute target node
                last_result = await orchestrator._execute_node(target_node, ctx)

                iter_duration = (time.monotonic() - iter_start) * 1000

                # End trace span
                if trace_collector and span_id:
                    trace_collector.end_span(span_id, output=last_result[:200])

                # Check exit condition
                condition_met = await self._check_exit(
                    mode, last_result, rules, eval_prompt, context_key,
                    run_context, ctx,
                )

                if condition_met is None:
                    # LLM eval failure
                    llm_fail_count += 1
                    if llm_fail_count >= LLM_CONSECUTIVE_FAIL_LIMIT:
                        exit_reason = "llm_evaluate_failed"
                        break
                elif condition_met:
                    exit_reason = f"condition_met_{mode}"
                    break
                else:
                    llm_fail_count = 0  # Reset on successful eval

                # Credit cap check
                credits_used = len(ctx.step_attempts) - initial_step_count
                if credits_used >= CREDIT_CAP_PER_LOOP:
                    exit_reason = "credit_cap_exceeded"
                    logger.warning("loop_credit_cap", node_id=node_id, credits=credits_used)
                    break

                # Delay between iterations (not after last)
                if delay_ms > 0 and i < max_iterations - 1:
                    await asyncio.sleep(delay_ms / 1000.0)

            return last_result

        try:
            result = await asyncio.wait_for(_run_loop(), timeout=timeout_ms / 1000.0)
        except asyncio.TimeoutError:
            exit_reason = "timeout"
            result = last_result or f"[Loop {node_id}: timed out after {timeout_ms}ms]"
            logger.warning("loop_timeout", node_id=node_id, iterations=iteration_count)

        logger.info(
            "loop_complete",
            node_id=node_id,
            iterations=iteration_count,
            exit_reason=exit_reason,
        )

        ctx.results[node_id] = result
        return result

    async def _check_exit(
        self,
        mode: str,
        output: str,
        rules: list[dict],
        eval_prompt: str,
        context_key: str,
        run_context: AgencyRunContext | None,
        ctx: ExecutionContext,
    ) -> bool | None:
        """Check if the exit condition is met. Returns True/False/None (None = eval failure)."""
        import json

        if mode == "max_iterations":
            return False  # Never exit early, let max handle it

        if mode == "rule_based":
            try:
                data = json.loads(output)
            except (json.JSONDecodeError, TypeError):
                data = output
            for rule in rules:
                field_path = rule.get("field", "")
                operator = rule.get("operator", "equals")
                value = str(rule.get("value", ""))
                field_value = _extract_jsonpath(data, field_path) if field_path.startswith("$") else data
                if _compare(operator, field_value, value):
                    return True
            return False

        if mode == "llm_evaluate":
            return await self._llm_evaluate(output, eval_prompt, ctx)

        if mode == "context_check":
            if not run_context or not context_key:
                return False
            val = await run_context.get(context_key)
            return bool(val)

        return False

    async def _llm_evaluate(
        self, output: str, eval_prompt: str, ctx: ExecutionContext,
    ) -> bool | None:
        """Ask an LLM whether the exit condition is satisfied."""
        import os

        llm_url = os.getenv("LLM_GATEWAY_URL", "http://127.0.0.1:3000")
        system = (
            f"You are evaluating loop iteration output.\n{eval_prompt}\n\n"
            "Respond with ONLY 'yes' or 'no'."
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{llm_url}/api/llm/chat",
                    json={"messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": output[:2000]},
                    ]},
                    headers={"Authorization": f"Bearer {ctx.user_token}"},
                )
                resp.raise_for_status()
                body = resp.json()
            answer = (
                body.get("choices", [{}])[0].get("message", {}).get("content", "")
                or body.get("content", "")
                or ""
            ).strip().lower()
            return answer in ("yes", "true", "1")
        except Exception as exc:
            logger.warning("loop_llm_evaluate_error", error=str(exc)[:100])
            return None

    def _inject_feedback(
        self,
        mode: str,
        template: str,
        original_input: str,
        previous_output: str,
        iteration: int,
    ) -> str:
        """Build the input for the next iteration with feedback."""
        if mode == "custom_prompt" and template:
            return template.replace(
                "{previous_output}", previous_output[:2000],
            ).replace(
                "{iteration}", str(iteration),
            ).replace(
                "{original_input}", original_input,
            )
        # Auto mode
        return (
            f"[Iteration {iteration} feedback] Previous output:\n"
            f"{previous_output[:2000]}\n\n"
            f"Please improve or continue.\n\n"
            f"Original request: {original_input}"
        )
