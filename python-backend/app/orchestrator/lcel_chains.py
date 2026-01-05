"""
SmartSpec Pro - LCEL Chains
Phase 1.4

LangChain Expression Language (LCEL) chains for LLM execution.
Provides composable, streamable chains with memory context integration.
"""

from typing import Optional, Dict, Any, List, AsyncIterator, Callable
from dataclasses import dataclass, field
from enum import Enum
import structlog
from langchain_openai import ChatOpenAI
from langchain_core.prompts import (
    ChatPromptTemplate,
    MessagesPlaceholder,
    PromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
)
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser
from langchain_core.runnables import (
    RunnableSequence,
    RunnableLambda,
    RunnablePassthrough,
    RunnableParallel,
    RunnableConfig,
)
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from langchain_core.callbacks import AsyncCallbackHandler
from pydantic import BaseModel, Field

logger = structlog.get_logger()


# ==================== ENUMS ====================

class TaskType(str, Enum):
    """Types of LLM tasks."""
    SIMPLE = "simple"
    COMPLEX = "complex"
    CODE_GENERATION = "code_generation"
    CODE_REVIEW = "code_review"
    ANALYSIS = "analysis"
    SUMMARIZATION = "summarization"
    TRANSLATION = "translation"
    CONVERSATION = "conversation"


class BudgetPriority(str, Enum):
    """Budget priority for model selection."""
    QUALITY = "quality"
    BALANCED = "balanced"
    ECONOMY = "economy"


# ==================== MODELS ====================

@dataclass
class ChainConfig:
    """Configuration for LCEL chains."""
    model_name: str = "gpt-4.1-mini"
    temperature: float = 0.7
    max_tokens: int = 4000
    streaming: bool = False
    timeout: int = 60
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    
    # Memory context settings
    include_semantic_context: bool = True
    include_episodic_context: bool = True
    max_context_tokens: int = 2000


@dataclass
class ChainInput:
    """Input for LCEL chains."""
    prompt: str
    task_type: TaskType = TaskType.SIMPLE
    budget_priority: BudgetPriority = BudgetPriority.BALANCED
    
    # Optional context
    system_message: Optional[str] = None
    chat_history: List[BaseMessage] = field(default_factory=list)
    semantic_context: Optional[Dict[str, Any]] = None
    episodic_context: Optional[Dict[str, Any]] = None
    
    # Additional parameters
    variables: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ChainOutput:
    """Output from LCEL chains."""
    content: str
    model: str
    tokens_used: int = 0
    cost: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class StreamingChunk(BaseModel):
    """A chunk of streaming output."""
    content: str
    is_final: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ==================== PROMPT TEMPLATES ====================

# Default system prompts for different task types
SYSTEM_PROMPTS = {
    TaskType.SIMPLE: "You are a helpful AI assistant.",
    TaskType.COMPLEX: """You are an expert AI assistant capable of handling complex tasks.
Think step by step and provide detailed, well-structured responses.""",
    TaskType.CODE_GENERATION: """You are an expert software engineer.
Generate clean, well-documented, production-ready code.
Follow best practices and include error handling.""",
    TaskType.CODE_REVIEW: """You are an expert code reviewer.
Analyze code for bugs, security issues, performance problems, and style violations.
Provide specific, actionable feedback.""",
    TaskType.ANALYSIS: """You are an expert analyst.
Provide thorough, data-driven analysis with clear conclusions and recommendations.""",
    TaskType.SUMMARIZATION: """You are an expert at summarizing information.
Create concise, accurate summaries that capture the key points.""",
    TaskType.TRANSLATION: """You are an expert translator.
Provide accurate, natural-sounding translations that preserve meaning and tone.""",
    TaskType.CONVERSATION: """You are a friendly, helpful AI assistant engaged in conversation.
Be natural, empathetic, and helpful.""",
}


def get_system_prompt(task_type: TaskType, custom_system: Optional[str] = None) -> str:
    """Get system prompt for task type."""
    if custom_system:
        return custom_system
    return SYSTEM_PROMPTS.get(task_type, SYSTEM_PROMPTS[TaskType.SIMPLE])


def format_semantic_context(context: Optional[Dict[str, Any]]) -> str:
    """Format semantic memory context for prompt."""
    if not context:
        return ""
    
    parts = []
    
    if context.get("preferences"):
        parts.append("## User Preferences")
        for pref in context["preferences"][:5]:
            parts.append(f"- {pref.get('content', '')}")
    
    if context.get("facts"):
        parts.append("\n## Project Facts")
        for fact in context["facts"][:5]:
            parts.append(f"- {fact.get('content', '')}")
    
    if context.get("skills"):
        parts.append("\n## Available Skills")
        for skill in context["skills"][:5]:
            parts.append(f"- {skill.get('content', '')}")
    
    if context.get("rules"):
        parts.append("\n## Rules & Constraints")
        for rule in context["rules"][:5]:
            parts.append(f"- {rule.get('content', '')}")
    
    return "\n".join(parts) if parts else ""


def format_episodic_context(context: Optional[Dict[str, Any]]) -> str:
    """Format episodic memory context for prompt."""
    if not context:
        return ""
    
    parts = []
    
    if context.get("conversations"):
        parts.append("## Relevant Past Conversations")
        for conv in context["conversations"][:3]:
            content = conv.get("content", "")[:200]
            parts.append(f"- {content}...")
    
    if context.get("code_snippets"):
        parts.append("\n## Relevant Code Examples")
        for code in context["code_snippets"][:2]:
            lang = code.get("language", "")
            content = code.get("content", "")[:300]
            parts.append(f"```{lang}\n{content}\n```")
    
    if context.get("workflows"):
        parts.append("\n## Relevant Past Workflows")
        for wf in context["workflows"][:3]:
            parts.append(f"- {wf.get('summary', '')}")
    
    return "\n".join(parts) if parts else ""


def build_context_section(
    semantic_context: Optional[Dict[str, Any]],
    episodic_context: Optional[Dict[str, Any]],
) -> str:
    """Build the context section for prompts."""
    semantic = format_semantic_context(semantic_context)
    episodic = format_episodic_context(episodic_context)
    
    if not semantic and not episodic:
        return ""
    
    parts = ["# Context"]
    if semantic:
        parts.append(semantic)
    if episodic:
        parts.append(episodic)
    
    return "\n\n".join(parts)


# ==================== CHAIN FACTORY ====================

class LCELChainFactory:
    """Factory for creating LCEL chains."""
    
    def __init__(self, config: Optional[ChainConfig] = None):
        """
        Initialize the chain factory.
        
        Args:
            config: Optional chain configuration
        """
        self.config = config or ChainConfig()
        self._llm: Optional[ChatOpenAI] = None
        logger.info("LCEL chain factory initialized", model=self.config.model_name)
    
    @property
    def llm(self) -> ChatOpenAI:
        """Get or create the LLM instance."""
        if self._llm is None:
            self._llm = ChatOpenAI(
                model=self.config.model_name,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                streaming=self.config.streaming,
                timeout=self.config.timeout,
                api_key=self.config.api_key,
                base_url=self.config.base_url,
            )
        return self._llm
    
    def create_simple_chain(self) -> RunnableSequence:
        """
        Create a simple prompt -> LLM -> output chain.
        
        Returns:
            LCEL chain
        """
        prompt = ChatPromptTemplate.from_messages([
            ("system", "{system_message}"),
            ("human", "{prompt}"),
        ])
        
        chain = prompt | self.llm | StrOutputParser()
        
        logger.debug("Created simple chain")
        return chain
    
    def create_chat_chain(self) -> RunnableSequence:
        """
        Create a chat chain with message history.
        
        Returns:
            LCEL chain
        """
        prompt = ChatPromptTemplate.from_messages([
            ("system", "{system_message}"),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{prompt}"),
        ])
        
        chain = prompt | self.llm | StrOutputParser()
        
        logger.debug("Created chat chain")
        return chain
    
    def create_context_aware_chain(self) -> RunnableSequence:
        """
        Create a chain that includes memory context.
        
        Returns:
            LCEL chain
        """
        # Template with context section
        template = """{{system_message}}

{{#if context}}
{context}
{{/if}}

User Request:
{prompt}"""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "{system_message}"),
            ("human", "{context}\n\nUser Request:\n{prompt}"),
        ])
        
        # Build chain with context injection
        chain = (
            RunnablePassthrough.assign(
                context=lambda x: build_context_section(
                    x.get("semantic_context"),
                    x.get("episodic_context"),
                )
            )
            | prompt
            | self.llm
            | StrOutputParser()
        )
        
        logger.debug("Created context-aware chain")
        return chain
    
    def create_full_chain(self) -> RunnableSequence:
        """
        Create a full-featured chain with chat history and context.
        
        Returns:
            LCEL chain
        """
        prompt = ChatPromptTemplate.from_messages([
            ("system", "{system_message}"),
            ("human", "{context}"),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{prompt}"),
        ])
        
        chain = (
            RunnablePassthrough.assign(
                context=lambda x: build_context_section(
                    x.get("semantic_context"),
                    x.get("episodic_context"),
                )
            )
            | prompt
            | self.llm
            | StrOutputParser()
        )
        
        logger.debug("Created full chain")
        return chain
    
    def create_json_output_chain(self, schema: type) -> RunnableSequence:
        """
        Create a chain that outputs structured JSON.
        
        Args:
            schema: Pydantic model for output schema
        
        Returns:
            LCEL chain
        """
        parser = JsonOutputParser(pydantic_object=schema)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "{system_message}\n\n{format_instructions}"),
            ("human", "{prompt}"),
        ])
        
        chain = (
            RunnablePassthrough.assign(
                format_instructions=lambda _: parser.get_format_instructions()
            )
            | prompt
            | self.llm
            | parser
        )
        
        logger.debug("Created JSON output chain", schema=schema.__name__)
        return chain


# ==================== CHAIN EXECUTOR ====================

class LCELChainExecutor:
    """
    Executes LCEL chains with memory integration and streaming support.
    """
    
    def __init__(
        self,
        config: Optional[ChainConfig] = None,
        memory_service: Optional[Any] = None,
        episodic_service: Optional[Any] = None,
    ):
        """
        Initialize the chain executor.
        
        Args:
            config: Chain configuration
            memory_service: Optional semantic memory service
            episodic_service: Optional episodic memory service
        """
        self.config = config or ChainConfig()
        self.factory = LCELChainFactory(config)
        self.memory_service = memory_service
        self.episodic_service = episodic_service
        
        logger.info("LCEL chain executor initialized")
    
    async def execute(
        self,
        input: ChainInput,
        callbacks: Optional[List[AsyncCallbackHandler]] = None,
    ) -> ChainOutput:
        """
        Execute an LCEL chain.
        
        Args:
            input: Chain input
            callbacks: Optional callbacks for streaming
        
        Returns:
            Chain output
        """
        # Get system message
        system_message = get_system_prompt(input.task_type, input.system_message)
        
        # Build context
        semantic_context = input.semantic_context
        episodic_context = input.episodic_context
        
        # Fetch context from services if not provided
        if self.config.include_semantic_context and not semantic_context and self.memory_service:
            try:
                semantic_context = await self.memory_service.get_context_for_prompt(
                    user_id=input.variables.get("user_id"),
                    project_id=input.variables.get("project_id"),
                )
            except Exception as e:
                logger.warning("Failed to fetch semantic context", error=str(e))
        
        if self.config.include_episodic_context and not episodic_context and self.episodic_service:
            try:
                episodic_context = await self.episodic_service.get_rag_context(
                    query=input.prompt,
                    user_id=input.variables.get("user_id"),
                    project_id=input.variables.get("project_id"),
                )
            except Exception as e:
                logger.warning("Failed to fetch episodic context", error=str(e))
        
        # Select chain based on input
        if input.chat_history:
            chain = self.factory.create_full_chain()
        elif semantic_context or episodic_context:
            chain = self.factory.create_context_aware_chain()
        else:
            chain = self.factory.create_simple_chain()
        
        # Prepare input dict
        chain_input = {
            "prompt": input.prompt,
            "system_message": system_message,
            "chat_history": input.chat_history,
            "semantic_context": semantic_context,
            "episodic_context": episodic_context,
            **input.variables,
        }
        
        # Execute chain
        config = RunnableConfig(callbacks=callbacks) if callbacks else None
        
        try:
            content = await chain.ainvoke(chain_input, config=config)
            
            # Get token usage from LLM (if available)
            tokens_used = 0
            cost = 0.0
            
            logger.info(
                "Chain executed successfully",
                task_type=input.task_type.value,
                model=self.config.model_name,
            )
            
            return ChainOutput(
                content=content,
                model=self.config.model_name,
                tokens_used=tokens_used,
                cost=cost,
                metadata={
                    "task_type": input.task_type.value,
                    "has_semantic_context": semantic_context is not None,
                    "has_episodic_context": episodic_context is not None,
                    "has_chat_history": len(input.chat_history) > 0,
                },
            )
        except Exception as e:
            logger.error("Chain execution failed", error=str(e))
            raise
    
    async def stream(
        self,
        input: ChainInput,
        callbacks: Optional[List[AsyncCallbackHandler]] = None,
    ) -> AsyncIterator[StreamingChunk]:
        """
        Stream chain output.
        
        Args:
            input: Chain input
            callbacks: Optional callbacks
        
        Yields:
            Streaming chunks
        """
        # Get system message
        system_message = get_system_prompt(input.task_type, input.system_message)
        
        # Build context (simplified for streaming)
        semantic_context = input.semantic_context
        episodic_context = input.episodic_context
        
        # Select chain
        if input.chat_history:
            chain = self.factory.create_full_chain()
        elif semantic_context or episodic_context:
            chain = self.factory.create_context_aware_chain()
        else:
            chain = self.factory.create_simple_chain()
        
        # Prepare input
        chain_input = {
            "prompt": input.prompt,
            "system_message": system_message,
            "chat_history": input.chat_history,
            "semantic_context": semantic_context,
            "episodic_context": episodic_context,
            **input.variables,
        }
        
        # Stream
        config = RunnableConfig(callbacks=callbacks) if callbacks else None
        
        try:
            async for chunk in chain.astream(chain_input, config=config):
                yield StreamingChunk(content=chunk, is_final=False)
            
            yield StreamingChunk(content="", is_final=True)
            
        except Exception as e:
            logger.error("Streaming failed", error=str(e))
            raise


# ==================== GLOBAL INSTANCE ====================

_chain_executor: Optional[LCELChainExecutor] = None


def get_chain_executor(
    config: Optional[ChainConfig] = None,
    memory_service: Optional[Any] = None,
    episodic_service: Optional[Any] = None,
    force_new: bool = False,
) -> LCELChainExecutor:
    """
    Get or create the global chain executor.
    
    Args:
        config: Optional chain configuration
        memory_service: Optional semantic memory service
        episodic_service: Optional episodic memory service
        force_new: Force creation of new instance
    
    Returns:
        Chain executor instance
    """
    global _chain_executor
    
    if _chain_executor is None or force_new:
        _chain_executor = LCELChainExecutor(
            config=config,
            memory_service=memory_service,
            episodic_service=episodic_service,
        )
    
    return _chain_executor


def reset_chain_executor():
    """Reset the global chain executor."""
    global _chain_executor
    _chain_executor = None
