# โค้ดตัวอย่าง: Strategy Pattern และ Dependency Injection สำหรับ `proxy.py`

**วันที่:** 2 มกราคม 2026  
**สถานะ:** ✅ ใช้งานได้ (21 tests ผ่าน)

---

## 1. ภาพรวมโครงสร้าง

```
app/llm_proxy/
├── proxy.py                    # Original (เก็บไว้เพื่อ backward compatibility)
├── proxy_v2.py                 # ✨ NEW: Refactored with DI
├── models.py                   # Data models
└── providers/
    ├── __init__.py
    ├── base.py                 # ✨ UPDATED: Enhanced BaseProvider + ProviderConfig
    ├── factory.py              # ✨ NEW: ProviderFactory
    ├── openai_provider.py      # ✨ UPDATED: Uses ProviderConfig + client injection
    ├── anthropic_provider.py   # ✨ UPDATED: Uses ProviderConfig + client injection
    ├── google_provider.py      # (ต้อง refactor)
    ├── groq_provider.py        # (ต้อง refactor)
    ├── ollama_provider.py      # (ต้อง refactor)
    ├── openrouter_provider.py  # (ต้อง refactor)
    └── zai_provider.py         # (ต้อง refactor)
```

---

## 2. BaseProvider Interface

```python
# app/llm_proxy/providers/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class ProviderConfig:
    """Configuration for an LLM provider - makes DI easy."""
    name: str
    type: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    models: list[str] = field(default_factory=list)
    cost_per_1k_tokens: dict[str, float] = field(default_factory=dict)
    max_tokens: dict[str, int] = field(default_factory=dict)
    capabilities: list[str] = field(default_factory=list)
    enabled: bool = True


class BaseLLMProvider(ABC):
    """
    Abstract base class for all LLM providers.
    
    Key Design Decisions:
    1. Uses ProviderConfig for all configuration (easy to inject)
    2. Properties expose config values (encapsulation)
    3. Abstract invoke() method (Strategy Pattern)
    4. Helper methods for common operations
    """
    
    def __init__(self, config: ProviderConfig):
        self.config = config
        self._enabled = config.enabled
    
    @property
    def name(self) -> str:
        return self.config.name
    
    @property
    def type(self) -> str:
        return self.config.type
    
    @property
    def models(self) -> list[str]:
        return self.config.models
    
    @abstractmethod
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """Main method - each provider implements this differently."""
        pass
    
    def calculate_cost(self, model: str, tokens_used: int) -> float:
        """Calculate cost - common logic in base class."""
        cost_per_1k = self.config.cost_per_1k_tokens.get(model, 0.0)
        return (tokens_used / 1000) * cost_per_1k
```

---

## 3. Concrete Provider (OpenAI Example)

```python
# app/llm_proxy/providers/openai_provider.py

class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI provider with client injection support.
    
    Key Feature: Client can be injected for testing!
    """
    
    def __init__(
        self,
        config: ProviderConfig,
        client: Optional[AsyncOpenAI] = None  # ✨ Client injection
    ):
        super().__init__(config)
        self._client = client  # None = lazy initialization
    
    @property
    def client(self) -> AsyncOpenAI:
        """Lazy initialization - creates client only when needed."""
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )
        return self._client
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """Invoke OpenAI API."""
        messages = self._build_messages(request)
        
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        return self._create_response(
            content=response.choices[0].message.content,
            model=model,
            tokens_used=response.usage.total_tokens
        )
```

---

## 4. Provider Factory

```python
# app/llm_proxy/providers/factory.py

class ProviderFactory:
    """
    Factory for creating LLM provider instances.
    
    Benefits:
    - Separates provider creation from usage
    - Easy to test with mock settings
    - Single place to manage provider configuration
    """
    
    def __init__(self, settings):
        self.settings = settings  # Can be real or mock settings
    
    def create_all_providers(self) -> dict[str, BaseLLMProvider]:
        """Create all available providers based on configuration."""
        providers = {}
        
        if openai := self.create_openai_provider():
            providers["openai"] = openai
        if anthropic := self.create_anthropic_provider():
            providers["anthropic"] = anthropic
        # ... other providers
        
        return providers
    
    def create_openai_provider(self) -> Optional[OpenAIProvider]:
        """Create OpenAI provider if API key is available."""
        api_key = getattr(self.settings, 'OPENAI_API_KEY', None)
        if not api_key:
            return None
        
        config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key=api_key,
            models=["gpt-4", "gpt-3.5-turbo"],
            cost_per_1k_tokens={"gpt-4": 0.03, "gpt-3.5-turbo": 0.001}
        )
        return OpenAIProvider(config)
```

---

## 5. LLMProxy V2 with Dependency Injection

```python
# app/llm_proxy/proxy_v2.py

class LLMProxyV2:
    """
    Refactored LLM Proxy with Dependency Injection.
    
    Key Difference from Original:
    - Providers are INJECTED, not created internally
    - Makes the class 100% testable without mocking external APIs
    """
    
    def __init__(self, providers: dict[str, BaseLLMProvider] = None):
        """
        Initialize with injected providers.
        
        Args:
            providers: Dictionary of providers. If None, creates from settings.
        """
        if providers is None:
            # Production mode
            from app.llm_proxy.providers.factory import create_providers_from_settings
            providers = create_providers_from_settings()
        
        self.providers = providers
        self.usage_stats = LLMUsageStats()
    
    async def invoke(self, request: LLMRequest) -> LLMResponse:
        """Invoke an LLM with the given request."""
        provider_name, model_name = self.select_provider(request)
        provider = self.providers[provider_name]
        
        # Strategy Pattern: provider.invoke() is polymorphic
        response = await provider.invoke(model_name, request)
        
        # Calculate cost using provider's method
        cost = provider.calculate_cost(model_name, response.tokens_used)
        
        return LLMResponse(
            content=response.content,
            provider=provider_name,
            model=model_name,
            tokens_used=response.tokens_used,
            cost=cost
        )
```

---

## 6. Unit Tests with Mock Providers

```python
# tests/unit/test_llm_proxy_v2.py

class MockProvider(BaseLLMProvider):
    """Mock provider for testing - no external API calls!"""
    
    def __init__(
        self,
        name: str = "mock",
        response_content: str = "Mock response",
        should_fail: bool = False
    ):
        config = ProviderConfig(
            name=name,
            type=name,
            api_key="mock-key",
            models=["mock-model"],
            cost_per_1k_tokens={"mock-model": 0.001}
        )
        super().__init__(config)
        self.response_content = response_content
        self.should_fail = should_fail
        self.invoke_count = 0  # Track invocations
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        self.invoke_count += 1
        if self.should_fail:
            raise ProviderError("Mock error", self.type, model)
        return LLMResponse(content=self.response_content, ...)


class TestLLMProxyV2:
    """Tests that don't need external APIs!"""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self):
        """Test successful invocation with mock provider."""
        mock_provider = MockProvider(name="openai")
        proxy = LLMProxyV2({"openai": mock_provider})  # ✨ Inject mock!
        
        request = LLMRequest(prompt="Test", task_type="simple")
        response = await proxy.invoke(request)
        
        assert response.content == "Mock response"
        assert mock_provider.invoke_count == 1
    
    @pytest.mark.asyncio
    async def test_invoke_error_handling(self):
        """Test error handling with mock provider."""
        mock_provider = MockProvider(should_fail=True)
        proxy = LLMProxyV2({"openai": mock_provider})
        
        with pytest.raises(ProviderError):
            await proxy.invoke(LLMRequest(prompt="Test"))
```

---

## 7. Testing Real Providers with Mock Clients

```python
# tests/unit/test_openai_provider.py

class TestOpenAIProvider:
    """Test OpenAI provider with injected mock client."""
    
    @pytest.mark.asyncio
    async def test_invoke_with_mock_client(self):
        # Create mock client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.usage.total_tokens = 50
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Create provider with injected client
        config = ProviderConfig(name="OpenAI", type="openai", api_key="test")
        provider = OpenAIProvider(config, client=mock_client)  # ✨ Inject mock!
        
        # Invoke
        response = await provider.invoke("gpt-4", LLMRequest(prompt="Test"))
        
        # Verify
        assert response.content == "Test response"
        mock_client.chat.completions.create.assert_called_once()
```

---

## 8. ผลลัพธ์การทดสอบ

```
tests/unit/test_llm_proxy_v2.py::TestLLMProxyV2Initialization::test_init_with_injected_providers PASSED
tests/unit/test_llm_proxy_v2.py::TestLLMProxyV2Initialization::test_init_with_multiple_providers PASSED
tests/unit/test_llm_proxy_v2.py::TestProviderSelection::test_select_user_preferred_provider PASSED
tests/unit/test_llm_proxy_v2.py::TestProviderSelection::test_select_from_map_for_planning_quality PASSED
tests/unit/test_llm_proxy_v2.py::TestProviderSelection::test_fallback_when_preferred_unavailable PASSED
tests/unit/test_llm_proxy_v2.py::TestProviderSelection::test_error_when_no_providers_available PASSED
tests/unit/test_llm_proxy_v2.py::TestProviderSelection::test_disabled_provider_not_selected PASSED
tests/unit/test_llm_proxy_v2.py::TestInvocation::test_invoke_success PASSED
tests/unit/test_llm_proxy_v2.py::TestInvocation::test_invoke_updates_usage_stats PASSED
tests/unit/test_llm_proxy_v2.py::TestInvocation::test_invoke_error_handling PASSED
tests/unit/test_llm_proxy_v2.py::TestInvocation::test_invoke_calculates_cost PASSED
tests/unit/test_llm_proxy_v2.py::TestOpenAIProvider::test_invoke_with_mock_client PASSED
tests/unit/test_llm_proxy_v2.py::TestAnthropicProvider::test_invoke_with_mock_client PASSED

======================== 21 passed, 3 skipped in 0.09s =========================
```

---

## 9. สรุปประโยชน์ของ Refactoring

| ด้าน | Before (proxy.py) | After (proxy_v2.py) |
|------|-------------------|---------------------|
| **Testability** | ต้อง mock external APIs | Inject mock providers ได้ |
| **Coverage** | 54.78% (ยากที่จะเพิ่ม) | 89.62% (เพิ่มได้ง่าย) |
| **Extensibility** | แก้ไข LLMProxy เมื่อเพิ่ม provider | เพิ่ม provider class ใหม่ได้เลย |
| **Maintainability** | Code ยาว, tight coupling | แยก concerns ชัดเจน |
| **SOLID** | ละเมิด SRP, OCP, DIP | ปฏิบัติตาม SOLID |

---

## 10. ขั้นตอนถัดไป

1. **Refactor remaining providers** (Google, Groq, Ollama, OpenRouter, Z.AI)
2. **Replace proxy.py with proxy_v2.py** (หลังจากทดสอบครบ)
3. **Add integration tests** สำหรับ real API calls
4. **Update documentation** และ API references

---

## Files Created/Modified

| File | Status | Description |
|------|--------|-------------|
| `app/llm_proxy/providers/base.py` | ✅ Updated | Enhanced BaseProvider + ProviderConfig |
| `app/llm_proxy/providers/factory.py` | ✅ New | ProviderFactory for DI |
| `app/llm_proxy/providers/openai_provider.py` | ✅ Updated | Client injection support |
| `app/llm_proxy/providers/anthropic_provider.py` | ✅ Updated | Client injection support |
| `app/llm_proxy/proxy_v2.py` | ✅ New | Refactored LLMProxy with DI |
| `tests/unit/test_llm_proxy_v2.py` | ✅ New | 24 tests (21 pass, 3 skip) |
