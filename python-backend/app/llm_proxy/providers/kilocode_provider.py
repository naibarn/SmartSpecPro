"""
Kilo Code Provider

Kilo Code API is an OpenAI-compatible API that provides access to multiple LLM models
through OpenRouter integration.

Official endpoint: https://api.kilo.ai/api/openrouter/chat/completions
Documentation: https://kilo.ai/docs

Features:
- OpenAI-compatible chat completions
- Multiple model support (OpenRouter format)
- Streaming support (SSE)
- Token-based authentication
"""

from typing import Dict, List, Optional, Any
import httpx
import structlog

from .base import BaseProvider, ProviderConfig

logger = structlog.get_logger()


class KiloCodeProvider(BaseProvider):
    """
    Kilo Code LLM Provider

    Provides access to Kilo Code API which offers multiple LLM models
    through OpenRouter integration.
    """

    def __init__(self, config: ProviderConfig):
        """
        Initialize Kilo Code provider.

        Args:
            config: Provider configuration with API key and base URL
        """
        super().__init__(config)

        # Default to production endpoint if not specified
        if not self.config.base_url:
            self.config.base_url = "https://api.kilo.ai/api/openrouter"

        # Remove trailing slash
        self.config.base_url = self.config.base_url.rstrip('/')

        logger.info(
            "kilocode_provider_initialized",
            base_url=self.config.base_url,
            has_api_key=bool(self.config.api_key)
        )

    @property
    def provider_name(self) -> str:
        """Provider name"""
        return "kilocode"

    def _get_headers(self) -> Dict[str, str]:
        """
        Get headers for Kilo Code API requests.

        Returns:
            Headers dict with Authorization
        """
        if not self.config.api_key:
            raise ValueError("Kilo Code API key is required")

        return {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json"
        }

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "minimax/minimax-m2.1:free",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send chat completion request to Kilo Code API.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model name in OpenRouter format (e.g., "minimax/minimax-m2.1:free")
            temperature: Sampling temperature (0.0-2.0)
            max_tokens: Maximum tokens to generate
            stream: Whether to stream response (not supported in this sync method)
            **kwargs: Additional parameters

        Returns:
            Response dict with choices, usage, etc.

        Raises:
            httpx.HTTPError: If request fails
        """
        url = f"{self.config.base_url}/chat/completions"

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,  # Force non-streaming for sync method
            **kwargs
        }

        if max_tokens:
            payload["max_tokens"] = max_tokens

        logger.info(
            "kilocode_chat_request",
            url=url,
            model=model,
            message_count=len(messages)
        )

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    url,
                    headers=self._get_headers(),
                    json=payload
                )
                response.raise_for_status()

                data = response.json()

                logger.info(
                    "kilocode_chat_response",
                    status_code=response.status_code,
                    model=data.get("model"),
                    finish_reason=data.get("choices", [{}])[0].get("finish_reason")
                )

                return data

        except httpx.HTTPStatusError as e:
            logger.error(
                "kilocode_http_error",
                status_code=e.response.status_code,
                error=str(e),
                response_text=e.response.text[:500]
            )
            raise

        except httpx.RequestError as e:
            logger.error(
                "kilocode_request_error",
                error=str(e)
            )
            raise

    async def list_models(self) -> List[Dict[str, Any]]:
        """
        List available models from Kilo Code API.

        Returns:
            List of model dicts with id, name, etc.
        """
        url = f"{self.config.base_url}/models"

        logger.info("kilocode_list_models", url=url)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    url,
                    headers=self._get_headers()
                )
                response.raise_for_status()

                data = response.json()
                models = data.get("data", [])

                logger.info(
                    "kilocode_models_retrieved",
                    model_count=len(models)
                )

                return models

        except httpx.HTTPError as e:
            logger.error(
                "kilocode_list_models_error",
                error=str(e)
            )
            # Return empty list on error
            return []

    async def test_connection(self) -> bool:
        """
        Test connection to Kilo Code API.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            # Simple test: list models
            models = await self.list_models()
            return len(models) > 0
        except Exception as e:
            logger.error(
                "kilocode_connection_test_failed",
                error=str(e)
            )
            return False

    def estimate_cost(
        self,
        prompt_tokens: int,
        completion_tokens: int,
        model: str = "minimax/minimax-m2.1:free"
    ) -> float:
        """
        Estimate cost for Kilo Code API usage.

        Note: Kilo Code uses OpenRouter pricing, which varies by model.
        For accurate pricing, check OpenRouter's pricing page.

        Args:
            prompt_tokens: Number of prompt tokens
            completion_tokens: Number of completion tokens
            model: Model name

        Returns:
            Estimated cost in USD
        """
        # Default pricing (approximate)
        # Free models: $0
        # Paid models: varies

        if ":free" in model.lower():
            return 0.0

        # Default estimate for paid models (similar to OpenRouter average)
        # $0.002 per 1K prompt tokens, $0.006 per 1K completion tokens
        prompt_cost = (prompt_tokens / 1000) * 0.002
        completion_cost = (completion_tokens / 1000) * 0.006

        return prompt_cost + completion_cost

    def get_recommended_models(self) -> List[str]:
        """
        Get recommended models for Kilo Code.

        Returns:
            List of recommended model names
        """
        return [
            "minimax/minimax-m2.1:free",  # Free model
            "anthropic/claude-3-5-sonnet",  # Quality
            "meta-llama/llama-3.1-70b-instruct",  # Cost-effective
            "google/gemini-flash-1.5",  # Speed
            "openai/gpt-4o",  # OpenAI quality
        ]


# Factory function
def create_kilocode_provider(
    api_key: str,
    base_url: Optional[str] = None,
    **kwargs
) -> KiloCodeProvider:
    """
    Create Kilo Code provider instance.

    Args:
        api_key: Kilo Code API key/token
        base_url: Optional custom base URL (defaults to production)
        **kwargs: Additional config parameters

    Returns:
        KiloCodeProvider instance
    """
    config = ProviderConfig(
        api_key=api_key,
        base_url=base_url or "https://api.kilo.ai/api/openrouter",
        **kwargs
    )

    return KiloCodeProvider(config)
