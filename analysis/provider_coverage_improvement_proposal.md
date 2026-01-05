# Proposal: Improving Test Coverage for Ollama and OpenRouter Providers

## 1. Introduction

This document outlines a plan to increase the test coverage for `ollama_provider.py` and `openrouter_provider.py` to over 90%. The current coverage is 68.75% and 67.12% respectively. The low coverage is due to untested methods, missing edge case tests, and lazy initialization logic.

## 2. Proposed Test Cases

### 2.1. Ollama Provider (`ollama_provider.py`)

| Test Case | Description | Lines Covered | Estimated Effort |
|-----------|-------------|---------------|------------------|
| **Test Disabled Provider** | Verify `ProviderError` is raised when `enabled=False` | 5 | Low |
| **Test Connection Error** | Mock `httpx.ConnectError` and verify `ProviderError` is raised | 10 | Low |
| **Test API Error** | Mock a generic `Exception` and verify `ProviderError` is raised | 11 | Low |
| **Test `create_default_config()`** | Test the class method for creating default config | 11 | Low |
| **Test `close()` method** | Test that the HTTP client is closed correctly | 3 | Low |
| **Test Lazy Initialization** | Test that the client is created on first use | 2 | Medium |

### 2.2. OpenRouter Provider (`openrouter_provider.py`)

| Test Case | Description | Lines Covered | Estimated Effort |
|-----------|-------------|---------------|------------------|
| **Test Disabled Provider** | Verify `ProviderError` is raised when `enabled=False` | 5 | Low |
| **Test API Error** | Mock a generic `Exception` and verify `ProviderError` is raised | 8 | Low |
| **Test `create_default_config()`** | Test the class method for creating default config | 11 | Low |
| **Test `get_accurate_cost()`** | Mock `httpx` and test the accurate cost retrieval | 18 | Medium |
| **Test Extra Headers** | Test that `HTTP-Referer` and `X-Title` are sent | 4 | Low |
| **Test System Prompt** | Test that system prompt is included in messages | 4 | Low |
| **Test Lazy Initialization** | Test that the client is created on first use | 2 | Medium |

## 3. Implementation Plan

1. **Create new test file:** `tests/unit/llm_proxy/test_provider_edge_cases.py`
2. **Add test cases** for disabled providers, error handling, and class methods.
3. **Add test cases** for provider-specific methods (`get_accurate_cost`, `close`).
4. **Add test cases** for lazy initialization by not injecting a client.
5. **Run tests** and verify coverage exceeds 90%.

## 4. Expected Outcome

| Provider | Current Coverage | Expected Coverage |
|----------|------------------|-------------------|
| `ollama_provider.py` | 68.75% | **> 95%** |
| `openrouter_provider.py` | 67.12% | **> 92%** |

By implementing these test cases, we will ensure that the providers are robust, reliable, and fully tested.
