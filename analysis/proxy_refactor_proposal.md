# ข้อเสนอ Refactor และ Test Strategy สำหรับ `proxy.py`

**เป้าหมาย:** เพิ่ม Test Coverage จาก 56.96% เป็น >90% และปรับปรุง Code Quality

## 1. สรุปปัญหาหลัก (Root Cause Analysis)

จากการวิเคราะห์ พบว่าสาเหตุหลักที่ `proxy.py` มี Coverage ต่ำ มาจากปัญหา **Tight Coupling** และ **ขาด Dependency Injection (DI)** ซึ่งทำให้การทดสอบทำได้ยาก โดยเฉพาะในส่วนที่เกี่ยวข้องกับ external dependencies

1.  **Tight Coupling with Configuration:** `_load_providers()` อ่านค่าจาก `settings` (environment variables) โดยตรง และถูกเรียกใน `__init__` ทำให้ยากต่อการ mock configuration สำหรับ provider ต่างๆ ในการทดสอบ
2.  **Direct Instantiation of API Clients:** `LLMProxy` สร้าง instance ของ API client (เช่น `openai.AsyncOpenAI`, `anthropic.AsyncAnthropic`) โดยตรงภายใน `_call_*` methods ทำให้การ mock client แต่ละตัวทำได้ซับซ้อน
3.  **High Cyclomatic Complexity:** method `invoke()` และ `select_llm()` มี `if/elif` หลายชั้นเพื่อจัดการกับ provider ที่แตกต่างกัน ทำให้ code ซับซ้อนและทดสอบยาก

## 2. แนวทางการ Refactor

เราจะใช้หลักการ **Dependency Inversion Principle** และ **Strategy Pattern** เพื่อแก้ปัญหา Tight Coupling และเพิ่มความสามารถในการทดสอบ (Testability)

### Step 1: สร้าง Provider Interface (Strategy Pattern)

สร้าง Abstract Base Class (ABC) `BaseProvider` เพื่อกำหนด interface กลางสำหรับ provider ทุกตัว โดยจะมี method หลักคือ `async invoke(request: LLMRequest) -> LLMResponse`

```python
# In a new file, e.g., app/llm_proxy/providers/base.py
from abc import ABC, abstractmethod
from app.llm_proxy.models import LLMRequest, LLMResponse

class BaseProvider(ABC):
    def __init__(self, provider_config):
        self.config = provider_config

    @abstractmethod
    async def invoke(self, request: LLMRequest) -> LLMResponse:
        pass

    # Common utility methods can be added here
```

### Step 2: สร้าง Concrete Provider Classes

Refactor `_call_*` methods ทั้งหมดออกมาเป็น class ย่อยที่สืบทอดจาก `BaseProvider` โดยแต่ละ class จะรับผิดชอบ provider ของตัวเองเท่านั้น

**ตัวอย่าง: `OpenAIProvider`**
```python
# In a new file, e.g., app/llm_proxy/providers/openai_provider.py
import openai
from .base import BaseProvider

class OpenAIProvider(BaseProvider):
    async def invoke(self, request: LLMRequest) -> LLMResponse:
        client = openai.AsyncOpenAI(api_key=self.config.api_key, base_url=self.config.base_url)
        # ... (logic from _call_openai)
        response = await client.chat.completions.create(...)
        # ...
        return LLMResponse(...)
```

ทำเช่นนี้กับ provider ทั้งหมด: `AnthropicProvider`, `GoogleProvider`, `GroqProvider`, `OllamaProvider`, `OpenRouterProvider`, `ZaiProvider`

### Step 3: Refactor `LLMProxy` ให้ใช้ Dependency Injection

ปรับ `LLMProxy` ใหม่ทั้งหมด ให้ทำหน้าที่เป็น **Facade** และ **Context** สำหรับ Strategy Pattern โดยจะไม่สร้าง provider หรือ client เอง แต่จะได้รับ (inject) เข้ามา

```python
# Refactored LLMProxy
class LLMProxy:
    def __init__(self, providers: dict[str, BaseProvider]):
        self.providers = providers  # Providers are now injected
        self.usage_stats = LLMUsageStats()

    def select_provider(self, request: LLMRequest) -> BaseProvider:
        # ... (logic from select_llm, but returns a provider object)
        provider_name, model_name = ...
        if provider_name not in self.providers:
            # Fallback logic
        return self.providers[provider_name]

    async def invoke(self, request: LLMRequest) -> LLMResponse:
        provider = self.select_provider(request)
        
        start_time = time.time()
        response = await provider.invoke(request) # Delegate to the provider object
        latency_ms = int((time.time() - start_time) * 1000)
        
        # ... (cost calculation and usage stats update)
        return response
```

### Step 4: สร้าง Provider Factory

สร้าง `ProviderFactory` เพื่อรับผิดชอบการสร้าง provider instances จาก configuration ซึ่งจะช่วยแยกส่วนของการสร้าง object ออกจาก `LLMProxy`

```python
# In a new factory file
class ProviderFactory:
    @staticmethod
    def create_providers_from_settings() -> dict[str, BaseProvider]:
        providers = {}
        if settings.OPENAI_API_KEY:
            config = ... # build config from settings
            providers["openai"] = OpenAIProvider(config)
        if settings.ANTHROPIC_API_KEY:
            config = ...
            providers["anthropic"] = AnthropicProvider(config)
        # ... and so on for all providers
        return providers

# Global instance creation will now look like this:
providers = ProviderFactory.create_providers_from_settings()
llm_proxy = LLMProxy(providers)
```

## 3. Test Strategy หลัง Refactor

การ Refactor นี้จะทำให้การทดสอบแต่ละส่วนทำได้ง่ายและเป็นอิสระต่อกัน

1.  **Test Concrete Providers (Unit Tests):**
    *   สร้าง test file แยกสำหรับแต่ละ provider เช่น `test_openai_provider.py`
    *   ในแต่ละ test, **mock เฉพาะ API client** ที่เกี่ยวข้องเท่านั้น (เช่น `patch('openai.AsyncOpenAI')`)
    *   สามารถทดสอบ logic การสร้าง request และการ parse response ของแต่ละ provider ได้อย่างสมบูรณ์
    *   **จะครอบคลุม code ใน `_call_*` methods เดิมทั้งหมด**

2.  **Test `ProviderFactory` (Integration-like Tests):**
    *   สร้าง test เพื่อทดสอบ `create_providers_from_settings`
    *   ใช้ `monkeypatch` เพื่อ set/unset environment variables (API keys) และตรวจสอบว่า factory สร้าง provider instances ได้ถูกต้องตามเงื่อนไข
    *   **จะครอบคลุม code ใน `_load_providers` เดิมทั้งหมด**

3.  **Test `LLMProxy` (Unit Tests):**
    *   `LLMProxy` จะไม่มี dependency กับ external libraries อีกต่อไป
    *   ในการทดสอบ, เราจะสร้าง **mock `BaseProvider` objects** และ inject เข้าไปใน `LLMProxy`
    *   **Test `select_provider`:** ตรวจสอบว่า method คืน mock provider ที่ถูกต้องตาม `LLMRequest`
    *   **Test `invoke`:** ตรวจสอบว่า `invoke` ถูกเรียกบน provider object ที่ถูกต้อง และ logic การคำนวณ cost/latency ทำงานถูกต้อง
    *   **Test Fallback:** สามารถจำลองสถานการณ์ fallback ได้ง่ายๆ โดยการส่ง mock providers ที่มี `enabled=False` เข้าไป

## 4. ประโยชน์ที่คาดว่าจะได้รับ

*   **Coverage > 90%:** สามารถทดสอบทุก path ของ provider loading, invocation, และ fallback logic ได้อย่างสมบูรณ์
*   **Improved Code Quality:**
    *   **Single Responsibility Principle:** แต่ละ provider class รับผิดชอบแค่ provider เดียว
    *   **Open/Closed Principle:** การเพิ่ม provider ใหม่ทำได้โดยการสร้าง class ใหม่ โดยไม่ต้องแก้ไข `LLMProxy`
    *   **Dependency Inversion:** `LLMProxy` ไม่ขึ้นอยู่กับ concrete implementation แต่ขึ้นอยู่กับ `BaseProvider` interface
*   **Maintainability:** Code จะอ่านง่ายขึ้น, แก้ไขง่ายขึ้น, และขยายความสามารถได้ง่ายขึ้นในอนาคต
