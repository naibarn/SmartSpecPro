"""
SmartSpec Pro - Authenticated Generation Service
Generation service with API key authentication and usage tracking.
"""

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.generation.models import MediaType, get_model
from app.services.generation.generation_service import (
    GenerationService,
    GenerationTaskCreate,
    GenerationTaskResponse,
    get_generation_service,
)
from app.services.generation.key_service import (
    KeyManagementService,
    get_key_management_service,
)
from app.services.generation.authenticated_storage import (
    AuthenticatedStorageService,
    get_authenticated_storage,
)

logger = structlog.get_logger()


# =============================================================================
# GENERATION CREDITS
# =============================================================================

class GenerationCredits:
    """Credits configuration for generation operations."""
    
    # Base credits per operation type
    IMAGE_BASE_CREDITS = 1.0
    VIDEO_BASE_CREDITS = 5.0
    AUDIO_BASE_CREDITS = 0.5
    
    # Multipliers
    HD_MULTIPLIER = 1.5
    UHD_MULTIPLIER = 2.0
    LONG_VIDEO_MULTIPLIER = 2.0  # > 5 seconds
    
    @classmethod
    def calculate_credits(
        cls,
        media_type: str,
        model_id: str,
        options: Dict[str, Any],
    ) -> float:
        """Calculate credits for a generation task."""
        model = get_model(model_id)
        if not model:
            return 0
        
        # Start with model's base credits
        credits = model.base_credits
        
        # Apply resolution multiplier
        resolution = options.get("resolution", "")
        if "1080" in resolution or "hd" in resolution.lower():
            credits *= cls.HD_MULTIPLIER
        elif "2160" in resolution or "4k" in resolution.lower():
            credits *= cls.UHD_MULTIPLIER
        
        # Apply duration multiplier for video
        if media_type == "video":
            duration = options.get("duration", 5)
            if duration > 5:
                credits *= cls.LONG_VIDEO_MULTIPLIER
        
        return round(credits, 2)


# =============================================================================
# CREDITS TRACKER
# =============================================================================

class CreditsTracker:
    """
    Tracks credits usage per user/API key.
    
    In production, this should use Redis or database.
    """
    
    def __init__(self):
        # In-memory tracking (use Redis/DB in production)
        self._credits: Dict[str, Dict[str, Any]] = {}
        self._usage_history: Dict[str, List[Dict[str, Any]]] = {}
    
    def get_balance(self, user_id: str) -> Dict[str, Any]:
        """Get credits balance for a user."""
        if user_id not in self._credits:
            self._credits[user_id] = {
                "total_credits": 100.0,  # Default starting credits
                "used_credits": 0.0,
                "reserved_credits": 0.0,  # For in-progress tasks
                "last_updated": datetime.utcnow(),
            }
        return self._credits[user_id]
    
    def get_available_credits(self, user_id: str) -> float:
        """Get available credits (total - used - reserved)."""
        balance = self.get_balance(user_id)
        return balance["total_credits"] - balance["used_credits"] - balance["reserved_credits"]
    
    def reserve_credits(self, user_id: str, amount: float, task_id: str) -> bool:
        """Reserve credits for a task."""
        available = self.get_available_credits(user_id)
        if available < amount:
            return False
        
        balance = self.get_balance(user_id)
        balance["reserved_credits"] += amount
        balance["last_updated"] = datetime.utcnow()
        
        logger.info(
            "Credits reserved",
            user_id=user_id,
            amount=amount,
            task_id=task_id,
        )
        return True
    
    def commit_credits(self, user_id: str, amount: float, task_id: str):
        """Commit reserved credits (task completed)."""
        balance = self.get_balance(user_id)
        balance["reserved_credits"] = max(0, balance["reserved_credits"] - amount)
        balance["used_credits"] += amount
        balance["last_updated"] = datetime.utcnow()
        
        # Record in history
        if user_id not in self._usage_history:
            self._usage_history[user_id] = []
        
        self._usage_history[user_id].append({
            "task_id": task_id,
            "amount": amount,
            "timestamp": datetime.utcnow(),
            "type": "generation",
        })
        
        logger.info(
            "Credits committed",
            user_id=user_id,
            amount=amount,
            task_id=task_id,
        )
    
    def release_credits(self, user_id: str, amount: float, task_id: str):
        """Release reserved credits (task failed/cancelled)."""
        balance = self.get_balance(user_id)
        balance["reserved_credits"] = max(0, balance["reserved_credits"] - amount)
        balance["last_updated"] = datetime.utcnow()
        
        logger.info(
            "Credits released",
            user_id=user_id,
            amount=amount,
            task_id=task_id,
        )
    
    def add_credits(self, user_id: str, amount: float, reason: str):
        """Add credits to user balance."""
        balance = self.get_balance(user_id)
        balance["total_credits"] += amount
        balance["last_updated"] = datetime.utcnow()
        
        if user_id not in self._usage_history:
            self._usage_history[user_id] = []
        
        self._usage_history[user_id].append({
            "amount": amount,
            "timestamp": datetime.utcnow(),
            "type": "credit",
            "reason": reason,
        })
    
    def get_usage_history(
        self,
        user_id: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Get usage history for a user."""
        history = self._usage_history.get(user_id, [])
        return sorted(
            history,
            key=lambda x: x["timestamp"],
            reverse=True,
        )[:limit]


# =============================================================================
# AUTHENTICATED GENERATION SERVICE
# =============================================================================

class AuthenticatedGenerationService:
    """
    Generation service with API key authentication.
    
    Features:
    - API key validation before generation
    - Credits tracking and enforcement
    - Usage history
    - Rate limiting
    """
    
    def __init__(
        self,
        session: AsyncSession,
        generation_service: Optional[GenerationService] = None,
    ):
        self.session = session
        self.generation_service = generation_service or get_generation_service()
        self.key_service = get_key_management_service(session)
        self.storage_service = get_authenticated_storage(session)
        self.credits_tracker = CreditsTracker()
        
        # Track tasks with their credit reservations
        self._task_credits: Dict[str, float] = {}
    
    # =========================================================================
    # AUTHENTICATION
    # =========================================================================
    
    async def validate_api_key(
        self,
        api_key: str,
        required_scope: str = "generation:create",
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Validate API key for generation operations.
        
        Args:
            api_key: The API key to validate
            required_scope: Required scope
            ip_address: Client IP for logging
            user_agent: Client user agent for logging
            
        Returns:
            Validated key info or None if invalid
        """
        result = await self.key_service.validate_key(
            api_key=api_key,
            required_scope=required_scope,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        if not result:
            logger.warning(
                "Generation API key validation failed",
                ip_address=ip_address,
            )
            return None
        
        return result
    
    # =========================================================================
    # AUTHENTICATED GENERATION
    # =========================================================================
    
    async def create_generation_task(
        self,
        api_key: str,
        model_id: str,
        prompt: str,
        options: Optional[Dict[str, Any]] = None,
        reference_files: Optional[List[str]] = None,
        callback_url: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a generation task with API key authentication.
        
        Args:
            api_key: API key for authentication
            model_id: Model to use for generation
            prompt: Generation prompt
            options: Generation options
            reference_files: Reference files for img2img, etc.
            callback_url: Webhook URL for completion notification
            ip_address: Client IP
            
        Returns:
            Task creation result
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="generation:create",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        options = options or {}
        
        # Get model info
        model = get_model(model_id)
        if not model:
            return {"error": "invalid_model", "message": f"Unknown model: {model_id}"}
        
        # Calculate credits
        credits_needed = GenerationCredits.calculate_credits(
            media_type=model.media_type.value,
            model_id=model_id,
            options=options,
        )
        
        # Check and reserve credits
        if not self.credits_tracker.reserve_credits(user_id, credits_needed, "pending"):
            available = self.credits_tracker.get_available_credits(user_id)
            return {
                "error": "insufficient_credits",
                "message": f"Insufficient credits. Need {credits_needed}, have {available}",
                "credits_needed": credits_needed,
                "credits_available": available,
            }
        
        try:
            # Create task
            task_data = GenerationTaskCreate(
                user_id=user_id,
                model_id=model_id,
                prompt=prompt,
                media_type=model.media_type,
                options=options,
                reference_files=reference_files,
                callback_url=callback_url,
            )
            
            response = await self.generation_service.create_generation_task(task_data)
            
            # Update credit reservation with actual task ID
            self._task_credits[response.id] = credits_needed
            
            logger.info(
                "Authenticated generation task created",
                user_id=user_id,
                task_id=response.id,
                model_id=model_id,
                credits_reserved=credits_needed,
            )
            
            return {
                "success": True,
                "task": response.to_dict(),
                "credits_reserved": credits_needed,
            }
            
        except Exception as e:
            # Release reserved credits on error
            self.credits_tracker.release_credits(user_id, credits_needed, "failed")
            logger.error("Generation task creation failed", error=str(e))
            return {"error": "creation_failed", "message": str(e)}
    
    async def get_task_status(
        self,
        api_key: str,
        task_id: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get task status with API key authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="generation:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Get task status
        response = await self.generation_service.get_task_status(task_id)
        
        if not response:
            return {"error": "task_not_found", "message": f"Task not found: {task_id}"}
        
        # Verify ownership
        if response.user_id != user_id:
            return {"error": "access_denied", "message": "You don't have access to this task"}
        
        # Handle credits on completion
        if response.status in ("completed", "failed", "cancelled"):
            credits_reserved = self._task_credits.pop(task_id, 0)
            
            if response.status == "completed":
                self.credits_tracker.commit_credits(user_id, credits_reserved, task_id)
            else:
                self.credits_tracker.release_credits(user_id, credits_reserved, task_id)
        
        return {
            "success": True,
            "task": response.to_dict(),
        }
    
    async def wait_for_task(
        self,
        api_key: str,
        task_id: str,
        timeout: int = 300,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Wait for task completion with API key authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="generation:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Wait for task
        response = await self.generation_service.wait_for_task(task_id, timeout)
        
        if not response:
            return {"error": "task_not_found", "message": f"Task not found: {task_id}"}
        
        if response.user_id != user_id:
            return {"error": "access_denied", "message": "You don't have access to this task"}
        
        # Handle credits
        credits_reserved = self._task_credits.pop(task_id, 0)
        
        if response.status == "completed":
            self.credits_tracker.commit_credits(user_id, credits_reserved, task_id)
        else:
            self.credits_tracker.release_credits(user_id, credits_reserved, task_id)
        
        return {
            "success": True,
            "task": response.to_dict(),
        }
    
    async def get_user_tasks(
        self,
        api_key: str,
        media_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get user's generation tasks with API key authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="generation:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Get tasks
        media_type_enum = MediaType(media_type) if media_type else None
        tasks = await self.generation_service.get_user_tasks(
            user_id=user_id,
            media_type=media_type_enum,
            status=status,
            limit=limit,
            offset=offset,
        )
        
        return {
            "success": True,
            "tasks": [t.to_dict() for t in tasks],
            "count": len(tasks),
        }
    
    async def delete_task(
        self,
        api_key: str,
        task_id: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete a task with API key authentication.
        """
        # Validate API key
        key_info = await self.validate_api_key(
            api_key,
            required_scope="generation:delete",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        
        # Delete task
        success = await self.generation_service.delete_task(task_id, user_id)
        
        if not success:
            return {"error": "delete_failed", "message": "Task not found or access denied"}
        
        return {"success": True, "task_id": task_id}
    
    # =========================================================================
    # CREDITS MANAGEMENT
    # =========================================================================
    
    async def get_credits_balance(
        self,
        api_key: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get credits balance with API key authentication.
        """
        key_info = await self.validate_api_key(
            api_key,
            required_scope="credits:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        balance = self.credits_tracker.get_balance(user_id)
        available = self.credits_tracker.get_available_credits(user_id)
        
        return {
            "success": True,
            "balance": {
                "total_credits": balance["total_credits"],
                "used_credits": balance["used_credits"],
                "reserved_credits": balance["reserved_credits"],
                "available_credits": available,
            },
        }
    
    async def get_usage_history(
        self,
        api_key: str,
        limit: int = 50,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get usage history with API key authentication.
        """
        key_info = await self.validate_api_key(
            api_key,
            required_scope="credits:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        user_id = key_info["user_id"]
        history = self.credits_tracker.get_usage_history(user_id, limit)
        
        # Convert datetime to ISO format
        for item in history:
            if "timestamp" in item:
                item["timestamp"] = item["timestamp"].isoformat()
        
        return {
            "success": True,
            "history": history,
        }
    
    # =========================================================================
    # MODEL INFO
    # =========================================================================
    
    async def list_models(
        self,
        api_key: str,
        media_type: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List available models with API key authentication.
        """
        key_info = await self.validate_api_key(
            api_key,
            required_scope="generation:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        media_type_enum = MediaType(media_type) if media_type else None
        models = self.generation_service.list_models(media_type=media_type_enum)
        
        return {
            "success": True,
            "models": models,
        }
    
    async def get_model_info(
        self,
        api_key: str,
        model_id: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get model info with API key authentication.
        """
        key_info = await self.validate_api_key(
            api_key,
            required_scope="generation:read",
            ip_address=ip_address,
        )
        
        if not key_info:
            return {"error": "invalid_api_key", "message": "Invalid or expired API key"}
        
        model_info = self.generation_service.get_model_info(model_id)
        
        if not model_info:
            return {"error": "model_not_found", "message": f"Unknown model: {model_id}"}
        
        return {
            "success": True,
            "model": model_info,
        }


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_authenticated_generation_service(
    session: AsyncSession,
) -> AuthenticatedGenerationService:
    """Get authenticated generation service instance."""
    return AuthenticatedGenerationService(session)
