/**
 * Auto-Prompt Generation Service
 * Uses AI to enhance and optimize prompts for image and video generation
 */

import { getAuthToken } from './authService';

const API_BASE_URL = `${import.meta.env.VITE_PY_BACKEND_URL || 'http://127.0.0.1:8000'}/api/v1`;

export interface PromptEnhancementRequest {
  userInput: string;
  mediaType: 'image' | 'video';
  targetModel?: string;
  style?: string;
  referenceImages?: string[]; // URLs or descriptions
  additionalContext?: string;
}

export interface PromptEnhancementResponse {
  enhancedPrompt: string;
  originalPrompt: string;
  improvements: string[];
  suggestions: string[];
  estimatedQuality: number; // 1-10
}

/**
 * Enhance a user's prompt for image generation
 */
export async function enhanceImagePrompt(
  userInput: string,
  options?: {
    targetModel?: string;
    style?: string;
    referenceImages?: string[];
  }
): Promise<PromptEnhancementResponse> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/prompt/enhance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      userInput,
      mediaType: 'image',
      targetModel: options?.targetModel || 'dalle-3',
      style: options?.style,
      referenceImages: options?.referenceImages || [],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to enhance prompt');
  }

  return response.json();
}

/**
 * Enhance a user's prompt for video generation
 */
export async function enhanceVideoPrompt(
  userInput: string,
  options?: {
    targetModel?: string;
    duration?: number;
    referenceImages?: string[];
  }
): Promise<PromptEnhancementResponse> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/prompt/enhance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      userInput,
      mediaType: 'video',
      targetModel: options?.targetModel || 'veo-3-1',
      additionalContext: options?.duration ? `Duration: ${options.duration}s` : undefined,
      referenceImages: options?.referenceImages || [],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to enhance prompt');
  }

  return response.json();
}

/**
 * Generate multiple prompt variations
 */
export async function generatePromptVariations(
  basePrompt: string,
  mediaType: 'image' | 'video',
  count: number = 3
): Promise<string[]> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/prompt/variations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      basePrompt,
      mediaType,
      count,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate variations');
  }

  const data = await response.json();
  return data.variations;
}

/**
 * Analyze prompt quality and provide suggestions
 */
export async function analyzePromptQuality(
  prompt: string,
  mediaType: 'image' | 'video'
): Promise<{
  score: number;
  issues: string[];
  suggestions: string[];
}> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/prompt/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt,
      mediaType,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to analyze prompt');
  }

  return response.json();
}
