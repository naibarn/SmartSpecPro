"""
SmartSpecWeb Gateway Client

This module provides a client for communicating with the SmartSpecWeb gateway
to handle credit calculations, deductions, and cost tracking for media generation
and LLM operations.
"""

import httpx
import structlog
from typing import Optional, Dict, Any
from decimal import Decimal
from pydantic import BaseModel

from app.core.settings import settings

logger = structlog.get_logger()


class CreditDeductionRequest(BaseModel):
    """Request model for credit deduction via gateway."""
    user_id: str
    amount_usd: float
    description: str
    request_type: str  # "llm", "image", "video", "audio"
    model: str
    metadata: Optional[Dict[str, Any]] = None


class CreditDeductionResponse(BaseModel):
    """Response model from gateway credit deduction."""
    success: bool
    transaction_id: str
    balance_before_usd: float
    balance_after_usd: float
    amount_deducted_usd: float
    message: Optional[str] = None


class CostEstimationRequest(BaseModel):
    """Request model for cost estimation via gateway."""
    request_type: str  # "llm", "image", "video", "audio"
    model: str
    parameters: Optional[Dict[str, Any]] = None


class CostEstimationResponse(BaseModel):
    """Response model from gateway cost estimation."""
    estimated_cost_usd: float
    currency: str = "USD"
    note: Optional[str] = None


class WebGatewayClient:
    """
    Client for SmartSpecWeb Gateway.
    
    Handles:
    - Credit deduction and tracking
    - Cost estimation for different media types
    - User balance checking
    - Transaction logging
    """
    
    def __init__(self):
        """Initialize the gateway client."""
        self.base_url = settings.WEB_GATEWAY_URL
        self.token = settings.WEB_GATEWAY_TOKEN
        self.enabled = bool(self.base_url and self.token and settings.USE_WEB_GATEWAY)
        
        if not self.enabled:
            logger.warning("SmartSpecWeb Gateway is disabled or not configured")
    
    async def deduct_credits(
        self,
        user_id: str,
        amount_usd: float,
        description: str,
        request_type: str,
        model: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[CreditDeductionResponse]:
        """
        Deduct credits from user account via gateway.
        
        Args:
            user_id: User ID
            amount_usd: Amount to deduct in USD
            description: Description of the charge
            request_type: Type of request (llm, image, video, audio)
            model: Model used
            metadata: Additional metadata
            
        Returns:
            CreditDeductionResponse if successful, None if gateway is disabled
        """
        if not self.enabled:
            logger.debug("Gateway disabled, skipping credit deduction")
            return None
        
        try:
            request = CreditDeductionRequest(
                user_id=user_id,
                amount_usd=amount_usd,
                description=description,
                request_type=request_type,
                model=model,
                metadata=metadata or {}
            )
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/credits/deduct",
                    json=request.model_dump(),
                    headers={"Authorization": f"Bearer {self.token}"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    result = CreditDeductionResponse(**data)
                    logger.info(
                        "credits_deducted_via_gateway",
                        user_id=user_id,
                        amount_usd=amount_usd,
                        transaction_id=result.transaction_id,
                        balance_after=result.balance_after_usd
                    )
                    return result
                else:
                    logger.error(
                        "gateway_credit_deduction_failed",
                        user_id=user_id,
                        status_code=response.status_code,
                        response=response.text
                    )
                    return None
                    
        except Exception as e:
            logger.error(
                "gateway_credit_deduction_error",
                user_id=user_id,
                error=str(e)
            )
            return None
    
    async def estimate_cost(
        self,
        request_type: str,
        model: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> Optional[float]:
        """
        Estimate cost for a request via gateway.
        
        Args:
            request_type: Type of request (llm, image, video, audio)
            model: Model to use
            parameters: Additional parameters for cost calculation
            
        Returns:
            Estimated cost in USD, or None if gateway is disabled
        """
        if not self.enabled:
            logger.debug("Gateway disabled, using local cost estimation")
            return None
        
        try:
            request = CostEstimationRequest(
                request_type=request_type,
                model=model,
                parameters=parameters or {}
            )
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/costs/estimate",
                    json=request.model_dump(),
                    headers={"Authorization": f"Bearer {self.token}"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    result = CostEstimationResponse(**data)
                    logger.debug(
                        "cost_estimated_via_gateway",
                        request_type=request_type,
                        model=model,
                        estimated_cost=result.estimated_cost_usd
                    )
                    return result.estimated_cost_usd
                else:
                    logger.warning(
                        "gateway_cost_estimation_failed",
                        status_code=response.status_code,
                        response=response.text
                    )
                    return None
                    
        except Exception as e:
            logger.error(
                "gateway_cost_estimation_error",
                error=str(e)
            )
            return None
    
    async def check_balance(self, user_id: str) -> Optional[float]:
        """
        Check user balance via gateway.
        
        Args:
            user_id: User ID
            
        Returns:
            Balance in USD, or None if gateway is disabled
        """
        if not self.enabled:
            logger.debug("Gateway disabled, cannot check balance")
            return None
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v1/credits/balance/{user_id}",
                    headers={"Authorization": f"Bearer {self.token}"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    balance_usd = data.get("balance_usd", 0.0)
                    logger.debug(
                        "balance_checked_via_gateway",
                        user_id=user_id,
                        balance_usd=balance_usd
                    )
                    return balance_usd
                else:
                    logger.warning(
                        "gateway_balance_check_failed",
                        user_id=user_id,
                        status_code=response.status_code
                    )
                    return None
                    
        except Exception as e:
            logger.error(
                "gateway_balance_check_error",
                user_id=user_id,
                error=str(e)
            )
            return None


# Singleton instance
_gateway_client: Optional[WebGatewayClient] = None


def get_gateway_client() -> WebGatewayClient:
    """Get or create the gateway client singleton."""
    global _gateway_client
    if _gateway_client is None:
        _gateway_client = WebGatewayClient()
    return _gateway_client
