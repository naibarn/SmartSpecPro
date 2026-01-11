"""
Context-Aware LLM Client for Kilo CLI

Extends the base LLM client to support conversation context
passed from the backend via environment variables.
"""

from __future__ import annotations

import os
import json
import sys
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

from .llm_client import LLMClient, LLMConfig


@dataclass
class ConversationContext:
    """Context from previous conversation turns"""
    messages: List[Dict[str, str]]
    total_tokens: int
    was_truncated: bool
    context_usage_percent: float
    
    @classmethod
    def from_env(cls) -> Optional['ConversationContext']:
        """Load context from KILO_CONTEXT environment variable"""
        context_json = os.environ.get("KILO_CONTEXT")
        if not context_json:
            return None
        
        try:
            data = json.loads(context_json)
            return cls(
                messages=data.get("messages", []),
                total_tokens=data.get("total_tokens", 0),
                was_truncated=data.get("was_truncated", False),
                context_usage_percent=data.get("context_usage_percent", 0)
            )
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Could not parse KILO_CONTEXT: {e}", file=sys.stderr)
            return None


class ContextAwareLLMClient(LLMClient):
    """
    LLM Client that incorporates conversation context.
    
    This client automatically includes previous conversation history
    when making LLM calls, enabling multi-turn conversations.
    """
    
    def __init__(self, config: LLMConfig, context: Optional[ConversationContext] = None):
        super().__init__(config)
        self.context = context
        self.session_id = os.environ.get("KILO_SESSION_ID")
    
    @classmethod
    def from_env(cls) -> 'ContextAwareLLMClient':
        """Create client from environment variables with context"""
        config = LLMConfig.from_env()
        context = ConversationContext.from_env()
        return cls(config, context)
    
    def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        stream: bool = False,
        include_context: bool = True,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Send chat completion request with conversation context.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model name (defaults to config.model)
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream response
            include_context: Whether to include conversation context
            **kwargs: Additional parameters
        
        Returns:
            Response dict with 'content', 'model', 'usage', etc.
        """
        # Build full message list with context
        full_messages = []
        
        if include_context and self.context and self.context.messages:
            # Log context usage
            if self.context.was_truncated:
                print(f"📋 Context was truncated to fit token limit", file=sys.stderr)
            print(f"📊 Context usage: {self.context.context_usage_percent:.1f}% ({self.context.total_tokens} tokens)", file=sys.stderr)
            
            # Add context messages (excluding system messages - they'll be added from current messages)
            for ctx_msg in self.context.messages:
                if ctx_msg.get("role") != "system":
                    full_messages.append(ctx_msg)
        
        # Add current messages
        # If first message is system, put it at the beginning
        system_msg = None
        other_msgs = []
        for msg in messages:
            if msg.get("role") == "system" and system_msg is None:
                system_msg = msg
            else:
                other_msgs.append(msg)
        
        # Build final message list: system -> context -> current
        final_messages = []
        if system_msg:
            final_messages.append(system_msg)
        final_messages.extend(full_messages)
        final_messages.extend(other_msgs)
        
        # Log message count
        if len(final_messages) > len(messages):
            print(f"💬 Including {len(full_messages)} previous messages in context", file=sys.stderr)
        
        # Call parent chat method
        return super().chat(
            messages=final_messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
            **kwargs
        )
    
    def execute_workflow(
        self,
        workflow_content: str,
        user_input: str,
        platform: str = "kilo",
        spec_id: Optional[str] = None,
        model: Optional[str] = None,
        include_context: bool = True
    ) -> Dict[str, Any]:
        """
        Execute a workflow with conversation context.
        
        Args:
            workflow_content: Full workflow markdown content
            user_input: User's input/arguments
            platform: Platform name (kilo, cli, etc.)
            spec_id: Optional spec ID for context
            model: Optional model override
            include_context: Whether to include conversation context
        
        Returns:
            LLM response with workflow execution result
        """
        # Build context parts
        context_parts = [
            f"Platform: {platform}",
        ]
        if spec_id:
            context_parts.append(f"Spec ID: {spec_id}")
        if self.session_id:
            context_parts.append(f"Session ID: {self.session_id}")
        
        context_str = "\n".join(context_parts)
        
        # Build system message
        system_content = f"You are executing a SmartSpec workflow.\n\n{context_str}\n\nWorkflow Instructions:\n{workflow_content}"
        
        # If we have context, add a note about it
        if include_context and self.context and self.context.messages:
            system_content += "\n\n[Note: This is a continuation of a previous conversation. Previous context has been included.]"
        
        # Build messages
        messages = [
            {
                "role": "system",
                "content": system_content
            },
            {
                "role": "user",
                "content": user_input or "Execute this workflow"
            }
        ]
        
        print(f"\n🤖 Calling LLM with model: {model or self.config.model}", file=sys.stderr)
        print(f"📝 Workflow length: {len(workflow_content)} characters", file=sys.stderr)
        print(f"💬 User input: {user_input[:100]}..." if len(user_input) > 100 else f"💬 User input: {user_input}", file=sys.stderr)
        
        response = self.chat(
            messages=messages, 
            model=model,
            include_context=include_context
        )
        
        print(f"✅ LLM responded with {len(response['content'])} characters", file=sys.stderr)
        if response.get("usage"):
            print(f"📊 Token usage: {response['usage']}", file=sys.stderr)
        
        return response


def create_context_aware_client() -> ContextAwareLLMClient:
    """Create context-aware LLM client from environment variables"""
    return ContextAwareLLMClient.from_env()


# For backwards compatibility
def create_client() -> ContextAwareLLMClient:
    """Alias for create_context_aware_client"""
    return create_context_aware_client()
