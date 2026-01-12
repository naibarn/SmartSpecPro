-- Add LLM providers table for storing API keys and configurations
CREATE TABLE IF NOT EXISTS `llm_providers` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `providerName` varchar(64) NOT NULL UNIQUE,
  `displayName` varchar(128) NOT NULL,
  `description` text,
  `baseUrl` varchar(512),
  `apiKeyEncrypted` text,
  `hasApiKey` boolean NOT NULL DEFAULT false,
  `defaultModel` varchar(128),
  `availableModels` json,
  `configJson` json,
  `isEnabled` boolean NOT NULL DEFAULT false,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default providers (without API keys)
INSERT INTO `llm_providers` (`providerName`, `displayName`, `description`, `baseUrl`, `defaultModel`, `sortOrder`, `availableModels`, `configJson`) VALUES
('openai', 'OpenAI', 'GPT-4, GPT-4o, GPT-3.5, and other OpenAI models', 'https://api.openai.com/v1', 'gpt-4o-mini', 1, 
  '[{"id":"gpt-4o","name":"GPT-4o","contextLength":128000},{"id":"gpt-4o-mini","name":"GPT-4o Mini","contextLength":128000},{"id":"gpt-4-turbo","name":"GPT-4 Turbo","contextLength":128000},{"id":"gpt-3.5-turbo","name":"GPT-3.5 Turbo","contextLength":16385}]',
  '{"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

('anthropic', 'Anthropic Claude', 'Claude 3.5, Claude 3 Opus, Sonnet, and Haiku models', 'https://api.anthropic.com/v1', 'claude-3-5-sonnet-20241022', 2,
  '[{"id":"claude-3-5-sonnet-20241022","name":"Claude 3.5 Sonnet","contextLength":200000},{"id":"claude-3-opus-20240229","name":"Claude 3 Opus","contextLength":200000},{"id":"claude-3-sonnet-20240229","name":"Claude 3 Sonnet","contextLength":200000},{"id":"claude-3-haiku-20240307","name":"Claude 3 Haiku","contextLength":200000}]',
  '{"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

('google', 'Google AI (Gemini)', 'Gemini Pro, Gemini Flash, and other Google AI models', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-1.5-flash', 3,
  '[{"id":"gemini-1.5-pro","name":"Gemini 1.5 Pro","contextLength":1000000},{"id":"gemini-1.5-flash","name":"Gemini 1.5 Flash","contextLength":1000000},{"id":"gemini-pro","name":"Gemini Pro","contextLength":32000}]',
  '{"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

('groq', 'Groq', 'Ultra-fast LLM inference with Llama, Mixtral, and Gemma models', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', 4,
  '[{"id":"llama-3.3-70b-versatile","name":"Llama 3.3 70B","contextLength":128000},{"id":"llama-3.1-70b-versatile","name":"Llama 3.1 70B","contextLength":128000},{"id":"mixtral-8x7b-32768","name":"Mixtral 8x7B","contextLength":32768},{"id":"gemma2-9b-it","name":"Gemma 2 9B","contextLength":8192}]',
  '{"supportsVision":false,"supportsStreaming":true,"supportsTools":true}'),

('openrouter', 'OpenRouter', 'Access 420+ models with unified API including Claude, GPT, Llama, and more', 'https://openrouter.ai/api/v1', 'anthropic/claude-3.5-sonnet', 5,
  '[{"id":"anthropic/claude-3.5-sonnet","name":"Claude 3.5 Sonnet"},{"id":"openai/gpt-4o","name":"GPT-4o"},{"id":"meta-llama/llama-3.1-405b-instruct","name":"Llama 3.1 405B"},{"id":"google/gemini-pro-1.5","name":"Gemini Pro 1.5"}]',
  '{"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

('minimax', 'Minimax', 'Minimax AI models including MiniMax-Text-01 and abab series', 'https://api.minimax.chat/v1', 'MiniMax-Text-01', 6,
  '[{"id":"MiniMax-Text-01","name":"MiniMax Text 01","contextLength":1000000},{"id":"abab6.5s-chat","name":"abab 6.5s Chat","contextLength":245760},{"id":"abab6.5-chat","name":"abab 6.5 Chat","contextLength":8192}]',
  '{"supportsVision":false,"supportsStreaming":true,"supportsTools":true}'),

('qwen', 'Qwen (Alibaba)', 'Qwen series models from Alibaba Cloud including Qwen-Max and Qwen-Plus', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-max', 7,
  '[{"id":"qwen-max","name":"Qwen Max","contextLength":32000},{"id":"qwen-plus","name":"Qwen Plus","contextLength":131072},{"id":"qwen-turbo","name":"Qwen Turbo","contextLength":131072},{"id":"qwen-long","name":"Qwen Long","contextLength":10000000}]',
  '{"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

('ollama', 'Ollama (Local)', 'Run models locally with Ollama - Llama, Mistral, CodeLlama, and more', 'http://localhost:11434/v1', 'llama3.2', 8,
  '[{"id":"llama3.2","name":"Llama 3.2"},{"id":"llama3.1","name":"Llama 3.1"},{"id":"mistral","name":"Mistral"},{"id":"codellama","name":"CodeLlama"},{"id":"phi3","name":"Phi-3"}]',
  '{"supportsVision":true,"supportsStreaming":true,"supportsTools":false}'),

('zhipu', 'Zhipu AI (GLM)', 'GLM series models from Zhipu AI including GLM-4 and GLM-4V', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4-flash', 9,
  '[{"id":"glm-4","name":"GLM-4","contextLength":128000},{"id":"glm-4-flash","name":"GLM-4 Flash","contextLength":128000},{"id":"glm-4v","name":"GLM-4V (Vision)","contextLength":2000},{"id":"glm-4-long","name":"GLM-4 Long","contextLength":1000000}]',
  '{"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

('deepseek', 'DeepSeek', 'DeepSeek AI models including DeepSeek-V3 and DeepSeek Coder', 'https://api.deepseek.com/v1', 'deepseek-chat', 10,
  '[{"id":"deepseek-chat","name":"DeepSeek Chat (V3)","contextLength":64000},{"id":"deepseek-coder","name":"DeepSeek Coder","contextLength":64000},{"id":"deepseek-reasoner","name":"DeepSeek Reasoner","contextLength":64000}]',
  '{"supportsVision":false,"supportsStreaming":true,"supportsTools":true}');
