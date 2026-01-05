# New LLM Providers - OpenRouter & Z.AI

**Date:** December 30, 2025  
**Version:** 0.2.0  
**Status:** ✅ Implemented

---

## 🎯 **Overview**

SmartSpec Pro now supports **OpenRouter** and **Z.AI (GLM-4.7)** as additional LLM providers, bringing:

- **400+ models** through OpenRouter's unified API
- **Chinese LLM** support via Z.AI's GLM series
- **Cost-effective options** with free models (GLM-4-Flash)
- **Flexible architecture** for easy future expansion

---

## 🔌 **OpenRouter**

### **What is OpenRouter?**

OpenRouter is a unified API that provides access to 400+ AI models from multiple providers through a single endpoint. It handles automatic fallbacks, load balancing, and provides a consistent OpenAI-compatible interface.

### **Key Features**

- ✅ **400+ models** from OpenAI, Anthropic, Google, Meta, Mistral, Cohere, and more
- ✅ **OpenAI-compatible API** - drop-in replacement
- ✅ **Automatic fallbacks** - if one provider fails, automatically tries another
- ✅ **Load balancing** - distributes requests across available GPUs
- ✅ **Unified pricing** - single billing across all models
- ✅ **Cost tracking** - detailed usage analytics

### **Setup**

1. **Get API Key:**
   - Visit https://openrouter.ai
   - Sign up and create an API key
   - Copy your API key (starts with `sk-or-v1-...`)

2. **Configure Environment:**
   ```bash
   # .env
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   OPENROUTER_SITE_URL=https://yoursite.com  # Optional
   OPENROUTER_SITE_NAME=YourSiteName  # Optional
   ```

3. **Restart Server:**
   ```bash
   cd python-backend
   python -m uvicorn app.main:app --reload
   ```

### **Available Models**

SmartSpec Pro is pre-configured with these popular models:

| Model | Provider | Cost (per 1M tokens) | Best For |
|-------|----------|---------------------|----------|
| `openai/gpt-4o` | OpenAI | $5 input, $15 output | General, Planning |
| `openai/gpt-4o-mini` | OpenAI | $0.15 input, $0.60 output | Fast, Cost-effective |
| `anthropic/claude-3.5-sonnet` | Anthropic | $3 input, $15 output | Code, Analysis |
| `google/gemini-flash-1.5` | Google | $0.075 input, $0.30 output | Speed, Long context |
| `meta-llama/llama-3.1-70b-instruct` | Meta | $0.52 input, $0.75 output | Open source |

**See all models:** https://openrouter.ai/models

### **Usage**

**Automatic Selection (Recommended):**
```python
from app.llm_proxy.models import LLMRequest

request = LLMRequest(
    prompt="Write a Python function to calculate fibonacci",
    task_type="code_generation",
    budget_priority="quality"  # Will use claude-3.5-sonnet via OpenRouter
)

response = await llm_proxy.invoke(request)
```

**Manual Selection:**
```python
request = LLMRequest(
    prompt="Explain quantum computing",
    preferred_provider="openrouter",
    preferred_model="openai/gpt-4o"
)

response = await llm_proxy.invoke(request)
```

### **Cost Tracking**

OpenRouter provides accurate cost tracking via the generation API:

```python
# After LLM call, get accurate cost
from app.llm_proxy.providers.openrouter_provider import OpenRouterProvider

provider = OpenRouterProvider(api_key="...")
stats = await provider.get_accurate_cost(response.id)

print(f"Actual cost: ${stats['total_cost']}")
print(f"Tokens: {stats['tokens_used']}")
```

---

## 🇨🇳 **Z.AI (GLM-4.7)**

### **What is Z.AI?**

Z.AI (Zhipu AI) provides the GLM series of models, including GLM-4.7, the latest flagship model optimized for coding and reasoning tasks. It supports both English and Chinese, with a 200K context window.

### **Key Features**

- ✅ **GLM-4.7** - Latest flagship model optimized for coding
- ✅ **200K context** - Long context support
- ✅ **Multi-lingual** - English and Chinese
- ✅ **Free tier** - GLM-4-Flash is completely free
- ✅ **Coding Plan** - $3/month for 3× usage
- ✅ **OpenAI-compatible API**

### **Setup**

1. **Get API Key:**
   - Visit https://z.ai
   - Sign up and create an API key
   - Copy your API key

2. **Configure Environment:**
   ```bash
   # .env
   ZAI_API_KEY=your-key-here
   ZAI_USE_CODING_ENDPOINT=false  # Set to true if using GLM Coding Plan
   ```

3. **Restart Server:**
   ```bash
   cd python-backend
   python -m uvicorn app.main:app --reload
   ```

### **Available Models**

| Model | Description | Context | Cost | Best For |
|-------|-------------|---------|------|----------|
| `glm-4.7` | Latest flagship | 200K | ~$1/1M tokens | Coding, Reasoning |
| `glm-4.6` | Previous version | 200K | ~$1/1M tokens | General |
| `glm-4.5` | Hybrid reasoning | 200K | ~$1/1M tokens | Complex reasoning |
| `glm-4-flash` | Fast, free model | 128K | **FREE** | Speed, Testing |

### **Usage**

**Automatic Selection:**
```python
request = LLMRequest(
    prompt="写一个Python函数来计算斐波那契数列",  # Chinese prompt
    task_type="code_generation",
    budget_priority="quality"  # Will use glm-4.7
)

response = await llm_proxy.invoke(request)
```

**Manual Selection:**
```python
request = LLMRequest(
    prompt="Explain machine learning in simple terms",
    preferred_provider="zai",
    preferred_model="glm-4.7"
)

response = await llm_proxy.invoke(request)
```

**Free Model (GLM-4-Flash):**
```python
request = LLMRequest(
    prompt="Quick test",
    preferred_provider="zai",
    preferred_model="glm-4-flash"  # Completely free!
)

response = await llm_proxy.invoke(request)
```

### **GLM Coding Plan**

If you subscribe to the GLM Coding Plan ($3/month for 3× usage):

1. Set `ZAI_USE_CODING_ENDPOINT=true` in `.env`
2. Restart server
3. Enjoy 3× more usage for the same price

---

## 🏗️ **Architecture**

### **Provider Classes**

Both providers are implemented as classes inheriting from `BaseLLMProvider`:

```
app/llm_proxy/providers/
├── base.py                    # Base provider interface
├── openrouter_provider.py     # OpenRouter implementation
└── zai_provider.py            # Z.AI implementation
```

### **Integration with LLMProxy**

The providers are automatically loaded in `LLMProxy._load_providers()`:

```python
# OpenRouter
if settings.OPENROUTER_API_KEY:
    self.providers['openrouter'] = LLMProvider(...)
    
# Z.AI
if settings.ZAI_API_KEY:
    self.providers['zai'] = LLMProvider(...)
```

### **Model Selection**

Models are automatically selected based on task type and budget priority:

```python
MODEL_SELECTION = {
    "code_generation": {
        "quality": "anthropic/claude-3.5-sonnet",  # via OpenRouter
        "cost": "glm-4-flash",  # via Z.AI (FREE!)
        "speed": "google/gemini-flash-1.5"  # via OpenRouter
    },
    ...
}
```

---

## 💰 **Cost Comparison**

### **Code Generation Task (1000 tokens)**

| Provider | Model | Cost | Speed | Quality |
|----------|-------|------|-------|---------|
| OpenRouter | claude-3.5-sonnet | $0.003 | Medium | ⭐⭐⭐⭐⭐ |
| OpenRouter | gpt-4o-mini | $0.0002 | Fast | ⭐⭐⭐⭐ |
| OpenRouter | gemini-flash-1.5 | $0.00008 | Very Fast | ⭐⭐⭐⭐ |
| Z.AI | glm-4.7 | $0.001 | Medium | ⭐⭐⭐⭐ |
| Z.AI | glm-4-flash | **FREE** | Fast | ⭐⭐⭐ |

### **Recommendations**

- **Best Quality:** `anthropic/claude-3.5-sonnet` via OpenRouter
- **Best Value:** `glm-4-flash` via Z.AI (FREE!)
- **Best Speed:** `google/gemini-flash-1.5` via OpenRouter
- **Best for Chinese:** `glm-4.7` via Z.AI

---

## 🧪 **Testing**

### **Test OpenRouter**

```bash
cd python-backend

# Set API key
export OPENROUTER_API_KEY=sk-or-v1-your-key

# Test with Python
python3.11 -c "
from app.llm_proxy.proxy import LLMProxy
from app.llm_proxy.models import LLMRequest
import asyncio

async def test():
    proxy = LLMProxy()
    request = LLMRequest(
        prompt='Say hello',
        preferred_provider='openrouter',
        preferred_model='openai/gpt-4o-mini'
    )
    response = await proxy.invoke(request)
    print(f'Response: {response.content}')
    print(f'Cost: \${response.cost:.6f}')

asyncio.run(test())
"
```

### **Test Z.AI**

```bash
# Set API key
export ZAI_API_KEY=your-key

# Test with Python
python3.11 -c "
from app.llm_proxy.proxy import LLMProxy
from app.llm_proxy.models import LLMRequest
import asyncio

async def test():
    proxy = LLMProxy()
    request = LLMRequest(
        prompt='你好，请介绍一下自己',  # Chinese
        preferred_provider='zai',
        preferred_model='glm-4-flash'  # FREE!
    )
    response = await proxy.invoke(request)
    print(f'Response: {response.content}')
    print(f'Cost: \${response.cost:.6f}')

asyncio.run(test())
"
```

---

## 📊 **Monitoring**

### **Check Loaded Providers**

```python
from app.llm_proxy.proxy import llm_proxy

providers = llm_proxy.get_providers()
for provider in providers:
    print(f"{provider.name}: {provider.enabled}")
```

### **Usage Statistics**

```python
stats = llm_proxy.get_usage_stats()
print(f"Total requests: {stats.total_requests}")
print(f"Total cost: ${stats.total_cost:.2f}")
print(f"By provider: {stats.cost_by_provider}")
```

---

## 🚀 **Future Expansion**

The provider architecture is designed for easy expansion. To add a new provider:

1. **Create provider class:**
   ```python
   # app/llm_proxy/providers/newprovider_provider.py
   class NewProvider(BaseLLMProvider):
       async def invoke(self, request: LLMRequest) -> LLMResponse:
           # Implementation
           pass
   ```

2. **Add to config:**
   ```python
   # app/core/config.py
   NEWPROVIDER_API_KEY: str = ""
   ```

3. **Load in LLMProxy:**
   ```python
   # app/llm_proxy/proxy.py
   if settings.NEWPROVIDER_API_KEY:
       self.providers['newprovider'] = LLMProvider(...)
   ```

4. **Add handler:**
   ```python
   async def _call_newprovider(self, provider, model, request):
       # Implementation
       pass
   ```

---

## 📚 **References**

- **OpenRouter:**
  - Website: https://openrouter.ai
  - Docs: https://openrouter.ai/docs
  - Models: https://openrouter.ai/models
  - API: https://openrouter.ai/docs/api/reference/overview

- **Z.AI:**
  - Website: https://z.ai
  - Docs: https://docs.z.ai
  - GLM-4.7: https://docs.z.ai/guides/llm/glm-4.7
  - API: https://docs.z.ai/api-reference/introduction

---

## ✅ **Summary**

SmartSpec Pro now supports:

- ✅ **7 LLM providers:** OpenAI, Anthropic, Google, Groq, Ollama, OpenRouter, Z.AI
- ✅ **400+ models** via OpenRouter
- ✅ **Multi-lingual** support (English + Chinese)
- ✅ **Free options** (GLM-4-Flash, Ollama)
- ✅ **Flexible architecture** for easy expansion
- ✅ **Automatic selection** based on task and budget
- ✅ **Cost tracking** and monitoring

**Ready to use! 🎉**
