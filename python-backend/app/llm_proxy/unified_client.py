"""
Unified LLM Client - SmartSpec Pro
Combines all providers with intelligent routing and fallbacks
"""

import asyncio
from typing import Optional, List, Dict, Any, Literal, IO
from decimal import Decimal
import structlog
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm_proxy.openrouter_wrapper import OpenRouterWrapper, create_openrouter_client
from app.llm_proxy.models import LLMRequest, LLMResponse, LLMProvider
from app.core.config import settings
from app.llm_proxy.providers import KieAIProvider, KNPLabsProvider

logger = structlog.get_logger()

def _is_placeholder_key(value: Optional[str]) -> bool:
    if not value:
        return True
    normalized = value.strip().lower()
    return normalized in {
        "",
        "your-kie-ai-api-key",
        "changeme",
        "change-me",
        "replace-me",
        "your-api-key",
    }


class UnifiedLLMClient:
    """
    Unified LLM Client ที่รวม:
    - OpenRouter (420+ models, load balancing, fallbacks)
    - Z.AI (GLM-4.7, Chinese LLM)
    - Direct providers (OpenAI, Anthropic, Google, Groq, Ollama)
    - Database-backed provider configs (from Admin UI)

    Features:
    - Automatic provider selection
    - Load balancing
    - Automatic fallbacks
    - Cost optimization
    - Privacy controls
    - Monitoring และ logging
    - Dynamic provider configuration from database
    """

    def __init__(self):
        """Initialize unified LLM client"""
        self.openrouter_client: Optional[OpenRouterWrapper] = None
        self.direct_providers: Dict[str, Any] = {}
        self.provider_configs: Dict[str, Dict] = {}  # Provider configs from database
        self.default_models: Dict[str, str] = {}  # Default models per provider
        self.model_to_provider: Dict[str, str] = {}  # Map model strings to their provider names
        self.kie_ai_client: Optional[KieAIProvider] = None
        self.knplabs_client: Optional[KNPLabsProvider] = None
        self._initialized = False

        logger.info("unified_llm_client_created")

    async def initialize(self, db: Optional[AsyncSession] = None):
        """
        Async initialization of LLM clients

        Args:
            db: Optional database session for loading provider configs
        """
        if self._initialized:
            return

        # Load from .env (backward compatibility)
        self._initialize_clients()

        # Load from database (if available)
        if db:
            await self._initialize_from_database(db)

        self._initialized = True
        logger.info("unified_llm_client_initialized")

    async def _initialize_from_database(self, db: AsyncSession):
        """
        Initialize providers from database configurations

        Args:
            db: Database session
        """
        try:
            from app.services.provider_config_service import get_provider_config_service

            service = get_provider_config_service()
            configs = await service.get_all_provider_configs(db)

            self.provider_configs = configs

            # Extract default models
            for provider_name, config in configs.items():
                if config.get("default_model"):
                    default_model = config["default_model"]
                    self.default_models[provider_name] = default_model
                    # Map the model string to its provider
                    self.model_to_provider[default_model] = provider_name

            # Initialize provider clients from database configs
            for provider_name, config in configs.items():
                await self._initialize_provider_from_config(provider_name, config)

            logger.info(
                "providers_loaded_from_database",
                count=len(configs),
                providers=list(configs.keys()),
                models=self.default_models
            )
        except Exception as e:
            logger.error(
                "failed_to_load_providers_from_database",
                error=str(e)
            )

    async def _initialize_provider_from_config(
        self,
        provider_name: str,
        config: Dict
    ):
        """
        Initialize a provider client from database config

        Args:
            provider_name: Provider identifier
            config: Provider configuration dict
        """
        api_key = config.get("api_key")
        base_url = config.get("base_url")

        if not api_key:
            logger.warning(
                "provider_missing_api_key",
                provider=provider_name
            )
            return

        # Initialize based on provider type
        if provider_name == "openai":
            from openai import OpenAI
            self.direct_providers['openai'] = OpenAI(
                api_key=api_key,
                base_url=base_url or "https://api.openai.com/v1"
            )
            logger.info("openai_initialized_from_db")

        elif provider_name == "anthropic":
            import anthropic
            self.direct_providers['anthropic'] = anthropic.Anthropic(
                api_key=api_key
            )
            logger.info("anthropic_initialized_from_db")

        elif provider_name == "openrouter":
            self.openrouter_client = create_openrouter_client(
                api_key=api_key,
                site_url=config.get("site_url", "https://smartspec.pro"),
                site_name=config.get("site_name", "SmartSpec Pro")
            )
            logger.info("openrouter_initialized_from_db")

        elif provider_name == "kilocode":
            # Kilo Code uses OpenRouter-compatible API
            # Must send headers to appear as Kilo Code CLI
            from openai import OpenAI
            self.direct_providers['kilocode'] = OpenAI(
                api_key=api_key,
                base_url=base_url or "https://api.kilo.ai/api/openrouter",
                default_headers={
                    "HTTP-Referer": "https://kilo.ai",
                    "X-Title": "SmartSpec Kilo CLI Proxy",
                    "User-Agent": "kilo-code-cli/1.0.0"
                }
            )
            logger.info("kilocode_initialized_from_db", base_url=base_url)

        elif provider_name == "groq":
            from openai import OpenAI
            self.direct_providers['groq'] = OpenAI(
                api_key=api_key,
                base_url=base_url or "https://api.groq.com/openai/v1"
            )
            logger.info("groq_initialized_from_db")

        elif provider_name == "kie_ai":
            self.kie_ai_client = KieAIProvider(
                api_key=api_key,
                base_url=base_url or "https://api.kie.ai/api/v1",
            )
            logger.info("kie_ai_initialized_from_db")

        elif provider_name in {"knplabs", "knplabai"}:
            self.knplabs_client = KNPLabsProvider(
                api_key=api_key,
                base_url=base_url or KNPLabsProvider.BASE_URL,
            )
            logger.info("knplabs_initialized_from_db", base_url=base_url)

        elif provider_name == "ollama":
            from openai import OpenAI
            self.direct_providers['ollama'] = OpenAI(
                api_key="ollama",  # Ollama doesn't require real API key
                base_url=base_url or "http://localhost:11434/v1"
            )
            logger.info("ollama_initialized_from_db")

        else:
            # Generic OpenAI-compatible provider
            # Support any provider that has OpenAI-compatible API
            from openai import OpenAI
            self.direct_providers[provider_name] = OpenAI(
                api_key=api_key,
                base_url=base_url
            )
            logger.info(
                "generic_openai_provider_initialized_from_db",
                provider=provider_name,
                base_url=base_url
            )
    
    def _initialize_clients(self):
        """Initialize all LLM clients"""
        
        # OpenRouter (primary - 420+ models)
        if settings.OPENROUTER_API_KEY:
            self.openrouter_client = create_openrouter_client(
                api_key=settings.OPENROUTER_API_KEY,
                site_url=getattr(settings, 'SITE_URL', 'https://smartspec.pro'),
                site_name=getattr(settings, 'SITE_NAME', 'SmartSpec Pro')
            )
            logger.info("openrouter_client_initialized")
        
        # Direct providers (backup)
        # เก็บไว้สำหรับ fallback หรือ special cases
        if settings.OPENAI_API_KEY:
            from openai import OpenAI
            self.direct_providers['openai'] = OpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL
            )
            logger.info("direct_openai_initialized")

        if settings.GROQ_API_KEY:
            from openai import OpenAI
            self.direct_providers['groq'] = OpenAI(
                api_key=settings.GROQ_API_KEY,
                base_url=settings.GROQ_BASE_URL,
            )
            logger.info("direct_groq_initialized")
        
        if settings.ANTHROPIC_API_KEY:
            import anthropic
            self.direct_providers['anthropic'] = anthropic.Anthropic(
                api_key=settings.ANTHROPIC_API_KEY
            )
            logger.info("direct_anthropic_initialized")

        if settings.KIE_AI_API_KEY and not _is_placeholder_key(settings.KIE_AI_API_KEY):
            self.kie_ai_client = KieAIProvider(
                api_key=settings.KIE_AI_API_KEY,
                base_url=settings.KIE_AI_BASE_URL or "https://api.kie.ai/api/v1"
            )
            logger.info("kie_ai_client_initialized")
        elif settings.KIE_AI_API_KEY:
            # Placeholder env key should not mask DB-backed provider configuration.
            logger.warning("kie_ai_env_key_ignored_placeholder")

        if settings.KNPLABAI_API_KEY and not _is_placeholder_key(settings.KNPLABAI_API_KEY):
            self.knplabs_client = KNPLabsProvider(
                api_key=settings.KNPLABAI_API_KEY,
                base_url=settings.KNPLABAI_BASE_URL or KNPLabsProvider.BASE_URL,
            )
            logger.info("knplabs_client_initialized")
        elif settings.KNPLABAI_API_KEY:
            logger.warning("knplabs_env_key_ignored_placeholder")
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        # Model selection
        model: Optional[str] = None,
        task_type: Optional[str] = None,
        budget_priority: Literal["cost", "quality", "speed", "balanced"] = "balanced",
        # OpenRouter features
        use_openrouter: bool = True,
        fallback_models: Optional[List[str]] = None,
        sort: Optional[Literal["price", "throughput", "latency"]] = None,
        # Privacy
        data_collection: Literal["allow", "deny"] = "allow",
        zdr: Optional[bool] = None,
        # Cost control
        max_price: Optional[Dict[str, float]] = None,
        # Other parameters
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> LLMResponse:
        """
        Unified chat completion with intelligent routing
        
        Args:
            messages: Chat messages
            model: Specific model (e.g., "openai/gpt-4o", "anthropic/claude-3.5-sonnet")
            task_type: Task type for automatic model selection
            budget_priority: Budget priority (cost, quality, speed, balanced)
            use_openrouter: Use OpenRouter (default: True)
            fallback_models: Fallback models
            sort: Sort providers by price/throughput/latency
            data_collection: Allow or deny data collection
            zdr: Zero Data Retention
            max_price: Max price per 1K tokens
            temperature: Temperature
            max_tokens: Max tokens
            **kwargs: Other parameters
        
        Returns:
            LLMResponse
        
        Example:
            >>> client = UnifiedLLMClient()
            >>> response = await client.chat(
            ...     messages=[{"role": "user", "content": "Hello"}],
            ...     task_type="code_generation",
            ...     budget_priority="quality",
            ...     fallback_models=["openai/gpt-4o"]
            ... )
        """
        
        # Step 1: Select model
        if not model:
            model = self._select_model(task_type, budget_priority)

        # Check if model has a configured provider
        provider_name = None

        # First check if this model is mapped to a provider (from database config)
        if model in self.model_to_provider:
            provider_name = self.model_to_provider[model]
        # Otherwise, try to extract provider from model string
        elif "/" in model:
            provider_name = model.split("/")[0]

        # Check if the provider is available in direct_providers
        provider_in_direct = provider_name and provider_name in self.direct_providers

        logger.info(
            "unified_llm_chat",
            model=model,
            task_type=task_type,
            budget_priority=budget_priority,
            use_openrouter=use_openrouter,
            provider_name=provider_name,
            provider_in_direct=provider_in_direct
        )

        # Step 2: Route to appropriate client
        # Priority: OpenRouter (when requested) > Direct provider > Fallback
        try:
            if use_openrouter and self.openrouter_client:
                # Use OpenRouter (primary) — handles provider-prefixed models like "openai/gpt-4o"
                logger.info("using_openrouter", model=model)
                response = await self._chat_openrouter(
                    model=model,
                    messages=messages,
                    fallback_models=fallback_models,
                    sort=sort,
                    data_collection=data_collection,
                    zdr=zdr,
                    max_price=max_price,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    budget_priority=budget_priority,
                    **kwargs
                )
            elif provider_in_direct:
                # Use direct provider (when OpenRouter not requested or not available)
                logger.info("using_direct_provider", provider=provider_name, model=model)
                response = await self._chat_direct(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    provider_name=provider_name,
                    **kwargs
                )
            else:
                # Use direct provider (fallback)
                response = await self._chat_direct(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs
                )
            
            logger.info(
                "unified_llm_success",
                model=model,
                model_used=response.model,
                tokens=response.tokens_used or 0
            )
            
            return response
        
        except Exception as e:
            logger.error(
                "unified_llm_error",
                model=model,
                error=str(e)
            )
            raise
    
    async def _chat_openrouter(
        self,
        model: str,
        messages: List[Dict[str, str]],
        fallback_models: Optional[List[str]],
        sort: Optional[str],
        data_collection: str,
        zdr: Optional[bool],
        max_price: Optional[Dict[str, float]],
        temperature: float,
        max_tokens: Optional[int],
        budget_priority: str,
        **kwargs
    ) -> LLMResponse:
        """Chat via OpenRouter with load balancing and fallbacks"""
        
        # Apply budget priority
        if not sort:
            if budget_priority == "cost":
                sort = "price"
            elif budget_priority == "speed":
                sort = "throughput"
            # else: use default (balanced)
        
        # Set default fallbacks based on model
        if not fallback_models:
            fallback_models = self._get_default_fallbacks(model, budget_priority)
        
        # Call OpenRouter
        response = self.openrouter_client.chat(
            model=model,
            messages=messages,
            sort=sort,
            fallback_models=fallback_models,
            data_collection=data_collection,
            zdr=zdr,
            max_price=max_price,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
        
        # Convert to LLMResponse
        return self._convert_to_llm_response(response)
    
    async def _chat_direct(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: Optional[int],
        provider_name: Optional[str] = None,
        **kwargs
    ) -> LLMResponse:
        """Chat via direct provider (fallback)"""

        # If provider_name is explicitly provided, use it
        if provider_name:
            # Provider explicitly specified
            # For OpenRouter-compatible providers (kilocode, openrouter), keep full model string
            if provider_name in ["kilocode", "openrouter"]:
                model_name = model  # Keep full format like "minimax/minimax-m2.1:free"
            else:
                # For other providers, extract model name from full model string
                if "/" in model:
                    model_name = model.split("/", 1)[1]  # Everything after first /
                else:
                    model_name = model
        else:
            # Parse provider from model string
            if "/" in model:
                provider_name = model.split("/")[0]
                model_name = model.split("/")[1]
            else:
                provider_name = "openai"  # Default
                model_name = model

        if provider_name not in self.direct_providers:
            raise ValueError(f"Provider {provider_name} not available")

        client = self.direct_providers[provider_name]

        # Use default model from config if available
        if not model_name and provider_name in self.default_models:
            model_name = self.default_models[provider_name]
            logger.info(
                "using_default_model",
                provider=provider_name,
                model=model_name
            )

        logger.info(
            "calling_provider_api",
            provider=provider_name,
            model=model_name
        )

        # Call provider
        if provider_name == "anthropic":
            # Anthropic uses different API
            response = client.messages.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens or 1024,
                **kwargs
            )
        else:
            # All other providers use OpenAI-compatible API
            # (openai, kilocode, groq, ollama, minimax, deepseek, etc.)
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )

        return self._convert_to_llm_response(response)
    
    def _select_model(
        self,
        task_type: Optional[str],
        budget_priority: str
    ) -> str:
        """
        Select appropriate model based on task type and budget priority

        Task Types:
        - code_generation: Claude 3.5 Sonnet, GPT-4o
        - analysis: GPT-4o, Claude 3.5 Sonnet
        - planning: GPT-4o, Claude 3.5 Sonnet
        - simple: GPT-4o-mini, Gemini Flash
        - decision: GPT-4o, Claude 3.5 Sonnet

        Budget Priority:
        - quality: Best models (Claude 3.5 Sonnet, GPT-4o)
        - speed: Fast models (Gemini Flash, GPT-4o-mini)
        - cost: Cheap models (Llama 3.1, Gemini Flash)
        - balanced: Good balance (GPT-4o, Claude 3.5 Sonnet)
        """

        # Check for database-configured providers first
        if self.default_models:
            # Use the first available default model from enabled providers
            default_model = next(iter(self.default_models.values()))
            logger.info(
                "using_database_default_model",
                model=default_model,
                provider=self.model_to_provider.get(default_model, "unknown")
            )
            return default_model

        # Model selection matrix
        model_matrix = {
            "code_generation": {
                "quality": "anthropic/claude-3.5-sonnet",
                "speed": "google/gemini-flash-1.5",
                "cost": "meta-llama/llama-3.1-70b-instruct",
                "balanced": "openai/gpt-4o"
            },
            "analysis": {
                "quality": "openai/gpt-4o",
                "speed": "google/gemini-flash-1.5",
                "cost": "meta-llama/llama-3.1-70b-instruct",
                "balanced": "openai/gpt-4o"
            },
            "planning": {
                "quality": "anthropic/claude-3.5-sonnet",
                "speed": "openai/gpt-4o-mini",
                "cost": "meta-llama/llama-3.1-70b-instruct",
                "balanced": "openai/gpt-4o"
            },
            "simple": {
                "quality": "openai/gpt-4o-mini",
                "speed": "google/gemini-flash-1.5",
                "cost": "meta-llama/llama-3.1-70b-instruct",
                "balanced": "google/gemini-flash-1.5"
            },
            "decision": {
                "quality": "anthropic/claude-3.5-sonnet",
                "speed": "openai/gpt-4o",
                "cost": "meta-llama/llama-3.1-70b-instruct",
                "balanced": "openai/gpt-4o"
            }
        }
        
        # Default task type
        if not task_type:
            task_type = "simple"
        
        # Get model
        if task_type in model_matrix:
            model = model_matrix[task_type].get(budget_priority, "openai/gpt-4o")
        else:
            model = "openai/gpt-4o"  # Default
        
        logger.info(
            "model_selected",
            task_type=task_type,
            budget_priority=budget_priority,
            model=model
        )
        
        return model
    
    def _get_default_fallbacks(
        self,
        model: str,
        budget_priority: str
    ) -> List[str]:
        """Get default fallback models"""
        
        # High-quality fallbacks
        if budget_priority == "quality":
            if "claude" in model:
                return ["openai/gpt-4o", "google/gemini-flash-1.5"]
            elif "gpt-4" in model:
                return ["anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5"]
            else:
                return ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"]
        
        # Speed fallbacks
        elif budget_priority == "speed":
            return [
                "google/gemini-flash-1.5",
                "openai/gpt-4o-mini",
                "meta-llama/llama-3.1-70b-instruct"
            ]
        
        # Cost fallbacks
        elif budget_priority == "cost":
            return [
                "meta-llama/llama-3.1-70b-instruct",
                "google/gemini-flash-1.5",
                "openai/gpt-4o-mini"
            ]
        
        # Balanced fallbacks (default)
        else:
            return [
                "openai/gpt-4o",
                "anthropic/claude-3.5-sonnet",
                "google/gemini-flash-1.5"
            ]
    
    def _convert_to_llm_response(self, response: Any) -> LLMResponse:
        """Convert provider response to LLMResponse
        
        OpenRouter returns cost in 'credits' where 1 credit = $0.000001 USD
        We convert this to USD for credit deduction.
        """

        # OpenAI-compatible response (OpenRouter, OpenAI, KiloCode, etc.)
        if hasattr(response, 'choices') and hasattr(response, 'model'):
            tokens_used = None
            cost = None
            prompt_tokens = None
            completion_tokens = None
            
            if hasattr(response, 'usage') and response.usage:
                tokens_used = response.usage.total_tokens
                prompt_tokens = getattr(response.usage, 'prompt_tokens', None)
                completion_tokens = getattr(response.usage, 'completion_tokens', None)
                
                # OpenRouter returns cost in credits (1 credit = $0.000001 USD)
                # The cost field is in credits, so we convert to USD
                openrouter_cost = getattr(response.usage, 'cost', None)
                if openrouter_cost is not None:
                    # Convert OpenRouter credits to USD
                    # OpenRouter cost is in credits where 1 credit = $0.000001
                    cost = float(openrouter_cost) * 0.000001
                    logger.info(
                        "openrouter_cost_extracted",
                        cost_credits=openrouter_cost,
                        cost_usd=cost,
                        tokens_used=tokens_used
                    )
            
            # If no cost from OpenRouter, estimate based on model pricing
            if cost is None and prompt_tokens and completion_tokens:
                model_name = response.model
                estimated_cost = self.estimate_cost(model_name, prompt_tokens, completion_tokens)
                cost = float(estimated_cost)
                logger.info(
                    "cost_estimated_from_tokens",
                    model=model_name,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    cost_usd=cost
                )
            
            # Extract provider from model string if possible
            provider = "openrouter"
            if hasattr(response, 'model') and "/" in response.model:
                provider = response.model.split("/")[0]

            return LLMResponse(
                content=response.choices[0].message.content,
                model=response.model,
                provider=provider,
                tokens_used=tokens_used,
                cost=cost,
                latency_ms=None,
                finish_reason=response.choices[0].finish_reason
            )

        # Anthropic response
        elif hasattr(response, 'content') and hasattr(response, 'model'):
            tokens_used = None
            cost = None
            
            if hasattr(response, 'usage'):
                input_tokens = response.usage.input_tokens
                output_tokens = response.usage.output_tokens
                tokens_used = input_tokens + output_tokens
                
                # Estimate cost for Anthropic
                estimated_cost = self.estimate_cost(response.model, input_tokens, output_tokens)
                cost = float(estimated_cost)

            return LLMResponse(
                content=response.content[0].text,
                model=response.model,
                provider="anthropic",
                tokens_used=tokens_used,
                cost=cost,
                latency_ms=None,
                finish_reason=response.stop_reason
            )

        else:
            raise ValueError(f"Unknown response type: {type(response)}")

    async def transcribe(
        self,
        audio_file: IO[bytes],
        provider: str = "groq",
        language: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Transcribe audio using a configured provider."""
        provider_name = provider.strip().lower()
        if provider_name not in {"openai", "groq"}:
            raise ValueError(f"Unsupported transcription provider: {provider}")

        client = self.direct_providers.get(provider_name)
        if client is None:
            raise ValueError(f"Provider {provider_name} not available")

        transcription_model = model or ("whisper-large-v3" if provider_name == "groq" else "whisper-1")
        if hasattr(audio_file, "seek"):
            try:
                audio_file.seek(0)
            except Exception:
                pass

        def _call():
            kwargs: Dict[str, Any] = {
                "model": transcription_model,
                "file": audio_file,
            }
            if language:
                kwargs["language"] = language
            return client.audio.transcriptions.create(**kwargs)

        result = await asyncio.to_thread(_call)
        return {
            "text": getattr(result, "text", ""),
            "language": getattr(result, "language", language or "en"),
            "confidence": float(getattr(result, "confidence", 0.9) or 0.9),
            "duration": float(getattr(result, "duration", 0.0) or 0.0),
        }

    async def synthesize_speech(
        self,
        text: str,
        provider: str = "openai",
        voice: str = "alloy",
        speed: float = 1.0,
        format: str = "mp3",
    ) -> Dict[str, Any]:
        """Synthesize speech using OpenAI, KNPLabs, or ElevenLabs-compatible routing."""
        provider_name = provider.strip().lower()

        if provider_name in {"openai"}:
            client = self.direct_providers.get("openai")
            if client is None:
                raise ValueError("OpenAI provider not available")

            def _call():
                return client.audio.speech.create(
                    model="gpt-4o-mini-tts",
                    voice=voice,
                    input=text,
                    response_format=format,
                    speed=speed,
                )

            result = await asyncio.to_thread(_call)
            audio_bytes = getattr(result, "content", None)
            if audio_bytes is None and hasattr(result, "read"):
                audio_bytes = await asyncio.to_thread(result.read)
            if audio_bytes is None:
                raise ValueError("OpenAI TTS response did not contain audio bytes")
            return {"audio_bytes": audio_bytes}

        if provider_name in {"knplabs", "knplabai"}:
            if not self.knplabs_client:
                if not settings.KNPLABAI_API_KEY.strip():
                    raise ValueError("KNPLabs provider not available")
                self.knplabs_client = KNPLabsProvider(
                    api_key=settings.KNPLABAI_API_KEY,
                    base_url=settings.KNPLABAI_BASE_URL or KNPLabsProvider.BASE_URL,
                )
            audio_bytes = await self.knplabs_client.generate_speech(
                model="gpt-4o-mini-tts",
                input_text=text,
                voice=voice,
                response_format=format,
            )
            return {"audio_bytes": audio_bytes}

        if provider_name in {"elevenlabs", "kie_ai", "kie"}:
            if not self.kie_ai_client:
                from app.services.media_provider_service import initialize_kie_ai_client
                self.kie_ai_client = await initialize_kie_ai_client()
            if not self.kie_ai_client:
                raise ValueError("ElevenLabs provider not available")

            result = await self.kie_ai_client.generate_audio(
                model="elevenlabs-tts",
                text=text,
                voice=voice,
                speed=speed,
                output_format=format,
                wait_for_completion=True,
            )
            url = None
            if isinstance(result, dict):
                data = result.get("data")
                if isinstance(data, list) and data:
                    first = data[0]
                    if isinstance(first, dict):
                        url = first.get("url") or first.get("audio_url")
                if not url:
                    url = result.get("audio_url") or result.get("url")
            if not url:
                raise ValueError("ElevenLabs provider returned no audio URL")

            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()
                return {"audio_bytes": response.content}

        raise ValueError(f"Unsupported TTS provider: {provider}")
    
    def estimate_cost(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int
    ) -> Decimal:
        """
        Estimate cost for a request
        
        Args:
            model: Model name
            prompt_tokens: Number of prompt tokens
            completion_tokens: Number of completion tokens
        
        Returns:
            Estimated cost in USD
        """
        
        # Cost per 1M tokens (approximate)
        cost_table = {
            # OpenAI
            "gpt-4o": {"prompt": 2.5, "completion": 10.0},
            "gpt-4o-mini": {"prompt": 0.15, "completion": 0.6},
            "gpt-4-turbo": {"prompt": 10.0, "completion": 30.0},
            
            # Anthropic
            "claude-3.5-sonnet": {"prompt": 3.0, "completion": 15.0},
            "claude-3-opus": {"prompt": 15.0, "completion": 75.0},
            "claude-3-haiku": {"prompt": 0.25, "completion": 1.25},
            
            # Google
            "gemini-flash-1.5": {"prompt": 0.075, "completion": 0.3},
            "gemini-pro-1.5": {"prompt": 1.25, "completion": 5.0},
            
            # Meta
            "llama-3.1-70b-instruct": {"prompt": 0.35, "completion": 0.4},
            "llama-3.1-405b-instruct": {"prompt": 2.7, "completion": 2.7},
        }
        
        # Extract model name (remove provider prefix)
        model_name = model.split("/")[-1] if "/" in model else model
        
        # Get costs
        costs = cost_table.get(model_name, {"prompt": 1.0, "completion": 3.0})  # Default
        
        # Calculate
        prompt_cost = (prompt_tokens / 1_000_000) * costs["prompt"]
        completion_cost = (completion_tokens / 1_000_000) * costs["completion"]
        total_cost = prompt_cost + completion_cost
        
        return Decimal(str(total_cost))


# Global singleton instance
unified_client = UnifiedLLMClient()


def get_unified_client() -> UnifiedLLMClient:
    """Get the module-level singleton instance of UnifiedLLMClient.

    This returns the same instance that is initialized at app startup via
    ``main.py`` (which calls ``unified_client.initialize(db=session)``).
    """
    return unified_client
# mypy: ignore-errors
