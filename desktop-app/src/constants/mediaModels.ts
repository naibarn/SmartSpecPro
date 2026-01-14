/**
 * Media Generation Model Constants
 * 
 * Centralized registry of supported media generation models.
 * This ensures consistency across Backend API, MCP Server, and Frontend.
 * 
 * IMPORTANT: Keep in sync with python-backend/app/core/media_models.py
 */

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
}

// Image Models
export const IMAGE_MODELS: ModelInfo[] = [
  {
    id: 'google-nano-banana-pro',
    name: 'Google Nano Banana Pro',
    provider: 'kie.ai',
    description: 'High-quality image generation with Google\'s latest model',
  },
  {
    id: 'flux-2.0',
    name: 'Flux 2.0',
    provider: 'kie.ai',
    description: 'Fast and creative image generation',
  },
  {
    id: 'z-image',
    name: 'Z-Image',
    provider: 'kie.ai',
    description: 'Artistic style image generation',
  },
  {
    id: 'grok-imagine',
    name: 'Grok Imagine',
    provider: 'kie.ai',
    description: 'xAI\'s image generation model',
  },
];

// Video Models
export const VIDEO_MODELS: ModelInfo[] = [
  {
    id: 'veo-3-1',
    name: 'Veo 3.1',
    provider: 'kie.ai',
    description: 'Google\'s video generation model',
  },
  {
    id: 'sora-2',
    name: 'Sora 2',
    provider: 'kie.ai',
    description: 'OpenAI\'s video generation model',
  },
  {
    id: 'kling-2.6',
    name: 'Kling 2.6',
    provider: 'kie.ai',
    description: 'Kling video generation model',
  },
];

// Audio Models
export const AUDIO_MODELS: ModelInfo[] = [
  {
    id: 'elevenlabs-tts',
    name: 'ElevenLabs Text-to-Speech',
    provider: 'kie.ai',
    description: 'High-quality text-to-speech',
  },
  {
    id: 'elevenlabs-sfx',
    name: 'ElevenLabs Sound Effects',
    provider: 'kie.ai',
    description: 'Sound effects generation',
  },
];

// Default models
export const DEFAULT_IMAGE_MODEL = 'google-nano-banana-pro';
export const DEFAULT_VIDEO_MODEL = 'veo-3-1';
export const DEFAULT_AUDIO_MODEL = 'elevenlabs-tts';

// Helper functions
export type MediaType = 'image' | 'video' | 'audio';

export function getModelsForType(type: MediaType): ModelInfo[] {
  switch (type) {
    case 'image':
      return IMAGE_MODELS;
    case 'video':
      return VIDEO_MODELS;
    case 'audio':
      return AUDIO_MODELS;
    default:
      return [];
  }
}

export function getDefaultModelForType(type: MediaType): string {
  switch (type) {
    case 'image':
      return DEFAULT_IMAGE_MODEL;
    case 'video':
      return DEFAULT_VIDEO_MODEL;
    case 'audio':
      return DEFAULT_AUDIO_MODEL;
    default:
      return '';
  }
}

export function isValidModel(modelId: string, type?: MediaType): boolean {
  const allModels = [...IMAGE_MODELS, ...VIDEO_MODELS, ...AUDIO_MODELS];
  const model = allModels.find(m => m.id === modelId);
  
  if (!model) return false;
  
  if (type) {
    const modelsForType = getModelsForType(type);
    return modelsForType.some(m => m.id === modelId);
  }
  
  return true;
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  const allModels = [...IMAGE_MODELS, ...VIDEO_MODELS, ...AUDIO_MODELS];
  return allModels.find(m => m.id === modelId);
}
