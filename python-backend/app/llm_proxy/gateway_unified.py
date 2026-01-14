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
        response.credits_used = transaction.amount
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

        if not self.unified_client.kie_ai_client:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Kie.ai client not initialized or enabled")

        try:
            image_data = await self.unified_client.kie_ai_client.generate_image(
                model=request.model,
                prompt=request.prompt,
                **request.dict(exclude_unset=True, exclude={
                    "model", "prompt", "user", "reference_image_urls", "reference_style_url"
                })
            )
            # Handle reference images if any
            if request.reference_image_urls:
                # This part needs more sophisticated handling, e.g., uploading to Kie.ai first
                logger.warning("Reference image URLs are not fully supported yet for Kie.ai direct generation.")

            response = ImageGenerationResponse(
                id=image_data.get("id", ""),
                model=request.model,
                provider="kie_ai",
                created=image_data.get("created", 0),
                data=image_data.get("data", []),
            )

            actual_cost = estimated_cost # For now, assume estimated is actual
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = transaction.amount
            response.credits_balance = transaction.balance_after
            return response
        except Exception as e:
            logger.error("image_generation_failed", user_id=user.id, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Image generation failed: {str(e)}")

    async def generate_video(
        self,
        request: VideoGenerationRequest,
        user: User
    ) -> VideoGenerationResponse:
        """
        Generate video with credit checking.
        """
        logger.info("video_generation_request", user_id=user.id, model=request.model)

        # Estimate cost via Web Gateway or use local estimate
        estimated_cost = await self._estimate_cost(request, False)
        await self._check_credits(user, estimated_cost)

        if not self.unified_client.kie_ai_client:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Kie.ai client not initialized or enabled")

        try:
            video_data = await self.unified_client.kie_ai_client.generate_video(
                model=request.model,
                prompt=request.prompt,
                **request.dict(exclude_unset=True, exclude={
                    "model", "prompt", "user", "reference_video_url", "reference_image_urls"
                })
            )
            response = VideoGenerationResponse(
                id=video_data.get("id", ""),
                model=request.model,
                provider="kie_ai",
                created=video_data.get("created", 0),
                data=video_data.get("data", []),
            )

            actual_cost = estimated_cost
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = transaction.amount
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
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Kie.ai client not initialized or enabled")

        try:
            audio_data = await self.unified_client.kie_ai_client.generate_audio(
                model=request.model,
                text=request.text,
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

            actual_cost = estimated_cost
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = transaction.amount
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
        
        # Fall back to local credit service
        transaction = await self.credit_service.deduct_credits(
            user_id=user.id,
            amount_usd=actual_cost,
            description=f"{gateway_request_type.upper()} Generation: {request.model}",
            metadata=metadata
        )
        logger.info(
            "credits_deducted_locally",
            user_id=user.id,
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
