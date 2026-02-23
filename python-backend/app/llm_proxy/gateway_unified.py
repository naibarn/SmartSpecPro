from decimal import Decimal
from typing import Dict, Any, Optional, List, Literal, Union
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.llm_proxy.proxy import LLMProxy, LLMProviderError
from app.llm_proxy.unified_client import get_unified_client, UnifiedLLMClient
from app.llm_proxy.models import LLMRequest, LLMResponse, ImageGenerationRequest, ImageGenerationResponse, VideoGenerationRequest, VideoGenerationResponse, AudioGenerationRequest, AudioGenerationResponse
from app.services.credit_service import CreditService, InsufficientCreditsError
from app.services.web_gateway_client import get_gateway_client
from app.core.credits import usd_to_credits, credits_to_usd
from app.models.user import User

# R2 storage is optional - only needed for uploading reference images
try:
    from app.services.r2_storage_service import get_r2_storage_service
    R2_STORAGE_AVAILABLE = True
except ImportError:
    R2_STORAGE_AVAILABLE = False
    get_r2_storage_service = None

logger = structlog.get_logger()


# Cost estimation matrix for different task types and priorities
COST_PER_1K_TOKENS = {
    ("planning", "quality"): Decimal("0.03"),      # GPT-4
    ("planning", "cost"): Decimal("0.001"),        # Gemini Pro
    ("planning", "speed"): Decimal("0.0001"),      # Groq
    ("code_generation", "quality"): Decimal("0.015"),  # Claude Sonnet
    ("code_generation", "cost"): Decimal("0.0"),   # Ollama
    ("code_generation", "speed"): Decimal("0.0001"),   # Groq
    ("analysis", "quality"): Decimal("0.015"),     # Claude Sonnet
    ("analysis", "cost"): Decimal("0.001"),        # Gemini Pro
    ("analysis", "speed"): Decimal("0.0001"),      # Groq
    ("decision", "quality"): Decimal("0.03"),      # GPT-4
    ("decision", "cost"): Decimal("0.0075"),       # Claude Haiku
    ("decision", "speed"): Decimal("0.0001"),      # Groq
    ("simple", "quality"): Decimal("0.0015"),      # GPT-3.5
    ("simple", "cost"): Decimal("0.0"),            # Ollama
    ("simple", "speed"): Decimal("0.0015"),        # GPT-3.5
}

# Model selection matrix for OpenRouter
MODEL_MATRIX = {
    ("code_generation", "quality"): "anthropic/claude-3.5-sonnet",
    ("code_generation", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("code_generation", "speed"): "google/gemini-flash-1.5",
    ("analysis", "quality"): "openai/gpt-4o",
    ("analysis", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("analysis", "speed"): "google/gemini-flash-1.5",
    ("planning", "quality"): "anthropic/claude-3.5-sonnet",
    ("planning", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("planning", "speed"): "openai/gpt-4o-mini",
    ("simple", "quality"): "openai/gpt-4o-mini",
    ("simple", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("simple", "speed"): "google/gemini-flash-1.5",
    ("decision", "quality"): "anthropic/claude-3.5-sonnet",
    ("decision", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("decision", "speed"): "openai/gpt-4o",
}


class LLMGateway:
    """
    Unified LLM Gateway with credit checking and multi-provider support.
    
    This gateway provides a single entry point for all LLM operations,
    supporting both direct provider access and OpenRouter routing.
    
    Flow:
    1. Authenticate user (via dependency injection)
    2. Estimate LLM cost
    3. Check sufficient credits
    4. Call LLM (direct or via OpenRouter)
    5. Calculate actual cost
    6. Deduct credits
    7. Return response with credit info
    
    Usage:
        gateway = LLMGateway(db)
        response = await gateway.invoke(request, user)
    """
    
    def __init__(self, db: AsyncSession):
        """
        Initialize the gateway with database session.
        
        Args:
            db: AsyncSession for database operations
        """
        self.db = db
        self.llm_proxy = LLMProxy()
        self.unified_client = get_unified_client()
        self.credit_service = CreditService(db)
        self.web_gateway = get_gateway_client()
    
    async def invoke(
        self,
        request: LLMRequest,
        user: User,
        # Routing options
        use_openrouter: bool = True,
        # OpenRouter features
        fallback_models: Optional[List[str]] = None,
        sort: Optional[Literal["price", "throughput", "latency"]] = None,
        # Privacy controls
        data_collection: Literal["allow", "deny"] = "allow",
        zdr: Optional[bool] = None,
        # Cost control
        max_price: Optional[Dict[str, float]] = None,
    ) -> LLMResponse:
        """
        Invoke LLM with credit checking and automatic routing.
        
        Args:
            request: LLM request with messages, task_type, etc.
            user: Current authenticated user
            use_openrouter: Use OpenRouter for routing (default: True)
            fallback_models: List of fallback models for OpenRouter
            sort: Sort providers by price/throughput/latency
            data_collection: Allow or deny data collection
            zdr: Zero Data Retention mode
            max_price: Maximum price per 1K tokens
        
        Returns:
            LLMResponse with content, usage stats, and credit info
        
        Raises:
            HTTPException: 402 if insufficient credits, 503 if all providers fail
        """
        logger.info(
            "llm_gateway_invoke",
            user_id=user.id,
            task_type=request.task_type,
            budget_priority=request.budget_priority,
            use_openrouter=use_openrouter,
        )
        
        # Step 1: Estimate cost
        estimated_cost = await self._estimate_cost(request, use_openrouter)
        logger.info(
            "llm_cost_estimated",
            user_id=user.id,
            estimated_cost=float(estimated_cost),
        )
        
        # Step 2: Check sufficient credits
        await self._check_credits(user, estimated_cost)
        
        # Step 3: Call LLM
        if use_openrouter and self.unified_client.openrouter_client:
            response = await self._invoke_via_openrouter(
                request, user, fallback_models, sort,
                data_collection, zdr, max_price
            )
        else:
            response = await self._invoke_via_direct(request, user)
        
        # Step 4: Calculate actual cost
        actual_cost = self._calculate_actual_cost(response, use_openrouter)
        logger.info(
            "llm_cost_actual",
            user_id=user.id,
            actual_cost=float(actual_cost),
            estimated_cost=float(estimated_cost),
            difference=float(actual_cost - estimated_cost),
        )
        
        # Step 5: Deduct credits
        transaction = await self._deduct_credits(
            user, actual_cost, request, response, estimated_cost, use_openrouter
        )
        
        # Step 6: Add credit info to response
        response.credits_used = abs(transaction.amount)  # Return positive value for credits used
        response.credits_balance = transaction.balance_after
        
        return response

    async def generate_image(
        self,
        request: ImageGenerationRequest,
        user: User
    ) -> ImageGenerationResponse:
        """
        Generate image with credit checking.
        """
        logger.info("image_generation_request", user_id=user.id, model=request.model)

        # Estimate cost via Web Gateway or use local estimate
        estimated_cost = await self._estimate_cost(request, False)
        await self._check_credits(user, estimated_cost)

        # --- BytePlus ModelArk routing ---
        from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
        if request.model in BytePlusModelArkProvider.IMAGE_MODELS:
            from app.services.media_provider_service import get_media_provider_key
            provider_config = await get_media_provider_key("byteplus_modelark")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="BytePlus ModelArk not configured. Please add API key in Admin > Media Providers.",
                )
            client = None
            try:
                client = BytePlusModelArkProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                size = request.size or "2K"
                result = await client.generate_image(
                    model=request.model,
                    prompt=request.prompt,
                    size=size,
                )
                actual_cost = Decimal(str(client.calculate_cost_usd(result["usage_tokens"])))
                response = ImageGenerationResponse(
                    id=result.get("provider_task_id", ""),
                    model=request.model,
                    provider="byteplus_modelark",
                    created=0,
                    data=[{"url": result["result_url"]}],
                )
                transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except Exception as e:
                logger.error("byteplus_image_generation_failed", user_id=user.id, model=request.model, error=str(e))
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="BytePlus image generation failed. See server logs for details.")
            finally:
                if client is not None:
                    await client.aclose()
        # --- End BytePlus routing ---

        if not self.unified_client.kie_ai_client:
            # Try to initialize from SmartSpecWeb media_providers
            from app.services.media_provider_service import initialize_kie_ai_client
            self.unified_client.kie_ai_client = await initialize_kie_ai_client()

            if not self.unified_client.kie_ai_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Kie.ai not configured. Please add API key in Admin > Media Providers."
                )

        try:
            # Log incoming request for debugging
            logger.info(
                "generate_image_start",
                user_id=user.id,
                model=request.model,
                has_reference_urls=bool(request.reference_image_urls),
                reference_url_count=len(request.reference_image_urls) if request.reference_image_urls else 0,
            )

            # Resolve reference image URLs to public URLs via R2 storage
            # This is needed because Kie.ai needs to download images from public URLs
            resolved_reference_urls = request.reference_image_urls
            resolved_style_url = request.reference_style_url

            if request.reference_image_urls or request.reference_style_url:
                logger.info("r2_resolution_starting", urls=request.reference_image_urls)
                try:
                    if not R2_STORAGE_AVAILABLE:
                        raise ImportError("R2 storage not available (boto3 not installed)")
                    r2_service = get_r2_storage_service()
                    # Pass db_session as parameter (NOT stored on singleton to avoid async context issues)

                    if request.reference_image_urls:
                        resolved_reference_urls = await r2_service.resolve_reference_urls(
                            request.reference_image_urls,
                            db_session=self.db
                        )
                        logger.info(
                            "reference_urls_resolved",
                            original=request.reference_image_urls,
                            resolved=resolved_reference_urls
                        )

                    if request.reference_style_url:
                        resolved_style_url = await r2_service.resolve_reference_url(
                            request.reference_style_url,
                            db_session=self.db
                        )
                        logger.info(
                            "style_url_resolved",
                            original=request.reference_style_url,
                            resolved=resolved_style_url
                        )
                except Exception as e:
                    logger.warning(
                        "reference_url_resolution_failed",
                        error=str(e),
                        reference_urls=request.reference_image_urls
                    )
                    # Continue with original URLs if R2 resolution fails

            # For synchronous generation, always use polling mode (not callback mode)
            # This ensures we wait for the result before returning to the client
            # Callback mode is only suitable for async endpoints (/async/image)
            image_data = await self.unified_client.kie_ai_client.generate_image(
                model=request.model,
                prompt=request.prompt,
                callback_url="",  # Force polling mode - empty string disables callback
                reference_image_urls=resolved_reference_urls,  # Pass resolved URLs to Kie.ai
                reference_style_url=resolved_style_url,  # Pass resolved style URL to Kie.ai
                **request.dict(exclude_unset=True, exclude={
                    "model", "prompt", "user", "reference_image_urls", "reference_style_url"
                })
            )

            # Check for None response from Kie.ai
            if image_data is None:
                logger.error("kie_ai_returned_none", user_id=user.id, model=request.model)
                raise ValueError("No response received from Kie.ai image generation API")

            # Log full response for debugging
            logger.info(
                "kie_ai_image_response",
                user_id=user.id,
                id=image_data.get("id"),
                data_count=len(image_data.get("data", [])),
                data=image_data.get("data", []),
                raw_keys=list(image_data.keys()) if image_data else None,
                has_reference_images=bool(request.reference_image_urls),
            )

            # Extract data - check both 'data' and 'raw_response' fields
            result_data = image_data.get("data", [])

            # If data is empty but we have raw_response, try to extract from there
            if not result_data and image_data.get("raw_response"):
                raw_response = image_data.get("raw_response", {})
                logger.info("kie_ai_checking_raw_response", raw_keys=list(raw_response.keys()) if isinstance(raw_response, dict) else "not_dict")

                # Try nested paths in raw_response
                if isinstance(raw_response, dict):
                    nested = raw_response.get("data", {})
                    if isinstance(nested, dict):
                        result_json = nested.get("resultJson", {})
                        # Parse if it's a string
                        if isinstance(result_json, str):
                            import json
                            try:
                                result_json = json.loads(result_json)
                            except:
                                pass
                        if isinstance(result_json, dict):
                            urls = result_json.get("resultUrls", [])
                            for url in urls:
                                if isinstance(url, str):
                                    result_data.append({"url": url})
                                elif isinstance(url, dict):
                                    result_data.append({"url": url.get("url")})
                            if result_data:
                                logger.info("kie_ai_extracted_from_raw", count=len(result_data))

            response = ImageGenerationResponse(
                id=image_data.get("id", ""),
                model=request.model,
                provider="kie_ai",
                created=image_data.get("created", 0),
                data=result_data,
            )

            # Use actual Kie.ai credits if available (Kie 1 credit = $0.005)
            kie_credits = image_data.get("kie_credits_consumed")
            if kie_credits is not None and kie_credits > 0:
                actual_cost = Decimal(str(kie_credits)) * Decimal("0.005")
                logger.info("image_actual_cost_from_kie", kie_credits=kie_credits, actual_cost_usd=float(actual_cost), estimated_cost_usd=float(estimated_cost))
            else:
                actual_cost = estimated_cost
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)  # Return positive value for credits used
            response.credits_balance = transaction.balance_after
            return response
        except Exception as e:
            logger.error("image_generation_failed", user_id=user.id, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Image generation failed: {str(e)}")

    async def generate_video(
        self,
        request: VideoGenerationRequest,
        user: User,
        wait_for_completion: bool = True,
    ) -> VideoGenerationResponse:
        """
        Generate video with credit checking.
        """
        logger.info("video_generation_request", user_id=user.id, model=request.model)

        # Estimate cost via Web Gateway or use local estimate
        estimated_cost = await self._estimate_cost(request, False)
        await self._check_credits(user, estimated_cost)

        # --- BytePlus ModelArk routing ---
        from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
        if request.model in BytePlusModelArkProvider.VIDEO_MODELS:
            from app.services.media_provider_service import get_media_provider_key
            provider_config = await get_media_provider_key("byteplus_modelark")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="BytePlus ModelArk not configured. Please add API key in Admin > Media Providers.",
                )
            client = None
            try:
                client = BytePlusModelArkProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                extra = request.extra_params or {}
                resolution = request.resolution or extra.get("resolution", "1080p")
                duration = request.duration or int(extra.get("duration", 5))
                camerafixed = bool(extra.get("camerafixed", False))
                reference_image_url = None
                if request.reference_image_urls:
                    reference_image_url = request.reference_image_urls[0]
                result = await client.create_video_task(
                    model=request.model,
                    prompt=request.prompt,
                    resolution=resolution,
                    duration=duration,
                    camerafixed=camerafixed,
                    reference_image_url=reference_image_url,
                )
                response = VideoGenerationResponse(
                    id=result["provider_task_id"],
                    model=request.model,
                    provider="byteplus_modelark",
                    created=0,
                    data=[],
                )
                transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except Exception as e:
                logger.error("byteplus_video_task_creation_failed", user_id=user.id, model=request.model, error=str(e))
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="BytePlus video task creation failed. See server logs for details.")
            finally:
                if client is not None:
                    await client.aclose()
        # --- End BytePlus routing ---

        if not self.unified_client.kie_ai_client:
            # Try to initialize from SmartSpecWeb media_providers
            from app.services.media_provider_service import initialize_kie_ai_client
            self.unified_client.kie_ai_client = await initialize_kie_ai_client()

            if not self.unified_client.kie_ai_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Kie.ai not configured. Please add API key in Admin > Media Providers."
                )

        try:
            provider_kwargs = request.dict(exclude_unset=True, exclude={
                "model", "prompt", "user", "reference_video_url", "reference_image_urls"
            })

            if wait_for_completion:
                # Synchronous mode: block until result is ready.
                provider_kwargs["callback_url"] = ""  # Explicitly disable callback and use polling.
            # Async mode: do not force callback_url; provider config callback can be used if present.

            video_data = await self.unified_client.kie_ai_client.generate_video(
                model=request.model,
                prompt=request.prompt,
                wait_for_completion=wait_for_completion,
                **provider_kwargs
            )
            response = VideoGenerationResponse(
                id=video_data.get("id", ""),
                model=request.model,
                provider="kie_ai",
                created=video_data.get("created", 0),
                data=video_data.get("data", []),
            )

            # Use actual Kie.ai credits if available (Kie 1 credit = $0.005)
            kie_credits = video_data.get("kie_credits_consumed")
            if kie_credits is not None and kie_credits > 0:
                actual_cost = Decimal(str(kie_credits)) * Decimal("0.005")
                logger.info("video_actual_cost_from_kie", kie_credits=kie_credits, actual_cost_usd=float(actual_cost), estimated_cost_usd=float(estimated_cost))
            else:
                actual_cost = estimated_cost
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)  # Return positive value for credits used
            response.credits_balance = transaction.balance_after
            return response
        except Exception as e:
            logger.error("video_generation_failed", user_id=user.id, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Video generation failed: {str(e)}")

    async def generate_audio(
        self,
        request: AudioGenerationRequest,
        user: User
    ) -> AudioGenerationResponse:
        """
        Generate audio with credit checking.
        """
        logger.info("audio_generation_request", user_id=user.id, model=request.model)

        # Estimate cost via Web Gateway or use local estimate
        estimated_cost = await self._estimate_cost(request, False)
        await self._check_credits(user, estimated_cost)

        if not self.unified_client.kie_ai_client:
            # Try to initialize from SmartSpecWeb media_providers
            from app.services.media_provider_service import initialize_kie_ai_client
            self.unified_client.kie_ai_client = await initialize_kie_ai_client()

            if not self.unified_client.kie_ai_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Kie.ai not configured. Please add API key in Admin > Media Providers."
                )

        try:
            # For synchronous generation, always use polling mode (not callback mode)
            audio_data = await self.unified_client.kie_ai_client.generate_audio(
                model=request.model,
                text=request.text,
                callback_url="",  # Force polling mode
                **request.dict(exclude_unset=True, exclude={
                    "model", "text", "user"
                })
            )
            response = AudioGenerationResponse(
                id=audio_data.get("id", ""),
                model=request.model,
                provider="kie_ai",
                created=audio_data.get("created", 0),
                data=audio_data.get("data", []),
            )

            # Use actual Kie.ai credits if available (Kie 1 credit = $0.005)
            kie_credits = audio_data.get("kie_credits_consumed")
            if kie_credits is not None and kie_credits > 0:
                actual_cost = Decimal(str(kie_credits)) * Decimal("0.005")
                logger.info("audio_actual_cost_from_kie", kie_credits=kie_credits, actual_cost_usd=float(actual_cost), estimated_cost_usd=float(estimated_cost))
            else:
                actual_cost = estimated_cost
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)  # Return positive value for credits used
            response.credits_balance = transaction.balance_after
            return response
        except Exception as e:
            logger.error("audio_generation_failed", user_id=user.id, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Audio generation failed: {str(e)}")

    async def _estimate_cost(self, request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest], use_openrouter: bool) -> Decimal:
        """Estimate cost based on request type, preferring Web Gateway if available."""
        if isinstance(request, LLMRequest):
            request_type = "llm"
            local_cost = COST_PER_1K_TOKENS.get((request.task_type, request.budget_priority), Decimal("0.001"))
        elif isinstance(request, ImageGenerationRequest):
            request_type = "image"
            local_cost = Decimal("0.01")
        elif isinstance(request, VideoGenerationRequest):
            request_type = "video"
            local_cost = Decimal("0.05")
        elif isinstance(request, AudioGenerationRequest):
            request_type = "audio"
            local_cost = Decimal("0.005")
        else:
            raise ValueError("Unknown request type for cost estimation")

        # For media requests, look up creditCost from media_models table
        # Uses pricingTiers from configJson when available (resolution/duration-based pricing)
        if not isinstance(request, LLMRequest):
            try:
                from sqlalchemy import text
                import json as _json
                result = await self.db.execute(
                    text('SELECT "creditCost", "configJson" FROM media_models WHERE "modelId" = :model_id LIMIT 1'),
                    {"model_id": request.model}
                )
                row = result.fetchone()
                if row and row[0]:
                    credit_cost = row[0]  # default flat cost
                    config_json = row[1]

                    # Try to use pricingTiers for more accurate cost
                    if config_json:
                        try:
                            config = _json.loads(config_json) if isinstance(config_json, str) else config_json
                            pricing_tiers = config.get("pricingTiers") if isinstance(config, dict) else None
                            if pricing_tiers and isinstance(pricing_tiers, dict):
                                # Build tier key from request parameters
                                resolution = getattr(request, "resolution", None)
                                duration = getattr(request, "duration", None)
                                formula = config.get("pricingFormula", "flat")

                                tier_key = None
                                if formula == "flat" and resolution and resolution in pricing_tiers:
                                    tier_key = resolution
                                elif formula == "per_duration" and duration:
                                    tier_key = f"{duration}s"
                                elif formula == "matrix":
                                    # Build composite key from pricing-affecting fields
                                    parts = []
                                    for field in sorted(config.get("inputFields", []), key=lambda f: {"resolution": 0, "quality": 1, "duration": 2}.get(f.get("key", ""), 99)):
                                        if field.get("affectsPricing"):
                                            val = getattr(request, field["key"], None) or field.get("default")
                                            if val is not None:
                                                s = str(val)
                                                if field["key"] == "duration" and not s.endswith("s"):
                                                    s += "s"
                                                parts.append(s)
                                    if parts:
                                        tier_key = "-".join(parts)

                                if tier_key and tier_key in pricing_tiers:
                                    credit_cost = pricing_tiers[tier_key]
                                    logger.info("estimate_cost_from_pricing_tier", model=request.model, tier_key=tier_key, credit_cost=credit_cost)
                        except Exception as e:
                            logger.debug(f"Could not parse pricingTiers: {e}")

                    # Convert platform credits to USD (1000 credits = $1)
                    db_cost = Decimal(str(credit_cost)) / Decimal("1000")
                    logger.info("estimate_cost_from_db", model=request.model, credit_cost=credit_cost, usd_cost=float(db_cost))
                    return db_cost
            except Exception as e:
                logger.debug(f"Could not look up model cost from DB: {e}")

        try:
            gateway_cost = await self.web_gateway.estimate_cost(
                request_type=request_type,
                model=request.model
            )
            if gateway_cost is not None:
                return Decimal(str(gateway_cost))
        except Exception as e:
            logger.warning(f"Failed to get cost from gateway: {e}, using local estimate")

        return local_cost

    async def _deduct_credits(
        self,
        user: User,
        actual_cost: Decimal,
        request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest],
        response: Union[LLMResponse, ImageGenerationResponse, VideoGenerationResponse, AudioGenerationResponse],
        estimated_cost: Decimal,
        use_openrouter: bool
    ):
        """
        Deduct credits from user account via Web Gateway or local service.

        IMPORTANT: Uses a fresh database session to avoid MissingGreenlet errors
        that can occur when the original session becomes stale after long-running
        operations (like Kie.ai image generation which can take 40+ seconds).
        """
        request_type = request.__class__.__name__

        # Determine request type for gateway
        if isinstance(request, LLMRequest):
            gateway_request_type = "llm"
        elif isinstance(request, ImageGenerationRequest):
            gateway_request_type = "image"
        elif isinstance(request, VideoGenerationRequest):
            gateway_request_type = "video"
        elif isinstance(request, AudioGenerationRequest):
            gateway_request_type = "audio"
        else:
            gateway_request_type = "unknown"

        metadata = {
            "request_type": request_type,
            "model": request.model,
            "estimated_cost_usd": float(estimated_cost),
            "actual_cost_usd": float(actual_cost),
            "use_openrouter": use_openrouter,
            "response_id": getattr(response, "id", None),
            "provider": getattr(response, "provider", None),
        }

        # Try to deduct via Web Gateway first
        gateway_result = await self.web_gateway.deduct_credits(
            user_id=user.id,
            amount_usd=float(actual_cost),
            description=f"{gateway_request_type.upper()} Generation: {request.model}",
            request_type=gateway_request_type,
            model=request.model,
            metadata=metadata
        )

        if gateway_result:
            logger.info(
                "credits_deducted_via_gateway",
                user_id=user.id,
                amount_usd=float(actual_cost),
                transaction_id=gateway_result.transaction_id,
                balance_after=gateway_result.balance_after_usd,
            )
            return gateway_result

        # Fall back to local credit service with a FRESH database session
        # This is critical for long-running operations like Kie.ai image generation
        # which can take 40+ seconds, causing the original session to become stale
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as fresh_db:
            fresh_credit_service = CreditService(fresh_db)
            transaction = await fresh_credit_service.deduct_credits(
                user_id=str(user.id),
                llm_cost_usd=Decimal(str(actual_cost)) if not isinstance(actual_cost, Decimal) else actual_cost,
                description=f"{gateway_request_type.upper()} Generation: {request.model}",
                metadata=metadata
            )
            logger.info(
                "credits_deducted_locally",
                user_id=str(user.id),
                amount_usd=float(actual_cost),
                balance_after=float(transaction.balance_after),
                transaction_id=transaction.id,
            )
            return transaction

    async def _check_credits(self, user: User, estimated_cost: Decimal) -> None:
        """Check if user has sufficient credits."""
        has_credits = await self.credit_service.check_sufficient_credits(
            user_id=user.id,
            estimated_cost_usd=estimated_cost
        )

        if not has_credits:
            balance_credits = await self.credit_service.get_balance(user.id)
            balance_usd = credits_to_usd(balance_credits)
            required_credits = usd_to_credits(estimated_cost)
            
            logger.warning(
                "insufficient_credits",
                user_id=user.id,
                balance_credits=balance_credits,
                balance_usd=float(balance_usd),
                needed_credits=required_credits,
                needed_usd=float(estimated_cost),
            )
            
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": "Insufficient credits",
                    "balance_credits": balance_credits,
                    "balance_usd": float(balance_usd),
                    "required_credits": required_credits,
                    "required_usd": float(estimated_cost),
                    "message": (
                        f"You need {required_credits:,} credits (${estimated_cost:.2f}) "
                        f"but only have {balance_credits:,} credits (${balance_usd:.2f}). "
                        "Please top up your account."
                    )
                }
            )
    
    async def _invoke_via_openrouter(
        self,
        request: LLMRequest,
        user: User,
        fallback_models: Optional[List[str]],
        sort: Optional[Literal["price", "throughput", "latency"]],
        data_collection: Literal["allow", "deny"],
        zdr: Optional[bool],
        max_price: Optional[Dict[str, float]],
    ) -> LLMResponse:
        """Invoke LLM via OpenRouter unified client."""
        try:
            response = await self.unified_client.chat(
                messages=request.messages,
                model=request.preferred_model,
                task_type=request.task_type,
                budget_priority=request.budget_priority,
                use_openrouter=True,
                fallback_models=fallback_models,
                sort=sort,
                data_collection=data_collection,
                zdr=zdr,
                max_price=max_price,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
            
            logger.info(
                "llm_openrouter_success",
                user_id=user.id,
                model_requested=request.preferred_model,
                model_used=response.model,
                provider=response.provider,
                tokens=response.tokens_used or 0,
            )
            
            return response
            
        except Exception as e:
            logger.error(
                "llm_openrouter_failed",
                user_id=user.id,
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"LLM call failed: {str(e)}"
            )
    
    async def _invoke_via_direct(
        self,
        request: LLMRequest,
        user: User
    ) -> LLMResponse:
        """
        Invoke LLM via direct provider client.
        """
        try:
            response = await self.unified_client.chat(
                messages=request.messages,
                model=request.preferred_model,
                task_type=request.task_type,
                budget_priority=request.budget_priority,
                use_openrouter=False,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
            
            logger.info(
                "llm_direct_success",
                user_id=user.id,
                model_requested=request.preferred_model,
                model_used=response.model,
                provider=response.provider,
                tokens=response.tokens_used or 0,
            )
            
            return response
            
        except Exception as e:
            logger.error(
                "llm_direct_failed",
                user_id=user.id,
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"LLM call failed: {str(e)}"
            )


class LLMGatewayV1(LLMGateway):
    """
    LLM Gateway V1 (Legacy Compatibility)
    This class is kept for backward compatibility only.
    """
    pass


class LLMGatewayV2(LLMGateway):
    """
    LLM Gateway V2 (Legacy Compatibility)
    This class is kept for backward compatibility only.
    """
    pass
