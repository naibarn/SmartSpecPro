"""Image Generation node executor using the Media Studio pipeline (Kie AI)."""
import os
from typing import Any, Dict

import httpx
import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

# Node.js web app internal URL for tRPC calls
NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")


class ImageExecutor:
    """
    Executor for Image Generation nodes.

    Uses the same media generation pipeline as Media Studio:
    Node.js tRPC media.generateImage -> credit check -> Python media API -> Kie AI -> credit deduction

    Models are loaded dynamically from the media_models DB table.  The frontend
    renders dynamic input fields based on each model's configJson.inputFields
    (e.g. aspect_ratio, resolution, output_format).  All values set by the user
    are forwarded to the tRPC payload so the Node.js pipeline can pass them to
    the external provider.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """
        Execute image generation via the Node.js tRPC media pipeline.

        This goes through the full Media Studio flow:
        1. Node.js checks rate limit
        2. Node.js checks user credits
        3. Node.js calls Python backend media API -> Kie AI gateway
        4. On success, Node.js deducts credits

        Args:
            data: Node execution data with prompt and config
            context: Execution context with user auth info

        Returns:
            dict with imageUrl and metadata outputs
        """
        config = data.config
        inputs = data.inputs

        # --- Collect known fields ------------------------------------------------
        prompt = inputs.get("prompt") or config.get("prompt", "")
        if not prompt:
            return {"imageUrl": None, "metadata": {"error": "Image generation requires a prompt"}}

        model = inputs.get("model") or config.get("model", "")

        # Collect dynamic fields from config (set by configJson.inputFields on frontend)
        aspect_ratio = config.get("aspect_ratio") or config.get("aspectRatio")
        resolution = config.get("resolution")
        output_format = config.get("output_format")

        # Reference images (from upstream node connection or comma-separated URLs)
        ref_images_raw = inputs.get("referenceImages") or config.get("referenceImages")
        reference_images: list[str] = []
        if isinstance(ref_images_raw, list):
            reference_images = [str(u) for u in ref_images_raw if u]
        elif isinstance(ref_images_raw, str) and ref_images_raw.strip():
            reference_images = [u.strip() for u in ref_images_raw.split(",") if u.strip()]

        # Collect any extra params that aren't standard fields
        standard_fields = {
            "prompt", "model", "aspect_ratio", "aspectRatio", "resolution",
            "output_format", "referenceImages", "modelCreditCost",
        }
        extra_params = {k: v for k, v in config.items() if k not in standard_fields and v is not None}

        # --- Auth token ----------------------------------------------------------
        user_token = context.extra_data.get("user_token", "")
        if not user_token:
            logger.warning("image_executor_no_token", execution_id=context.execution_id)
            return {"imageUrl": None, "metadata": {"error": "No authentication token available"}}

        # --- Build tRPC payload --------------------------------------------------
        trpc_input: dict[str, Any] = {
            "prompt": prompt,
        }
        if model:
            trpc_input["model"] = model
        if aspect_ratio:
            trpc_input["aspectRatio"] = aspect_ratio
        if resolution:
            trpc_input["resolution"] = resolution
        if output_format:
            trpc_input["outputFormat"] = output_format
        if reference_images:
            trpc_input["imageUrls"] = reference_images
        if extra_params:
            trpc_input["extraParams"] = extra_params

        trpc_payload = {"json": trpc_input}

        logger.info(
            "image_executor_request",
            execution_id=context.execution_id,
            model=model or "default",
            has_aspect_ratio=bool(aspect_ratio),
            has_resolution=bool(resolution),
            extra_param_count=len(extra_params),
        )

        # --- Call Node.js tRPC media.generateImage endpoint ----------------------
        # Full pipeline: rate limit -> credit check -> Kie AI -> credit deduction
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{NODEJS_INTERNAL_URL}/trpc/media.generateImage",
                    json=trpc_payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {user_token}",
                        "Cookie": f"token={user_token}",
                    },
                )

                if response.status_code != 200:
                    error_text = response.text
                    logger.error(
                        "image_executor_trpc_error",
                        status=response.status_code,
                        body=error_text[:500],
                        execution_id=context.execution_id,
                    )
                    # Try to parse tRPC error
                    try:
                        error_data = response.json()
                        error_msg = (
                            error_data.get("error", {}).get("message")
                            or error_data.get("error", {}).get("json", {}).get("message")
                            or f"Image generation failed (HTTP {response.status_code})"
                        )
                    except Exception:
                        error_msg = f"Image generation failed (HTTP {response.status_code})"

                    return {"imageUrl": None, "metadata": {"error": error_msg}}

                result = response.json()
                # tRPC wraps result in { result: { data: { json: { ... } } } }
                result_data = (
                    result.get("result", {}).get("data", {}).get("json")
                    or result.get("result", {}).get("data", {})
                )

                image_url = (
                    result_data.get("url")
                    or result_data.get("imageUrl")
                    or result_data.get("outputUrl")
                )
                credits_used = result_data.get("creditsUsed", 0)

                logger.info(
                    "image_executor_success",
                    execution_id=context.execution_id,
                    model=model,
                    credits_used=credits_used,
                    has_url=bool(image_url),
                )

                return {
                    "imageUrl": image_url,
                    "metadata": {
                        "model": model,
                        "aspectRatio": aspect_ratio,
                        "resolution": resolution,
                        "prompt": prompt,
                        "creditsUsed": credits_used,
                        "provider": result_data.get("provider", "kie.ai"),
                    },
                }

        except httpx.TimeoutException:
            logger.error("image_executor_timeout", execution_id=context.execution_id)
            return {"imageUrl": None, "metadata": {"error": "Image generation timed out (120s)"}}
        except Exception as exc:
            logger.exception("image_executor_unexpected_error", execution_id=context.execution_id)
            return {"imageUrl": None, "metadata": {"error": f"Image generation failed: {str(exc)}"}}
