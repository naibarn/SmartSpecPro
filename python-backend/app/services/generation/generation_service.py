"""
SmartSpec Pro - Generation Service
Main service for handling image, video, and audio generation.
"""

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.services.generation.models import (
    MediaType,
    GenerationModel,
    get_model,
    get_models_by_type,
    get_active_models,
    list_models_summary,
)
from app.services.generation.kie_provider import (
    KieAIProvider,
    GenerationRequest,
    KieTaskResult,
    TaskStatus,
    get_kie_provider,
)
from app.services.generation.r2_storage import (
    R2StorageService,
    StoragePath,
    get_r2_storage,
)

logger = structlog.get_logger()


# =============================================================================
# GENERATION TASK SCHEMA
# =============================================================================

class GenerationTaskCreate:
    """Schema for creating a generation task."""
    
    def __init__(
        self,
        user_id: str,
        model_id: str,
        prompt: str,
        media_type: Optional[MediaType] = None,
        options: Optional[Dict[str, Any]] = None,
        reference_files: Optional[List[str]] = None,
        callback_url: Optional[str] = None,
    ):
        self.user_id = user_id
        self.model_id = model_id
        self.prompt = prompt
        self.media_type = media_type
        self.options = options or {}
        self.reference_files = reference_files or []
        self.callback_url = callback_url


class GenerationTaskResponse:
    """Response schema for generation task."""
    
    def __init__(
        self,
        id: str,
        user_id: str,
        task_type: str,
        model_id: str,
        status: str,
        prompt: str,
        options: Dict[str, Any],
        output_url: Optional[str] = None,
        thumbnail_url: Optional[str] = None,
        error_message: Optional[str] = None,
        credits_used: float = 0,
        progress: float = 0,
        created_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
    ):
        self.id = id
        self.user_id = user_id
        self.task_type = task_type
        self.model_id = model_id
        self.status = status
        self.prompt = prompt
        self.options = options
        self.output_url = output_url
        self.thumbnail_url = thumbnail_url
        self.error_message = error_message
        self.credits_used = credits_used
        self.progress = progress
        self.created_at = created_at
        self.completed_at = completed_at
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "task_type": self.task_type,
            "model_id": self.model_id,
            "status": self.status,
            "prompt": self.prompt,
            "options": self.options,
            "output_url": self.output_url,
            "thumbnail_url": self.thumbnail_url,
            "error_message": self.error_message,
            "credits_used": self.credits_used,
            "progress": self.progress,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


# =============================================================================
# GENERATION SERVICE
# =============================================================================

class GenerationService:
    """
    Main service for handling media generation.
    
    Coordinates between:
    - KieAI Provider (API calls)
    - R2 Storage (file storage)
    - Database (task tracking)
    """
    
    def __init__(
        self,
        kie_provider: Optional[KieAIProvider] = None,
        r2_storage: Optional[R2StorageService] = None,
    ):
        self.kie_provider = kie_provider or get_kie_provider()
        self.r2_storage = r2_storage or get_r2_storage()
        
        # In-memory task cache (for demo, should use Redis in production)
        self._tasks: Dict[str, Dict[str, Any]] = {}
    
    # =========================================================================
    # MODEL LISTING
    # =========================================================================
    
    def list_models(
        self,
        media_type: Optional[MediaType] = None,
        include_beta: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        List available generation models.
        
        Args:
            media_type: Filter by media type
            include_beta: Include beta models
            
        Returns:
            List of model summaries
        """
        if media_type:
            models = get_models_by_type(media_type)
        else:
            models = get_active_models()
        
        if not include_beta:
            models = {k: v for k, v in models.items() if v.status.value != "beta"}
        
        return [
            {
                "id": m.id,
                "name": m.name,
                "media_type": m.media_type.value,
                "description": m.description,
                "status": m.status.value,
                "is_featured": m.is_featured,
                "base_credits": m.base_credits,
                "aspect_ratios": m.aspect_ratios,
                "resolutions": m.resolutions,
                "durations": m.durations,
                "output_formats": m.output_formats,
                "tags": m.tags,
            }
            for m in models.values()
        ]
    
    def get_model_info(self, model_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed info for a specific model."""
        model = get_model(model_id)
        if not model:
            return None
        
        return {
            "id": model.id,
            "name": model.name,
            "provider": model.provider,
            "media_type": model.media_type.value,
            "description": model.description,
            "supports_image_input": model.supports_image_input,
            "supports_video_input": model.supports_video_input,
            "supports_audio_input": model.supports_audio_input,
            "max_prompt_length": model.max_prompt_length,
            "aspect_ratios": model.aspect_ratios,
            "resolutions": model.resolutions,
            "durations": model.durations,
            "output_formats": model.output_formats,
            "voices": model.voices,
            "base_credits": model.base_credits,
            "pricing_tiers": model.pricing_tiers,
            "status": model.status.value,
            "is_featured": model.is_featured,
            "tags": model.tags,
            "documentation_url": model.documentation_url,
        }
    
    # =========================================================================
    # GENERATION
    # =========================================================================
    
    async def create_generation_task(
        self,
        task_data: GenerationTaskCreate,
    ) -> GenerationTaskResponse:
        """
        Create a new generation task.
        
        Args:
            task_data: Task creation data
            
        Returns:
            GenerationTaskResponse with task ID and initial status
        """
        model = get_model(task_data.model_id)
        if not model:
            raise ValueError(f"Unknown model: {task_data.model_id}")
        
        # Generate task ID
        task_id = str(uuid4())
        
        # Build generation request
        request = GenerationRequest(
            model_id=task_data.model_id,
            prompt=task_data.prompt,
            image_urls=task_data.reference_files if model.supports_image_input else None,
            aspect_ratio=task_data.options.get("aspect_ratio"),
            resolution=task_data.options.get("resolution"),
            duration=task_data.options.get("duration"),
            output_format=task_data.options.get("output_format"),
            voice=task_data.options.get("voice"),
            stability=task_data.options.get("stability"),
            similarity_boost=task_data.options.get("similarity_boost"),
            speed=task_data.options.get("speed"),
            multi_shots=task_data.options.get("multi_shots"),
            callback_url=task_data.callback_url,
        )
        
        # Create task in kie.ai
        kie_result = await self.kie_provider.create_task(request)
        
        # Store task info
        task_info = {
            "id": task_id,
            "user_id": task_data.user_id,
            "task_type": model.media_type.value,
            "model_id": task_data.model_id,
            "prompt": task_data.prompt,
            "options": task_data.options,
            "reference_files": task_data.reference_files,
            "status": kie_result.status.value,
            "external_task_id": kie_result.task_id,
            "credits_used": kie_result.credits_used,
            "progress": 0,
            "output_url": None,
            "thumbnail_url": None,
            "error_message": None,
            "created_at": datetime.utcnow(),
            "started_at": None,
            "completed_at": None,
        }
        self._tasks[task_id] = task_info
        
        logger.info(
            "Generation task created",
            task_id=task_id,
            model_id=task_data.model_id,
            external_task_id=kie_result.task_id,
        )
        
        return GenerationTaskResponse(
            id=task_id,
            user_id=task_data.user_id,
            task_type=model.media_type.value,
            model_id=task_data.model_id,
            status=kie_result.status.value,
            prompt=task_data.prompt,
            options=task_data.options,
            credits_used=kie_result.credits_used,
            created_at=task_info["created_at"],
        )
    
    async def get_task_status(self, task_id: str) -> Optional[GenerationTaskResponse]:
        """
        Get the current status of a generation task.
        
        Args:
            task_id: Task ID
            
        Returns:
            GenerationTaskResponse with current status
        """
        task_info = self._tasks.get(task_id)
        if not task_info:
            return None
        
        # If task is still processing, query kie.ai
        if task_info["status"] in ("pending", "queued", "processing"):
            external_task_id = task_info.get("external_task_id")
            if external_task_id:
                try:
                    kie_result = await self.kie_provider.query_task(external_task_id)
                    await self._update_task_from_kie_result(task_id, kie_result)
                    task_info = self._tasks[task_id]
                except Exception as e:
                    logger.error("Error querying task status", task_id=task_id, error=str(e))
        
        return GenerationTaskResponse(
            id=task_info["id"],
            user_id=task_info["user_id"],
            task_type=task_info["task_type"],
            model_id=task_info["model_id"],
            status=task_info["status"],
            prompt=task_info["prompt"],
            options=task_info["options"],
            output_url=task_info.get("output_url"),
            thumbnail_url=task_info.get("thumbnail_url"),
            error_message=task_info.get("error_message"),
            credits_used=task_info.get("credits_used", 0),
            progress=task_info.get("progress", 0),
            created_at=task_info.get("created_at"),
            completed_at=task_info.get("completed_at"),
        )
    
    async def _update_task_from_kie_result(
        self,
        task_id: str,
        kie_result: KieTaskResult,
    ):
        """Update task info from kie.ai result."""
        task_info = self._tasks.get(task_id)
        if not task_info:
            return
        
        task_info["status"] = kie_result.status.value
        task_info["progress"] = kie_result.progress
        
        if kie_result.status == TaskStatus.PROCESSING:
            if not task_info.get("started_at"):
                task_info["started_at"] = datetime.utcnow()
        
        elif kie_result.status == TaskStatus.COMPLETED:
            task_info["completed_at"] = datetime.utcnow()
            
            # Download and store output in R2
            if kie_result.output_url:
                try:
                    output_url = await self._store_output(
                        task_info["user_id"],
                        task_id,
                        task_info["task_type"],
                        kie_result.output_url,
                    )
                    task_info["output_url"] = output_url
                    
                    # Create thumbnail for images
                    if task_info["task_type"] == "image":
                        thumbnail_url = await self._create_thumbnail(
                            task_info["user_id"],
                            task_id,
                            output_url,
                        )
                        task_info["thumbnail_url"] = thumbnail_url
                        
                except Exception as e:
                    logger.error("Error storing output", task_id=task_id, error=str(e))
                    task_info["output_url"] = kie_result.output_url  # Use original URL
        
        elif kie_result.status == TaskStatus.FAILED:
            task_info["completed_at"] = datetime.utcnow()
            task_info["error_message"] = kie_result.error_message
    
    async def _store_output(
        self,
        user_id: str,
        task_id: str,
        task_type: str,
        source_url: str,
    ) -> str:
        """Download output from kie.ai and store in R2."""
        # Determine storage path and extension
        ext = self._get_extension_from_url(source_url)
        
        if task_type == "image":
            key = StoragePath.image_generated(user_id, task_id, ext)
        elif task_type == "video":
            key = StoragePath.video_generated(user_id, task_id, ext)
        elif task_type == "audio":
            key = StoragePath.audio_generated(user_id, task_id, ext)
        else:
            key = f"other/{user_id}/{task_id}.{ext}"
        
        # Upload to R2
        return await self.r2_storage.upload_from_url(source_url, key)
    
    async def _create_thumbnail(
        self,
        user_id: str,
        task_id: str,
        source_url: str,
    ) -> str:
        """Create thumbnail for an image."""
        source_key = source_url.replace(self.r2_storage.public_url, "").lstrip("/")
        target_key = StoragePath.image_thumbnail(task_id, "256", "jpg")
        
        return await self.r2_storage.create_image_thumbnail(
            source_key,
            target_key,
            size=(256, 256),
        )
    
    def _get_extension_from_url(self, url: str) -> str:
        """Extract file extension from URL."""
        import urllib.parse
        path = urllib.parse.urlparse(url).path
        ext = path.split(".")[-1].lower() if "." in path else ""
        
        # Default extensions by type
        if not ext or ext not in ("png", "jpg", "jpeg", "webp", "mp4", "webm", "mp3", "wav"):
            return "png"  # Default
        
        return ext
    
    # =========================================================================
    # WAIT FOR COMPLETION
    # =========================================================================
    
    async def wait_for_task(
        self,
        task_id: str,
        timeout: int = 300,
        poll_interval: float = 2.0,
    ) -> Optional[GenerationTaskResponse]:
        """
        Wait for a task to complete.
        
        Args:
            task_id: Task ID
            timeout: Maximum wait time in seconds
            poll_interval: Time between status checks
            
        Returns:
            Final task response
        """
        start_time = asyncio.get_event_loop().time()
        
        while True:
            response = await self.get_task_status(task_id)
            if not response:
                return None
            
            if response.status in ("completed", "failed", "cancelled"):
                return response
            
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= timeout:
                return response
            
            await asyncio.sleep(poll_interval)
    
    # =========================================================================
    # TASK HISTORY
    # =========================================================================
    
    async def get_user_tasks(
        self,
        user_id: str,
        media_type: Optional[MediaType] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[GenerationTaskResponse]:
        """
        Get generation tasks for a user.
        
        Args:
            user_id: User ID
            media_type: Filter by media type
            status: Filter by status
            limit: Maximum number of tasks
            offset: Offset for pagination
            
        Returns:
            List of task responses
        """
        tasks = [
            t for t in self._tasks.values()
            if t["user_id"] == user_id
        ]
        
        if media_type:
            tasks = [t for t in tasks if t["task_type"] == media_type.value]
        
        if status:
            tasks = [t for t in tasks if t["status"] == status]
        
        # Sort by created_at descending
        tasks.sort(key=lambda t: t.get("created_at") or datetime.min, reverse=True)
        
        # Apply pagination
        tasks = tasks[offset:offset + limit]
        
        return [
            GenerationTaskResponse(
                id=t["id"],
                user_id=t["user_id"],
                task_type=t["task_type"],
                model_id=t["model_id"],
                status=t["status"],
                prompt=t["prompt"],
                options=t["options"],
                output_url=t.get("output_url"),
                thumbnail_url=t.get("thumbnail_url"),
                error_message=t.get("error_message"),
                credits_used=t.get("credits_used", 0),
                progress=t.get("progress", 0),
                created_at=t.get("created_at"),
                completed_at=t.get("completed_at"),
            )
            for t in tasks
        ]
    
    async def delete_task(self, task_id: str, user_id: str) -> bool:
        """
        Delete a generation task.
        
        Args:
            task_id: Task ID
            user_id: User ID (for authorization)
            
        Returns:
            True if deleted
        """
        task_info = self._tasks.get(task_id)
        if not task_info:
            return False
        
        if task_info["user_id"] != user_id:
            return False
        
        # Delete output files from R2
        if task_info.get("output_url"):
            key = task_info["output_url"].replace(
                self.r2_storage.public_url, ""
            ).lstrip("/")
            await self.r2_storage.delete_file(key)
        
        if task_info.get("thumbnail_url"):
            key = task_info["thumbnail_url"].replace(
                self.r2_storage.public_url, ""
            ).lstrip("/")
            await self.r2_storage.delete_file(key)
        
        # Remove from cache
        del self._tasks[task_id]
        
        logger.info("Task deleted", task_id=task_id)
        return True


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_service_instance: Optional[GenerationService] = None


def get_generation_service() -> GenerationService:
    """Get the singleton generation service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = GenerationService()
    return _service_instance
