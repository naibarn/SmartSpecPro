"""
Model Comparison Service
Run same prompt on multiple models and compare results
"""

import uuid
import asyncio
import time
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.model_comparison import ModelComparison
from app.llm_proxy.unified_client import get_unified_client
from app.services.credit_service import CreditService
from app.core.credits import usd_to_credits


class ModelComparisonService:
    """Service for comparing LLM models"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm_client = get_unified_client()
        self.credit_service = CreditService(db)
    
    async def compare_models(
        self,
        user_id: str,
        prompt: str,
        models: List[Dict[str, str]],  # [{"provider": "openai", "model": "gpt-4"}]
        max_tokens: int = 1000,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        Compare multiple models with the same prompt
        
        Args:
            user_id: User ID
            prompt: Prompt to test
            models: List of {provider, model} to compare
            max_tokens: Maximum tokens per response
            temperature: Temperature for generation
        
        Returns:
            Comparison results
        """
        # Check user has enough credits (estimate)
        estimated_cost_usd = self._estimate_cost(models, prompt, max_tokens)
        estimated_credits = usd_to_credits(estimated_cost_usd)
        
        user_credits = await self.credit_service.get_balance(user_id)
        if user_credits < estimated_credits:
            raise ValueError(
                f"Insufficient credits. Need ~{estimated_credits}, have {user_credits}"
            )
        
        # Run comparisons in parallel
        tasks = []
        for model_config in models:
            task = self._run_single_model(
                user_id=user_id,
                prompt=prompt,
                provider=model_config["provider"],
                model=model_config["model"],
                max_tokens=max_tokens,
                temperature=temperature
            )
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        comparison_results = []
        total_cost_usd = 0.0
        total_credits_used = 0
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                comparison_results.append({
                    "provider": models[i]["provider"],
                    "model": models[i]["model"],
                    "error": str(result),
                    "response": None,
                    "tokens": 0,
                    "cost_usd": 0.0,
                    "credits_used": 0,
                    "latency_ms": 0
                })
            else:
                comparison_results.append(result)
                total_cost_usd += result["cost_usd"]
                total_credits_used += result["credits_used"]
        
        # Save comparison
        comparison_id = str(uuid.uuid4())
        comparison = ModelComparison(
            id=comparison_id,
            user_id=user_id,
            prompt=prompt,
            models=models,
            results=comparison_results,
            total_cost_usd=total_cost_usd,
            total_credits_used=total_credits_used,
            created_at=datetime.utcnow()
        )
        
        self.db.add(comparison)
        await self.db.commit()
        await self.db.refresh(comparison)
        
        return self._comparison_to_dict(comparison)
    
    async def get_comparison(
        self,
        comparison_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a comparison by ID
        
        Args:
            comparison_id: Comparison ID
            user_id: User ID
        
        Returns:
            Comparison or None
        """
        result = await self.db.execute(
            select(ModelComparison).where(
                ModelComparison.id == comparison_id,
                ModelComparison.user_id == user_id
            )
        )
        comparison = result.scalar_one_or_none()
        
        if not comparison:
            return None
        
        return self._comparison_to_dict(comparison)
    
    async def list_comparisons(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List user's comparisons
        
        Args:
            user_id: User ID
            limit: Maximum number of results
            offset: Offset for pagination
        
        Returns:
            List of comparisons
        """
        result = await self.db.execute(
            select(ModelComparison)
            .where(ModelComparison.user_id == user_id)
            .order_by(ModelComparison.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        comparisons = result.scalars().all()
        
        return [self._comparison_to_dict(c) for c in comparisons]
    
    async def delete_comparison(
        self,
        comparison_id: str,
        user_id: str
    ) -> bool:
        """
        Delete a comparison
        
        Args:
            comparison_id: Comparison ID
            user_id: User ID
        
        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            select(ModelComparison).where(
                ModelComparison.id == comparison_id,
                ModelComparison.user_id == user_id
            )
        )
        comparison = result.scalar_one_or_none()
        
        if not comparison:
            return False
        
        await self.db.delete(comparison)
        await self.db.commit()
        
        return True
    
    async def _run_single_model(
        self,
        user_id: str,
        prompt: str,
        provider: str,
        model: str,
        max_tokens: int,
        temperature: float
    ) -> Dict[str, Any]:
        """
        Run a single model and return results
        
        Args:
            user_id: User ID
            prompt: Prompt
            provider: Provider name
            model: Model name
            max_tokens: Max tokens
            temperature: Temperature
        
        Returns:
            Result dictionary
        """
        start_time = time.time()
        
        try:
            # Call LLM
            response = await self.llm_client.invoke(
                provider=provider,
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=temperature
            )
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Calculate cost
            cost_usd = response.get("cost_usd", 0.0)
            credits_used = usd_to_credits(cost_usd)
            
            # Deduct credits
            await self.credit_service.deduct_credits(
                user_id=user_id,
                amount=credits_used,
                description=f"Model comparison: {provider}/{model}",
                metadata={
                    "provider": provider,
                    "model": model,
                    "type": "comparison"
                }
            )
            
            return {
                "provider": provider,
                "model": model,
                "response": response.get("content", ""),
                "tokens": response.get("total_tokens", 0),
                "cost_usd": cost_usd,
                "credits_used": credits_used,
                "latency_ms": latency_ms,
                "error": None
            }
        
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            
            return {
                "provider": provider,
                "model": model,
                "response": None,
                "tokens": 0,
                "cost_usd": 0.0,
                "credits_used": 0,
                "latency_ms": latency_ms,
                "error": str(e)
            }
    
    def _estimate_cost(
        self,
        models: List[Dict[str, str]],
        prompt: str,
        max_tokens: int
    ) -> float:
        """
        Estimate total cost for comparison
        
        Args:
            models: List of models
            prompt: Prompt
            max_tokens: Max tokens
        
        Returns:
            Estimated cost in USD
        """
        # Rough estimate: $0.01 per model
        # In reality, this varies by model
        return len(models) * 0.01
    
    def _comparison_to_dict(self, comparison: ModelComparison) -> Dict[str, Any]:
        """Convert comparison to dictionary"""
        return {
            "id": comparison.id,
            "user_id": comparison.user_id,
            "prompt": comparison.prompt,
            "models": comparison.models,
            "results": comparison.results,
            "total_cost_usd": comparison.total_cost_usd,
            "total_credits_used": comparison.total_credits_used,
            "created_at": comparison.created_at.isoformat()
        }
