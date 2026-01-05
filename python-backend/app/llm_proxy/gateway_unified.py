"""
SmartSpec Pro - Unified LLM Gateway
Version: 2.0.0

This module consolidates gateway.py and gateway_v2.py into a single,
unified gateway that supports both direct provider access and OpenRouter.

Features:
- Credit checking and deduction
- Multi-provider support (direct + OpenRouter)
- Automatic fallbacks
- Load balancing (price, throughput, latency)
- Privacy controls (ZDR, data collection)
- Cost estimation and tracking
- Comprehensive logging
"""

from decimal import Decimal
from typing import Dict, Any, Optional, List, Literal
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.llm_proxy.proxy import LLMProxy, LLMProviderError
from app.llm_proxy.unified_client import get_unified_client, UnifiedLLMClient
from app.llm_proxy.models import LLMRequest, LLMResponse
from app.services.credit_service import CreditService, InsufficientCreditsError
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
        estimated_cost = self._estimate_cost(request, use_openrouter)
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
                tokens=response.usage.total_tokens if response.usage else 0,
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
        user: User,
    ) -> LLMResponse:
        """Invoke LLM via direct provider with fallback logic."""
        primary_provider = request.preferred_provider or "openai"  # Default to openai if not specified
        fallback_providers = self.llm_proxy.get_fallback_providers(primary_provider)
        
        # Try primary provider first
        try:
            logger.info("llm_direct_attempt", user_id=user.id, provider=primary_provider)
            response = await self.llm_proxy.invoke(request)
            return response
            
        except LLMProviderError as e:
            logger.warning(
                "llm_provider_failed",
                user_id=user.id,
                provider=primary_provider,
                error=str(e),
            )
            
            # Try fallback providers
            for fallback_provider in fallback_providers:
                try:
                    logger.info(
                        "llm_fallback_attempt",
                        user_id=user.id,
                        provider=fallback_provider
                    )
                    fallback_request = request.model_copy(update={"preferred_provider": fallback_provider})
                    response = await self.llm_proxy.invoke(fallback_request)
                    
                    logger.info(
                        "llm_fallback_succeeded",
                        user_id=user.id,
                        original_provider=primary_provider,
                        fallback_provider=fallback_provider,
                    )
                    return response
                    
                except LLMProviderError as fallback_e:
                    logger.warning(
                        "llm_fallback_failed",
                        user_id=user.id,
                        provider=fallback_provider,
                        error=str(fallback_e),
                    )
                    continue
            
            # All fallbacks failed
            logger.critical(
                "llm_all_fallbacks_failed",
                user_id=user.id,
                original_provider=primary_provider,
                fallbacks=fallback_providers,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "All LLM providers are currently unavailable. "
                    f"Please try again later. Final error: {str(e)}"
                )
            )
    
    async def _deduct_credits(
        self,
        user: User,
        actual_cost: Decimal,
        request: LLMRequest,
        response: LLMResponse,
        estimated_cost: Decimal,
        use_openrouter: bool,
    ):
        """Deduct credits from user account."""
        try:
            transaction = await self.credit_service.deduct_credits(
                user_id=user.id,
                llm_cost_usd=actual_cost,
                description=f"LLM call: {request.task_type} using {response.provider}/{response.model}",
                metadata={
                    "task_type": request.task_type,
                    "provider": response.provider,
                    "model": response.model,
                    "model_requested": request.preferred_model,
                    "tokens": response.tokens_used,
                    "prompt_tokens": 0,  # Not available in LLMResponse model
                    "completion_tokens": response.tokens_used,  # Approximate as completion tokens
                    "llm_cost": float(actual_cost),
                    "estimated_cost": float(estimated_cost),
                    "use_openrouter": use_openrouter,
                    "budget_priority": request.budget_priority,
                }
            )
            
            logger.info(
                "credits_deducted",
                user_id=user.id,
                credits_deducted=transaction.amount,
                usd_deducted=float(actual_cost),
                balance_after_credits=transaction.balance_after,
                balance_after_usd=float(credits_to_usd(transaction.balance_after)),
            )
            
            return transaction
            
        except InsufficientCreditsError as e:
            # This shouldn't happen since we checked before, but handle it anyway
            logger.error(
                "unexpected_insufficient_credits",
                user_id=user.id,
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": "Insufficient credits",
                    "required": float(e.required),
                    "available": float(e.available),
                }
            )
    
    def _estimate_cost(self, request: LLMRequest, use_openrouter: bool) -> Decimal:
        """
        Estimate LLM cost based on request.
        
        Args:
            request: LLM request
            use_openrouter: Whether using OpenRouter
        
        Returns:
            Estimated cost in USD
        """
        # Estimate tokens based on message length (1 token ≈ 4 characters)
        message_length = sum(len(msg.get("content", "")) for msg in request.messages)
        estimated_prompt_tokens = message_length // 4
        
        # Assume response is 2x input for most tasks
        estimated_completion_tokens = estimated_prompt_tokens * 2
        estimated_total_tokens = estimated_prompt_tokens + estimated_completion_tokens
        
        if use_openrouter and self.unified_client.openrouter_client:
            # Use unified client for more accurate estimation
            model = request.preferred_model or MODEL_MATRIX.get(
                (request.task_type, request.budget_priority),
                "openai/gpt-4o"
            )
            estimated_cost = self.unified_client.estimate_cost(
                model=model,
                prompt_tokens=estimated_prompt_tokens,
                completion_tokens=estimated_completion_tokens
            )
        else:
            # Use static cost matrix for direct providers
            key = (request.task_type, request.budget_priority)
            cost_per_1k = COST_PER_1K_TOKENS.get(key, Decimal("0.01"))
            estimated_cost = Decimal(str(estimated_total_tokens / 1000)) * cost_per_1k
        
        # Minimum cost: $0.0001
        return max(estimated_cost, Decimal("0.0001"))
    
    def _calculate_actual_cost(self, response: LLMResponse, use_openrouter: bool) -> Decimal:
        """
        Calculate actual cost from LLM response.
        
        Args:
            response: LLM response with usage stats
            use_openrouter: Whether using OpenRouter
        
        Returns:
            Actual cost in USD
        """
        # If response has cost field, use it directly
        if hasattr(response, 'cost') and response.cost:
            return Decimal(str(response.cost))
        
        # If no usage stats, estimate based on content length
        if not response.usage:
            content_length = len(response.content) if response.content else 0
            estimated_tokens = content_length // 4
            return Decimal(str(estimated_tokens / 1000 * 0.01))
        
        # Calculate cost using unified client
        if use_openrouter and self.unified_client.openrouter_client:
            return self.unified_client.estimate_cost(
                model=response.model,
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens
            )
        
        # Fallback: use response tokens_used if available
        tokens = response.usage.total_tokens if response.usage else response.tokens_used or 0
        return Decimal(str(tokens / 1000 * 0.01))
    
    async def get_user_balance(self, user: User) -> Dict[str, Any]:
        """
        Get user credit balance and transaction stats.
        
        Args:
            user: Current user
        
        Returns:
            Dictionary with balance and stats
        """
        balance_credits = await self.credit_service.get_balance(user.id)
        balance_usd = await self.credit_service.get_balance_usd(user.id)
        stats = await self.credit_service.get_transaction_stats(user.id)
        
        return {
            "balance_credits": balance_credits,
            "balance_usd": float(balance_usd),
            "stats": stats
        }
    
    async def get_available_models(self) -> Dict[str, Any]:
        """
        Get available models and providers.
        
        Returns:
            Dictionary with available models grouped by provider
        """
        return {
            "openrouter": {
                "enabled": self.unified_client.openrouter_client is not None,
                "models": "420+",
                "features": [
                    "Load balancing",
                    "Automatic fallbacks",
                    "Privacy controls (ZDR)",
                    "Cost controls"
                ]
            },
            "direct_providers": {
                "openai": "openai" in self.unified_client.direct_providers,
                "anthropic": "anthropic" in self.unified_client.direct_providers,
            },
            "recommended_models": {
                "code_generation": {
                    "quality": "anthropic/claude-3.5-sonnet",
                    "speed": "google/gemini-flash-1.5",
                    "cost": "meta-llama/llama-3.1-70b-instruct"
                },
                "analysis": {
                    "quality": "openai/gpt-4o",
                    "speed": "google/gemini-flash-1.5",
                    "cost": "meta-llama/llama-3.1-70b-instruct"
                },
                "planning": {
                    "quality": "anthropic/claude-3.5-sonnet",
                    "speed": "openai/gpt-4o-mini",
                    "cost": "meta-llama/llama-3.1-70b-instruct"
                },
                "simple": {
                    "quality": "openai/gpt-4o-mini",
                    "speed": "google/gemini-flash-1.5",
                    "cost": "meta-llama/llama-3.1-70b-instruct"
                }
            }
        }


# Backward compatibility aliases
LLMGatewayV1 = LLMGateway
LLMGatewayV2 = LLMGateway
