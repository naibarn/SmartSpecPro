"""
SmartSpec Pro - Generation Models Registry
Defines all available AI generation models for image, video, and audio.
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class MediaType(str, Enum):
    """Type of media that can be generated."""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


class ModelStatus(str, Enum):
    """Model availability status."""
    ACTIVE = "active"
    BETA = "beta"
    DEPRECATED = "deprecated"
    MAINTENANCE = "maintenance"


class GenerationModel(BaseModel):
    """Configuration for a generation model."""
    
    # Identity
    id: str = Field(..., description="Unique model identifier")
    name: str = Field(..., description="Human-readable model name")
    provider: str = Field(default="kie.ai", description="API provider")
    media_type: MediaType = Field(..., description="Type of media generated")
    description: str = Field(default="", description="Model description")
    
    # Capabilities
    supports_image_input: bool = Field(default=False, description="Can accept image as input")
    supports_video_input: bool = Field(default=False, description="Can accept video as input")
    supports_audio_input: bool = Field(default=False, description="Can accept audio as input")
    max_prompt_length: int = Field(default=5000, description="Maximum prompt length in characters")
    
    # Options
    aspect_ratios: Optional[List[str]] = Field(default=None, description="Available aspect ratios")
    resolutions: Optional[List[str]] = Field(default=None, description="Available resolutions")
    durations: Optional[List[int]] = Field(default=None, description="Available durations in seconds")
    output_formats: Optional[List[str]] = Field(default=None, description="Available output formats")
    voices: Optional[List[str]] = Field(default=None, description="Available voices for TTS")
    
    # Pricing
    base_credits: float = Field(default=0, description="Base credits per generation")
    pricing_tiers: Optional[Dict[str, float]] = Field(default=None, description="Pricing by tier")
    
    # Status
    status: ModelStatus = Field(default=ModelStatus.ACTIVE, description="Model status")
    is_featured: bool = Field(default=False, description="Featured model")
    
    # Metadata
    tags: List[str] = Field(default_factory=list, description="Model tags")
    documentation_url: Optional[str] = Field(default=None, description="Documentation URL")
    
    def get_price(self, **options) -> float:
        """Calculate price based on options."""
        if not self.pricing_tiers:
            return self.base_credits
        
        # Build tier key from options
        if self.media_type == MediaType.VIDEO:
            resolution = options.get("resolution", "720p")
            duration = options.get("duration", 5)
            tier_key = f"{resolution}-{duration}s"
            return self.pricing_tiers.get(tier_key, self.base_credits)
        
        if self.media_type == MediaType.IMAGE:
            resolution = options.get("resolution", "1K")
            return self.pricing_tiers.get(resolution, self.base_credits)
        
        return self.base_credits
    
    def validate_options(self, options: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and normalize options."""
        validated = {}
        
        if self.aspect_ratios and "aspect_ratio" in options:
            if options["aspect_ratio"] in self.aspect_ratios:
                validated["aspect_ratio"] = options["aspect_ratio"]
            else:
                validated["aspect_ratio"] = self.aspect_ratios[0]
        
        if self.resolutions and "resolution" in options:
            if options["resolution"] in self.resolutions:
                validated["resolution"] = options["resolution"]
            else:
                validated["resolution"] = self.resolutions[0]
        
        if self.durations and "duration" in options:
            if options["duration"] in self.durations:
                validated["duration"] = options["duration"]
            else:
                validated["duration"] = self.durations[0]
        
        if self.output_formats and "output_format" in options:
            if options["output_format"] in self.output_formats:
                validated["output_format"] = options["output_format"]
            else:
                validated["output_format"] = self.output_formats[0]
        
        return validated


# =============================================================================
# IMAGE GENERATION MODELS
# =============================================================================

IMAGE_MODELS: Dict[str, GenerationModel] = {
    "nano-banana-pro": GenerationModel(
        id="nano-banana-pro",
        name="Nano Banana Pro",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="Google Gemini 3.0 Pro - Sharp 2K/4K imagery with improved text rendering and character consistency",
        supports_image_input=True,
        max_prompt_length=20000,
        aspect_ratios=["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"],
        resolutions=["1K", "2K", "4K"],
        output_formats=["png", "jpg"],
        base_credits=18,
        pricing_tiers={"1K": 18, "2K": 18, "4K": 24},
        status=ModelStatus.ACTIVE,
        is_featured=True,
        tags=["gemini", "text-rendering", "character-consistency", "high-quality"],
        documentation_url="https://kie.ai/nano-banana-pro",
    ),
    
    "z-image": GenerationModel(
        id="z-image",
        name="Z-Image",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="Z-Image generation model for creative imagery",
        max_prompt_length=5000,
        aspect_ratios=["1:1", "16:9", "9:16"],
        resolutions=["1K", "2K"],
        output_formats=["png", "jpg"],
        base_credits=20,
        status=ModelStatus.BETA,
        tags=["creative", "artistic"],
        documentation_url="https://kie.ai/z-image",
    ),
    
    "seedream-4-5": GenerationModel(
        id="seedream-4-5",
        name="Seedream 4.5",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="ByteDance Seedream 4.5 - High quality image generation with excellent detail",
        supports_image_input=True,
        max_prompt_length=5000,
        aspect_ratios=["1:1", "16:9", "9:16", "4:3", "3:4"],
        resolutions=["1K", "2K", "4K"],
        output_formats=["png", "jpg"],
        base_credits=25,
        status=ModelStatus.BETA,
        tags=["bytedance", "high-detail", "photorealistic"],
        documentation_url="https://kie.ai/seedream-4-5",
    ),
    
    "flux-2": GenerationModel(
        id="flux-2",
        name="FLUX 2",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="Black Forest Labs FLUX 2 - Photorealistic image generation",
        supports_image_input=True,
        max_prompt_length=5000,
        aspect_ratios=["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
        resolutions=["1K", "2K", "4K"],
        output_formats=["png", "jpg", "webp"],
        base_credits=30,
        status=ModelStatus.BETA,
        is_featured=True,
        tags=["flux", "photorealistic", "high-quality"],
        documentation_url="https://kie.ai/flux-2",
    ),
}


# =============================================================================
# VIDEO GENERATION MODELS
# =============================================================================

VIDEO_MODELS: Dict[str, GenerationModel] = {
    "wan/2-6-text-to-video": GenerationModel(
        id="wan/2-6-text-to-video",
        name="Wan 2.6 Text-to-Video",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Alibaba Wan 2.6 - Multi-shot HD video generation with native audio and stable characters",
        max_prompt_length=5000,
        resolutions=["720p", "1080p"],
        durations=[5, 10, 15],
        output_formats=["mp4"],
        base_credits=70,
        pricing_tiers={
            "720p-5s": 70, "720p-10s": 140, "720p-15s": 209.5,
            "1080p-5s": 104.5, "1080p-10s": 209.5, "1080p-15s": 315,
        },
        status=ModelStatus.ACTIVE,
        is_featured=True,
        tags=["alibaba", "multi-shot", "native-audio", "character-consistency"],
        documentation_url="https://kie.ai/wan-2-6",
    ),
    
    "wan/2-6-image-to-video": GenerationModel(
        id="wan/2-6-image-to-video",
        name="Wan 2.6 Image-to-Video",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Alibaba Wan 2.6 - Transform images into dynamic videos",
        supports_image_input=True,
        max_prompt_length=5000,
        resolutions=["720p", "1080p"],
        durations=[5, 10, 15],
        output_formats=["mp4"],
        base_credits=70,
        pricing_tiers={
            "720p-5s": 70, "720p-10s": 140, "720p-15s": 209.5,
            "1080p-5s": 104.5, "1080p-10s": 209.5, "1080p-15s": 315,
        },
        status=ModelStatus.ACTIVE,
        tags=["alibaba", "image-to-video"],
        documentation_url="https://kie.ai/wan-2-6",
    ),
    
    "wan/2-6-video-to-video": GenerationModel(
        id="wan/2-6-video-to-video",
        name="Wan 2.6 Video-to-Video",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Alibaba Wan 2.6 - Transform and enhance existing videos",
        supports_video_input=True,
        max_prompt_length=5000,
        resolutions=["720p", "1080p"],
        output_formats=["mp4"],
        base_credits=100,
        status=ModelStatus.ACTIVE,
        tags=["alibaba", "video-to-video", "enhancement"],
        documentation_url="https://kie.ai/wan-2-6",
    ),
    
    "seedance-1-5-pro": GenerationModel(
        id="seedance-1-5-pro",
        name="Seedance 1.5 Pro",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="ByteDance Seedance - Dance and motion video generation",
        supports_image_input=True,
        max_prompt_length=5000,
        resolutions=["720p", "1080p"],
        durations=[5, 10],
        output_formats=["mp4"],
        base_credits=100,
        status=ModelStatus.BETA,
        tags=["bytedance", "dance", "motion"],
        documentation_url="https://kie.ai/seedance-1-5-pro",
    ),
    
    "sora-2-pro-storyboard": GenerationModel(
        id="sora-2-pro-storyboard",
        name="Sora 2 Pro Storyboard",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="OpenAI Sora 2 - Storyboard-based video generation with scene control",
        supports_image_input=True,
        max_prompt_length=10000,
        resolutions=["720p", "1080p"],
        durations=[5, 10, 15, 20],
        output_formats=["mp4"],
        base_credits=200,
        status=ModelStatus.BETA,
        is_featured=True,
        tags=["openai", "sora", "storyboard", "scene-control"],
        documentation_url="https://kie.ai/sora-2-pro-storyboard",
    ),
    
    "veo-3-1": GenerationModel(
        id="veo-3-1",
        name="Veo 3.1",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Google Veo 3.1 - High quality cinematic video generation",
        supports_image_input=True,
        max_prompt_length=5000,
        resolutions=["720p", "1080p", "4K"],
        durations=[5, 10, 15],
        output_formats=["mp4"],
        base_credits=150,
        status=ModelStatus.BETA,
        is_featured=True,
        tags=["google", "veo", "cinematic", "high-quality"],
        documentation_url="https://kie.ai/veo-3-1",
    ),
    
    "sora-2-pro": GenerationModel(
        id="sora-2-pro",
        name="Sora 2 Pro",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="OpenAI Sora 2 Pro - General purpose video generation",
        supports_image_input=True,
        max_prompt_length=10000,
        resolutions=["720p", "1080p"],
        durations=[5, 10, 15, 20],
        output_formats=["mp4"],
        base_credits=200,
        status=ModelStatus.BETA,
        tags=["openai", "sora", "general"],
        documentation_url="https://kie.ai/sora-2-pro",
    ),
    
    "infinitalk": GenerationModel(
        id="infinitalk",
        name="Infinitalk",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Talking head video generation with lip sync",
        supports_image_input=True,
        supports_audio_input=True,
        max_prompt_length=5000,
        resolutions=["720p", "1080p"],
        durations=[5, 10, 15, 30, 60],
        output_formats=["mp4"],
        base_credits=80,
        status=ModelStatus.BETA,
        tags=["talking-head", "lip-sync", "avatar"],
        documentation_url="https://kie.ai/infinitalk",
    ),
}


# =============================================================================
# AUDIO GENERATION MODELS
# =============================================================================

AUDIO_MODELS: Dict[str, GenerationModel] = {
    "elevenlabs/text-to-speech-turbo-2-5": GenerationModel(
        id="elevenlabs/text-to-speech-turbo-2-5",
        name="ElevenLabs TTS Turbo 2.5",
        provider="kie.ai",
        media_type=MediaType.AUDIO,
        description="ElevenLabs Text-to-Speech - Human-like voices with emotion control",
        max_prompt_length=10000,
        output_formats=["mp3", "wav"],
        voices=["Rachel", "Aria", "Roger", "Sarah"],
        base_credits=12,  # per 1000 characters
        status=ModelStatus.ACTIVE,
        is_featured=True,
        tags=["elevenlabs", "tts", "human-like", "multi-voice"],
        documentation_url="https://kie.ai/elevenlabs-tts",
    ),
    
    "elevenlabs/text-to-speech-multilingual-v2": GenerationModel(
        id="elevenlabs/text-to-speech-multilingual-v2",
        name="ElevenLabs TTS Multilingual V2",
        provider="kie.ai",
        media_type=MediaType.AUDIO,
        description="ElevenLabs Multilingual TTS - Support for 29+ languages",
        max_prompt_length=10000,
        output_formats=["mp3", "wav"],
        base_credits=15,  # per 1000 characters
        status=ModelStatus.ACTIVE,
        tags=["elevenlabs", "tts", "multilingual"],
        documentation_url="https://kie.ai/elevenlabs-tts",
    ),
    
    "elevenlabs/sound-effect": GenerationModel(
        id="elevenlabs/sound-effect",
        name="ElevenLabs Sound Effect",
        provider="kie.ai",
        media_type=MediaType.AUDIO,
        description="ElevenLabs Sound Effect - Generate custom sound effects from text",
        max_prompt_length=1000,
        output_formats=["mp3", "wav"],
        base_credits=20,
        status=ModelStatus.BETA,
        tags=["elevenlabs", "sfx", "sound-effect"],
        documentation_url="https://kie.ai/elevenlabs-sound-effect",
    ),
}


# =============================================================================
# COMBINED REGISTRY
# =============================================================================

ALL_MODELS: Dict[str, GenerationModel] = {
    **IMAGE_MODELS,
    **VIDEO_MODELS,
    **AUDIO_MODELS,
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_model(model_id: str) -> Optional[GenerationModel]:
    """Get a model by its ID."""
    return ALL_MODELS.get(model_id)


def get_models_by_type(media_type: MediaType) -> Dict[str, GenerationModel]:
    """Get all models of a specific media type."""
    return {k: v for k, v in ALL_MODELS.items() if v.media_type == media_type}


def get_active_models() -> Dict[str, GenerationModel]:
    """Get all active (non-deprecated) models."""
    return {k: v for k, v in ALL_MODELS.items() if v.status != ModelStatus.DEPRECATED}


def get_featured_models() -> Dict[str, GenerationModel]:
    """Get all featured models."""
    return {k: v for k, v in ALL_MODELS.items() if v.is_featured}


def get_models_by_tag(tag: str) -> Dict[str, GenerationModel]:
    """Get all models with a specific tag."""
    return {k: v for k, v in ALL_MODELS.items() if tag in v.tags}


def list_models_summary() -> List[Dict[str, Any]]:
    """Get a summary list of all models for API response."""
    return [
        {
            "id": model.id,
            "name": model.name,
            "media_type": model.media_type.value,
            "description": model.description,
            "status": model.status.value,
            "is_featured": model.is_featured,
            "base_credits": model.base_credits,
            "tags": model.tags,
        }
        for model in ALL_MODELS.values()
    ]
