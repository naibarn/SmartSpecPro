"""
SmartSpec Pro - Python SDK
Easy-to-use client for AI image, video, and audio generation.

Installation:
    pip install smartspec-sdk

Usage:
    from smartspec import SmartSpecClient
    
    client = SmartSpecClient(api_key="ss_live_xxx")
    
    # Generate an image
    result = client.generate_image(
        prompt="A beautiful sunset over mountains",
        aspect_ratio="16:9",
        resolution="2K"
    )
    print(result.output_url)
"""

import os
import time
import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urljoin

# Try to import httpx for async support
try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

# Fallback to requests for sync support
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

if not HAS_HTTPX and not HAS_REQUESTS:
    raise ImportError("Either httpx or requests must be installed")


__version__ = "1.0.0"


# =============================================================================
# ENUMS
# =============================================================================

class MediaType(str, Enum):
    """Type of media to generate."""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


class TaskStatus(str, Enum):
    """Status of a generation task."""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class GenerationResult:
    """Result from a generation task."""
    id: str
    status: TaskStatus
    task_type: str
    model_id: str
    prompt: str
    output_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error_message: Optional[str] = None
    credits_used: float = 0
    progress: float = 0
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    
    @property
    def is_complete(self) -> bool:
        """Check if the task is complete."""
        return self.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED)
    
    @property
    def is_success(self) -> bool:
        """Check if the task completed successfully."""
        return self.status == TaskStatus.COMPLETED
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GenerationResult":
        """Create from API response dict."""
        return cls(
            id=data["id"],
            status=TaskStatus(data["status"]),
            task_type=data["task_type"],
            model_id=data["model_id"],
            prompt=data["prompt"],
            output_url=data.get("output_url"),
            thumbnail_url=data.get("thumbnail_url"),
            error_message=data.get("error_message"),
            credits_used=data.get("credits_used", 0),
            progress=data.get("progress", 0),
            created_at=data.get("created_at"),
            completed_at=data.get("completed_at"),
        )


@dataclass
class ModelInfo:
    """Information about a generation model."""
    id: str
    name: str
    media_type: str
    description: str
    status: str
    is_featured: bool
    base_credits: float
    aspect_ratios: Optional[List[str]] = None
    resolutions: Optional[List[str]] = None
    durations: Optional[List[int]] = None
    output_formats: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ModelInfo":
        """Create from API response dict."""
        return cls(
            id=data["id"],
            name=data["name"],
            media_type=data["media_type"],
            description=data["description"],
            status=data["status"],
            is_featured=data["is_featured"],
            base_credits=data["base_credits"],
            aspect_ratios=data.get("aspect_ratios"),
            resolutions=data.get("resolutions"),
            durations=data.get("durations"),
            output_formats=data.get("output_formats"),
            tags=data.get("tags"),
        )


# =============================================================================
# EXCEPTIONS
# =============================================================================

class SmartSpecError(Exception):
    """Base exception for SmartSpec SDK."""
    pass


class AuthenticationError(SmartSpecError):
    """Raised when API key is invalid or missing."""
    pass


class RateLimitError(SmartSpecError):
    """Raised when rate limit is exceeded."""
    pass


class ValidationError(SmartSpecError):
    """Raised when request validation fails."""
    pass


class GenerationError(SmartSpecError):
    """Raised when generation fails."""
    pass


# =============================================================================
# SYNC CLIENT
# =============================================================================

class SmartSpecClient:
    """
    Synchronous client for SmartSpec Pro API.
    
    Args:
        api_key: Your SmartSpec API key (starts with ss_live_ or ss_test_)
        base_url: API base URL (default: https://api.smartspec.pro)
        timeout: Request timeout in seconds (default: 60)
    
    Example:
        client = SmartSpecClient(api_key="ss_live_xxx")
        
        # Generate an image
        result = client.generate_image(
            prompt="A beautiful sunset",
            model="nano-banana-pro",
            aspect_ratio="16:9"
        )
        
        # Wait for completion
        result = client.wait_for_task(result.id)
        print(result.output_url)
    """
    
    DEFAULT_BASE_URL = "https://api.smartspec.pro/api/v1"
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = 60,
    ):
        self.api_key = api_key or os.environ.get("SMARTSPEC_API_KEY")
        if not self.api_key:
            raise AuthenticationError(
                "API key is required. Set SMARTSPEC_API_KEY environment variable "
                "or pass api_key parameter."
            )
        
        self.base_url = base_url or os.environ.get("SMARTSPEC_BASE_URL", self.DEFAULT_BASE_URL)
        self.timeout = timeout
        
        if not HAS_REQUESTS:
            raise ImportError("requests library is required for sync client")
        
        self._session = requests.Session()
        self._session.headers.update({
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"SmartSpec-Python-SDK/{__version__}",
        })
    
    def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs,
    ) -> Dict[str, Any]:
        """Make an API request."""
        url = urljoin(self.base_url + "/", endpoint.lstrip("/"))
        
        try:
            response = self._session.request(
                method,
                url,
                timeout=self.timeout,
                **kwargs,
            )
            
            if response.status_code == 401:
                raise AuthenticationError("Invalid API key")
            elif response.status_code == 429:
                raise RateLimitError("Rate limit exceeded")
            elif response.status_code == 400:
                raise ValidationError(response.json().get("detail", "Validation error"))
            
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise SmartSpecError(f"Request failed: {e}")
    
    # =========================================================================
    # MODELS
    # =========================================================================
    
    def list_models(
        self,
        media_type: Optional[str] = None,
        include_beta: bool = True,
    ) -> List[ModelInfo]:
        """
        List available generation models.
        
        Args:
            media_type: Filter by type (image, video, audio)
            include_beta: Include beta models
            
        Returns:
            List of ModelInfo objects
        """
        params = {"include_beta": include_beta}
        if media_type:
            params["media_type"] = media_type
        
        data = self._request("GET", "/generation/models", params=params)
        return [ModelInfo.from_dict(m) for m in data]
    
    def get_model(self, model_id: str) -> ModelInfo:
        """
        Get information about a specific model.
        
        Args:
            model_id: Model identifier
            
        Returns:
            ModelInfo object
        """
        data = self._request("GET", f"/generation/models/{model_id}")
        return ModelInfo.from_dict(data)
    
    # =========================================================================
    # IMAGE GENERATION
    # =========================================================================
    
    def generate_image(
        self,
        prompt: str,
        model: str = "nano-banana-pro",
        aspect_ratio: str = "1:1",
        resolution: str = "2K",
        output_format: str = "png",
        reference_images: Optional[List[str]] = None,
        wait: bool = False,
        timeout: int = 120,
    ) -> GenerationResult:
        """
        Generate an image using AI.
        
        Args:
            prompt: Text description of the image
            model: Model to use (default: nano-banana-pro)
            aspect_ratio: Aspect ratio (1:1, 16:9, 9:16, etc.)
            resolution: Resolution (1K, 2K, 4K)
            output_format: Output format (png, jpg)
            reference_images: Reference image URLs for style transfer
            wait: Wait for completion before returning
            timeout: Timeout for waiting (seconds)
            
        Returns:
            GenerationResult object
        
        Example:
            result = client.generate_image(
                prompt="A cute cat wearing a hat",
                aspect_ratio="1:1",
                resolution="2K",
                wait=True
            )
            print(result.output_url)
        """
        payload = {
            "prompt": prompt,
            "model_id": model,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "output_format": output_format,
        }
        
        if reference_images:
            payload["reference_images"] = reference_images
        
        data = self._request("POST", "/generation/image", json=payload)
        result = GenerationResult.from_dict(data)
        
        if wait:
            result = self.wait_for_task(result.id, timeout=timeout)
        
        return result
    
    # =========================================================================
    # VIDEO GENERATION
    # =========================================================================
    
    def generate_video(
        self,
        prompt: str,
        model: str = "wan/2-6-text-to-video",
        duration: int = 5,
        resolution: str = "720p",
        multi_shots: bool = False,
        reference_image: Optional[str] = None,
        wait: bool = False,
        timeout: int = 300,
    ) -> GenerationResult:
        """
        Generate a video using AI.
        
        Args:
            prompt: Text description of the video
            model: Model to use (default: wan/2-6-text-to-video)
            duration: Duration in seconds (5, 10, 15)
            resolution: Resolution (720p, 1080p)
            multi_shots: Enable multi-shot mode
            reference_image: Reference image URL for I2V
            wait: Wait for completion before returning
            timeout: Timeout for waiting (seconds)
            
        Returns:
            GenerationResult object
        
        Example:
            result = client.generate_video(
                prompt="A dog running on the beach",
                duration=5,
                resolution="720p",
                wait=True
            )
            print(result.output_url)
        """
        payload = {
            "prompt": prompt,
            "model_id": model,
            "duration": duration,
            "resolution": resolution,
            "multi_shots": multi_shots,
        }
        
        if reference_image:
            payload["reference_image"] = reference_image
        
        data = self._request("POST", "/generation/video", json=payload)
        result = GenerationResult.from_dict(data)
        
        if wait:
            result = self.wait_for_task(result.id, timeout=timeout)
        
        return result
    
    # =========================================================================
    # AUDIO GENERATION
    # =========================================================================
    
    def generate_audio(
        self,
        text: str,
        model: str = "elevenlabs/text-to-speech-turbo-2-5",
        voice: str = "Rachel",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        speed: float = 1.0,
        wait: bool = False,
        timeout: int = 60,
    ) -> GenerationResult:
        """
        Generate audio/speech using AI.
        
        Args:
            text: Text to convert to speech
            model: Model to use (default: elevenlabs TTS)
            voice: Voice to use (Rachel, Aria, Roger, Sarah)
            stability: Voice stability (0-1)
            similarity_boost: Similarity boost (0-1)
            speed: Speech speed (0.7-1.2)
            wait: Wait for completion before returning
            timeout: Timeout for waiting (seconds)
            
        Returns:
            GenerationResult object
        
        Example:
            result = client.generate_audio(
                text="Hello, welcome to SmartSpec Pro!",
                voice="Rachel",
                wait=True
            )
            print(result.output_url)
        """
        payload = {
            "text": text,
            "model_id": model,
            "voice": voice,
            "stability": stability,
            "similarity_boost": similarity_boost,
            "speed": speed,
        }
        
        data = self._request("POST", "/generation/audio", json=payload)
        result = GenerationResult.from_dict(data)
        
        if wait:
            result = self.wait_for_task(result.id, timeout=timeout)
        
        return result
    
    # =========================================================================
    # TASK MANAGEMENT
    # =========================================================================
    
    def get_task(self, task_id: str) -> GenerationResult:
        """
        Get the status of a generation task.
        
        Args:
            task_id: Task identifier
            
        Returns:
            GenerationResult object
        """
        data = self._request("GET", f"/generation/tasks/{task_id}")
        return GenerationResult.from_dict(data)
    
    def wait_for_task(
        self,
        task_id: str,
        timeout: int = 300,
        poll_interval: float = 2.0,
    ) -> GenerationResult:
        """
        Wait for a task to complete.
        
        Args:
            task_id: Task identifier
            timeout: Maximum wait time in seconds
            poll_interval: Time between status checks
            
        Returns:
            GenerationResult object
        """
        start_time = time.time()
        
        while True:
            result = self.get_task(task_id)
            
            if result.is_complete:
                return result
            
            elapsed = time.time() - start_time
            if elapsed >= timeout:
                raise GenerationError(f"Task timed out after {timeout} seconds")
            
            time.sleep(poll_interval)
    
    def list_tasks(
        self,
        media_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[GenerationResult]:
        """
        List generation tasks.
        
        Args:
            media_type: Filter by type (image, video, audio)
            status: Filter by status
            limit: Maximum number of tasks
            offset: Offset for pagination
            
        Returns:
            List of GenerationResult objects
        """
        params = {"limit": limit, "offset": offset}
        if media_type:
            params["media_type"] = media_type
        if status:
            params["status"] = status
        
        data = self._request("GET", "/generation/tasks", params=params)
        return [GenerationResult.from_dict(t) for t in data]
    
    def delete_task(self, task_id: str) -> bool:
        """
        Delete a generation task.
        
        Args:
            task_id: Task identifier
            
        Returns:
            True if deleted successfully
        """
        self._request("DELETE", f"/generation/tasks/{task_id}")
        return True


# =============================================================================
# ASYNC CLIENT
# =============================================================================

class AsyncSmartSpecClient:
    """
    Asynchronous client for SmartSpec Pro API.
    
    Args:
        api_key: Your SmartSpec API key
        base_url: API base URL
        timeout: Request timeout in seconds
    
    Example:
        async with AsyncSmartSpecClient(api_key="ss_live_xxx") as client:
            result = await client.generate_image(
                prompt="A beautiful sunset",
                wait=True
            )
            print(result.output_url)
    """
    
    DEFAULT_BASE_URL = "https://api.smartspec.pro/api/v1"
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = 60,
    ):
        self.api_key = api_key or os.environ.get("SMARTSPEC_API_KEY")
        if not self.api_key:
            raise AuthenticationError(
                "API key is required. Set SMARTSPEC_API_KEY environment variable "
                "or pass api_key parameter."
            )
        
        self.base_url = base_url or os.environ.get("SMARTSPEC_BASE_URL", self.DEFAULT_BASE_URL)
        self.timeout = timeout
        
        if not HAS_HTTPX:
            raise ImportError("httpx library is required for async client")
        
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "X-API-Key": self.api_key,
                "Content-Type": "application/json",
                "User-Agent": f"SmartSpec-Python-SDK/{__version__}",
            },
            timeout=httpx.Timeout(self.timeout),
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs,
    ) -> Dict[str, Any]:
        """Make an API request."""
        if not self._client:
            raise SmartSpecError("Client not initialized. Use 'async with' context manager.")
        
        try:
            response = await self._client.request(method, endpoint, **kwargs)
            
            if response.status_code == 401:
                raise AuthenticationError("Invalid API key")
            elif response.status_code == 429:
                raise RateLimitError("Rate limit exceeded")
            elif response.status_code == 400:
                raise ValidationError(response.json().get("detail", "Validation error"))
            
            response.raise_for_status()
            return response.json()
            
        except httpx.RequestError as e:
            raise SmartSpecError(f"Request failed: {e}")
    
    # =========================================================================
    # MODELS
    # =========================================================================
    
    async def list_models(
        self,
        media_type: Optional[str] = None,
        include_beta: bool = True,
    ) -> List[ModelInfo]:
        """List available generation models."""
        params = {"include_beta": include_beta}
        if media_type:
            params["media_type"] = media_type
        
        data = await self._request("GET", "/generation/models", params=params)
        return [ModelInfo.from_dict(m) for m in data]
    
    async def get_model(self, model_id: str) -> ModelInfo:
        """Get information about a specific model."""
        data = await self._request("GET", f"/generation/models/{model_id}")
        return ModelInfo.from_dict(data)
    
    # =========================================================================
    # IMAGE GENERATION
    # =========================================================================
    
    async def generate_image(
        self,
        prompt: str,
        model: str = "nano-banana-pro",
        aspect_ratio: str = "1:1",
        resolution: str = "2K",
        output_format: str = "png",
        reference_images: Optional[List[str]] = None,
        wait: bool = False,
        timeout: int = 120,
    ) -> GenerationResult:
        """Generate an image using AI."""
        payload = {
            "prompt": prompt,
            "model_id": model,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "output_format": output_format,
        }
        
        if reference_images:
            payload["reference_images"] = reference_images
        
        data = await self._request("POST", "/generation/image", json=payload)
        result = GenerationResult.from_dict(data)
        
        if wait:
            result = await self.wait_for_task(result.id, timeout=timeout)
        
        return result
    
    # =========================================================================
    # VIDEO GENERATION
    # =========================================================================
    
    async def generate_video(
        self,
        prompt: str,
        model: str = "wan/2-6-text-to-video",
        duration: int = 5,
        resolution: str = "720p",
        multi_shots: bool = False,
        reference_image: Optional[str] = None,
        wait: bool = False,
        timeout: int = 300,
    ) -> GenerationResult:
        """Generate a video using AI."""
        payload = {
            "prompt": prompt,
            "model_id": model,
            "duration": duration,
            "resolution": resolution,
            "multi_shots": multi_shots,
        }
        
        if reference_image:
            payload["reference_image"] = reference_image
        
        data = await self._request("POST", "/generation/video", json=payload)
        result = GenerationResult.from_dict(data)
        
        if wait:
            result = await self.wait_for_task(result.id, timeout=timeout)
        
        return result
    
    # =========================================================================
    # AUDIO GENERATION
    # =========================================================================
    
    async def generate_audio(
        self,
        text: str,
        model: str = "elevenlabs/text-to-speech-turbo-2-5",
        voice: str = "Rachel",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        speed: float = 1.0,
        wait: bool = False,
        timeout: int = 60,
    ) -> GenerationResult:
        """Generate audio/speech using AI."""
        payload = {
            "text": text,
            "model_id": model,
            "voice": voice,
            "stability": stability,
            "similarity_boost": similarity_boost,
            "speed": speed,
        }
        
        data = await self._request("POST", "/generation/audio", json=payload)
        result = GenerationResult.from_dict(data)
        
        if wait:
            result = await self.wait_for_task(result.id, timeout=timeout)
        
        return result
    
    # =========================================================================
    # TASK MANAGEMENT
    # =========================================================================
    
    async def get_task(self, task_id: str) -> GenerationResult:
        """Get the status of a generation task."""
        data = await self._request("GET", f"/generation/tasks/{task_id}")
        return GenerationResult.from_dict(data)
    
    async def wait_for_task(
        self,
        task_id: str,
        timeout: int = 300,
        poll_interval: float = 2.0,
    ) -> GenerationResult:
        """Wait for a task to complete."""
        start_time = asyncio.get_event_loop().time()
        
        while True:
            result = await self.get_task(task_id)
            
            if result.is_complete:
                return result
            
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= timeout:
                raise GenerationError(f"Task timed out after {timeout} seconds")
            
            await asyncio.sleep(poll_interval)
    
    async def list_tasks(
        self,
        media_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[GenerationResult]:
        """List generation tasks."""
        params = {"limit": limit, "offset": offset}
        if media_type:
            params["media_type"] = media_type
        if status:
            params["status"] = status
        
        data = await self._request("GET", "/generation/tasks", params=params)
        return [GenerationResult.from_dict(t) for t in data]
    
    async def delete_task(self, task_id: str) -> bool:
        """Delete a generation task."""
        await self._request("DELETE", f"/generation/tasks/{task_id}")
        return True


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def create_client(api_key: Optional[str] = None) -> SmartSpecClient:
    """
    Create a SmartSpec client.
    
    Args:
        api_key: API key (or set SMARTSPEC_API_KEY env var)
        
    Returns:
        SmartSpecClient instance
    """
    return SmartSpecClient(api_key=api_key)


def create_async_client(api_key: Optional[str] = None) -> AsyncSmartSpecClient:
    """
    Create an async SmartSpec client.
    
    Args:
        api_key: API key (or set SMARTSPEC_API_KEY env var)
        
    Returns:
        AsyncSmartSpecClient instance (use with 'async with')
    """
    return AsyncSmartSpecClient(api_key=api_key)
