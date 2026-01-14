"""
Media Generation Model Constants

Centralized registry of supported media generation models.
This ensures consistency across Backend API, MCP Server, and Frontend.
"""

from enum import Enum
from typing import Dict, List, Any


class ImageModel(str, Enum):
    """Supported image generation models"""
    NANO_BANANA_PRO = "google-nano-banana-pro"
    FLUX_2_0 = "flux-2.0"
    Z_IMAGE = "z-image"
    GROK_IMAGINE = "grok-imagine"


class VideoModel(str, Enum):
    """Supported video generation models"""
    VEO_3_1 = "veo-3-1"
    SORA_2 = "sora-2"
    KLING_2_6 = "kling-2.6"


class AudioModel(str, Enum):
    """Supported audio generation models"""
    ELEVENLABS_TTS = "elevenlabs-tts"
    ELEVENLABS_SFX = "elevenlabs-sfx"


# Default models for each type
DEFAULT_IMAGE_MODEL = ImageModel.NANO_BANANA_PRO
DEFAULT_VIDEO_MODEL = VideoModel.VEO_3_1
DEFAULT_AUDIO_MODEL = AudioModel.ELEVENLABS_TTS


# Model metadata for display and validation
MODEL_METADATA: Dict[str, Dict[str, Any]] = {
    # Image models
    ImageModel.NANO_BANANA_PRO.value: {
        "type": "image",
        "name": "Google Nano Banana Pro",
        "provider": "kie.ai",
        "description": "High-quality image generation with Google's latest model",
        "supports_sizes": ["1024x1024", "1024x1792", "1792x1024"],
        "supports_aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
    },
    ImageModel.FLUX_2_0.value: {
        "type": "image",
        "name": "Flux 2.0",
        "provider": "kie.ai",
        "description": "Fast and creative image generation",
        "supports_sizes": ["1024x1024", "1024x1792", "1792x1024"],
        "supports_aspect_ratios": ["1:1", "16:9", "9:16"],
    },
    ImageModel.Z_IMAGE.value: {
        "type": "image",
        "name": "Z-Image",
        "provider": "kie.ai",
        "description": "Artistic style image generation",
        "supports_sizes": ["1024x1024"],
        "supports_aspect_ratios": ["1:1"],
    },
    ImageModel.GROK_IMAGINE.value: {
        "type": "image",
        "name": "Grok Imagine",
        "provider": "kie.ai",
        "description": "xAI's image generation model",
        "supports_sizes": ["1024x1024", "1024x1792", "1792x1024"],
        "supports_aspect_ratios": ["1:1", "16:9", "9:16"],
    },
    
    # Video models
    VideoModel.VEO_3_1.value: {
        "type": "video",
        "name": "Veo 3.1",
        "provider": "kie.ai",
        "description": "Google's video generation model",
        "supports_durations": [5, 10, 15],
        "supports_aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    VideoModel.SORA_2.value: {
        "type": "video",
        "name": "Sora 2",
        "provider": "kie.ai",
        "description": "OpenAI's video generation model",
        "supports_durations": [5, 10, 15, 20],
        "supports_aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    VideoModel.KLING_2_6.value: {
        "type": "video",
        "name": "Kling 2.6",
        "provider": "kie.ai",
        "description": "Kling video generation model",
        "supports_durations": [5, 10],
        "supports_aspect_ratios": ["16:9", "9:16"],
    },
    
    # Audio models
    AudioModel.ELEVENLABS_TTS.value: {
        "type": "audio",
        "name": "ElevenLabs Text-to-Speech",
        "provider": "kie.ai",
        "description": "High-quality text-to-speech",
        "supports_voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    },
    AudioModel.ELEVENLABS_SFX.value: {
        "type": "audio",
        "name": "ElevenLabs Sound Effects",
        "provider": "kie.ai",
        "description": "Sound effects generation",
        "supports_voices": [],
    },
}


def get_all_models() -> Dict[str, List[str]]:
    """Get all supported models grouped by type"""
    return {
        "image": [m.value for m in ImageModel],
        "video": [m.value for m in VideoModel],
        "audio": [m.value for m in AudioModel],
    }


def get_model_metadata(model_id: str) -> Dict[str, Any] | None:
    """Get metadata for a specific model"""
    return MODEL_METADATA.get(model_id)


def is_valid_model(model_id: str, model_type: str = None) -> bool:
    """Check if a model ID is valid"""
    metadata = MODEL_METADATA.get(model_id)
    if not metadata:
        return False
    if model_type and metadata.get("type") != model_type:
        return False
    return True


def get_models_for_type(model_type: str) -> List[Dict[str, Any]]:
    """Get all models for a specific type with metadata"""
    return [
        {"id": model_id, **metadata}
        for model_id, metadata in MODEL_METADATA.items()
        if metadata.get("type") == model_type
    ]
