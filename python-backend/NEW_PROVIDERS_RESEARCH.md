# New LLM Providers Research

**Date:** December 30, 2025  
**Providers:** OpenRouter, Z.AI (GLM-4.7)

---

## 🔍 **OpenRouter**

### **Overview**
- **Unified API** for 400+ AI models
- **OpenAI-compatible** API (drop-in replacement)
- **Automatic fallbacks** and load balancing
- **Single endpoint** for all models

### **API Details**

**Endpoint:**
```
https://openrouter.ai/api/v1/chat/completions
```

**Authentication:**
```
Authorization: Bearer <OPENROUTER_API_KEY>
```

**Request Format (OpenAI-compatible):**
```json
{
  "model": "openai/gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ],
  "temperature": 1.0,
  "max_tokens": 1000,
  "stream": false
}
```

**Model Format:**
- `{provider}/{model}` (e.g., `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`)
- Full list: https://openrouter.ai/models

**Key Features:**
- ✅ OpenAI-compatible API
- ✅ Supports streaming
- ✅ Supports tool calling
- ✅ Automatic provider fallback
- ✅ Native token counting
- ✅ Cost tracking via `/api/v1/generation` endpoint

**Optional Headers:**
```
HTTP-Referer: <YOUR_SITE_URL>
X-Title: <YOUR_SITE_NAME>
```

**Response Format:**
Same as OpenAI Chat API with additional fields:
- `native_finish_reason` - Raw finish reason from provider
- `usage` - Token counts (normalized via GPT-4o tokenizer)

**Pricing:**
- Pay-per-use
- Different prices for different models
- Can query cost via generation ID

---

## 🔍 **Z.AI (GLM-4.7)**

### **Overview**
- **Chinese LLM** by Zhipu AI
- **GLM-4.7** - Latest flagship model
- **Optimized for coding** and reasoning
- **200K context** window

### **API Details**

**Endpoint (General):**
```
https://api.z.ai/api/paas/v4
```

**Endpoint (Coding Plan):**
```
https://api.z.ai/api/coding/paas/v4
```

**Authentication:**
```
Authorization: Bearer <ZAI_API_KEY>
```

**Request Format (OpenAI-compatible):**
```json
{
  "model": "glm-4.7",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful AI assistant."
    },
    {
      "role": "user",
      "content": "Hello"
    }
  ],
  "temperature": 1.0,
  "stream": true
}
```

**Available Models:**
- `glm-4.7` - Latest flagship (coding + reasoning)
- `glm-4.6` - Previous version
- `glm-4.5` - Hybrid reasoning model
- `glm-4-flash` - Fast, free model

**Key Features:**
- ✅ OpenAI-compatible API
- ✅ Supports streaming
- ✅ Supports tool calling
- ✅ Long context (200K tokens)
- ✅ Optimized for coding
- ✅ Multi-lingual (Chinese + English)

**Headers:**
```
Content-Type: application/json
Accept-Language: en-US,en
Authorization: Bearer YOUR_API_KEY
```

**Response Format:**
Same as OpenAI Chat API

**Pricing:**
- GLM Coding Plan: $3/month (3× usage)
- Pay-per-use available
- GLM-4-Flash: Free

---

## 📊 **Comparison**

| Feature | OpenRouter | Z.AI |
|---------|-----------|------|
| **API Format** | OpenAI-compatible | OpenAI-compatible |
| **Models** | 400+ models | GLM series |
| **Endpoint** | Single unified | General + Coding |
| **Authentication** | Bearer token | Bearer token |
| **Streaming** | ✅ Yes | ✅ Yes |
| **Tool Calling** | ✅ Yes | ✅ Yes |
| **Pricing** | Per-model | Subscription + Pay-per-use |
| **Fallback** | ✅ Automatic | ❌ No |
| **Context** | Varies by model | 200K (GLM-4.7) |

---

## 🎯 **Integration Strategy**

### **Approach 1: Direct Integration (Current)**
Add OpenRouter and Z.AI as separate providers alongside existing ones.

**Pros:**
- Full control over provider selection
- Can optimize for specific use cases
- Direct cost tracking

**Cons:**
- More code to maintain
- Need to handle fallbacks manually

### **Approach 2: OpenRouter as Unified Gateway**
Use OpenRouter as the primary gateway, access all models through it.

**Pros:**
- Single integration point
- Automatic fallbacks
- Access to 400+ models
- Simplified code

**Cons:**
- Additional layer (OpenRouter fee)
- Less control over routing
- Dependency on OpenRouter

### **Recommended: Hybrid Approach**
- Keep direct integrations for primary providers (OpenAI, Anthropic, Google)
- Add OpenRouter for additional models
- Add Z.AI for Chinese/coding use cases

---

## 🔧 **Implementation Plan**

### **Phase 1: Add OpenRouter Provider**
1. Create `OpenRouterProvider` class
2. Implement OpenAI-compatible interface
3. Add model mapping (openai/gpt-4o, anthropic/claude-3.5-sonnet, etc.)
4. Add cost tracking via generation API
5. Test with multiple models

### **Phase 2: Add Z.AI Provider**
1. Create `ZAIProvider` class
2. Implement OpenAI-compatible interface
3. Add GLM model support (glm-4.7, glm-4.6, glm-4.5, glm-4-flash)
4. Support both general and coding endpoints
5. Test with Chinese and English prompts

### **Phase 3: Update Configuration**
1. Add `OPENROUTER_API_KEY` to environment variables
2. Add `ZAI_API_KEY` to environment variables
3. Update provider selection logic
4. Update model routing based on task type

### **Phase 4: Testing & Documentation**
1. Add unit tests for new providers
2. Add integration tests
3. Update API documentation
4. Update user guide with new models

---

## 📝 **Code Structure**

### **Current Structure:**
```
app/llm_proxy/
├── proxy.py           # Main LLM proxy
├── providers/
│   ├── openai.py      # OpenAI provider
│   ├── anthropic.py   # Anthropic provider
│   ├── google.py      # Google provider
│   ├── groq.py        # Groq provider
│   └── ollama.py      # Ollama provider
```

### **New Structure:**
```
app/llm_proxy/
├── proxy.py           # Main LLM proxy
├── providers/
│   ├── base.py        # Base provider interface
│   ├── openai.py      # OpenAI provider
│   ├── anthropic.py   # Anthropic provider
│   ├── google.py      # Google provider
│   ├── groq.py        # Groq provider
│   ├── ollama.py      # Ollama provider
│   ├── openrouter.py  # OpenRouter provider (NEW)
│   └── zai.py         # Z.AI provider (NEW)
```

---

## 🚀 **Next Steps**

1. ✅ Research completed
2. ⏳ Design flexible provider architecture
3. ⏳ Implement OpenRouter provider
4. ⏳ Implement Z.AI provider
5. ⏳ Update configuration
6. ⏳ Add tests
7. ⏳ Update documentation
8. ⏳ Commit and push

---

## 📚 **References**

- OpenRouter Docs: https://openrouter.ai/docs
- OpenRouter API: https://openrouter.ai/docs/api/reference/overview
- OpenRouter Models: https://openrouter.ai/models
- Z.AI Docs: https://docs.z.ai
- Z.AI API: https://docs.z.ai/api-reference/introduction
- GLM-4.7 Guide: https://docs.z.ai/guides/llm/glm-4.7
