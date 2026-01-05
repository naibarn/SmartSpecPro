"""
OpenRouter Wrapper with Load Balancing and Automatic Fallbacks
SmartSpec Pro - Advanced LLM Routing
"""

from typing import Optional, List, Literal, Dict, Any
from openai import OpenAI, OpenAIError
import structlog
import time

logger = structlog.get_logger()


class OpenRouterWrapper:
    """
    Wrapper class สำหรับ OpenRouter พร้อม Load Balancing และ Automatic Fallbacks
    
    Features:
    - Load balancing (price, throughput, latency)
    - Automatic fallbacks (model และ provider)
    - Provider routing และ filtering
    - Privacy controls (ZDR, data collection)
    - Cost controls (max price)
    - Retry logic
    - Error handling
    
    Example:
        >>> client = OpenRouterWrapper(api_key="sk-or-v1-...")
        >>> response = client.chat(
        ...     model="anthropic/claude-3.5-sonnet",
        ...     messages=[{"role": "user", "content": "Hello"}],
        ...     sort="throughput",
        ...     fallback_models=["openai/gpt-4o"]
        ... )
    """
    
    def __init__(
        self,
        api_key: str,
        site_url: str = "",
        site_name: str = "",
        default_timeout: int = 30,
        default_max_retries: int = 3
    ):
        """
        Initialize OpenRouter wrapper
        
        Args:
            api_key: OpenRouter API key
            site_url: Your site URL (for rankings)
            site_name: Your site name (for rankings)
            default_timeout: Default timeout in seconds
            default_max_retries: Default max retries
        """
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=default_timeout
        )
        self.site_url = site_url
        self.site_name = site_name
        self.default_max_retries = default_max_retries
        
        logger.info(
            "openrouter_wrapper_initialized",
            site_url=site_url,
            site_name=site_name
        )
    
    def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        # Load balancing options
        sort: Optional[Literal["price", "throughput", "latency"]] = None,
        # Fallback options
        fallback_models: Optional[List[str]] = None,
        allow_fallbacks: bool = True,
        # Provider options
        preferred_providers: Optional[List[str]] = None,
        only_providers: Optional[List[str]] = None,
        ignore_providers: Optional[List[str]] = None,
        # Privacy options
        data_collection: Literal["allow", "deny"] = "allow",
        zdr: Optional[bool] = None,
        # Quality options
        require_parameters: bool = False,
        quantizations: Optional[List[str]] = None,
        # Cost options
        max_price: Optional[Dict[str, float]] = None,
        # Retry options
        max_retries: Optional[int] = None,
        # OpenAI API parameters
        **kwargs
    ) -> Any:
        """
        Chat completion with load balancing and fallbacks
        
        Args:
            model: Model ID (e.g., "openai/gpt-4o")
            messages: Chat messages
            
            Load Balancing:
                sort: Sort providers by "price", "throughput", or "latency"
            
            Fallbacks:
                fallback_models: List of fallback models
                allow_fallbacks: Allow provider fallbacks (default: True)
            
            Provider Routing:
                preferred_providers: Preferred provider order
                only_providers: Only allow these providers
                ignore_providers: Ignore these providers
            
            Privacy:
                data_collection: "allow" or "deny" data collection
                zdr: Enforce Zero Data Retention
            
            Quality:
                require_parameters: Only use providers supporting all parameters
                quantizations: Allowed quantization levels
            
            Cost:
                max_price: Max price per 1K tokens {"prompt": 0.005, "completion": 0.015}
            
            Retry:
                max_retries: Max retry attempts (default: 3)
            
            **kwargs: Other OpenAI API parameters (temperature, max_tokens, etc.)
        
        Returns:
            ChatCompletion response
        
        Raises:
            OpenAIError: If all attempts fail
        
        Example:
            >>> response = client.chat(
            ...     model="anthropic/claude-3.5-sonnet",
            ...     messages=[{"role": "user", "content": "Write code"}],
            ...     sort="throughput",
            ...     fallback_models=["openai/gpt-4o", "google/gemini-flash-1.5"],
            ...     data_collection="deny",
            ...     max_retries=3
            ... )
        """
        # Build extra_body
        extra_body = self._build_extra_body(
            sort=sort,
            fallback_models=fallback_models,
            allow_fallbacks=allow_fallbacks,
            preferred_providers=preferred_providers,
            only_providers=only_providers,
            ignore_providers=ignore_providers,
            data_collection=data_collection,
            zdr=zdr,
            require_parameters=require_parameters,
            quantizations=quantizations,
            max_price=max_price
        )
        
        # Build extra_headers
        extra_headers = self._build_extra_headers()
        
        # Retry logic
        retries = max_retries if max_retries is not None else self.default_max_retries
        
        for attempt in range(retries):
            try:
                logger.info(
                    "openrouter_request",
                    model=model,
                    attempt=attempt + 1,
                    max_retries=retries,
                    extra_body=extra_body
                )
                
                response = self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    extra_body=extra_body if extra_body else None,
                    extra_headers=extra_headers if extra_headers else None,
                    **kwargs
                )
                
                logger.info(
                    "openrouter_success",
                    model=model,
                    model_used=response.model,
                    tokens=response.usage.total_tokens if response.usage else 0,
                    attempt=attempt + 1
                )
                
                return response
            
            except OpenAIError as e:
                logger.warning(
                    "openrouter_error",
                    model=model,
                    attempt=attempt + 1,
                    max_retries=retries,
                    error=str(e)
                )
                
                if attempt < retries - 1:
                    # Exponential backoff
                    wait_time = 2 ** attempt
                    logger.info(
                        "openrouter_retry",
                        wait_time=wait_time,
                        next_attempt=attempt + 2
                    )
                    time.sleep(wait_time)
                else:
                    logger.error(
                        "openrouter_failed",
                        model=model,
                        attempts=retries,
                        error=str(e)
                    )
                    raise
    
    def _build_extra_body(
        self,
        sort: Optional[str] = None,
        fallback_models: Optional[List[str]] = None,
        allow_fallbacks: bool = True,
        preferred_providers: Optional[List[str]] = None,
        only_providers: Optional[List[str]] = None,
        ignore_providers: Optional[List[str]] = None,
        data_collection: str = "allow",
        zdr: Optional[bool] = None,
        require_parameters: bool = False,
        quantizations: Optional[List[str]] = None,
        max_price: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """Build extra_body for OpenRouter request"""
        extra_body = {}
        
        # Provider options
        provider_opts = {}
        
        if sort:
            provider_opts["sort"] = sort
        
        if preferred_providers:
            provider_opts["order"] = preferred_providers
        
        if not allow_fallbacks:
            provider_opts["allow_fallbacks"] = False
        
        if require_parameters:
            provider_opts["require_parameters"] = True
        
        if data_collection == "deny":
            provider_opts["data_collection"] = "deny"
        
        if zdr is not None:
            provider_opts["zdr"] = zdr
        
        if only_providers:
            provider_opts["only"] = only_providers
        
        if ignore_providers:
            provider_opts["ignore"] = ignore_providers
        
        if quantizations:
            provider_opts["quantizations"] = quantizations
        
        if max_price:
            provider_opts["max_price"] = max_price
        
        if provider_opts:
            extra_body["provider"] = provider_opts
        
        # Model fallbacks
        if fallback_models:
            extra_body["models"] = fallback_models
        
        return extra_body
    
    def _build_extra_headers(self) -> Dict[str, str]:
        """Build extra_headers for OpenRouter request"""
        headers = {}
        
        if self.site_url:
            headers["HTTP-Referer"] = self.site_url
        
        if self.site_name:
            headers["X-Title"] = self.site_name
        
        return headers
    
    # Convenience methods
    
    def chat_high_availability(
        self,
        model: str,
        messages: List[Dict[str, str]],
        fallback_models: Optional[List[str]] = None,
        **kwargs
    ):
        """
        Chat with high availability (default load balancing + fallbacks)
        
        Example:
            >>> response = client.chat_high_availability(
            ...     model="anthropic/claude-3.5-sonnet",
            ...     messages=[{"role": "user", "content": "Hello"}],
            ...     fallback_models=["openai/gpt-4o", "google/gemini-flash-1.5"]
            ... )
        """
        return self.chat(
            model=model,
            messages=messages,
            fallback_models=fallback_models,
            allow_fallbacks=True,
            **kwargs
        )
    
    def chat_fast(
        self,
        model: str,
        messages: List[Dict[str, str]],
        **kwargs
    ):
        """
        Chat with maximum speed (throughput-optimized)
        
        Example:
            >>> response = client.chat_fast(
            ...     model="google/gemini-flash-1.5",
            ...     messages=[{"role": "user", "content": "Quick question"}]
            ... )
        """
        return self.chat(
            model=model,
            messages=messages,
            sort="throughput",
            **kwargs
        )
    
    def chat_cheap(
        self,
        model: str,
        messages: List[Dict[str, str]],
        max_price: Optional[Dict[str, float]] = None,
        **kwargs
    ):
        """
        Chat with minimum cost (price-optimized)
        
        Example:
            >>> response = client.chat_cheap(
            ...     model="meta-llama/llama-3.1-70b-instruct",
            ...     messages=[{"role": "user", "content": "Hello"}],
            ...     max_price={"prompt": 0.001, "completion": 0.002}
            ... )
        """
        return self.chat(
            model=model,
            messages=messages,
            sort="price",
            max_price=max_price,
            **kwargs
        )
    
    def chat_private(
        self,
        model: str,
        messages: List[Dict[str, str]],
        zdr: bool = True,
        **kwargs
    ):
        """
        Chat with maximum privacy (ZDR + no data collection)
        
        Example:
            >>> response = client.chat_private(
            ...     model="openai/gpt-4o",
            ...     messages=[{"role": "user", "content": "Confidential data"}]
            ... )
        """
        return self.chat(
            model=model,
            messages=messages,
            data_collection="deny",
            zdr=zdr,
            **kwargs
        )
    
    def chat_reliable(
        self,
        model: str,
        messages: List[Dict[str, str]],
        preferred_providers: Optional[List[str]] = None,
        **kwargs
    ):
        """
        Chat with specific reliable providers
        
        Example:
            >>> response = client.chat_reliable(
            ...     model="openai/gpt-4o",
            ...     messages=[{"role": "user", "content": "Hello"}],
            ...     preferred_providers=["azure", "openai"]
            ... )
        """
        return self.chat(
            model=model,
            messages=messages,
            preferred_providers=preferred_providers,
            allow_fallbacks=True,
            **kwargs
        )


# Helper function for creating OpenRouter client
def create_openrouter_client(
    api_key: str,
    site_url: str = "",
    site_name: str = ""
) -> OpenRouterWrapper:
    """
    Create OpenRouter client with SmartSpec defaults
    
    Args:
        api_key: OpenRouter API key
        site_url: Your site URL
        site_name: Your site name
    
    Returns:
        OpenRouterWrapper instance
    
    Example:
        >>> from app.llm_proxy.openrouter_wrapper import create_openrouter_client
        >>> client = create_openrouter_client(
        ...     api_key="sk-or-v1-your-key",
        ...     site_url="https://smartspec.pro",
        ...     site_name="SmartSpec Pro"
        ... )
    """
    return OpenRouterWrapper(
        api_key=api_key,
        site_url=site_url,
        site_name=site_name,
        default_timeout=30,
        default_max_retries=3
    )


# Preset configurations
OPENROUTER_PRESETS = {
    "high_availability": {
        "description": "Maximum uptime with multiple fallbacks",
        "config": {
            "allow_fallbacks": True,
            "fallback_models": [
                "openai/gpt-4o",
                "google/gemini-flash-1.5",
                "meta-llama/llama-3.1-70b-instruct"
            ]
        }
    },
    "high_speed": {
        "description": "Maximum speed with throughput optimization",
        "config": {
            "sort": "throughput"
        }
    },
    "low_cost": {
        "description": "Minimum cost with price optimization",
        "config": {
            "sort": "price",
            "max_price": {
                "prompt": 0.001,
                "completion": 0.002
            }
        }
    },
    "high_privacy": {
        "description": "Maximum privacy with ZDR and no data collection",
        "config": {
            "zdr": True,
            "data_collection": "deny"
        }
    },
    "balanced": {
        "description": "Balanced configuration (default OpenRouter behavior)",
        "config": {
            "allow_fallbacks": True
        }
    }
}


def get_preset_config(preset_name: str) -> Dict[str, Any]:
    """
    Get preset configuration
    
    Args:
        preset_name: Preset name (high_availability, high_speed, low_cost, high_privacy, balanced)
    
    Returns:
        Configuration dict
    
    Example:
        >>> config = get_preset_config("high_availability")
        >>> response = client.chat(
        ...     model="openai/gpt-4o",
        ...     messages=[{"role": "user", "content": "Hello"}],
        ...     **config
        ... )
    """
    if preset_name not in OPENROUTER_PRESETS:
        raise ValueError(f"Unknown preset: {preset_name}. Available: {list(OPENROUTER_PRESETS.keys())}")
    
    return OPENROUTER_PRESETS[preset_name]["config"]
