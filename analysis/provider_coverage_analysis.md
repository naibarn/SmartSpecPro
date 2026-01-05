# Provider Coverage Analysis

## Overview

| Provider | Coverage | Missing Lines |
|----------|----------|---------------|
| ollama_provider.py | 68.75% | 96-97, 112, 172-192, 207-209, 227 |
| openrouter_provider.py | 67.12% | 104-105, 123, 143, 145, 181-188, 200, 225-242, 260 |

## Ollama Provider Analysis

### Uncovered Lines Breakdown

#### Lines 96-97: Lazy Client Initialization
```python
import httpx
self._http_client = httpx.AsyncClient()
```
**สาเหตุ:** Tests inject mock client ดังนั้น lazy initialization ไม่ถูกเรียก
**ผลกระทบ:** 2 lines

#### Line 112: Provider Disabled Check
```python
raise ProviderError(
    message="Ollama provider is disabled",
    ...
)
```
**สาเหตุ:** Tests ใช้ enabled=True เสมอ
**ผลกระทบ:** 1 line (แต่ block ยาว 5 lines)

#### Lines 172-192: Error Handling
```python
except Exception as e:
    error_msg = str(e)
    if "ConnectError" in error_msg or "Connection refused" in error_msg:
        logger.error(...)
        raise ProviderError(...)
    
    logger.error(...)
    raise ProviderError(...)
```
**สาเหตุ:** Tests ไม่ได้ทดสอบ error cases
**ผลกระทบ:** 21 lines

#### Lines 207-209: Close Method
```python
await self._http_client.aclose()
self._http_client = None
```
**สาเหตุ:** Tests ไม่ได้เรียก close()
**ผลกระทบ:** 3 lines

#### Line 227: create_default_config
```python
return ProviderConfig(...)
```
**สาเหตุ:** Tests ไม่ได้ทดสอบ class method นี้
**ผลกระทบ:** 1 line (แต่ block ยาว 11 lines)

### Summary for Ollama
| Category | Lines | Percentage |
|----------|-------|------------|
| Lazy initialization | 2 | 14% |
| Disabled check | 5 | 36% |
| Error handling | 21 | 150% |
| Close method | 3 | 21% |
| Class method | 11 | 79% |
| **Total Missing** | **~31%** | |

---

## OpenRouter Provider Analysis

### Uncovered Lines Breakdown

#### Lines 104-105: Lazy Client Initialization
```python
from openai import AsyncOpenAI
self._client = AsyncOpenAI(...)
```
**สาเหตุ:** Tests inject mock client
**ผลกระทบ:** 2 lines

#### Line 123: Provider Disabled Check
```python
raise ProviderError(...)
```
**สาเหตุ:** Tests ใช้ enabled=True เสมอ
**ผลกระทบ:** 5 lines

#### Lines 143, 145: Extra Headers Logic
```python
if self.site_url:
    extra_headers["HTTP-Referer"] = self.site_url
if self.site_name:
    extra_headers["X-Title"] = self.site_name
```
**สาเหตุ:** Tests ไม่ได้ set site_url และ site_name
**ผลกระทบ:** 4 lines

#### Lines 181-188: Error Handling
```python
except Exception as e:
    logger.error(...)
    raise ProviderError(...)
```
**สาเหตุ:** Tests ไม่ได้ทดสอบ error cases
**ผลกระทบ:** 8 lines

#### Line 200: System Prompt Branch
```python
if request.system_prompt:
    messages.append({...})
```
**สาเหตุ:** Tests ไม่ได้ส่ง system_prompt
**ผลกระทบ:** 4 lines

#### Lines 225-242: get_accurate_cost Method
```python
async def get_accurate_cost(self, generation_id: str) -> dict:
    ...
```
**สาเหตุ:** Method นี้ไม่ได้ถูกทดสอบเลย
**ผลกระทบ:** 18 lines

#### Line 260: create_default_config
```python
return ProviderConfig(...)
```
**สาเหตุ:** Tests ไม่ได้ทดสอบ class method นี้
**ผลกระทบ:** 11 lines

### Summary for OpenRouter
| Category | Lines | Percentage |
|----------|-------|------------|
| Lazy initialization | 2 | 3% |
| Disabled check | 5 | 8% |
| Extra headers | 4 | 6% |
| Error handling | 8 | 13% |
| System prompt | 4 | 6% |
| get_accurate_cost | 18 | 29% |
| Class method | 11 | 17% |
| **Total Missing** | **~33%** | |

---

## Root Cause Analysis

### 1. Untested Methods
ทั้งสอง providers มี methods ที่ไม่ได้ถูกทดสอบ:
- `create_default_config()` - class method
- `get_accurate_cost()` - OpenRouter specific
- `close()` - Ollama specific

### 2. Missing Edge Case Tests
- Provider disabled scenarios
- Error handling (connection errors, API errors)
- Extra headers logic (OpenRouter)
- System prompt handling

### 3. Lazy Initialization Not Tested
เนื่องจาก tests inject mock clients ทำให้ lazy initialization code ไม่ถูก execute

---

## Recommendations

### Quick Wins (High Impact, Low Effort)

1. **Test create_default_config()** (+11 lines each)
   ```python
   def test_create_default_config():
       config = OllamaProvider.create_default_config()
       assert config.name == "Ollama"
       assert config.enabled is False
   ```

2. **Test disabled provider** (+5 lines each)
   ```python
   async def test_invoke_disabled_provider():
       config = ProviderConfig(..., enabled=False)
       provider = OllamaProvider(config)
       with pytest.raises(ProviderError):
           await provider.invoke("llama3", request)
   ```

3. **Test error handling** (+8-21 lines)
   ```python
   async def test_invoke_connection_error():
       mock_client = AsyncMock()
       mock_client.post.side_effect = Exception("Connection refused")
       ...
   ```

### Medium Effort

4. **Test get_accurate_cost()** (OpenRouter) (+18 lines)
   ```python
   async def test_get_accurate_cost():
       mock_httpx = AsyncMock()
       mock_httpx.get.return_value.json.return_value = {"cost": 0.01}
       ...
   ```

5. **Test close() method** (Ollama) (+3 lines)
   ```python
   async def test_close_client():
       provider = OllamaProvider(config)
       await provider.close()
       assert provider._http_client is None
   ```

6. **Test extra headers** (OpenRouter) (+4 lines)
   ```python
   async def test_invoke_with_site_info():
       provider = OpenRouterProvider(config, site_url="https://example.com")
       ...
   ```

### Expected Coverage After Fixes

| Provider | Current | After Quick Wins | After All Fixes |
|----------|---------|------------------|-----------------|
| ollama_provider.py | 68.75% | ~85% | ~95% |
| openrouter_provider.py | 67.12% | ~82% | ~92% |
