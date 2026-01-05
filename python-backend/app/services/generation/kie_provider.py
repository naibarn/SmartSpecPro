"""
SmartSpec Pro - KieAI Provider Service
Unified interface for all kie.ai generation APIs.
"""

import asyncio
import httpx
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.generation.models import (
    GenerationModel,
    MediaType,
    get_model,
    ALL_MODELS,
)

logger = structlog.get_logger()


# =============================================================================
# ENUMS AND MODELS
# =============================================================================

class TaskStatus(str, Enum):
    """Status of a generation task."""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class KieTaskResult(BaseModel):
    """Result from kie.ai API."""
    task_id: str
    status: TaskStatus
    progress: float = 0.0
    output_url: Optional[str] = None
    output_urls: Optional[List[str]] = None
    error_message: Optional[str] = None
    credits_used: float = 0.0
    processing_time_ms: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GenerationRequest(BaseModel):
    """Request for generation."""
    model_id: str
    prompt: str
    
    # Optional inputs
    image_urls: Optional[List[str]] = None
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    
    # Options
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None
    duration: Optional[int] = None
    output_format: Optional[str] = None
    
    # Audio-specific
    voice: Optional[str] = None
    stability: Optional[float] = None
    similarity_boost: Optional[float] = None
    speed: Optional[float] = None
    
    # Video-specific
    multi_shots: Optional[bool] = None
    
    # Callback
    callback_url: Optional[str] = None


# =============================================================================
# KIE AI PROVIDER
# =============================================================================

class KieAIProvider:
    """
    Unified provider for all kie.ai generation APIs.
    
    Handles:
    - Image generation (nano-banana-pro, z-image, seedream, flux)
    - Video generation (wan 2.6, seedance, sora, veo, infinitalk)
    - Audio generation (elevenlabs tts, sound effects)
    """
    
    BASE_URL = "https://api.kie.ai/api/v1/jobs"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.KIE_AI_API_KEY
        self._client: Optional[httpx.AsyncClient] = None
    
    @property
    def client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.BASE_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(60.0, connect=10.0),
            )
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    # =========================================================================
    # TASK CREATION
    # =========================================================================
    
    async def create_task(self, request: GenerationRequest) -> KieTaskResult:
        """
        Create a new generation task.
        
        Args:
            request: Generation request with model, prompt, and options
            
        Returns:
            KieTaskResult with task_id and initial status
        """
        model = get_model(request.model_id)
        if not model:
            raise ValueError(f"Unknown model: {request.model_id}")
        
        # Build request payload based on model type
        payload = self._build_payload(model, request)
        
        logger.info(
            "Creating kie.ai task",
            model_id=request.model_id,
            media_type=model.media_type.value,
        )
        
        try:
            response = await self.client.post("/createTask", json=payload)
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != 200:
                raise Exception(data.get("message", "Unknown error"))
            
            task_id = data["data"]["taskId"]
            
            logger.info(
                "Task created successfully",
                task_id=task_id,
                model_id=request.model_id,
            )
            
            return KieTaskResult(
                task_id=task_id,
                status=TaskStatus.QUEUED,
                credits_used=model.get_price(
                    resolution=request.resolution,
                    duration=request.duration,
                ),
            )
            
        except httpx.HTTPStatusError as e:
            logger.error(
                "HTTP error creating task",
                status_code=e.response.status_code,
                response=e.response.text,
            )
            raise
        except Exception as e:
            logger.error("Error creating task", error=str(e))
            raise
    
    def _build_payload(
        self,
        model: GenerationModel,
        request: GenerationRequest,
    ) -> Dict[str, Any]:
        """Build API payload based on model type."""
        payload = {
            "model": model.id,
            "input": {
                "prompt": request.prompt,
            },
        }
        
        if request.callback_url:
            payload["callBackUrl"] = request.callback_url
        
        # Image-specific options
        if model.media_type == MediaType.IMAGE:
            if request.aspect_ratio:
                payload["input"]["aspect_ratio"] = request.aspect_ratio
            if request.resolution:
                payload["input"]["resolution"] = request.resolution
            if request.output_format:
                payload["input"]["output_format"] = request.output_format
            if request.image_urls:
                payload["input"]["image_input"] = request.image_urls
        
        # Video-specific options
        elif model.media_type == MediaType.VIDEO:
            if request.duration:
                payload["input"]["duration"] = str(request.duration)
            if request.resolution:
                payload["input"]["resolution"] = request.resolution
            if request.multi_shots is not None:
                payload["input"]["multi_shots"] = request.multi_shots
            if request.image_urls:
                payload["input"]["image_input"] = request.image_urls[0]
            if request.video_url:
                payload["input"]["video_input"] = request.video_url
        
        # Audio-specific options
        elif model.media_type == MediaType.AUDIO:
            payload["input"]["text"] = request.prompt
            del payload["input"]["prompt"]
            
            if request.voice:
                payload["input"]["voice"] = request.voice
            if request.stability is not None:
                payload["input"]["stability"] = request.stability
            if request.similarity_boost is not None:
                payload["input"]["similarity_boost"] = request.similarity_boost
            if request.speed is not None:
                payload["input"]["speed"] = request.speed
        
        return payload
    
    # =========================================================================
    # TASK QUERYING
    # =========================================================================
    
    async def query_task(self, task_id: str) -> KieTaskResult:
        """
        Query the status of a generation task.
        
        Args:
            task_id: The task ID returned from create_task
            
        Returns:
            KieTaskResult with current status and output if completed
        """
        try:
            response = await self.client.get(
                "/queryTask",
                params={"taskId": task_id},
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != 200:
                raise Exception(data.get("message", "Unknown error"))
            
            task_data = data.get("data", {})
            status = self._parse_status(task_data.get("status", "pending"))
            
            result = KieTaskResult(
                task_id=task_id,
                status=status,
                progress=task_data.get("progress", 0.0),
            )
            
            # Extract output URL(s) if completed
            if status == TaskStatus.COMPLETED:
                output = task_data.get("output", {})
                
                # Handle different output formats
                if isinstance(output, str):
                    result.output_url = output
                elif isinstance(output, dict):
                    result.output_url = output.get("url") or output.get("video_url") or output.get("audio_url")
                    result.output_urls = output.get("urls", [])
                    result.metadata = output
                elif isinstance(output, list):
                    result.output_urls = output
                    if output:
                        result.output_url = output[0]
            
            elif status == TaskStatus.FAILED:
                result.error_message = task_data.get("error", "Generation failed")
            
            return result
            
        except httpx.HTTPStatusError as e:
            logger.error(
                "HTTP error querying task",
                task_id=task_id,
                status_code=e.response.status_code,
            )
            raise
        except Exception as e:
            logger.error("Error querying task", task_id=task_id, error=str(e))
            raise
    
    def _parse_status(self, status: str) -> TaskStatus:
        """Parse status string from API."""
        status_map = {
            "pending": TaskStatus.PENDING,
            "queued": TaskStatus.QUEUED,
            "processing": TaskStatus.PROCESSING,
            "running": TaskStatus.PROCESSING,
            "completed": TaskStatus.COMPLETED,
            "success": TaskStatus.COMPLETED,
            "failed": TaskStatus.FAILED,
            "error": TaskStatus.FAILED,
            "cancelled": TaskStatus.CANCELLED,
        }
        return status_map.get(status.lower(), TaskStatus.PENDING)
    
    # =========================================================================
    # WAIT FOR COMPLETION
    # =========================================================================
    
    async def wait_for_completion(
        self,
        task_id: str,
        timeout: int = 300,
        poll_interval: float = 2.0,
    ) -> KieTaskResult:
        """
        Wait for a task to complete.
        
        Args:
            task_id: The task ID to wait for
            timeout: Maximum time to wait in seconds
            poll_interval: Time between status checks
            
        Returns:
            KieTaskResult with final status and output
        """
        start_time = asyncio.get_event_loop().time()
        
        while True:
            result = await self.query_task(task_id)
            
            if result.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
                return result
            
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= timeout:
                logger.warning(
                    "Task timed out",
                    task_id=task_id,
                    elapsed=elapsed,
                    timeout=timeout,
                )
                return KieTaskResult(
                    task_id=task_id,
                    status=TaskStatus.FAILED,
                    error_message=f"Task timed out after {timeout} seconds",
                )
            
            await asyncio.sleep(poll_interval)
    
    # =========================================================================
    # CONVENIENCE METHODS
    # =========================================================================
    
    async def generate_image(
        self,
        prompt: str,
        model_id: str = "nano-banana-pro",
        aspect_ratio: str = "1:1",
        resolution: str = "2K",
        output_format: str = "png",
        image_urls: Optional[List[str]] = None,
        wait: bool = True,
        timeout: int = 120,
    ) -> KieTaskResult:
        """
        Generate an image.
        
        Args:
            prompt: Text description of the image
            model_id: Model to use (default: nano-banana-pro)
            aspect_ratio: Aspect ratio (default: 1:1)
            resolution: Resolution (default: 2K)
            output_format: Output format (default: png)
            image_urls: Reference images (optional)
            wait: Whether to wait for completion
            timeout: Timeout in seconds
            
        Returns:
            KieTaskResult with output URL
        """
        request = GenerationRequest(
            model_id=model_id,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            output_format=output_format,
            image_urls=image_urls,
        )
        
        result = await self.create_task(request)
        
        if wait:
            result = await self.wait_for_completion(result.task_id, timeout=timeout)
        
        return result
    
    async def generate_video(
        self,
        prompt: str,
        model_id: str = "wan/2-6-text-to-video",
        duration: int = 5,
        resolution: str = "720p",
        multi_shots: bool = False,
        image_url: Optional[str] = None,
        wait: bool = True,
        timeout: int = 300,
    ) -> KieTaskResult:
        """
        Generate a video.
        
        Args:
            prompt: Text description of the video
            model_id: Model to use (default: wan/2-6-text-to-video)
            duration: Duration in seconds (5, 10, or 15)
            resolution: Resolution (720p or 1080p)
            multi_shots: Enable multi-shot mode
            image_url: Reference image for I2V models
            wait: Whether to wait for completion
            timeout: Timeout in seconds
            
        Returns:
            KieTaskResult with output URL
        """
        request = GenerationRequest(
            model_id=model_id,
            prompt=prompt,
            duration=duration,
            resolution=resolution,
            multi_shots=multi_shots,
            image_urls=[image_url] if image_url else None,
        )
        
        result = await self.create_task(request)
        
        if wait:
            result = await self.wait_for_completion(result.task_id, timeout=timeout)
        
        return result
    
    async def generate_speech(
        self,
        text: str,
        model_id: str = "elevenlabs/text-to-speech-turbo-2-5",
        voice: str = "Rachel",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        speed: float = 1.0,
        wait: bool = True,
        timeout: int = 60,
    ) -> KieTaskResult:
        """
        Generate speech from text.
        
        Args:
            text: Text to convert to speech
            model_id: Model to use (default: elevenlabs TTS)
            voice: Voice to use (default: Rachel)
            stability: Voice stability (0-1)
            similarity_boost: Similarity boost (0-1)
            speed: Speech speed (0.7-1.2)
            wait: Whether to wait for completion
            timeout: Timeout in seconds
            
        Returns:
            KieTaskResult with output URL
        """
        request = GenerationRequest(
            model_id=model_id,
            prompt=text,
            voice=voice,
            stability=stability,
            similarity_boost=similarity_boost,
            speed=speed,
        )
        
        result = await self.create_task(request)
        
        if wait:
            result = await self.wait_for_completion(result.task_id, timeout=timeout)
        
        return result


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_provider_instance: Optional[KieAIProvider] = None


def get_kie_provider() -> KieAIProvider:
    """Get the singleton KieAI provider instance."""
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = KieAIProvider()
    return _provider_instance


async def shutdown_kie_provider():
    """Shutdown the KieAI provider."""
    global _provider_instance
    if _provider_instance:
        await _provider_instance.close()
        _provider_instance = None
