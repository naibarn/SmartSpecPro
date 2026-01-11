"""
Context Manager for Kilo CLI

Manages conversation context, token limits, and truncation strategies
to ensure efficient use of LLM context windows.
"""

from __future__ import annotations

import time
import uuid
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from threading import Lock


# Model context limits (tokens)
MODEL_CONTEXT_LIMITS = {
    # OpenAI
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-3.5-turbo": 16385,
    
    # Anthropic
    "claude-3-5-sonnet": 200000,
    "claude-3-opus": 200000,
    "claude-3-haiku": 200000,
    "claude-3-sonnet": 200000,
    
    # Google
    "gemini-2.0-flash": 1000000,
    "gemini-1.5-pro": 2000000,
    "gemini-1.5-flash": 1000000,
    
    # DeepSeek
    "deepseek-chat": 64000,
    "deepseek-coder": 64000,
    
    # Kilo/OpenRouter
    "anthropic/claude": 200000,
    "openai/gpt-4": 128000,
    "google/gemini": 1000000,
    
    # Default fallback
    "default": 32000
}


@dataclass
class ContextSettings:
    """Settings for context management"""
    # Token limits
    max_context_tokens: int = 100000  # Max tokens to use
    reserved_output_tokens: int = 8192  # Reserved for model output
    
    # Truncation settings
    max_messages_to_keep: int = 10  # Messages to keep in sliding window
    auto_condense_enabled: bool = True
    auto_condense_threshold: float = 0.80  # Trigger at 80% capacity
    
    # Content limits
    max_code_lines: int = 500  # Max lines per code block
    max_output_lines: int = 200  # Max lines for command output
    
    # Summarization
    enable_summarization: bool = True


@dataclass
class Message:
    """A single message in the conversation"""
    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: float = field(default_factory=time.time)
    token_count: int = 0
    message_type: str = "text"  # "command" | "response" | "code" | "summary"
    is_masked: bool = False
    original_token_count: int = 0  # Token count before masking
    
    def __post_init__(self):
        if self.token_count == 0:
            self.token_count = estimate_tokens(self.content)
            self.original_token_count = self.token_count


@dataclass
class Session:
    """A conversation session"""
    session_id: str
    created_at: float = field(default_factory=time.time)
    messages: List[Message] = field(default_factory=list)
    summary: Optional[str] = None
    summary_token_count: int = 0
    total_tokens: int = 0
    
    def add_message(self, message: Message):
        """Add a message to the session"""
        self.messages.append(message)
        self.total_tokens += message.token_count
    
    def get_recent_messages(self, count: int) -> List[Message]:
        """Get the most recent N messages"""
        return self.messages[-count:] if len(self.messages) > count else self.messages


@dataclass
class PreparedContext:
    """Context prepared for LLM"""
    messages: List[Dict[str, str]]
    total_tokens: int
    was_truncated: bool
    was_summarized: bool
    context_usage_percent: float
    session_id: str


def estimate_tokens(text: str) -> int:
    """
    Estimate token count without calling tokenizer API.
    Rule of thumb: ~4 chars per token for English, ~2-3 for Thai/CJK
    """
    if not text:
        return 0
    
    char_count = len(text)
    
    # Detect if mostly non-ASCII (Thai, CJK, etc.)
    non_ascii = sum(1 for c in text if ord(c) > 127)
    non_ascii_ratio = non_ascii / max(char_count, 1)
    
    if non_ascii_ratio > 0.3:
        # More non-ASCII characters, use lower ratio
        return int(char_count / 2.5)
    else:
        # Mostly ASCII/English
        return int(char_count / 4)


def get_model_limit(model_name: str) -> int:
    """Get context limit for a model, with fallback to default"""
    if not model_name:
        return MODEL_CONTEXT_LIMITS["default"]
    
    model_lower = model_name.lower()
    for key, limit in MODEL_CONTEXT_LIMITS.items():
        if key in model_lower:
            return limit
    return MODEL_CONTEXT_LIMITS["default"]


def mask_large_content(content: str, max_lines: int = 500, content_type: str = "output") -> tuple[str, bool]:
    """
    Mask large content to reduce token count while preserving context.
    
    Returns:
        tuple: (masked_content, was_masked)
    """
    lines = content.split('\n')
    if len(lines) <= max_lines:
        return content, False
    
    # Keep first and last portions
    keep_start = max_lines // 3
    keep_end = max_lines // 3
    truncated_count = len(lines) - keep_start - keep_end
    
    masked_lines = lines[:keep_start]
    masked_lines.append(f"\n[... {truncated_count} lines of {content_type} truncated for context efficiency ...]\n")
    masked_lines.extend(lines[-keep_end:])
    
    return '\n'.join(masked_lines), True


def detect_code_blocks(content: str) -> List[tuple[int, int, str]]:
    """
    Detect code blocks in content.
    
    Returns:
        List of tuples: (start_pos, end_pos, language)
    """
    pattern = r'```(\w*)\n(.*?)```'
    blocks = []
    for match in re.finditer(pattern, content, re.DOTALL):
        blocks.append((match.start(), match.end(), match.group(1) or "text"))
    return blocks


def mask_code_blocks(content: str, max_lines: int = 500) -> tuple[str, bool]:
    """
    Mask large code blocks while preserving structure.
    """
    blocks = detect_code_blocks(content)
    if not blocks:
        return content, False
    
    result = content
    was_masked = False
    offset = 0
    
    for start, end, lang in blocks:
        # Adjust positions for previous modifications
        adj_start = start + offset
        adj_end = end + offset
        
        block_content = result[adj_start:adj_end]
        # Extract code between ```
        code_match = re.search(r'```\w*\n(.*?)```', block_content, re.DOTALL)
        if code_match:
            code = code_match.group(1)
            masked_code, masked = mask_large_content(code, max_lines, f"{lang} code")
            if masked:
                was_masked = True
                new_block = f"```{lang}\n{masked_code}```"
                result = result[:adj_start] + new_block + result[adj_end:]
                offset += len(new_block) - (end - start)
    
    return result, was_masked


class SessionStore:
    """Thread-safe session storage"""
    
    def __init__(self):
        self._sessions: Dict[str, Session] = {}
        self._lock = Lock()
        self._max_sessions = 100  # Limit stored sessions
        self._session_ttl = 3600 * 24  # 24 hours
    
    def create_session(self) -> str:
        """Create a new session and return its ID"""
        session_id = str(uuid.uuid4())
        with self._lock:
            self._cleanup_old_sessions()
            self._sessions[session_id] = Session(session_id=session_id)
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID"""
        with self._lock:
            return self._sessions.get(session_id)
    
    def get_or_create_session(self, session_id: Optional[str]) -> Session:
        """Get existing session or create new one"""
        if session_id:
            session = self.get_session(session_id)
            if session:
                return session
        
        new_id = session_id or str(uuid.uuid4())
        with self._lock:
            self._cleanup_old_sessions()
            session = Session(session_id=new_id)
            self._sessions[new_id] = session
        return session
    
    def add_message(self, session_id: str, message: Message) -> bool:
        """Add a message to a session"""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.add_message(message)
                return True
        return False
    
    def update_summary(self, session_id: str, summary: str):
        """Update session summary"""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.summary = summary
                session.summary_token_count = estimate_tokens(summary)
    
    def _cleanup_old_sessions(self):
        """Remove old sessions to prevent memory bloat"""
        current_time = time.time()
        expired = [
            sid for sid, session in self._sessions.items()
            if current_time - session.created_at > self._session_ttl
        ]
        for sid in expired:
            del self._sessions[sid]
        
        # Also remove oldest if over limit
        if len(self._sessions) > self._max_sessions:
            sorted_sessions = sorted(
                self._sessions.items(),
                key=lambda x: x[1].created_at
            )
            for sid, _ in sorted_sessions[:len(self._sessions) - self._max_sessions]:
                del self._sessions[sid]


class ContextManager:
    """Manages conversation context and truncation"""
    
    def __init__(self, settings: Optional[ContextSettings] = None):
        self.settings = settings or ContextSettings()
        self.session_store = SessionStore()
    
    def prepare_context(
        self,
        session_id: Optional[str],
        new_command: str,
        conversation_context: Optional[Dict] = None,
        model_name: Optional[str] = None
    ) -> PreparedContext:
        """
        Prepare context for LLM call.
        
        Args:
            session_id: Session ID for context continuity
            new_command: The new user command
            conversation_context: Optional context from frontend
            model_name: Model name for determining limits
        
        Returns:
            PreparedContext ready for LLM
        """
        # Get or create session
        session = self.session_store.get_or_create_session(session_id)
        
        # Determine token limit
        model_limit = get_model_limit(model_name) if model_name else self.settings.max_context_tokens
        effective_limit = min(model_limit, self.settings.max_context_tokens) - self.settings.reserved_output_tokens
        
        # Add new user message
        user_message = Message(
            role="user",
            content=new_command,
            message_type="command"
        )
        session.add_message(user_message)
        
        # Build messages list
        messages = []
        was_truncated = False
        was_summarized = False
        
        # Add summary if exists
        if session.summary:
            messages.append({
                "role": "assistant",
                "content": f"[Previous conversation summary]\n{session.summary}"
            })
        
        # Get messages to include
        available_tokens = effective_limit
        if session.summary:
            available_tokens -= session.summary_token_count
        
        # Apply sliding window
        recent_messages = session.get_recent_messages(self.settings.max_messages_to_keep)
        
        # Check if we need to truncate
        total_message_tokens = sum(m.token_count for m in recent_messages)
        
        if total_message_tokens > available_tokens:
            was_truncated = True
            # Apply observation masking to reduce tokens
            recent_messages = self._apply_observation_masking(recent_messages)
            total_message_tokens = sum(m.token_count for m in recent_messages)
        
        # If still over limit, reduce message count
        while total_message_tokens > available_tokens and len(recent_messages) > 1:
            was_truncated = True
            recent_messages = recent_messages[1:]  # Remove oldest
            total_message_tokens = sum(m.token_count for m in recent_messages)
        
        # Convert to dict format
        for msg in recent_messages:
            messages.append({
                "role": msg.role,
                "content": msg.content
            })
        
        # Calculate usage
        total_tokens = sum(m.token_count for m in recent_messages)
        if session.summary:
            total_tokens += session.summary_token_count
        
        context_usage = (total_tokens / effective_limit) * 100 if effective_limit > 0 else 0
        
        return PreparedContext(
            messages=messages,
            total_tokens=total_tokens,
            was_truncated=was_truncated,
            was_summarized=was_summarized,
            context_usage_percent=min(context_usage, 100),
            session_id=session.session_id
        )
    
    def _apply_observation_masking(self, messages: List[Message]) -> List[Message]:
        """Apply observation masking to reduce token count"""
        masked_messages = []
        
        for msg in messages:
            if msg.role == "assistant" and not msg.is_masked:
                # Mask large code blocks
                masked_content, code_masked = mask_code_blocks(
                    msg.content, 
                    self.settings.max_code_lines
                )
                
                # Mask large outputs
                masked_content, output_masked = mask_large_content(
                    masked_content,
                    self.settings.max_output_lines,
                    "output"
                )
                
                if code_masked or output_masked:
                    new_msg = Message(
                        role=msg.role,
                        content=masked_content,
                        timestamp=msg.timestamp,
                        message_type=msg.message_type,
                        is_masked=True,
                        original_token_count=msg.original_token_count
                    )
                    masked_messages.append(new_msg)
                else:
                    masked_messages.append(msg)
            else:
                masked_messages.append(msg)
        
        return masked_messages
    
    def add_assistant_response(self, session_id: str, response: str):
        """Add assistant response to session"""
        message = Message(
            role="assistant",
            content=response,
            message_type="response"
        )
        self.session_store.add_message(session_id, message)
    
    def get_context_usage(self, session_id: str, model_name: Optional[str] = None) -> Dict[str, Any]:
        """Get current context usage statistics"""
        session = self.session_store.get_session(session_id)
        if not session:
            return {"error": "Session not found"}
        
        model_limit = get_model_limit(model_name) if model_name else self.settings.max_context_tokens
        effective_limit = min(model_limit, self.settings.max_context_tokens) - self.settings.reserved_output_tokens
        
        total_tokens = session.total_tokens
        if session.summary:
            total_tokens = session.summary_token_count + sum(
                m.token_count for m in session.get_recent_messages(self.settings.max_messages_to_keep)
            )
        
        return {
            "session_id": session_id,
            "message_count": len(session.messages),
            "total_tokens": total_tokens,
            "effective_limit": effective_limit,
            "usage_percent": (total_tokens / effective_limit * 100) if effective_limit > 0 else 0,
            "has_summary": session.summary is not None,
            "reserved_for_output": self.settings.reserved_output_tokens
        }


# Global instance
CONTEXT_MANAGER = ContextManager()
