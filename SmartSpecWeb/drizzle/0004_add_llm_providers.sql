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
-- OpenRouter is the PRIMARY gateway with fallback to direct providers
INSERT INTO `llm_providers` (`providerName`, `displayName`, `description`, `baseUrl`, `defaultModel`, `sortOrder`, `availableModels`, `configJson`) VALUES

-- OpenRouter (Primary Gateway - sort order 1)
('openrouter', 'OpenRouter', 'Primary LLM Gateway - Access 420+ models with automatic fallback', 'https://openrouter.ai/api/v1', 'anthropic/claude-3.5-sonnet:beta', 1,
  '[
    {"id":"anthropic/claude-3.5-sonnet:beta","name":"Claude 3.5 Sonnet (Latest)","contextLength":200000},
    {"id":"anthropic/claude-3.5-sonnet-20241022","name":"Claude 3.5 Sonnet (2024-10-22)","contextLength":200000},
    {"id":"anthropic/claude-3-opus-20240229","name":"Claude 3 Opus (2024-02-29)","contextLength":200000},
    {"id":"anthropic/claude-3-sonnet-20240229","name":"Claude 3 Sonnet (2024-02-29)","contextLength":200000},
    {"id":"anthropic/claude-3-haiku-20240307","name":"Claude 3 Haiku (2024-03-07)","contextLength":200000},
    {"id":"openai/gpt-4o-2024-11-20","name":"GPT-4o (2024-11-20)","contextLength":128000},
    {"id":"openai/gpt-4o-mini-2024-07-18","name":"GPT-4o Mini (2024-07-18)","contextLength":128000},
    {"id":"openai/gpt-4-turbo-2024-04-09","name":"GPT-4 Turbo (2024-04-09)","contextLength":128000},
    {"id":"openai/o1-preview-2024-09-12","name":"OpenAI o1 Preview (2024-09-12)","contextLength":128000},
    {"id":"openai/o1-mini-2024-09-12","name":"OpenAI o1 Mini (2024-09-12)","contextLength":128000},
    {"id":"google/gemini-pro-1.5","name":"Gemini 1.5 Pro","contextLength":1000000},
    {"id":"google/gemini-flash-1.5","name":"Gemini 1.5 Flash","contextLength":1000000},
    {"id":"google/gemini-2.0-flash-exp:free","name":"Gemini 2.0 Flash (Free)","contextLength":1000000},
    {"id":"meta-llama/llama-3.3-70b-instruct","name":"Llama 3.3 70B Instruct","contextLength":128000},
    {"id":"meta-llama/llama-3.1-405b-instruct","name":"Llama 3.1 405B Instruct","contextLength":128000},
    {"id":"deepseek/deepseek-chat","name":"DeepSeek V3","contextLength":64000},
    {"id":"deepseek/deepseek-r1","name":"DeepSeek R1 (Reasoning)","contextLength":64000},
    {"id":"qwen/qwen-2.5-72b-instruct","name":"Qwen 2.5 72B Instruct","contextLength":131072},
    {"id":"qwen/qwen-2.5-coder-32b-instruct","name":"Qwen 2.5 Coder 32B","contextLength":131072},
    {"id":"mistralai/mistral-large-2411","name":"Mistral Large (2024-11)","contextLength":128000},
    {"id":"mistralai/codestral-2501","name":"Codestral (2025-01)","contextLength":256000},
    {"id":"x-ai/grok-2-1212","name":"Grok 2 (2024-12-12)","contextLength":131072},
    {"id":"cohere/command-r-plus-08-2024","name":"Command R+ (2024-08)","contextLength":128000}
  ]',
  '{"isPrimary":true,"allow_fallbacks":true,"route":"fallback","sort":["throughput","latency","price"],"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

-- OpenAI (Fallback)
('openai', 'OpenAI', 'GPT-4o, GPT-4 Turbo, o1 series - Direct API (Fallback)', 'https://api.openai.com/v1', 'gpt-4o-2024-11-20', 2, 
  '[
    {"id":"gpt-4o-2024-11-20","name":"GPT-4o (2024-11-20)","contextLength":128000},
    {"id":"gpt-4o-mini-2024-07-18","name":"GPT-4o Mini (2024-07-18)","contextLength":128000},
    {"id":"gpt-4-turbo-2024-04-09","name":"GPT-4 Turbo (2024-04-09)","contextLength":128000},
    {"id":"gpt-4-0125-preview","name":"GPT-4 Preview (2024-01-25)","contextLength":128000},
    {"id":"gpt-3.5-turbo-0125","name":"GPT-3.5 Turbo (2024-01-25)","contextLength":16385},
    {"id":"o1-preview-2024-09-12","name":"o1 Preview (2024-09-12)","contextLength":128000},
    {"id":"o1-mini-2024-09-12","name":"o1 Mini (2024-09-12)","contextLength":128000}
  ]',
  '{"isFallback":true,"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

-- Anthropic (Fallback)
('anthropic', 'Anthropic Claude', 'Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku - Direct API (Fallback)', 'https://api.anthropic.com/v1', 'claude-3-5-sonnet-20241022', 3,
  '[
    {"id":"claude-3-5-sonnet-20241022","name":"Claude 3.5 Sonnet (2024-10-22)","contextLength":200000},
    {"id":"claude-3-5-haiku-20241022","name":"Claude 3.5 Haiku (2024-10-22)","contextLength":200000},
    {"id":"claude-3-opus-20240229","name":"Claude 3 Opus (2024-02-29)","contextLength":200000},
    {"id":"claude-3-sonnet-20240229","name":"Claude 3 Sonnet (2024-02-29)","contextLength":200000},
    {"id":"claude-3-haiku-20240307","name":"Claude 3 Haiku (2024-03-07)","contextLength":200000}
  ]',
  '{"isFallback":true,"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

-- Google (Fallback)
('google', 'Google AI (Gemini)', 'Gemini 2.0, 1.5 Pro/Flash - Direct API (Fallback)', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-1.5-flash-002', 4,
  '[
    {"id":"gemini-2.0-flash-exp","name":"Gemini 2.0 Flash (Experimental)","contextLength":1000000},
    {"id":"gemini-1.5-pro-002","name":"Gemini 1.5 Pro (002)","contextLength":2000000},
    {"id":"gemini-1.5-flash-002","name":"Gemini 1.5 Flash (002)","contextLength":1000000},
    {"id":"gemini-1.5-pro-001","name":"Gemini 1.5 Pro (001)","contextLength":2000000},
    {"id":"gemini-1.5-flash-001","name":"Gemini 1.5 Flash (001)","contextLength":1000000}
  ]',
  '{"isFallback":true,"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

-- DeepSeek (Fallback)
('deepseek', 'DeepSeek', 'DeepSeek V3, R1 Reasoning, Coder - Direct API (Fallback)', 'https://api.deepseek.com/v1', 'deepseek-chat', 5,
  '[
    {"id":"deepseek-chat","name":"DeepSeek V3 (Chat)","contextLength":64000},
    {"id":"deepseek-reasoner","name":"DeepSeek R1 (Reasoning)","contextLength":64000},
    {"id":"deepseek-coder","name":"DeepSeek Coder V2","contextLength":128000}
  ]',
  '{"isFallback":true,"supportsVision":false,"supportsStreaming":true,"supportsTools":true}'),

-- Groq (Fallback - Fast inference)
('groq', 'Groq', 'Ultra-fast inference - Llama 3.3, Mixtral, Gemma (Fallback)', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', 6,
  '[
    {"id":"llama-3.3-70b-versatile","name":"Llama 3.3 70B Versatile","contextLength":128000},
    {"id":"llama-3.3-70b-specdec","name":"Llama 3.3 70B SpecDec","contextLength":8192},
    {"id":"llama-3.1-70b-versatile","name":"Llama 3.1 70B Versatile","contextLength":128000},
    {"id":"llama-3.1-8b-instant","name":"Llama 3.1 8B Instant","contextLength":128000},
    {"id":"mixtral-8x7b-32768","name":"Mixtral 8x7B","contextLength":32768},
    {"id":"gemma2-9b-it","name":"Gemma 2 9B IT","contextLength":8192}
  ]',
  '{"isFallback":true,"supportsVision":false,"supportsStreaming":true,"supportsTools":true}'),

-- Qwen (Fallback)
('qwen', 'Qwen (Alibaba)', 'Qwen 2.5 Max/Plus/Turbo, Coder - Direct API (Fallback)', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-max-2025-01-25', 7,
  '[
    {"id":"qwen-max-2025-01-25","name":"Qwen Max (2025-01-25)","contextLength":32000},
    {"id":"qwen-plus-2025-01-25","name":"Qwen Plus (2025-01-25)","contextLength":131072},
    {"id":"qwen-turbo-2025-01-25","name":"Qwen Turbo (2025-01-25)","contextLength":131072},
    {"id":"qwen-coder-plus-2025-01-25","name":"Qwen Coder Plus (2025-01-25)","contextLength":131072},
    {"id":"qwen-long","name":"Qwen Long","contextLength":10000000}
  ]',
  '{"isFallback":true,"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

-- Minimax (Fallback)
('minimax', 'Minimax', 'MiniMax-Text-01, abab series - Direct API (Fallback)', 'https://api.minimax.chat/v1', 'MiniMax-Text-01', 8,
  '[
    {"id":"MiniMax-Text-01","name":"MiniMax Text 01","contextLength":1000000},
    {"id":"MiniMax-Text-01-128K","name":"MiniMax Text 01 (128K)","contextLength":128000},
    {"id":"abab6.5s-chat","name":"abab 6.5s Chat","contextLength":245760},
    {"id":"abab6.5-chat","name":"abab 6.5 Chat","contextLength":8192}
  ]',
  '{"isFallback":true,"supportsVision":false,"supportsStreaming":true,"supportsTools":true}'),

-- Zhipu (Fallback)
('zhipu', 'Zhipu AI (GLM)', 'GLM-4, GLM-4V Vision - Direct API (Fallback)', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4-flash', 9,
  '[
    {"id":"glm-4-plus","name":"GLM-4 Plus","contextLength":128000},
    {"id":"glm-4-flash","name":"GLM-4 Flash","contextLength":128000},
    {"id":"glm-4-0520","name":"GLM-4 (2024-05-20)","contextLength":128000},
    {"id":"glm-4v-plus","name":"GLM-4V Plus (Vision)","contextLength":8000},
    {"id":"glm-4v-flash","name":"GLM-4V Flash (Vision)","contextLength":8000},
    {"id":"glm-4-long","name":"GLM-4 Long","contextLength":1000000}
  ]',
  '{"isFallback":true,"supportsVision":true,"supportsStreaming":true,"supportsTools":true}'),

-- Ollama (Local - No fallback needed)
('ollama', 'Ollama (Local)', 'Run models locally - Llama, Mistral, CodeLlama, Phi', 'http://localhost:11434/v1', 'llama3.2:latest', 10,
  '[
    {"id":"llama3.2:latest","name":"Llama 3.2 (Latest)"},
    {"id":"llama3.1:70b","name":"Llama 3.1 70B"},
    {"id":"llama3.1:8b","name":"Llama 3.1 8B"},
    {"id":"mistral:latest","name":"Mistral (Latest)"},
    {"id":"codellama:latest","name":"CodeLlama (Latest)"},
    {"id":"phi3:latest","name":"Phi-3 (Latest)"},
    {"id":"qwen2.5:latest","name":"Qwen 2.5 (Latest)"},
    {"id":"deepseek-coder-v2:latest","name":"DeepSeek Coder V2 (Latest)"}
  ]',
  '{"isLocal":true,"supportsVision":true,"supportsStreaming":true,"supportsTools":false}');
