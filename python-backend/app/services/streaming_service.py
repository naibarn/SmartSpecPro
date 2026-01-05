"""
Streaming Service
Handles streaming LLM responses using Server-Sent Events (SSE)

Refactored for better testability and maintainability.
"""

import json
import asyncio
from typing import AsyncGenerator, Dict, Any, Optional, Protocol
from datetime import datetime
from abc import ABC, abstractmethod
import structlog

logger = structlog.get_logger()


class StreamProvider(Protocol):
    """Protocol for streaming providers"""
    
    async def stream(
        self,
        messages: list[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream responses from provider"""
        ...


class BaseStreamProvider(ABC):
    """Base class for streaming providers"""
    
    @abstractmethod
    async def stream(
        self,
        messages: list[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream responses from provider"""
        pass


class OpenAIStreamProvider(BaseStreamProvider):
    """OpenAI streaming provider"""
    
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key
        self.base_url = base_url
    
    async def stream(
        self,
        messages: list[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        from openai import AsyncOpenAI
        
        client_kwargs = {}
        if self.api_key:
            client_kwargs["api_key"] = self.api_key
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        
        client = AsyncOpenAI(**client_kwargs)
        
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True
        )
        
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield {
                    "type": "content",
                    "content": chunk.choices[0].delta.content
                }
            
            if hasattr(chunk, 'usage') and chunk.usage:
                yield {
                    "type": "usage",
                    "total_tokens": chunk.usage.total_tokens
                }


class AnthropicStreamProvider(BaseStreamProvider):
    """Anthropic streaming provider"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
    
    async def stream(
        self,
        messages: list[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        from anthropic import AsyncAnthropic
        
        client_kwargs = {}
        if self.api_key:
            client_kwargs["api_key"] = self.api_key
        
        client = AsyncAnthropic(**client_kwargs)
        
        async with client.messages.stream(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens or 4096
        ) as stream:
            async for text in stream.text_stream:
                yield {
                    "type": "content",
                    "content": text
                }
            
            message = await stream.get_final_message()
            yield {
                "type": "usage",
                "total_tokens": message.usage.input_tokens + message.usage.output_tokens
            }


class FallbackStreamProvider(BaseStreamProvider):
    """Fallback provider that simulates streaming from non-streaming API"""
    
    def __init__(self, llm_client):
        self.llm_client = llm_client
    
    async def stream(
        self,
        messages: list[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        provider: str = "unknown"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        response = await self.llm_client.chat_completion(
            messages=messages,
            model=model,
            provider=provider,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        content = response.get("content", "")
        chunk_size = 10
        
        for i in range(0, len(content), chunk_size):
            yield {
                "type": "content",
                "content": content[i:i+chunk_size]
            }
            await asyncio.sleep(0.01)
        
        yield {
            "type": "usage",
            "total_tokens": response.get("usage", {}).get("total_tokens", 0)
        }


class TokenCounter:
    """Token counting utility"""
    
    @staticmethod
    def count_tokens(text: str, model: str) -> int:
        """Count tokens in text"""
        try:
            if "gpt" in model.lower() or "openai" in model.lower():
                try:
                    import tiktoken
                    encoding = tiktoken.encoding_for_model(model)
                    return len(encoding.encode(text))
                except Exception:
                    pass
            return len(text) // 4
        except Exception as e:
            logger.warning("Token counting failed, using fallback", error=str(e))
            return len(text) // 4
    
    @staticmethod
    def count_tokens_for_messages(messages: list[Dict[str, str]], model: str) -> int:
        """Count tokens for a list of messages"""
        total = 0
        for message in messages:
            content = message.get("content", "")
            total += TokenCounter.count_tokens(content, model)
            total += 4  # Overhead per message
        return total


class SSEFormatter:
    """Server-Sent Events formatter"""
    
    @staticmethod
    def format(data: Dict[str, Any]) -> str:
        """Format data as SSE"""
        return f"data: {json.dumps(data)}\n\n"
    
    @staticmethod
    def error(message: str) -> str:
        """Format error as SSE"""
        return SSEFormatter.format({"type": "error", "error": message})
    
    @staticmethod
    def start(model: str, provider: str, request_id: str) -> str:
        """Format start event as SSE"""
        return SSEFormatter.format({
            "type": "start",
            "model": model,
            "provider": provider,
            "request_id": request_id
        })
    
    @staticmethod
    def token(content: str) -> str:
        """Format token event as SSE"""
        return SSEFormatter.format({"type": "token", "content": content})
    
    @staticmethod
    def done(total_tokens: int, cost_usd: float, credits_used: int, full_content: str) -> str:
        """Format done event as SSE"""
        return SSEFormatter.format({
            "type": "done",
            "total_tokens": total_tokens,
            "cost_usd": cost_usd,
            "credits_used": credits_used,
            "full_content": full_content
        })


class StreamingService:
    """Service for streaming LLM responses"""
    
    # Credits per USD conversion rate
    CREDITS_PER_USD = 1000
    
    def __init__(
        self,
        llm_client,
        credit_service,
        token_counter: Optional[TokenCounter] = None,
        sse_formatter: Optional[SSEFormatter] = None
    ):
        self.llm_client = llm_client
        self.credit_service = credit_service
        self.token_counter = token_counter or TokenCounter()
        self.sse_formatter = sse_formatter or SSEFormatter()
        self._providers: Dict[str, BaseStreamProvider] = {}
    
    def register_provider(self, name: str, provider: BaseStreamProvider):
        """Register a streaming provider"""
        self._providers[name] = provider
    
    def _get_provider(self, provider_name: str) -> BaseStreamProvider:
        """Get streaming provider by name"""
        if provider_name in self._providers:
            return self._providers[provider_name]
        
        # Create default providers
        if provider_name == "openai":
            return OpenAIStreamProvider()
        elif provider_name == "anthropic":
            return AnthropicStreamProvider()
        elif provider_name == "openrouter":
            from app.core.config import settings
            return OpenAIStreamProvider(
                api_key=settings.OPENROUTER_API_KEY,
                base_url="https://openrouter.ai/api/v1"
            )
        else:
            return FallbackStreamProvider(self.llm_client)
    
    async def stream_chat_completion(
        self,
        user_id: str,
        messages: list[Dict[str, str]],
        model: Optional[str] = None,
        provider: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        task_type: str = "general",
        budget_priority: str = "balanced"
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completion responses
        
        Yields SSE formatted strings with events:
        - start: {type, model, provider, request_id}
        - token: {type, content}
        - done: {type, total_tokens, cost_usd, credits_used, full_content}
        - error: {type, error}
        """
        request_id = f"stream_{user_id}_{datetime.utcnow().timestamp()}"
        
        try:
            # Check credits
            if not await self._check_credits(user_id):
                yield self.sse_formatter.error("Insufficient credits")
                return
            
            # Select model if not specified
            model, provider = self._select_model(model, provider, task_type, budget_priority)
            
            # Send start event
            yield self.sse_formatter.start(model, provider, request_id)
            
            # Stream and collect content
            full_content, total_tokens = await self._stream_content(
                messages, model, provider, temperature, max_tokens
            )
            
            if full_content is None:
                yield self.sse_formatter.error("Streaming failed")
                return
            
            # Calculate and deduct credits
            cost_usd, credits_used = self._calculate_cost(
                messages, full_content, model, provider
            )
            
            if not await self._deduct_credits(
                user_id, credits_used, request_id, provider, model, total_tokens, cost_usd
            ):
                yield self.sse_formatter.error("Credit deduction failed")
                return
            
            # Send done event
            yield self.sse_formatter.done(total_tokens, cost_usd, credits_used, full_content)
        
        except Exception as e:
            logger.error("Streaming error", error=str(e), request_id=request_id)
            yield self.sse_formatter.error(str(e))
    
    async def _check_credits(self, user_id: str) -> bool:
        """Check if user has sufficient credits"""
        try:
            balance = await self.credit_service.get_balance(user_id)
            return balance > 0
        except Exception as e:
            logger.error("Credit check failed", error=str(e))
            return False
    
    def _select_model(
        self,
        model: Optional[str],
        provider: Optional[str],
        task_type: str,
        budget_priority: str
    ) -> tuple[str, str]:
        """Select model and provider"""
        if model and provider:
            return model, provider
        
        model_info = self.llm_client.select_model(
            task_type=task_type,
            budget_priority=budget_priority
        )
        return model_info["model"], model_info["provider"]
    
    async def _stream_content(
        self,
        messages: list[Dict[str, str]],
        model: str,
        provider: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> tuple[Optional[str], int]:
        """Stream content from provider and yield tokens"""
        full_content = ""
        total_tokens = 0
        
        try:
            stream_provider = self._get_provider(provider)
            
            # Handle fallback provider differently
            if isinstance(stream_provider, FallbackStreamProvider):
                async for chunk in stream_provider.stream(
                    messages=messages,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    provider=provider
                ):
                    if chunk.get("type") == "content":
                        full_content += chunk.get("content", "")
                    elif chunk.get("type") == "usage":
                        total_tokens = chunk.get("total_tokens", 0)
            else:
                async for chunk in stream_provider.stream(
                    messages=messages,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens
                ):
                    if chunk.get("type") == "content":
                        full_content += chunk.get("content", "")
                    elif chunk.get("type") == "usage":
                        total_tokens = chunk.get("total_tokens", 0)
            
            return full_content, total_tokens
        
        except Exception as e:
            logger.error("Stream content failed", error=str(e))
            return None, 0
    
    def _calculate_cost(
        self,
        messages: list[Dict[str, str]],
        full_content: str,
        model: str,
        provider: str
    ) -> tuple[float, int]:
        """Calculate cost and credits"""
        input_tokens = self.token_counter.count_tokens_for_messages(messages, model)
        output_tokens = self.token_counter.count_tokens(full_content, model)
        
        cost_usd = self.llm_client.calculate_cost(
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens
        )
        
        credits_used = int(cost_usd * self.CREDITS_PER_USD)
        return cost_usd, credits_used
    
    async def _deduct_credits(
        self,
        user_id: str,
        credits_used: int,
        request_id: str,
        provider: str,
        model: str,
        total_tokens: int,
        cost_usd: float
    ) -> bool:
        """Deduct credits from user"""
        try:
            await self.credit_service.deduct_credits(
                user_id=user_id,
                amount=credits_used,
                description=f"LLM streaming: {provider}/{model}",
                metadata={
                    "request_id": request_id,
                    "provider": provider,
                    "model": model,
                    "tokens": total_tokens,
                    "cost_usd": cost_usd
                }
            )
            return True
        except Exception as e:
            logger.error("Credit deduction failed", error=str(e))
            return False
    
    async def cancel_stream(self, request_id: str):
        """Cancel an ongoing stream (placeholder for future implementation)"""
        # TODO: Implement stream cancellation with cancellation tokens
        pass


# Backward compatibility aliases
def _format_sse(data: Dict[str, Any]) -> str:
    """Legacy SSE formatter"""
    return SSEFormatter.format(data)


def _count_tokens(text: str, model: str) -> int:
    """Legacy token counter"""
    return TokenCounter.count_tokens(text, model)


def _count_tokens_for_messages(messages: list[Dict[str, str]], model: str) -> int:
    """Legacy message token counter"""
    return TokenCounter.count_tokens_for_messages(messages, model)
