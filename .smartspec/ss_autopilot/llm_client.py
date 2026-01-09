"""
LLM Client for Kilo CLI

Provides interface to call LLM through Python Backend's OpenAI-compatible proxy.
Supports streaming and non-streaming responses.
"""

from __future__ import annotations

import os
import json
import sys
from typing import Dict, Any, List, Optional, Iterator
from dataclasses import dataclass

try:
    import requests
except ImportError:
    print("ERROR: requests library not found. Install with: pip install requests", file=sys.stderr)
    requests = None


@dataclass
class LLMConfig:
    """LLM configuration"""
    backend_url: str
    proxy_token: str
    model: Optional[str] = None  # None means use backend default from Admin Settings
    timeout: int = 300

    @classmethod
    def from_env(cls) -> 'LLMConfig':
        """Load config from environment variables"""
        backend_url = os.environ.get("SMARTSPEC_BACKEND_URL", "http://localhost:8000")
        proxy_token = os.environ.get("SMARTSPEC_PROXY_TOKEN", "")
        # Allow override via env var, but default to None (use Admin Settings)
        model = os.environ.get("SMARTSPEC_DEFAULT_MODEL", None)

        return cls(
            backend_url=backend_url,
            proxy_token=proxy_token,
            model=model
        )


class LLMClient:
    """
    Client for calling LLM through Backend Proxy.

    Usage:
        client = LLMClient.from_env()
        response = client.chat(
            messages=[
                {"role": "system", "content": "You are a helpful assistant"},
                {"role": "user", "content": "Hello!"}
            ]
        )
        print(response["content"])
    """

    def __init__(self, config: LLMConfig):
        """
        Initialize LLM client.

        Args:
            config: LLM configuration
        """
        self.config = config
        self._validate_config()
        self._provider_cache = None  # Cache provider config

    def _validate_config(self):
        """Validate configuration"""
        if not self.config.backend_url:
            raise ValueError("SMARTSPEC_BACKEND_URL environment variable is required")

        if not self.config.proxy_token:
            print("WARNING: SMARTSPEC_PROXY_TOKEN not set. Proxy may reject requests.", file=sys.stderr)

        if not requests:
            raise ImportError("requests library is required. Install with: pip install requests")

    @classmethod
    def from_env(cls) -> 'LLMClient':
        """Create client from environment variables"""
        return cls(LLMConfig.from_env())

    def _get_provider_config(self) -> Optional[Dict[str, Any]]:
        """
        Fetch enabled provider config from Backend.
        Returns first enabled provider or None.
        Uses internal endpoint that returns decrypted API keys.
        """
        if self._provider_cache is not None:
            return self._provider_cache

        try:
            url = f"{self.config.backend_url}/api/v1/internal/provider/configs"
            headers = {
                "Authorization": f"Bearer {self.config.proxy_token}",
                "x-proxy-token": self.config.proxy_token
            }
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                configs = response.json()
                # Find first enabled provider
                for config in configs:
                    if config.get("is_enabled"):
                        self._provider_cache = config
                        return config
        except Exception as e:
            # If can't fetch, just use backend proxy
            print(f"Warning: Could not fetch provider config: {e}", file=sys.stderr)
            pass

        return None

    def _call_kilocode_direct(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        provider_config: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """
        Call Kilo Code API directly (not through backend proxy).
        This is required because Kilo Code API checks that requests come from Kilo Code CLI.
        """
        api_key = provider_config.get("api_key")
        base_url = provider_config.get("base_url", "https://api.kilo.ai/api/openrouter")

        if not api_key:
            raise ValueError("Kilo Code API key not found in provider config")

        url = f"{base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://kilo.ai",
            "X-Title": "SmartSpec Kilo CLI",
            "User-Agent": "kilo-code-cli/2.0.0",
            "X-Kilo-Version": "2.0.0",
            "X-Kilo-Client": "cli"
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
            **kwargs
        }

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=self.config.timeout
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            error_detail = response.text
            raise GatewayError(
                f"Kilo Code API error: {error_detail}"
            ) from e

    def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        stream: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send chat completion request to LLM.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model name (defaults to config.model)
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream response
            **kwargs: Additional parameters

        Returns:
            Response dict with 'content', 'model', 'usage', etc.

        Raises:
            requests.HTTPError: If request fails
            ValueError: If response is invalid
        """
        if stream:
            raise NotImplementedError("Streaming is not yet implemented. Use stream=False")

        # Check if we should call Kilo Code API directly
        provider_config = self._get_provider_config()
        if provider_config and provider_config.get("provider_name") == "kilocode":
            # Get model from provider config if not specified
            if model is None:
                model = provider_config.get("config_json", {}).get("default_model")

            # Call Kilo Code API directly (not through backend proxy)
            data = self._call_kilocode_direct(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                provider_config=provider_config,
                **kwargs
            )

            # Extract content from OpenAI-compatible format
            if "choices" in data and len(data["choices"]) > 0:
                choice = data["choices"][0]
                content = choice.get("message", {}).get("content", "")

                return {
                    "content": content,
                    "model": data.get("model", model),
                    "usage": data.get("usage", {}),
                    "finish_reason": choice.get("finish_reason"),
                    "raw": data
                }
            else:
                raise ValueError(f"Invalid response format from Kilo Code API: {data}")

        # Otherwise, call through backend proxy (for other providers)
        url = f"{self.config.backend_url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.config.proxy_token}",
            "x-proxy-token": self.config.proxy_token,
            "Content-Type": "application/json"
        }

        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
            **kwargs
        }

        # Only include model if explicitly specified
        # If model=None, backend will use default from Admin Settings
        if model is not None:
            payload["model"] = model

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=self.config.timeout
            )
            response.raise_for_status()
        except requests.exceptions.HTTPError as e:
            # Handle specific error codes
            if response.status_code == 402:
                raise InsufficientCreditsError(
                    f"Insufficient credits to make LLM call. Please top up your account."
                ) from e
            elif response.status_code == 401:
                raise AuthenticationError(
                    f"Authentication failed. Check SMARTSPEC_PROXY_TOKEN."
                ) from e
            elif response.status_code == 500:
                error_detail = response.json().get("detail", "Unknown error")
                raise GatewayError(
                    f"Gateway error: {error_detail}"
                ) from e
            else:
                raise
        except requests.exceptions.RequestException as e:
            raise ConnectionError(
                f"Failed to connect to backend at {url}. Is the backend running?"
            ) from e

        # Parse response
        data = response.json()

        # Extract content from OpenAI-compatible format
        if "choices" in data and len(data["choices"]) > 0:
            choice = data["choices"][0]
            content = choice.get("message", {}).get("content", "")

            return {
                "content": content,
                "model": data.get("model", model),
                "usage": data.get("usage", {}),
                "finish_reason": choice.get("finish_reason"),
                "raw_response": data
            }
        else:
            raise ValueError(f"Unexpected response format: {data}")

    def execute_workflow(
        self,
        workflow_content: str,
        user_input: str,
        platform: str = "kilo",
        spec_id: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute a workflow by sending it to LLM.

        Args:
            workflow_content: Full workflow markdown content
            user_input: User's input/arguments
            platform: Platform name (kilo, cli, etc.)
            spec_id: Optional spec ID for context
            model: Optional model override

        Returns:
            LLM response with workflow execution result
        """
        # Build context
        context_parts = [
            f"Platform: {platform}",
        ]
        if spec_id:
            context_parts.append(f"Spec ID: {spec_id}")

        context = "\n".join(context_parts)

        # Build messages
        messages = [
            {
                "role": "system",
                "content": f"You are executing a SmartSpec workflow.\n\n{context}\n\nWorkflow Instructions:\n{workflow_content}"
            },
            {
                "role": "user",
                "content": user_input or "Execute this workflow"
            }
        ]

        print(f"\n🤖 Calling LLM with model: {model or self.config.model}", file=sys.stderr)
        print(f"📝 Workflow length: {len(workflow_content)} characters", file=sys.stderr)
        print(f"💬 User input: {user_input[:100]}...", file=sys.stderr)

        response = self.chat(messages=messages, model=model)

        print(f"✅ LLM responded with {len(response['content'])} characters", file=sys.stderr)
        if response.get("usage"):
            print(f"📊 Token usage: {response['usage']}", file=sys.stderr)

        return response


# Custom exceptions
class LLMError(Exception):
    """Base exception for LLM errors"""
    pass


class InsufficientCreditsError(LLMError):
    """Raised when user has insufficient credits"""
    pass


class AuthenticationError(LLMError):
    """Raised when authentication fails"""
    pass


class GatewayError(LLMError):
    """Raised when gateway encounters an error"""
    pass


# Convenience function
def create_client() -> LLMClient:
    """Create LLM client from environment variables"""
    return LLMClient.from_env()


# Test function
def test_connection():
    """Test connection to LLM backend"""
    try:
        client = create_client()
        print(f"✅ LLM Client initialized")
        print(f"   Backend URL: {client.config.backend_url}")
        print(f"   Model: {client.config.model}")
        print(f"   Has token: {bool(client.config.proxy_token)}")

        # Try a simple call
        print("\n🧪 Testing connection with simple message...")
        response = client.chat(
            messages=[
                {"role": "user", "content": "Say 'Hello from Kilo CLI' and nothing else."}
            ],
            max_tokens=50
        )

        print(f"✅ Connection successful!")
        print(f"   Response: {response['content']}")
        print(f"   Model: {response['model']}")
        print(f"   Usage: {response['usage']}")

        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    # Run test when executed directly
    test_connection()
