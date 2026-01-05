"""
SmartSpec Pro - LLM Proxy
Phase 0.2

Main LLM Proxy class that handles:
- Multi-provider support
- Automatic LLM selection
- Cost tracking
- Fallback support
"""

import time
import os
from typing import Optional
import structlog
import openai
import anthropic
import google.generativeai as genai
from groq import AsyncGroq

from app.llm_proxy.models import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMUsageStats,
    ProviderHealth,
)
from app.core.config import settings

logger = structlog.get_logger()


class LLMProxy:
    """
    LLM Proxy for multi-provider LLM access with automatic selection
    """
    
    def __init__(self):
        self.providers: dict[str, LLMProvider] = {}
        self.usage_stats = LLMUsageStats()
        self.provider_health: dict[str, ProviderHealth] = {}
        self._load_providers()
    
    def _load_providers(self):
        """Load LLM providers from configuration"""
        logger.info("Loading LLM providers")
        
        # OpenAI
        if settings.OPENAI_API_KEY:
            self.providers['openai'] = LLMProvider(
                name='OpenAI',
                type='openai',
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                models=['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
                cost_per_1k_tokens={
                    'gpt-4': 0.03,
                    'gpt-4-turbo': 0.01,
                    'gpt-3.5-turbo': 0.001
                },
                max_tokens={
                    'gpt-4': 8192,
                    'gpt-4-turbo': 128000,
                    'gpt-3.5-turbo': 16385
                },
                capabilities=['planning', 'code_generation', 'analysis', 'decision', 'simple']
            )
            logger.info("OpenAI provider loaded")
        
        # Anthropic
        if settings.ANTHROPIC_API_KEY:
            self.providers['anthropic'] = LLMProvider(
                name='Anthropic',
                type='anthropic',
                api_key=settings.ANTHROPIC_API_KEY,
                base_url=settings.ANTHROPIC_BASE_URL,
                models=['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
                cost_per_1k_tokens={
                    'claude-3-opus-20240229': 0.015,
                    'claude-3-sonnet-20240229': 0.003,
                    'claude-3-haiku-20240307': 0.00025
                },
                max_tokens={
                    'claude-3-opus-20240229': 200000,
                    'claude-3-sonnet-20240229': 200000,
                    'claude-3-haiku-20240307': 200000
                },
                capabilities=['code_generation', 'analysis', 'planning', 'decision']
            )
            logger.info("Anthropic provider loaded")
        
        # Google
        if settings.GOOGLE_API_KEY:
            self.providers['google'] = LLMProvider(
                name='Google',
                type='google',
                api_key=settings.GOOGLE_API_KEY,
                models=['gemini-pro', 'gemini-pro-vision'],
                cost_per_1k_tokens={
                    'gemini-pro': 0.0005,
                    'gemini-pro-vision': 0.0005
                },
                max_tokens={
                    'gemini-pro': 32000,
                    'gemini-pro-vision': 16000
                },
                capabilities=['planning', 'analysis', 'simple']
            )
            logger.info("Google provider loaded")
        
        # Groq
        if settings.GROQ_API_KEY:
            self.providers['groq'] = LLMProvider(
                name='Groq',
                type='groq',
                api_key=settings.GROQ_API_KEY,
                base_url=settings.GROQ_BASE_URL,
                models=['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
                cost_per_1k_tokens={
                    'llama-3.1-70b-versatile': 0.0005,
                    'mixtral-8x7b-32768': 0.0002
                },
                max_tokens={
                    'llama-3.1-70b-versatile': 8192,
                    'mixtral-8x7b-32768': 32768
                },
                capabilities=['code_generation', 'analysis', 'simple', 'decision']
            )
            logger.info("Groq provider loaded")
        
        # Ollama (Local)
        self.providers['ollama'] = LLMProvider(
            name='Ollama',
            type='ollama',
            base_url=settings.OLLAMA_BASE_URL,
            models=['llama3', 'codellama', 'mistral'],
            cost_per_1k_tokens={
                'llama3': 0.0,
                'codellama': 0.0,
                'mistral': 0.0
            },
            max_tokens={
                'llama3': 8192,
                'codellama': 16384,
                'mistral': 8192
            },
            capabilities=['code_generation', 'simple'],
            enabled=False  # Disabled by default, requires local Ollama
        )
        logger.info("Ollama provider loaded (disabled)")
        
        # OpenRouter (Unified API for 400+ models)
        if settings.OPENROUTER_API_KEY:
            self.providers['openrouter'] = LLMProvider(
                name='OpenRouter',
                type='openrouter',
                api_key=settings.OPENROUTER_API_KEY,
                base_url='https://openrouter.ai/api/v1',
                models=[
                    'openai/gpt-4o',
                    'openai/gpt-4o-mini',
                    'anthropic/claude-3.5-sonnet',
                    'google/gemini-flash-1.5',
                    'meta-llama/llama-3.1-70b-instruct'
                ],
                cost_per_1k_tokens={
                    'openai/gpt-4o': 0.005,
                    'openai/gpt-4o-mini': 0.0002,
                    'anthropic/claude-3.5-sonnet': 0.003,
                    'google/gemini-flash-1.5': 0.00008,
                    'meta-llama/llama-3.1-70b-instruct': 0.0005
                },
                max_tokens={
                    'openai/gpt-4o': 128000,
                    'openai/gpt-4o-mini': 128000,
                    'anthropic/claude-3.5-sonnet': 200000,
                    'google/gemini-flash-1.5': 1000000,
                    'meta-llama/llama-3.1-70b-instruct': 131072
                },
                capabilities=['planning', 'code_generation', 'analysis', 'decision', 'simple']
            )
            logger.info("OpenRouter provider loaded")
        
        # Z.AI (GLM series)
        if settings.ZAI_API_KEY:
            base_url = (
                'https://api.z.ai/api/coding/paas/v4' if settings.ZAI_USE_CODING_ENDPOINT
                else 'https://api.z.ai/api/paas/v4'
            )
            self.providers['zai'] = LLMProvider(
                name='Z.AI',
                type='zai',
                api_key=settings.ZAI_API_KEY,
                base_url=base_url,
                models=['glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4-flash'],
                cost_per_1k_tokens={
                    'glm-4.7': 0.001,
                    'glm-4.6': 0.001,
                    'glm-4.5': 0.001,
                    'glm-4-flash': 0.0
                },
                max_tokens={
                    'glm-4.7': 200000,
                    'glm-4.6': 200000,
                    'glm-4.5': 200000,
                    'glm-4-flash': 128000
                },
                capabilities=['planning', 'code_generation', 'analysis', 'decision', 'simple']
            )
            logger.info(f"Z.AI provider loaded (endpoint: {base_url})")
        
        logger.info(f"Loaded {len([p for p in self.providers.values() if p.enabled])} enabled providers")
    
    def select_llm(self, request: LLMRequest) -> tuple[str, str]:
        """
        Select best LLM provider and model for the request
        
        Returns: (provider_name, model_name)
        """
        # If user specified preference, use it
        if request.preferred_provider and request.preferred_model:
            if request.preferred_provider in self.providers:
                provider = self.providers[request.preferred_provider]
                if provider.enabled and request.preferred_model in provider.models:
                    logger.info(
                        "Using user-specified LLM",
                        provider=request.preferred_provider,
                        model=request.preferred_model
                    )
                    return (request.preferred_provider, request.preferred_model)
        
        # Otherwise, select based on task type and budget priority
        selection_map = {
            'planning': {
                'quality': ('openai', 'gpt-4'),
                'cost': ('google', 'gemini-pro'),
                'speed': ('groq', 'llama-3.1-70b-versatile')
            },
            'code_generation': {
                'quality': ('anthropic', 'claude-3-sonnet-20240229'),
                'cost': ('ollama', 'codellama'),
                'speed': ('groq', 'llama-3.1-70b-versatile')
            },
            'analysis': {
                'quality': ('anthropic', 'claude-3-sonnet-20240229'),
                'cost': ('google', 'gemini-pro'),
                'speed': ('groq', 'mixtral-8x7b-32768')
            },
            'decision': {
                'quality': ('openai', 'gpt-4'),
                'cost': ('anthropic', 'claude-3-haiku-20240307'),
                'speed': ('groq', 'llama-3.1-70b-versatile')
            },
            'simple': {
                'quality': ('openai', 'gpt-3.5-turbo'),
                'cost': ('ollama', 'llama3'),
                'speed': ('openai', 'gpt-3.5-turbo')
            }
        }
        
        # Get selection
        provider_name, model_name = selection_map[request.task_type][request.budget_priority]
        
        # Check if provider is available and enabled
        if provider_name not in self.providers or not self.providers[provider_name].enabled:
            # Fallback to first available provider
            logger.warning(
                "Selected provider not available, using fallback",
                selected=provider_name,
                task_type=request.task_type,
                budget_priority=request.budget_priority
            )
            provider_name, model_name = self._get_fallback_provider(request.task_type)
        
        logger.info(
            "Selected LLM",
            provider=provider_name,
            model=model_name,
            task_type=request.task_type,
            budget_priority=request.budget_priority
        )
        
        return (provider_name, model_name)
    
    def _get_fallback_provider(self, task_type: str) -> tuple[str, str]:
        """Get fallback provider when preferred is unavailable"""
        # Try to find any enabled provider with the required capability
        for provider_name, provider in self.providers.items():
            if provider.enabled and task_type in provider.capabilities:
                return (provider_name, provider.models[0])
        
        # Last resort: use first enabled provider
        for provider_name, provider in self.providers.items():
            if provider.enabled:
                logger.warning(
                    "Using last-resort fallback provider",
                    provider=provider_name,
                    task_type=task_type
                )
                return (provider_name, provider.models[0])
        
        raise RuntimeError("No enabled LLM providers available")
    
    async def invoke(self, request: LLMRequest) -> LLMResponse:
        """Invoke LLM with automatic provider selection"""
        provider_name, model_name = self.select_llm(request)
        provider = self.providers[provider_name]
        
        start_time = time.time()
        
        try:
            # Call appropriate provider
            if provider.type == 'openai':
                response = await self._call_openai(provider, model_name, request)
            elif provider.type == 'anthropic':
                response = await self._call_anthropic(provider, model_name, request)
            elif provider.type == 'google':
                response = await self._call_google(provider, model_name, request)
            elif provider.type == 'groq':
                response = await self._call_groq(provider, model_name, request)
            elif provider.type == 'ollama':
                response = await self._call_ollama(provider, model_name, request)
            elif provider.type == 'openrouter':
                response = await self._call_openrouter(provider, model_name, request)
            elif provider.type == 'zai':
                response = await self._call_zai(provider, model_name, request)
            else:
                raise ValueError(f"Unknown provider type: {provider.type}")
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Calculate cost
            cost = (response.tokens_used / 1000) * provider.cost_per_1k_tokens[model_name]
            
            # Update usage stats
            self._update_usage_stats(provider_name, request.task_type, response.tokens_used, cost)
            
            return LLMResponse(
                content=response.content,
                provider=provider_name,
                model=model_name,
                tokens_used=response.tokens_used,
                cost=cost,
                latency_ms=latency_ms,
                finish_reason=response.finish_reason
            )
        
        except Exception as e:
            logger.error(
                "LLM invocation failed",
                provider=provider_name,
                model=model_name,
                error=str(e),
                exc_info=e
            )
            raise
    
    async def _call_openai(self, provider: LLMProvider, model: str, request: LLMRequest) -> LLMResponse:
        """Call OpenAI API"""
        client = openai.AsyncOpenAI(api_key=provider.api_key, base_url=provider.base_url)
        
        messages = request.messages or [{"role": "user", "content": request.prompt}]
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})
        
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        return LLMResponse(
            content=response.choices[0].message.content,
            provider='openai',
            model=model,
            tokens_used=response.usage.total_tokens,
            cost=0.0,  # Will be calculated by caller
            latency_ms=0,  # Will be calculated by caller
            finish_reason=response.choices[0].finish_reason
        )
    
    async def _call_anthropic(self, provider: LLMProvider, model: str, request: LLMRequest) -> LLMResponse:
        """Call Anthropic API"""
        client = anthropic.AsyncAnthropic(api_key=provider.api_key)
        
        messages = request.messages or [{"role": "user", "content": request.prompt}]
        
        response = await client.messages.create(
            model=model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            system=request.system_prompt or "",
            messages=messages
        )
        
        return LLMResponse(
            content=response.content[0].text,
            provider='anthropic',
            model=model,
            tokens_used=response.usage.input_tokens + response.usage.output_tokens,
            cost=0.0,
            latency_ms=0,
            finish_reason=response.stop_reason
        )
    
    async def _call_google(self, provider: LLMProvider, model: str, request: LLMRequest) -> LLMResponse:
        """Call Google Generative AI API"""
        genai.configure(api_key=provider.api_key)
        model_instance = genai.GenerativeModel(model)
        
        prompt = request.prompt
        if request.system_prompt:
            prompt = f"{request.system_prompt}\n\n{prompt}"
        
        response = await model_instance.generate_content_async(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=request.max_tokens,
                temperature=request.temperature
            )
        )
        
        # Google doesn't provide token counts in the same way
        # Estimate tokens (rough approximation)
        tokens_used = len(prompt.split()) + len(response.text.split())
        
        return LLMResponse(
            content=response.text,
            provider='google',
            model=model,
            tokens_used=tokens_used,
            cost=0.0,
            latency_ms=0,
            finish_reason=None
        )
    
    async def _call_groq(self, provider: LLMProvider, model: str, request: LLMRequest) -> LLMResponse:
        """Call Groq API"""
        client = AsyncGroq(api_key=provider.api_key)
        
        messages = request.messages or [{"role": "user", "content": request.prompt}]
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})
        
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        return LLMResponse(
            content=response.choices[0].message.content,
            provider='groq',
            model=model,
            tokens_used=response.usage.total_tokens,
            cost=0.0,
            latency_ms=0,
            finish_reason=response.choices[0].finish_reason
        )
    
    async def _call_ollama(self, provider: LLMProvider, model: str, request: LLMRequest) -> LLMResponse:
        """Call Ollama API"""
        import httpx
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{provider.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": request.prompt,
                    "system": request.system_prompt or "",
                    "options": {
                        "temperature": request.temperature,
                        "num_predict": request.max_tokens
                    }
                },
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
            
            # Estimate tokens
            tokens_used = len(request.prompt.split()) + len(data['response'].split())
            
            return LLMResponse(
                content=data['response'],
                provider='ollama',
                model=model,
                tokens_used=tokens_used,
                cost=0.0,
                latency_ms=0,
                finish_reason=None
            )
    
    async def _call_openrouter(self, provider: LLMProvider, model: str, request: LLMRequest) -> LLMResponse:
        """Call OpenRouter API (OpenAI-compatible)"""
        client = openai.AsyncOpenAI(
            api_key=provider.api_key,
            base_url=provider.base_url
        )
        
        messages = request.messages or [{"role": "user", "content": request.prompt}]
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})
        
        # Add optional headers for OpenRouter
        extra_headers = {}
        if settings.OPENROUTER_SITE_URL:
            extra_headers["HTTP-Referer"] = settings.OPENROUTER_SITE_URL
        if settings.OPENROUTER_SITE_NAME:
            extra_headers["X-Title"] = settings.OPENROUTER_SITE_NAME
        
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            extra_headers=extra_headers if extra_headers else None
        )
        
        return LLMResponse(
            content=response.choices[0].message.content,
            provider='openrouter',
            model=model,
            tokens_used=response.usage.total_tokens if response.usage else 0,
            cost=0.0,  # Will be calculated by caller
            latency_ms=0,  # Will be calculated by caller
            finish_reason=response.choices[0].finish_reason
        )
    
    async def _call_zai(self, provider: LLMProvider, model: str, request: LLMRequest) -> LLMResponse:
        """Call Z.AI API (OpenAI-compatible)"""
        client = openai.AsyncOpenAI(
            api_key=provider.api_key,
            base_url=provider.base_url
        )
        
        # GLM models support system messages
        messages = request.messages or [{"role": "user", "content": request.prompt}]
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})
        
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            extra_headers={
                "Accept-Language": "en-US,en"  # Support English
            }
        )
        
        return LLMResponse(
            content=response.choices[0].message.content,
            provider='zai',
            model=model,
            tokens_used=response.usage.total_tokens if response.usage else 0,
            cost=0.0,  # Will be calculated by caller
            latency_ms=0,  # Will be calculated by caller
            finish_reason=response.choices[0].finish_reason
        )
    
    def _update_usage_stats(self, provider: str, task_type: str, tokens: int, cost: float):
        """Update usage statistics"""
        self.usage_stats.total_requests += 1
        self.usage_stats.total_tokens += tokens
        self.usage_stats.total_cost += cost
        
        # By provider
        self.usage_stats.requests_by_provider[provider] = \
            self.usage_stats.requests_by_provider.get(provider, 0) + 1
        self.usage_stats.tokens_by_provider[provider] = \
            self.usage_stats.tokens_by_provider.get(provider, 0) + tokens
        self.usage_stats.cost_by_provider[provider] = \
            self.usage_stats.cost_by_provider.get(provider, 0.0) + cost
        
        # By task type
        self.usage_stats.requests_by_task_type[task_type] = \
            self.usage_stats.requests_by_task_type.get(task_type, 0) + 1
    
    def get_usage_stats(self) -> LLMUsageStats:
        """Get current usage statistics"""
        return self.usage_stats
    
    def get_providers(self) -> list[LLMProvider]:
        """Get list of configured providers"""
        return list(self.providers.values())
    
    def enable_provider(self, provider_name: str):
        """Enable a provider"""
        if provider_name in self.providers:
            self.providers[provider_name].enabled = True
            logger.info("Provider enabled", provider=provider_name)
    
    def disable_provider(self, provider_name: str):
        """Disable a provider"""
        if provider_name in self.providers:
            self.providers[provider_name].enabled = False
            logger.info("Provider disabled", provider=provider_name)


# Global LLM Proxy instance
llm_proxy = LLMProxy()


class LLMProviderError(Exception):
    """Custom exception for LLM provider errors."""
    def __init__(self, message, provider, model):
        self.message = message
        self.provider = provider
        self.model = model
        super().__init__(self.message)
