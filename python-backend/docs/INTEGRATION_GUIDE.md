# SmartSpec Pro Integration Guide

**Version:** 0.2.0  
**Date:** 30 December 2025

---

## 📋 **Overview**

SmartSpec Pro v0.2.0 integrates:
- **OpenRouter** (420+ models, load balancing, fallbacks)
- **Z.AI** (GLM-4.7, Chinese LLM)
- **Direct providers** (OpenAI, Anthropic, Google, Groq, Ollama)
- **Unified LLM Client** (intelligent routing)
- **Credit System** (1 USD = 1,000 credits)
- **Monitoring** (usage tracking, provider health)

---

## 🏗️ **Architecture**

```
User Request
    ↓
LLM Gateway V2
    ↓
Credit Check
    ↓
Unified LLM Client
    ├── OpenRouter (primary)
    │   ├── Load Balancing
    │   ├── Automatic Fallbacks
    │   └── 420+ Models
    ├── Z.AI (GLM-4.7)
    └── Direct Providers (backup)
    ↓
LLM Response
    ↓
Credit Deduction
    ↓
Monitoring
```

---

## 🚀 **Quick Start**

### **1. Setup Environment**

```bash
cd python-backend

# Copy environment template
cp .env.example .env

# Edit .env and add API keys
nano .env
```

**Required:**
```env
# OpenRouter (recommended)
OPENROUTER_API_KEY=sk-or-v1-your-key

# Or direct providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### **2. Install Dependencies**

```bash
pip3 install -r requirements.txt
```

### **3. Run Server**

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 💻 **Usage Examples**

### **Example 1: Basic LLM Call**

```python
from app.llm_proxy.unified_client import get_unified_client

client = get_unified_client()

response = await client.chat(
    messages=[{"role": "user", "content": "Hello"}],
    task_type="simple",
    budget_priority="balanced"
)

print(response.content)
```

### **Example 2: With OpenRouter Features**

```python
response = await client.chat(
    messages=[{"role": "user", "content": "Write code"}],
    model="anthropic/claude-3.5-sonnet",
    task_type="code_generation",
    budget_priority="quality",
    # OpenRouter features
    use_openrouter=True,
    fallback_models=["openai/gpt-4o", "google/gemini-flash-1.5"],
    sort="throughput",
    data_collection="deny",
    zdr=True
)
```

### **Example 3: Via Gateway (with Credits)**

```python
from app.llm_proxy.gateway_v2 import LLMGatewayV2
from app.llm_proxy.models import LLMRequest

gateway = LLMGatewayV2(db)

request = LLMRequest(
    messages=[{"role": "user", "content": "Hello"}],
    task_type="simple",
    budget_priority="balanced"
)

response = await gateway.invoke(
    request=request,
    user=current_user,
    use_openrouter=True,
    fallback_models=["openai/gpt-4o"]
)
```

---

## 🎯 **Model Selection**

### **Automatic Selection**

Unified Client จะเลือก model อัตโนมัติตาม:
- **Task Type:** code_generation, analysis, planning, simple, decision
- **Budget Priority:** quality, cost, speed, balanced

**Matrix:**

| Task Type | Quality | Speed | Cost | Balanced |
|-----------|---------|-------|------|----------|
| **code_generation** | Claude 3.5 Sonnet | Gemini Flash | Llama 3.1 | GPT-4o |
| **analysis** | GPT-4o | Gemini Flash | Llama 3.1 | GPT-4o |
| **planning** | Claude 3.5 Sonnet | GPT-4o-mini | Llama 3.1 | GPT-4o |
| **simple** | GPT-4o-mini | Gemini Flash | Llama 3.1 | Gemini Flash |
| **decision** | Claude 3.5 Sonnet | GPT-4o | Llama 3.1 | GPT-4o |

### **Manual Selection**

```python
response = await client.chat(
    messages=[...],
    model="openai/gpt-4o",  # Specify exact model
    ...
)
```

---

## ⚙️ **Configuration**

### **Environment Variables**

```env
# OpenRouter
USE_OPENROUTER=true
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_SITE_URL=https://smartspec.pro
OPENROUTER_SITE_NAME=SmartSpec Pro

# Default Settings
DEFAULT_BUDGET_PRIORITY=balanced
DEFAULT_TEMPERATURE=0.7
DEFAULT_MAX_TOKENS=4000
```

### **Code Configuration**

```python
from app.core.config import settings

# Check if OpenRouter is enabled
if settings.USE_OPENROUTER:
    print("OpenRouter enabled")

# Get default budget priority
priority = settings.DEFAULT_BUDGET_PRIORITY  # "balanced"
```

---

## 💰 **Credit System**

### **Conversion**

- **1 USD = 1,000 credits**
- **No markup on LLM usage**
- **15% markup on top-up**

### **Example:**

```
User pays: $100
→ Gets: 86,956 credits ($86.956 value)
→ SmartSpec revenue: $13.044

LLM cost: $0.10
→ Deduct: 100 credits
→ No additional markup
```

### **API Endpoints**

```python
# Get balance
GET /api/credits/balance

# Top-up
POST /api/credits/topup
{
  "payment_usd": 100.00,
  "payment_id": "pi_xxx"
}

# Get transactions
GET /api/credits/transactions?limit=10
```

---

## 📊 **Monitoring**

### **Usage Stats**

```python
from app.services.llm_monitoring import LLMMonitoringService

monitor = LLMMonitoringService(db)

# Get user stats
stats = await monitor.get_comprehensive_stats(
    user_id=user.id,
    days=30
)

print(stats)
# {
#   "overview": {...},
#   "by_provider": [...],
#   "by_model": [...],
#   "by_task_type": [...]
# }
```

### **Provider Health**

```python
from app.services.llm_monitoring import ProviderHealthMonitor

# Get all provider health
health = ProviderHealthMonitor.get_all_provider_health()

# Check if provider is healthy
is_healthy = ProviderHealthMonitor.is_provider_healthy(
    provider="openrouter",
    model="gpt-4o",
    min_success_rate=0.9
)
```

---

## 🔧 **Advanced Features**

### **Load Balancing**

```python
# Price-based (default)
response = await client.chat(...)

# Throughput-based
response = await client.chat(..., sort="throughput")

# Latency-based
response = await client.chat(..., sort="latency")
```

### **Fallbacks**

```python
# Model fallbacks
response = await client.chat(
    model="anthropic/claude-3.5-sonnet",
    fallback_models=[
        "openai/gpt-4o",
        "google/gemini-flash-1.5"
    ]
)

# Provider fallbacks (automatic via OpenRouter)
```

### **Privacy Controls**

```python
# Zero Data Retention
response = await client.chat(
    ...,
    zdr=True,
    data_collection="deny"
)
```

### **Cost Controls**

```python
# Max price limit
response = await client.chat(
    ...,
    max_price={
        "prompt": 0.005,      # $0.005 per 1K tokens
        "completion": 0.015   # $0.015 per 1K tokens
    }
)
```

---

## 🧪 **Testing**

### **Run Tests**

```bash
cd python-backend

# Run all tests
python3.11 -m pytest tests/ -v

# Run specific test
python3.11 -m pytest tests/unit/test_credit_system.py -v

# Run with coverage
python3.11 -m pytest tests/ --cov=app --cov-report=html
```

### **Manual Testing**

```bash
# Test OpenRouter
python3.11 examples/openrouter_examples.py

# Test unified client
python3.11 -c "
from app.llm_proxy.unified_client import get_unified_client
import asyncio

async def test():
    client = get_unified_client()
    response = await client.chat(
        messages=[{'role': 'user', 'content': 'Hello'}],
        task_type='simple',
        budget_priority='balanced'
    )
    print(response.content)

asyncio.run(test())
"
```

---

## 📁 **File Structure**

```
python-backend/
├── app/
│   ├── llm_proxy/
│   │   ├── unified_client.py       # Unified LLM Client
│   │   ├── gateway_v2.py           # LLM Gateway V2
│   │   ├── openrouter_wrapper.py   # OpenRouter Wrapper
│   │   ├── providers/              # Provider implementations
│   │   │   ├── openrouter_provider.py
│   │   │   ├── zai_provider.py
│   │   │   └── ...
│   │   └── models.py               # Data models
│   ├── services/
│   │   ├── credit_service.py       # Credit management
│   │   └── llm_monitoring.py       # Monitoring service
│   ├── core/
│   │   ├── config.py               # Configuration
│   │   └── credits.py              # Credit utilities
│   └── api/
│       ├── credits.py              # Credits API
│       └── llm.py                  # LLM API
├── docs/
│   ├── OPENROUTER_LOAD_BALANCING.md
│   ├── NEW_PROVIDERS.md
│   └── INTEGRATION_GUIDE.md
├── examples/
│   └── openrouter_examples.py
└── tests/
    └── unit/
        └── test_credit_system.py
```

---

## 🔗 **API Reference**

### **UnifiedLLMClient**

```python
class UnifiedLLMClient:
    async def chat(
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        task_type: Optional[str] = None,
        budget_priority: Literal["cost", "quality", "speed", "balanced"] = "balanced",
        use_openrouter: bool = True,
        fallback_models: Optional[List[str]] = None,
        sort: Optional[Literal["price", "throughput", "latency"]] = None,
        data_collection: Literal["allow", "deny"] = "allow",
        zdr: Optional[bool] = None,
        max_price: Optional[Dict[str, float]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> LLMResponse
```

### **LLMGatewayV2**

```python
class LLMGatewayV2:
    async def invoke(
        request: LLMRequest,
        user: User,
        use_openrouter: bool = True,
        fallback_models: Optional[List[str]] = None,
        sort: Optional[Literal["price", "throughput", "latency"]] = None,
        data_collection: Literal["allow", "deny"] = "allow",
        zdr: Optional[bool] = None,
        max_price: Optional[Dict[str, float]] = None,
    ) -> LLMResponse
```

---

## ✅ **Best Practices**

### **1. Use OpenRouter by Default**

```python
# ✅ DO
response = await client.chat(..., use_openrouter=True)

# ❌ DON'T (unless specific reason)
response = await client.chat(..., use_openrouter=False)
```

### **2. Set Fallbacks for High Availability**

```python
# ✅ DO
response = await client.chat(
    model="anthropic/claude-3.5-sonnet",
    fallback_models=["openai/gpt-4o", "google/gemini-flash-1.5"]
)
```

### **3. Use Appropriate Budget Priority**

```python
# ✅ DO: Match priority to use case
response = await client.chat(
    ...,
    task_type="code_generation",
    budget_priority="quality"  # For important tasks
)

response = await client.chat(
    ...,
    task_type="simple",
    budget_priority="cost"  # For simple tasks
)
```

### **4. Enable Privacy Controls for Sensitive Data**

```python
# ✅ DO
response = await client.chat(
    ...,
    zdr=True,
    data_collection="deny"
)
```

### **5. Monitor Usage**

```python
# ✅ DO: Track usage regularly
stats = await monitor.get_comprehensive_stats(user.id, days=30)
```

---

## 🐛 **Troubleshooting**

### **Issue: OpenRouter not working**

**Check:**
1. API key is set: `echo $OPENROUTER_API_KEY`
2. USE_OPENROUTER=true in .env
3. Check logs: `tail -f logs/smartspec.log`

### **Issue: Insufficient credits**

**Solution:**
```python
# Check balance
balance = await credit_service.get_balance(user.id)
print(f"Balance: {balance} credits")

# Top-up
await credit_service.add_credits(
    user_id=user.id,
    credits=100000,  # $100
    description="Top-up"
)
```

### **Issue: Model not found**

**Check:**
1. Model name format: `provider/model` (e.g., `openai/gpt-4o`)
2. Provider is available
3. Check available models: `await gateway.get_available_models()`

---

## 📚 **Additional Resources**

- **OpenRouter Load Balancing:** `docs/OPENROUTER_LOAD_BALANCING.md`
- **New Providers:** `docs/NEW_PROVIDERS.md`
- **Credit System:** `CREDIT_SYSTEM.md`
- **Examples:** `examples/openrouter_examples.py`

---

## 🎉 **Summary**

SmartSpec Pro v0.2.0 provides:

- ✅ **420+ models** via OpenRouter
- ✅ **Load balancing** (price, throughput, latency)
- ✅ **Automatic fallbacks** (model + provider)
- ✅ **Privacy controls** (ZDR, data collection)
- ✅ **Cost controls** (max price, budget priority)
- ✅ **Credit system** (1 USD = 1,000 credits)
- ✅ **Monitoring** (usage tracking, provider health)
- ✅ **Production-ready** (error handling, logging)

**Ready to use! 🚀**
