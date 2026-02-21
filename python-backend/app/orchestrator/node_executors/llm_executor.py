"""LLM Call node executor using the Node.js LLM gateway."""
import os
from typing import Any, Dict

import httpx
import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

# Node.js web app internal URL
NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")


class LLMExecutor:
    """
    Executor for LLM Call nodes.

    Routes through the Node.js multi-provider LLM gateway:
    /api/llm/v2/chat -> credit check -> provider routing with fallback -> LLM call -> credit deduction

    Models are resolved from the model_provider_map DB table.
    The gateway handles provider selection, health tracking, and cost calculation.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """
        Execute an LLM call via the Node.js LLM gateway.

        The gateway handles the full pipeline:
        1. Credit check (reject if insufficient)
        2. Resolve model -> provider via model_provider_map
        3. Call the LLM provider with fallback
        4. Deduct credits based on actual token usage

        Args:
            data: Node execution data with prompt, model, and config
            context: Execution context with user auth info

        Returns:
            dict with response text and usage metadata
        """
        config = data.config
        inputs = data.inputs

        # --- Collect inputs -------------------------------------------------------
        prompt = inputs.get("prompt") or config.get("prompt", "")
        if not prompt:
            return {
                "response": "",
                "usage": {"error": "LLM call requires a prompt"},
            }

        system_prompt = inputs.get("systemPrompt") or config.get("systemPrompt", "")
        model = inputs.get("model") or config.get("model", "gpt-4o-mini")
        temperature = config.get("temperature", 0.7)
        max_tokens = config.get("maxTokens") or config.get("max_tokens", 2000)

        # Context data from upstream nodes
        context_data = inputs.get("contextData") or config.get("contextData")
        if context_data:
            # Append context data to the prompt
            if isinstance(context_data, dict):
                import json
                context_str = json.dumps(context_data, ensure_ascii=False, indent=2)
            elif isinstance(context_data, str):
                context_str = context_data
            else:
                context_str = str(context_data)
            prompt = f"{prompt}\n\n--- Context Data ---\n{context_str}"

        # --- Auth token -----------------------------------------------------------
        user_token = context.extra_data.get("user_token", "")
        if not user_token:
            logger.warning("llm_executor_no_token", execution_id=context.execution_id)
            return {
                "response": "",
                "usage": {"error": "No authentication token available"},
            }

        # --- Build messages -------------------------------------------------------
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # --- Build request payload ------------------------------------------------
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": float(temperature) if temperature is not None else 0.7,
        }
        if max_tokens:
            payload["max_tokens"] = int(max_tokens)

        logger.info(
            "llm_executor_request",
            execution_id=context.execution_id,
            model=model,
            message_count=len(messages),
            has_system_prompt=bool(system_prompt),
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # --- Call Node.js LLM gateway /api/llm/v2/chat ----------------------------
        # Full pipeline: credit check -> multi-provider routing -> LLM call -> credit deduction
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{NODEJS_INTERNAL_URL}/api/llm/v2/chat",
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {user_token}",
                        "Cookie": f"token={user_token}",
                    },
                )

                if response.status_code != 200:
                    error_text = response.text
                    logger.error(
                        "llm_executor_gateway_error",
                        status=response.status_code,
                        body=error_text[:500],
                        execution_id=context.execution_id,
                    )
                    # Try to parse error message
                    try:
                        error_data = response.json()
                        error_msg = (
                            error_data.get("error", {}).get("message")
                            or f"LLM call failed (HTTP {response.status_code})"
                        )
                    except Exception:
                        error_msg = f"LLM call failed (HTTP {response.status_code})"

                    return {
                        "response": "",
                        "usage": {"error": error_msg},
                    }

                result = response.json()

                # Handle fallback_required response (provider switching)
                if result.get("fallbackRequired"):
                    logger.info(
                        "llm_executor_fallback",
                        execution_id=context.execution_id,
                        from_provider=result.get("from", {}).get("provider"),
                        to_provider=result.get("to", {}).get("provider"),
                    )
                    # Re-send with the fallback provider
                    fallback_provider_id = result.get("to", {}).get("providerId")
                    if fallback_provider_id:
                        payload["preferredProvider"] = fallback_provider_id
                        fb_response = await client.post(
                            f"{NODEJS_INTERNAL_URL}/api/llm/v2/chat",
                            json=payload,
                            headers={
                                "Content-Type": "application/json",
                                "Authorization": f"Bearer {user_token}",
                                "Cookie": f"token={user_token}",
                            },
                        )
                        if fb_response.status_code == 200:
                            result = fb_response.json()
                        else:
                            return {
                                "response": "",
                                "usage": {"error": "LLM call failed after provider fallback"},
                            }

                # Extract response content from OpenAI-compatible format
                choices = result.get("choices", [])
                response_text = ""
                if choices:
                    message = choices[0].get("message", {})
                    response_text = message.get("content", "")

                # Extract usage info
                usage = result.get("usage", {})
                credits_info = result.get("_credits", {})

                logger.info(
                    "llm_executor_success",
                    execution_id=context.execution_id,
                    model=model,
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0),
                    credits_used=credits_info.get("used", 0),
                )

                return {
                    "response": response_text,
                    "usage": {
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                        "total_tokens": usage.get("total_tokens", 0),
                        "model": result.get("model", model),
                        "creditsUsed": credits_info.get("used", 0),
                    },
                }

        except httpx.TimeoutException:
            logger.error("llm_executor_timeout", execution_id=context.execution_id)
            return {
                "response": "",
                "usage": {"error": "LLM call timed out (120s)"},
            }
        except Exception as exc:
            logger.exception("llm_executor_unexpected_error", execution_id=context.execution_id)
            return {
                "response": "",
                "usage": {"error": f"LLM call failed: {str(exc)}"},
            }
