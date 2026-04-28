/**
 * Chat & LLM types shared across web and desktop apps
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export type MediaType = 'image' | 'video' | 'audio';

export type MediaTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type LLMProviderName = 'openrouter' | 'openai' | 'anthropic' | 'deepseek' | 'google' | 'kie-ai' | 'krouter';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProviderName;
  contextLength: number;
  inputCost: number;
  outputCost: number;
  capabilities?: string[];
}

export interface LLMConfig {
  provider: LLMProviderName;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}
