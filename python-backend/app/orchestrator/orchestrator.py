"""
SmartSpec Pro - LangGraph Orchestrator
Phase 0.3

Main orchestrator class that uses LangGraph for:
- Workflow execution
- State management
- Checkpoint system
- Parallel execution
- Validation
"""

from typing import Optional, Dict, Any, List, Callable, Union
from datetime import datetime
import structlog
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.orchestrator.models import (
    ExecutionState,
    ExecutionStatus,
    WorkflowStep,
    WorkflowReport,
    ValidationResult,
    ParallelExecution,
)
from app.orchestrator.state_manager import state_manager
from app.orchestrator.checkpoint_manager import checkpoint_manager
from app.llm_proxy import llm_proxy, LLMRequest
from app.core.checkpointer import CheckpointerFactory, get_checkpointer, close_checkpointer
from app.services.memory_service import MemoryService, get_memory_service
from app.models.semantic_memory import MemoryType, MemoryScope
from app.services.episodic_memory_service import (
    EpisodicMemoryService,
    get_episodic_memory_service,
)
from app.models.episodic_memory import EpisodeType
from app.orchestrator.lcel_chains import (
    LCELChainExecutor,
    ChainConfig,
    ChainInput,
    ChainOutput,
    TaskType,
    BudgetPriority,
    get_chain_executor,
)
from app.services.kilo_session_manager import (
    KiloSessionManager,
    KiloSession,
    KiloResult,
    KiloMode,
    KiloConfig,
    get_kilo_session_manager,
)
from app.services.kilo_skill_manager import (
    KiloSkillManager,
    Skill,
    SkillScope,
    SkillMode,
    get_kilo_skill_manager,
)
from app.services.kilo_state_sync import (
    KiloStateSync,
    SyncState,
    CheckpointMapping,
    TaskMapping,
    get_kilo_state_sync,
)

logger = structlog.get_logger()


class WorkflowOrchestrator:
    """
    Orchestrates workflow execution using LangGraph.
    
    Supports two checkpointing modes:
    - PostgreSQL (production): Persistent, durable checkpoints across restarts
    - Memory (development): Fast, non-persistent checkpoints
    
    The checkpointer is initialized lazily on first workflow execution.
    """
    
    def __init__(self, use_postgres: bool = True, db_session: Optional[Any] = None):
        """
        Initialize the workflow orchestrator.
        
        Args:
            use_postgres: If True, use PostgreSQL for checkpoints (production).
                         If False, use in-memory checkpoints (development/testing).
            db_session: Optional async database session for memory service.
        """
        self.use_postgres = use_postgres
        self._checkpointer: Optional[Union[AsyncPostgresSaver, MemorySaver]] = None
        self._initialized = False
        self._db_session = db_session
        self._memory_service: Optional[MemoryService] = None
        self._episodic_memory_service: Optional[EpisodicMemoryService] = None
        self._chain_executor: Optional[LCELChainExecutor] = None
        self._use_lcel: bool = True  # Use LCEL chains by default
        self._kilo_session_manager: Optional[KiloSessionManager] = None
        self._kilo_sessions: Dict[str, KiloSession] = {}  # execution_id -> session
        self._kilo_skill_manager: Optional[KiloSkillManager] = None
        self._kilo_state_sync: Optional[KiloStateSync] = None
        logger.info(
            "Workflow orchestrator initialized",
            checkpoint_backend="postgres" if use_postgres else "memory"
        )
    
    async def _ensure_checkpointer(self) -> Union[AsyncPostgresSaver, MemorySaver]:
        """
        Ensure checkpointer is initialized (lazy initialization).
        
        Returns:
            The checkpointer instance
        """
        if self._checkpointer is None:
            self._checkpointer = await CheckpointerFactory.create(self.use_postgres)
            self._initialized = True
            logger.info(
                "Checkpointer initialized",
                type=type(self._checkpointer).__name__
            )
        return self._checkpointer
    
    @property
    def checkpointer(self) -> Optional[Union[AsyncPostgresSaver, MemorySaver]]:
        """Get the current checkpointer (may be None if not initialized)."""
        return self._checkpointer
    
    async def close(self):
        """
        Close the orchestrator and release resources.
        Should be called during application shutdown.
        """
        if self.use_postgres and self._initialized:
            await close_checkpointer()
            self._checkpointer = None
            self._initialized = False
            logger.info("Orchestrator closed")
    
    # ==================== MEMORY SERVICE ====================
    
    def set_db_session(self, db_session: Any):
        """
        Set the database session for memory service.
        
        Args:
            db_session: Async database session
        """
        self._db_session = db_session
        self._memory_service = None  # Reset to recreate with new session
    
    @property
    def memory_service(self) -> Optional[MemoryService]:
        """
        Get the memory service instance.
        
        Returns:
            MemoryService instance or None if no db session
        """
        if self._memory_service is None and self._db_session is not None:
            self._memory_service = get_memory_service(self._db_session)
        return self._memory_service
    
    async def get_context_for_workflow(
        self,
        user_id: str,
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get relevant memory context for a workflow execution.
        
        This retrieves user preferences, project facts, and skills
        to be included in LLM prompts during workflow execution.
        
        Args:
            user_id: User ID
            project_id: Optional project ID
        
        Returns:
            Dictionary with memory context
        """
        if not self.memory_service:
            return {"preferences": [], "facts": [], "skills": []}
        
        return await self.memory_service.get_context_for_prompt(
            user_id=user_id,
            project_id=project_id,
            include_preferences=True,
            include_facts=True,
            include_skills=True,
            max_memories=20
        )
    
    async def store_learned_fact(
        self,
        user_id: str,
        key: str,
        value: str,
        project_id: Optional[str] = None,
        execution_id: Optional[str] = None
    ) -> bool:
        """
        Store a fact learned during workflow execution.
        
        Args:
            user_id: User ID
            key: Fact key
            value: Fact value
            project_id: Optional project ID
            execution_id: Optional execution ID
        
        Returns:
            True if stored successfully
        """
        if not self.memory_service:
            return False
        
        try:
            if project_id:
                await self.memory_service.store_project_fact(
                    project_id=project_id,
                    key=key,
                    value=value,
                    user_id=user_id,
                    metadata={"source_execution_id": execution_id} if execution_id else None
                )
            else:
                await self.memory_service.store(
                    memory_key=f"fact:{key}",
                    content=value,
                    memory_type=MemoryType.PROJECT_FACT,
                    scope=MemoryScope.USER,
                    user_id=user_id,
                    source_execution_id=execution_id
                )
            return True
        except Exception as e:
            logger.error("Failed to store learned fact", error=str(e))
            return False
    
    @property
    def episodic_memory_service(self) -> Optional[EpisodicMemoryService]:
        """
        Get the episodic memory service instance.
        
        Returns:
            EpisodicMemoryService instance (lazy initialized)
        """
        if self._episodic_memory_service is None:
            self._episodic_memory_service = get_episodic_memory_service()
        return self._episodic_memory_service
    
    @property
    def chain_executor(self) -> LCELChainExecutor:
        """
        Get the LCEL chain executor instance.
        
        Returns:
            LCELChainExecutor instance (lazy initialized)
        """
        if self._chain_executor is None:
            self._chain_executor = get_chain_executor(
                memory_service=self.memory_service,
                episodic_service=self.episodic_memory_service,
            )
        return self._chain_executor
    
    @property
    def kilo_session_manager(self) -> KiloSessionManager:
        """
        Get the Kilo session manager instance.
        
        Returns:
            KiloSessionManager instance (lazy initialized)
        """
        if self._kilo_session_manager is None:
            self._kilo_session_manager = get_kilo_session_manager()
        return self._kilo_session_manager
    
    async def create_kilo_session(
        self,
        execution_id: str,
        workspace: str,
        mode: KiloMode = KiloMode.CODE,
    ) -> Optional[KiloSession]:
        """
        Create a Kilo session for a workflow execution.
        
        Args:
            execution_id: Workflow execution ID
            workspace: Path to workspace directory
            mode: Kilo mode (default: CODE)
        
        Returns:
            KiloSession if created successfully
        """
        try:
            # Check if CLI is available
            if not await self.kilo_session_manager.check_cli_available():
                logger.warning(
                    "Kilo CLI not available, skipping session creation",
                    execution_id=execution_id,
                )
                return None
            
            # Create session
            session = await self.kilo_session_manager.create_session(
                workspace=workspace,
                mode=mode,
            )
            
            # Track session by execution ID
            self._kilo_sessions[execution_id] = session
            
            logger.info(
                "Kilo session created for execution",
                execution_id=execution_id,
                session_id=session.session_id,
            )
            
            return session
        except Exception as e:
            logger.error(
                "Failed to create Kilo session",
                execution_id=execution_id,
                error=str(e),
            )
            return None
    
    async def execute_kilo_task(
        self,
        execution_id: str,
        prompt: str,
        mode: Optional[KiloMode] = None,
        workspace: Optional[str] = None,
    ) -> Optional[KiloResult]:
        """
        Execute a task using Kilo Code CLI.
        
        If no session exists for the execution, creates one.
        
        Args:
            execution_id: Workflow execution ID
            prompt: Task prompt/description
            mode: Optional mode override
            workspace: Optional workspace (required if no session exists)
        
        Returns:
            KiloResult if executed successfully
        """
        # Get or create session
        session = self._kilo_sessions.get(execution_id)
        
        if not session:
            if not workspace:
                logger.error(
                    "No workspace provided for new Kilo session",
                    execution_id=execution_id,
                )
                return None
            
            session = await self.create_kilo_session(
                execution_id=execution_id,
                workspace=workspace,
                mode=mode or KiloMode.CODE,
            )
            
            if not session:
                return None
        
        # Execute task
        try:
            result = await self.kilo_session_manager.execute_task(
                session=session,
                prompt=prompt,
                json_output=True,
            )
            
            # Store as episodic memory
            if self.episodic_memory_service and result.success:
                await self.store_code_episode(
                    code=result.output[:2000] if result.output else "",
                    language="kilo",
                    description=f"Kilo task: {prompt[:100]}",
                    was_successful=result.success,
                )
            
            return result
        except Exception as e:
            logger.error(
                "Kilo task execution failed",
                execution_id=execution_id,
                error=str(e),
            )
            return None
    
    async def get_kilo_checkpoints(
        self,
        execution_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get checkpoints for a Kilo session.
        
        Args:
            execution_id: Workflow execution ID
        
        Returns:
            List of checkpoint dictionaries
        """
        session = self._kilo_sessions.get(execution_id)
        if not session:
            return []
        
        checkpoints = await self.kilo_session_manager.get_checkpoints(session)
        return [cp.to_dict() for cp in checkpoints]
    
    async def restore_kilo_checkpoint(
        self,
        execution_id: str,
        checkpoint_hash: str,
    ) -> bool:
        """
        Restore a Kilo checkpoint.
        
        WARNING: This is destructive and performs a git hard reset.
        
        Args:
            execution_id: Workflow execution ID
            checkpoint_hash: Git commit hash to restore
        
        Returns:
            True if successful
        """
        session = self._kilo_sessions.get(execution_id)
        if not session:
            logger.warning(
                "No Kilo session found for execution",
                execution_id=execution_id,
            )
            return False
        
        return await self.kilo_session_manager.restore_checkpoint(
            session=session,
            checkpoint_hash=checkpoint_hash,
        )
    
    async def close_kilo_session(self, execution_id: str) -> None:
        """
        Close a Kilo session for an execution.
        
        Args:
            execution_id: Workflow execution ID
        """
        session = self._kilo_sessions.get(execution_id)
        if session:
            await self.kilo_session_manager.close_session(session)
            del self._kilo_sessions[execution_id]
            
            logger.info(
                "Kilo session closed",
                execution_id=execution_id,
            )
    
    @property
    def kilo_skill_manager(self) -> KiloSkillManager:
        """
        Get the Kilo skill manager instance.
        
        Returns:
            KiloSkillManager instance (lazy initialized)
        """
        if self._kilo_skill_manager is None:
            self._kilo_skill_manager = get_kilo_skill_manager()
        return self._kilo_skill_manager
    
    async def inject_skills_for_execution(
        self,
        execution_id: str,
        workspace: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> List[str]:
        """
        Inject skills for a workflow execution.
        
        This injects:
        - User preferences from semantic memory
        - Project facts from semantic memory
        - SmartSpec context
        
        Args:
            execution_id: Workflow execution ID
            workspace: Path to workspace directory
            user_id: Optional user ID for preferences
            project_id: Optional project ID for facts
        
        Returns:
            List of created skill names
        """
        created_skills = []
        
        try:
            # Get semantic memories
            semantic_memories = []
            
            if self.memory_service:
                # Get user preferences
                if user_id:
                    user_prefs = await self.memory_service.search(
                        memory_type=MemoryType.USER_PREFERENCE,
                        user_id=user_id,
                        limit=20,
                    )
                    semantic_memories.extend([m.to_dict() for m in user_prefs])
                
                # Get project facts
                if project_id:
                    project_facts = await self.memory_service.search(
                        memory_type=MemoryType.PROJECT_FACT,
                        project_id=project_id,
                        limit=20,
                    )
                    semantic_memories.extend([m.to_dict() for m in project_facts])
                
                # Get skills
                skills = await self.memory_service.search(
                    memory_type=MemoryType.SKILL,
                    user_id=user_id,
                    limit=10,
                )
                semantic_memories.extend([m.to_dict() for m in skills])
                
                # Get rules
                rules = await self.memory_service.search(
                    memory_type=MemoryType.RULE,
                    user_id=user_id,
                    project_id=project_id,
                    limit=10,
                )
                semantic_memories.extend([m.to_dict() for m in rules])
            
            # Inject SmartSpec context skill
            if semantic_memories:
                self.kilo_skill_manager.inject_smartspec_context(
                    workspace=workspace,
                    semantic_memories=semantic_memories,
                )
                created_skills.append("smartspec-context")
            
            # Set up default project skills
            default_skills = self.kilo_skill_manager.setup_project_skills(
                workspace=workspace,
                templates=["project_conventions"],
            )
            created_skills.extend([p.name for p in default_skills])
            
            logger.info(
                "Skills injected for execution",
                execution_id=execution_id,
                skills_count=len(created_skills),
            )
            
            return created_skills
            
        except Exception as e:
            logger.error(
                "Failed to inject skills",
                execution_id=execution_id,
                error=str(e),
            )
            return created_skills
    
    async def inject_custom_skill(
        self,
        workspace: str,
        name: str,
        description: str,
        content: str,
        mode: str = "generic",
    ) -> bool:
        """
        Inject a custom skill.
        
        Args:
            workspace: Workspace directory
            name: Skill name
            description: Skill description
            content: Skill content (markdown)
            mode: Skill mode (generic, code, architect, etc.)
        
        Returns:
            True if successful
        """
        try:
            # Convert mode string to enum
            try:
                skill_mode = SkillMode(mode)
            except ValueError:
                skill_mode = SkillMode.GENERIC
            
            skill = Skill(
                name=name,
                description=description,
                content=content,
                scope=SkillScope.PROJECT,
                mode=skill_mode,
            )
            
            self.kilo_skill_manager.create_skill(workspace, skill)
            
            logger.info(
                "Custom skill injected",
                name=name,
                workspace=workspace,
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "Failed to inject custom skill",
                name=name,
                error=str(e),
            )
            return False
    
    @property
    def kilo_state_sync(self) -> KiloStateSync:
        """
        Get the Kilo state sync instance.
        
        Returns:
            KiloStateSync instance (lazy initialized)
        """
        if self._kilo_state_sync is None:
            self._kilo_state_sync = get_kilo_state_sync()
        return self._kilo_state_sync
    
    async def init_kilo_sync_state(
        self,
        execution_id: str,
        workspace: str,
    ) -> SyncState:
        """
        Initialize sync state for an execution.
        
        Args:
            execution_id: Workflow execution ID
            workspace: Workspace directory
        
        Returns:
            Created SyncState
        """
        return self.kilo_state_sync.create_sync_state(
            execution_id=execution_id,
            workspace=workspace,
        )
    
    async def record_kilo_checkpoint(
        self,
        execution_id: str,
        step_id: str,
        kilo_checkpoint_hash: str,
        smartspec_checkpoint_id: Optional[str] = None,
    ) -> Optional[CheckpointMapping]:
        """
        Record a checkpoint mapping.
        
        Args:
            execution_id: Workflow execution ID
            step_id: Step ID
            kilo_checkpoint_hash: Kilo git commit hash
            smartspec_checkpoint_id: SmartSpec checkpoint ID
        
        Returns:
            Created CheckpointMapping
        """
        return await self.kilo_state_sync.record_checkpoint(
            execution_id=execution_id,
            step_id=step_id,
            kilo_checkpoint_hash=kilo_checkpoint_hash,
            smartspec_checkpoint_id=smartspec_checkpoint_id,
        )
    
    async def record_kilo_task(
        self,
        execution_id: str,
        step_id: str,
        kilo_task_id: str,
        prompt: str,
        result: Optional[str] = None,
        success: bool = False,
    ) -> Optional[TaskMapping]:
        """
        Record a task mapping.
        
        Args:
            execution_id: Workflow execution ID
            step_id: Step ID
            kilo_task_id: Kilo task ID
            prompt: Task prompt
            result: Task result
            success: Whether task succeeded
        
        Returns:
            Created TaskMapping
        """
        return await self.kilo_state_sync.record_task(
            execution_id=execution_id,
            step_id=step_id,
            kilo_task_id=kilo_task_id,
            prompt=prompt,
            result=result,
            success=success,
        )
    
    async def sync_kilo_state(
        self,
        execution_id: str,
    ) -> Dict[str, Any]:
        """
        Sync state with Kilo for an execution.
        
        This syncs checkpoints and tasks from Kilo to SmartSpec.
        
        Args:
            execution_id: Workflow execution ID
        
        Returns:
            Sync summary
        """
        session = self._kilo_sessions.get(execution_id)
        if not session:
            return {
                "success": False,
                "error": "No Kilo session found",
            }
        
        # Get checkpoints from Kilo
        checkpoints = await self.kilo_session_manager.get_checkpoints(session)
        checkpoint_count = await self.kilo_state_sync.sync_checkpoints_from_kilo(
            execution_id=execution_id,
            kilo_checkpoints=checkpoints,
        )
        
        # Get tasks from Kilo
        tasks = await self.kilo_session_manager.get_task_history(session)
        task_count = await self.kilo_state_sync.sync_tasks_from_kilo(
            execution_id=execution_id,
            kilo_tasks=tasks,
        )
        
        return {
            "success": True,
            "checkpoints_synced": checkpoint_count,
            "tasks_synced": task_count,
        }
    
    async def get_kilo_sync_summary(
        self,
        execution_id: str,
    ) -> Dict[str, Any]:
        """
        Get sync summary for an execution.
        
        Args:
            execution_id: Workflow execution ID
        
        Returns:
            Sync summary dictionary
        """
        return self.kilo_state_sync.get_sync_summary(execution_id)
    
    async def get_rag_context(
        self,
        query: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        max_episodes: int = 5,
    ) -> Dict[str, Any]:
        """
        Get RAG context from episodic memory for LLM prompts.
        
        This retrieves relevant past conversations, code snippets,
        and workflow episodes to enhance LLM responses.
        
        Args:
            query: The query/prompt to find context for
            user_id: Optional user ID filter
            project_id: Optional project ID filter
            max_episodes: Maximum episodes per category
        
        Returns:
            Dictionary with categorized relevant episodes
        """
        if not self.episodic_memory_service:
            return {
                "conversations": [],
                "code_snippets": [],
                "workflows": [],
                "total_episodes": 0,
            }
        
        return await self.episodic_memory_service.get_rag_context(
            query=query,
            user_id=user_id,
            project_id=project_id,
            max_episodes=max_episodes,
        )
    
    async def store_conversation_episode(
        self,
        user_message: str,
        assistant_response: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        model_used: Optional[str] = None,
        was_helpful: Optional[bool] = None,
    ) -> Optional[str]:
        """
        Store a conversation episode for future RAG retrieval.
        
        Args:
            user_message: User's message
            assistant_response: Assistant's response
            user_id: Optional user ID
            session_id: Optional session ID
            model_used: Model used for response
            was_helpful: Whether response was helpful
        
        Returns:
            Episode ID if stored successfully, None otherwise
        """
        if not self.episodic_memory_service:
            return None
        
        try:
            return await self.episodic_memory_service.store_conversation(
                user_message=user_message,
                assistant_response=assistant_response,
                user_id=user_id,
                session_id=session_id,
                model_used=model_used,
                was_helpful=was_helpful,
            )
        except Exception as e:
            logger.error("Failed to store conversation episode", error=str(e))
            return None
    
    async def store_code_episode(
        self,
        code: str,
        language: str,
        description: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        file_path: Optional[str] = None,
        was_successful: bool = True,
    ) -> Optional[str]:
        """
        Store a code episode for future RAG retrieval.
        
        Args:
            code: Code content
            language: Programming language
            description: Description of the code
            user_id: Optional user ID
            project_id: Optional project ID
            file_path: Optional file path
            was_successful: Whether code was successful
        
        Returns:
            Episode ID if stored successfully, None otherwise
        """
        if not self.episodic_memory_service:
            return None
        
        try:
            return await self.episodic_memory_service.store_code_episode(
                code=code,
                language=language,
                description=description,
                user_id=user_id,
                project_id=project_id,
                file_path=file_path,
                was_successful=was_successful,
            )
        except Exception as e:
            logger.error("Failed to store code episode", error=str(e))
            return None
    
    async def store_workflow_episode(
        self,
        workflow_id: str,
        execution_id: str,
        summary: str,
        details: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        was_successful: bool = True,
    ) -> Optional[str]:
        """
        Store a workflow execution episode.
        
        Args:
            workflow_id: Workflow ID
            execution_id: Execution ID
            summary: Execution summary
            details: Detailed description
            user_id: Optional user ID
            project_id: Optional project ID
            was_successful: Whether workflow succeeded
        
        Returns:
            Episode ID if stored successfully, None otherwise
        """
        if not self.episodic_memory_service:
            return None
        
        try:
            return await self.episodic_memory_service.store_workflow_episode(
                workflow_id=workflow_id,
                execution_id=execution_id,
                summary=summary,
                details=details,
                user_id=user_id,
                project_id=project_id,
                was_successful=was_successful,
            )
        except Exception as e:
            logger.error("Failed to store workflow episode", error=str(e))
            return None
    
    async def get_full_context(
        self,
        query: str,
        user_id: str,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get full context combining semantic and episodic memories.
        
        This is the main method for getting all relevant context
        for LLM prompts, combining:
        - User preferences (semantic)
        - Project facts (semantic)
        - Skills (semantic)
        - Past conversations (episodic)
        - Code snippets (episodic)
        - Workflow history (episodic)
        
        Args:
            query: The query/prompt to find context for
            user_id: User ID
            project_id: Optional project ID
        
        Returns:
            Dictionary with all relevant context
        """
        # Get semantic memory context
        semantic_context = await self.get_context_for_workflow(
            user_id=user_id,
            project_id=project_id,
        )
        
        # Get episodic memory context (RAG)
        episodic_context = await self.get_rag_context(
            query=query,
            user_id=user_id,
            project_id=project_id,
        )
        
        return {
            "semantic": semantic_context,
            "episodic": episodic_context,
            "user_id": user_id,
            "project_id": project_id,
        }
    
    def format_context_for_prompt(self, context: Dict[str, Any]) -> str:
        """
        Format combined context as a string for LLM prompts.
        
        Args:
            context: Context dictionary from get_full_context
        
        Returns:
            Formatted context string
        """
        parts = []
        
        # Format semantic context
        semantic = context.get("semantic", {})
        
        if semantic.get("preferences"):
            parts.append("## User Preferences\n")
            for pref in semantic["preferences"][:5]:
                parts.append(f"- {pref.get('content', '')}\n")
        
        if semantic.get("facts"):
            parts.append("\n## Project Facts\n")
            for fact in semantic["facts"][:5]:
                parts.append(f"- {fact.get('content', '')}\n")
        
        if semantic.get("skills"):
            parts.append("\n## Available Skills\n")
            for skill in semantic["skills"][:5]:
                parts.append(f"- {skill.get('content', '')}\n")
        
        # Format episodic context
        episodic = context.get("episodic", {})
        
        if episodic.get("conversations"):
            parts.append("\n## Relevant Past Conversations\n")
            for conv in episodic["conversations"][:3]:
                parts.append(f"- {conv.get('content', '')[:200]}...\n")
        
        if episodic.get("code_snippets"):
            parts.append("\n## Relevant Code Examples\n")
            for code in episodic["code_snippets"][:3]:
                lang = code.get("language", "")
                parts.append(f"```{lang}\n{code.get('content', '')[:500]}\n```\n")
        
        return "".join(parts) if parts else ""
    
    async def store_user_preference(
        self,
        user_id: str,
        key: str,
        value: str
    ) -> bool:
        """
        Store a user preference.
        
        Args:
            user_id: User ID
            key: Preference key
            value: Preference value
        
        Returns:
            True if stored successfully
        """
        if not self.memory_service:
            return False
        
        try:
            await self.memory_service.store_user_preference(
                user_id=user_id,
                key=key,
                value=value
            )
            return True
        except Exception as e:
            logger.error("Failed to store user preference", error=str(e))
            return False
    
    # ==================== WORKFLOW EXECUTION ====================
    
    async def execute_workflow(
        self,
        workflow_id: str,
        user_prompt: str,
        goal: str,
        steps: List[Dict[str, Any]],
        project_path: Optional[str] = None,
        parallel_config: Optional[ParallelExecution] = None,
        validation_rules: Optional[List] = None
    ) -> ExecutionState:
        """
        Execute a workflow with LangGraph orchestration
        
        Args:
            workflow_id: Workflow ID
            user_prompt: User's original prompt
            goal: Execution goal
            steps: List of workflow steps to execute
            project_path: Project directory path
            parallel_config: Parallel execution configuration
            validation_rules: Validation rules to apply
        
        Returns:
            Final ExecutionState
        """
        # Create execution state
        state = state_manager.create_execution(
            workflow_id=workflow_id,
            user_prompt=user_prompt,
            goal=goal,
            project_path=project_path,
            total_steps=len(steps)
        )
        
        execution_id = state.execution_id
        
        logger.info(
            "Starting workflow execution",
            execution_id=execution_id,
            workflow_id=workflow_id,
            total_steps=len(steps)
        )
        
        try:
            # Update status to running
            state_manager.update_status(execution_id, ExecutionStatus.RUNNING)
            
            # Ensure checkpointer is initialized
            checkpointer = await self._ensure_checkpointer()
            
            # Build LangGraph
            graph = await self._build_graph(execution_id, steps, parallel_config, checkpointer)
            
            # Execute graph with checkpointing
            config = {"configurable": {"thread_id": execution_id}}
            
            async for event in graph.astream(
                {"execution_id": execution_id},
                config=config
            ):
                # Process events
                logger.debug("Graph event", event=event)
            
            # Mark as completed
            state_manager.update_status(execution_id, ExecutionStatus.COMPLETED)
            
            # Run validation if configured
            if validation_rules:
                await self._validate_execution(execution_id, validation_rules)
            
            logger.info(
                "Workflow execution completed",
                execution_id=execution_id,
                duration_seconds=state.total_duration_seconds
            )
        
        except Exception as e:
            logger.error(
                "Workflow execution failed",
                execution_id=execution_id,
                error=str(e),
                exc_info=e
            )
            state_manager.set_error(execution_id, str(e))
            state_manager.update_status(execution_id, ExecutionStatus.FAILED)
        
        return state_manager.get_state(execution_id)
    
    async def _build_graph(
        self,
        execution_id: str,
        steps: List[Dict[str, Any]],
        parallel_config: Optional[ParallelExecution] = None,
        checkpointer: Optional[Union[AsyncPostgresSaver, MemorySaver]] = None
    ) -> StateGraph:
        """
        Build LangGraph for workflow execution.
        
        Args:
            execution_id: The execution ID
            steps: List of workflow steps
            parallel_config: Optional parallel execution configuration
            checkpointer: The checkpointer to use (PostgreSQL or Memory)
        
        Returns:
            Compiled StateGraph with checkpointing enabled
        """
        
        # Create graph
        workflow = StateGraph(dict)
        
        # Add nodes for each step
        for i, step_config in enumerate(steps):
            step_id = step_config.get('id', f"step_{i}")
            step_name = step_config.get('name', f"Step {i+1}")
            
            # Create step node
            async def step_node(state: dict, step_id=step_id, step_config=step_config):
                return await self._execute_step(
                    execution_id,
                    step_id,
                    step_config
                )
            
            workflow.add_node(step_id, step_node)
        
        # Add edges (sequential by default)
        if parallel_config and parallel_config.enabled and parallel_config.steps:
            # Parallel execution
            self._add_parallel_edges(workflow, steps, parallel_config.steps)
        else:
            # Sequential execution
            self._add_sequential_edges(workflow, steps)
        
        # Set entry point
        if steps:
            workflow.set_entry_point(steps[0].get('id', 'step_0'))
        
        # Compile graph with checkpointing
        # Use provided checkpointer or fallback to instance checkpointer
        cp = checkpointer or self._checkpointer
        
        logger.debug(
            "Compiling graph with checkpointer",
            execution_id=execution_id,
            checkpointer_type=type(cp).__name__ if cp else "None"
        )
        
        return workflow.compile(checkpointer=cp)
    
    def _add_sequential_edges(self, workflow: StateGraph, steps: List[Dict[str, Any]]):
        """Add sequential edges to graph"""
        for i in range(len(steps) - 1):
            current_step = steps[i].get('id', f"step_{i}")
            next_step = steps[i + 1].get('id', f"step_{i+1}")
            workflow.add_edge(current_step, next_step)
        
        # Last step to END
        if steps:
            last_step = steps[-1].get('id', f"step_{len(steps)-1}")
            workflow.add_edge(last_step, END)
    
    def _add_parallel_edges(
        self,
        workflow: StateGraph,
        steps: List[Dict[str, Any]],
        parallel_steps: List[str]
    ):
        """
        Add parallel edges to graph.
        
        This implements a fork-join pattern:
        1. Sequential steps run normally
        2. When parallel steps are encountered, they fork from a common predecessor
        3. All parallel steps join at a common successor
        
        Example:
            steps = [A, B, C, D, E]
            parallel_steps = [B, C, D]
            
            Result:
                A -> B ->
                A -> C -> E
                A -> D ->
        
        Args:
            workflow: StateGraph to add edges to
            steps: All workflow steps
            parallel_steps: List of step IDs to execute in parallel
        """
        if not parallel_steps:
            self._add_sequential_edges(workflow, steps)
            return
        
        # Build step index for quick lookup
        step_ids = [s.get('id', f"step_{i}") for i, s in enumerate(steps)]
        step_index = {sid: i for i, sid in enumerate(step_ids)}
        
        # Find parallel step indices
        parallel_indices = set()
        for ps in parallel_steps:
            if ps in step_index:
                parallel_indices.add(step_index[ps])
        
        if not parallel_indices:
            # No valid parallel steps found, fall back to sequential
            self._add_sequential_edges(workflow, steps)
            return
        
        # Find the fork point (step before first parallel step)
        min_parallel_idx = min(parallel_indices)
        max_parallel_idx = max(parallel_indices)
        
        # Add edges before parallel section (sequential)
        for i in range(min_parallel_idx - 1):
            current_step = step_ids[i]
            next_step = step_ids[i + 1]
            workflow.add_edge(current_step, next_step)
        
        # Fork point: step before parallel section
        if min_parallel_idx > 0:
            fork_step = step_ids[min_parallel_idx - 1]
            # Connect fork to all parallel steps
            for idx in parallel_indices:
                workflow.add_edge(fork_step, step_ids[idx])
        
        # Join point: step after parallel section
        if max_parallel_idx < len(steps) - 1:
            join_step = step_ids[max_parallel_idx + 1]
            # Connect all parallel steps to join
            for idx in parallel_indices:
                workflow.add_edge(step_ids[idx], join_step)
            
            # Continue sequential after join
            for i in range(max_parallel_idx + 1, len(steps) - 1):
                current_step = step_ids[i]
                next_step = step_ids[i + 1]
                workflow.add_edge(current_step, next_step)
        
        # Last step to END
        if steps:
            last_step = step_ids[-1]
            workflow.add_edge(last_step, END)
        
        logger.info(
            "Parallel edges configured",
            parallel_steps=parallel_steps,
            fork_step=step_ids[min_parallel_idx - 1] if min_parallel_idx > 0 else "START",
            join_step=step_ids[max_parallel_idx + 1] if max_parallel_idx < len(steps) - 1 else "END"
        )
    
    async def _execute_step(
        self,
        execution_id: str,
        step_id: str,
        step_config: Dict[str, Any]
    ) -> dict:
        """Execute a single workflow step"""
        
        step_name = step_config.get('name', step_id)
        step_description = step_config.get('description', '')
        step_type = step_config.get('type', 'llm')  # llm, kilo_cli, custom
        
        logger.info(
            "Executing step",
            execution_id=execution_id,
            step_id=step_id,
            step_name=step_name,
            step_type=step_type
        )
        
        # Add step to state
        state_manager.add_step(execution_id, step_id, step_name, step_description)
        
        # Update step status to running
        state_manager.update_step_status(execution_id, step_id, ExecutionStatus.RUNNING)
        
        try:
            # Execute based on step type
            if step_type == 'llm':
                output = await self._execute_llm_step(execution_id, step_id, step_config)
            elif step_type == 'kilo_cli':
                output = await self._execute_kilo_step(execution_id, step_id, step_config)
            elif step_type == 'custom':
                output = await self._execute_custom_step(execution_id, step_id, step_config)
            else:
                raise ValueError(f"Unknown step type: {step_type}")
            
            # Update step status to completed
            state_manager.update_step_status(
                execution_id,
                step_id,
                ExecutionStatus.COMPLETED,
                output=output
            )
            
            # Create checkpoint after step completion
            state = state_manager.get_state(execution_id)
            checkpoint = checkpoint_manager.create_checkpoint(
                execution_id=execution_id,
                state=state,
                step_id=step_id,
                step_name=step_name
            )
            state_manager.set_checkpoint(execution_id, checkpoint.checkpoint_id)
            
            logger.info(
                "Step completed",
                execution_id=execution_id,
                step_id=step_id,
                checkpoint_id=checkpoint.checkpoint_id
            )
            
            return {"step_id": step_id, "status": "completed", "output": output}
        
        except Exception as e:
            logger.error(
                "Step failed",
                execution_id=execution_id,
                step_id=step_id,
                error=str(e),
                exc_info=e
            )
            
            state_manager.update_step_status(
                execution_id,
                step_id,
                ExecutionStatus.FAILED,
                error=str(e)
            )
            
            raise
    
    async def _execute_llm_step(
        self,
        execution_id: str,
        step_id: str,
        step_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute LLM-based step.
        
        Supports two execution modes:
        - LCEL mode (default): Uses LangChain Expression Language chains
          with memory context integration
        - Legacy mode: Uses the original LLM proxy
        
        Args:
            execution_id: Workflow execution ID
            step_id: Step ID
            step_config: Step configuration including:
                - prompt: The prompt text
                - task_type: Type of task (simple, complex, code_generation, etc.)
                - budget_priority: quality, balanced, or economy
                - max_tokens: Maximum tokens for response
                - temperature: LLM temperature
                - system_message: Optional custom system message
                - use_lcel: Override LCEL mode (optional)
                - include_context: Whether to include memory context (default True)
                - user_id: User ID for context retrieval
                - project_id: Project ID for context retrieval
        
        Returns:
            Dictionary with content, provider, model, tokens_used, cost
        """
        prompt = step_config.get('prompt', '')
        task_type_str = step_config.get('task_type', 'simple')
        budget_priority_str = step_config.get('budget_priority', 'quality')
        use_lcel = step_config.get('use_lcel', self._use_lcel)
        
        if use_lcel:
            return await self._execute_llm_step_lcel(
                execution_id, step_id, step_config
            )
        else:
            return await self._execute_llm_step_legacy(
                execution_id, step_id, step_config
            )
    
    async def _execute_llm_step_lcel(
        self,
        execution_id: str,
        step_id: str,
        step_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute LLM step using LCEL chains with memory context.
        
        This is the new execution path that uses LangChain Expression Language
        for composable, streamable chains with automatic memory integration.
        """
        prompt = step_config.get('prompt', '')
        task_type_str = step_config.get('task_type', 'simple')
        budget_priority_str = step_config.get('budget_priority', 'quality')
        
        # Convert string to enum
        try:
            task_type = TaskType(task_type_str)
        except ValueError:
            task_type = TaskType.SIMPLE
        
        try:
            budget_priority = BudgetPriority(budget_priority_str)
        except ValueError:
            budget_priority = BudgetPriority.BALANCED
        
        # Get context if enabled
        semantic_context = None
        episodic_context = None
        include_context = step_config.get('include_context', True)
        user_id = step_config.get('user_id')
        project_id = step_config.get('project_id')
        
        if include_context:
            # Get semantic context
            if user_id and self.memory_service:
                try:
                    semantic_context = await self.memory_service.get_context_for_prompt(
                        user_id=user_id,
                        project_id=project_id,
                    )
                except Exception as e:
                    logger.warning("Failed to get semantic context", error=str(e))
            
            # Get episodic context
            if self.episodic_memory_service:
                try:
                    episodic_context = await self.episodic_memory_service.get_rag_context(
                        query=prompt,
                        user_id=user_id,
                        project_id=project_id,
                    )
                except Exception as e:
                    logger.warning("Failed to get episodic context", error=str(e))
        
        # Create chain input
        chain_input = ChainInput(
            prompt=prompt,
            task_type=task_type,
            budget_priority=budget_priority,
            system_message=step_config.get('system_message'),
            semantic_context=semantic_context,
            episodic_context=episodic_context,
            variables={
                "user_id": user_id,
                "project_id": project_id,
                "execution_id": execution_id,
                "step_id": step_id,
            },
        )
        
        # Execute chain
        try:
            output: ChainOutput = await self.chain_executor.execute(chain_input)
            
            # Update step with LLM metrics
            state_manager.update_step_status(
                execution_id,
                step_id,
                ExecutionStatus.RUNNING,
                llm_provider="openai",  # LCEL uses OpenAI
                llm_model=output.model,
                llm_cost=output.cost,
                tokens_used=output.tokens_used
            )
            
            logger.info(
                "LCEL step executed",
                execution_id=execution_id,
                step_id=step_id,
                task_type=task_type.value,
                has_semantic_context=semantic_context is not None,
                has_episodic_context=episodic_context is not None,
            )
            
            return {
                "content": output.content,
                "provider": "openai",
                "model": output.model,
                "tokens_used": output.tokens_used,
                "cost": output.cost,
                "metadata": output.metadata,
            }
        except Exception as e:
            logger.error(
                "LCEL step execution failed, falling back to legacy",
                error=str(e),
                execution_id=execution_id,
                step_id=step_id,
            )
            # Fall back to legacy execution
            return await self._execute_llm_step_legacy(
                execution_id, step_id, step_config
            )
    
    async def _execute_llm_step_legacy(
        self,
        execution_id: str,
        step_id: str,
        step_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute LLM step using the legacy LLM proxy.
        
        This is the original execution path that uses the LLM proxy
        for model selection and routing.
        """
        prompt = step_config.get('prompt', '')
        task_type = step_config.get('task_type', 'simple')
        budget_priority = step_config.get('budget_priority', 'quality')
        
        # Invoke LLM via proxy
        request = LLMRequest(
            prompt=prompt,
            task_type=task_type,
            budget_priority=budget_priority,
            max_tokens=step_config.get('max_tokens', 4000),
            temperature=step_config.get('temperature', 0.7)
        )
        
        response = await llm_proxy.invoke(request)
        
        # Update step with LLM metrics
        state_manager.update_step_status(
            execution_id,
            step_id,
            ExecutionStatus.RUNNING,
            llm_provider=response.provider,
            llm_model=response.model,
            llm_cost=response.cost,
            tokens_used=response.tokens_used
        )
        
        logger.info(
            "Legacy LLM step executed",
            execution_id=execution_id,
            step_id=step_id,
            provider=response.provider,
            model=response.model,
        )
        
        return {
            "content": response.content,
            "provider": response.provider,
            "model": response.model,
            "tokens_used": response.tokens_used,
            "cost": response.cost
        }
    
    async def stream_llm_step(
        self,
        execution_id: str,
        step_id: str,
        step_config: Dict[str, Any]
    ):
        """
        Stream LLM step output using LCEL chains.
        
        This method yields streaming chunks as they are generated,
        enabling real-time response display.
        
        Args:
            execution_id: Workflow execution ID
            step_id: Step ID
            step_config: Step configuration
        
        Yields:
            StreamingChunk objects with content
        """
        from app.orchestrator.lcel_chains import StreamingChunk
        
        prompt = step_config.get('prompt', '')
        task_type_str = step_config.get('task_type', 'simple')
        
        # Convert string to enum
        try:
            task_type = TaskType(task_type_str)
        except ValueError:
            task_type = TaskType.SIMPLE
        
        # Get context
        semantic_context = None
        episodic_context = None
        include_context = step_config.get('include_context', True)
        user_id = step_config.get('user_id')
        project_id = step_config.get('project_id')
        
        if include_context:
            if user_id and self.memory_service:
                try:
                    semantic_context = await self.memory_service.get_context_for_prompt(
                        user_id=user_id,
                        project_id=project_id,
                    )
                except Exception as e:
                    logger.warning("Failed to get semantic context for streaming", error=str(e))
            
            if self.episodic_memory_service:
                try:
                    episodic_context = await self.episodic_memory_service.get_rag_context(
                        query=prompt,
                        user_id=user_id,
                        project_id=project_id,
                    )
                except Exception as e:
                    logger.warning("Failed to get episodic context for streaming", error=str(e))
        
        # Create chain input
        chain_input = ChainInput(
            prompt=prompt,
            task_type=task_type,
            system_message=step_config.get('system_message'),
            semantic_context=semantic_context,
            episodic_context=episodic_context,
            variables={
                "user_id": user_id,
                "project_id": project_id,
                "execution_id": execution_id,
                "step_id": step_id,
            },
        )
        
        # Stream from chain executor
        try:
            async for chunk in self.chain_executor.stream(chain_input):
                yield chunk
            
            logger.info(
                "Streaming step completed",
                execution_id=execution_id,
                step_id=step_id,
            )
        except Exception as e:
            logger.error(
                "Streaming step failed",
                error=str(e),
                execution_id=execution_id,
                step_id=step_id,
            )
            # Yield error chunk
            yield StreamingChunk(
                content=f"Error: {str(e)}",
                is_final=True,
                metadata={"error": True},
            )
    
    async def _execute_kilo_step(
        self,
        execution_id: str,
        step_id: str,
        step_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute Kilo Code CLI step.
        
        This executes a task using the Kilo Code CLI in autonomous mode.
        
        Args:
            execution_id: Workflow execution ID
            step_id: Step ID
            step_config: Step configuration including:
                - prompt: The task prompt
                - workspace: Path to workspace directory
                - mode: Kilo mode (code, architect, debug, ask, orchestrator)
                - timeout: Timeout in seconds
        
        Returns:
            Dictionary with execution results
        """
        prompt = step_config.get('prompt', '')
        workspace = step_config.get('workspace')
        mode_str = step_config.get('mode', 'code')
        timeout = step_config.get('timeout', 300)
        
        # Convert mode string to enum
        try:
            mode = KiloMode(mode_str)
        except ValueError:
            mode = KiloMode.CODE
        
        # Check if Kilo CLI is available
        if not await self.kilo_session_manager.check_cli_available():
            logger.warning(
                "Kilo CLI not available, falling back to LLM",
                execution_id=execution_id,
                step_id=step_id,
            )
            # Fall back to LLM execution
            return await self._execute_llm_step(
                execution_id,
                step_id,
                {
                    "prompt": prompt,
                    "task_type": "code_generation",
                    "use_lcel": True,
                }
            )
        
        # Execute Kilo task
        result = await self.execute_kilo_task(
            execution_id=execution_id,
            prompt=prompt,
            mode=mode,
            workspace=workspace,
        )
        
        if not result:
            return {
                "success": False,
                "error": "Kilo execution failed",
                "content": "",
            }
        
        # Update step with Kilo metrics
        state_manager.update_step_status(
            execution_id,
            step_id,
            ExecutionStatus.RUNNING,
            llm_provider="kilo",
            llm_model="kilo-cli",
            llm_cost=result.cost,
            tokens_used=result.tokens_used,
        )
        
        logger.info(
            "Kilo step executed",
            execution_id=execution_id,
            step_id=step_id,
            success=result.success,
            duration=result.duration_seconds,
        )
        
        return {
            "success": result.success,
            "content": result.output,
            "error": result.error,
            "exit_code": result.exit_code,
            "json_data": result.json_data,
            "duration_seconds": result.duration_seconds,
            "tokens_used": result.tokens_used,
            "cost": result.cost,
            "provider": "kilo",
            "model": "kilo-cli",
        }
    
    async def _execute_custom_step(
        self,
        execution_id: str,
        step_id: str,
        step_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute custom step"""
        # TODO: Implement custom step execution
        logger.warning("Custom step execution not yet implemented", step_id=step_id)
        return {"status": "not_implemented"}
    
    async def _validate_execution(
        self,
        execution_id: str,
        validation_rules: List
    ):
        """Validate workflow execution"""
        # TODO: Implement validation
        logger.info("Validation not yet implemented", execution_id=execution_id)
    
    async def resume_from_checkpoint(
        self,
        checkpoint_id: str,
        steps: Optional[List[Dict[str, Any]]] = None,
        parallel_config: Optional[ParallelExecution] = None
    ) -> ExecutionState:
        """
        Resume workflow execution from a checkpoint.
        
        This method:
        1. Loads the checkpoint state
        2. Restores the execution state
        3. Rebuilds the workflow graph
        4. Resumes execution from the checkpoint step
        
        Args:
            checkpoint_id: ID of checkpoint to resume from
            steps: Optional workflow steps (if not in checkpoint metadata)
            parallel_config: Optional parallel execution config
        
        Returns:
            Final ExecutionState after resumption
        
        Raises:
            ValueError: If checkpoint not found or cannot be resumed
        """
        # Load checkpoint
        checkpoint = checkpoint_manager.load_checkpoint(checkpoint_id)
        if not checkpoint:
            raise ValueError(f"Checkpoint not found: {checkpoint_id}")
        
        if not checkpoint.can_resume:
            raise ValueError(f"Checkpoint cannot be resumed: {checkpoint_id}")
        
        logger.info(
            "Resuming from checkpoint",
            checkpoint_id=checkpoint_id,
            execution_id=checkpoint.execution_id,
            step_id=checkpoint.step_id,
            step_name=checkpoint.step_name
        )
        
        # Restore state
        execution_id = checkpoint.execution_id
        restored_state = checkpoint.state
        state_manager.states[execution_id] = restored_state
        
        # Get steps from checkpoint metadata or parameter
        workflow_steps = steps or checkpoint.metadata.get("steps", [])
        if not workflow_steps:
            raise ValueError("No workflow steps found in checkpoint or parameters")
        
        # Find the checkpoint step index
        checkpoint_step_id = checkpoint.step_id
        step_ids = [s.get('id', f"step_{i}") for i, s in enumerate(workflow_steps)]
        
        try:
            checkpoint_step_idx = step_ids.index(checkpoint_step_id)
        except ValueError:
            raise ValueError(f"Checkpoint step '{checkpoint_step_id}' not found in workflow steps")
        
        # Get remaining steps (from checkpoint step onwards)
        remaining_steps = workflow_steps[checkpoint_step_idx:]
        
        if not remaining_steps:
            logger.info("No remaining steps to execute", execution_id=execution_id)
            state_manager.update_status(execution_id, ExecutionStatus.COMPLETED)
            return state_manager.get_state(execution_id)
        
        logger.info(
            "Resuming execution",
            execution_id=execution_id,
            from_step=checkpoint_step_id,
            remaining_steps=len(remaining_steps)
        )
        
        # Update status to running
        state_manager.update_status(execution_id, ExecutionStatus.RUNNING)
        
        # Build graph for remaining steps
        graph = self._build_graph(
            execution_id=execution_id,
            steps=remaining_steps,
            parallel_config=parallel_config
        )
        
        # Create initial state for resumed execution
        initial_state = {
            "execution_id": execution_id,
            "current_step": checkpoint_step_id,
            "outputs": restored_state.aggregate_output,
            "resumed_from": checkpoint_id
        }
        
        # Configure thread for checkpointing
        config = {
            "configurable": {
                "thread_id": execution_id,
                "checkpoint_ns": f"resume_{checkpoint_id}"
            }
        }
        
        try:
            # Execute remaining steps
            async for event in graph.astream(initial_state, config):
                # Process events
                if isinstance(event, dict):
                    for step_id, step_output in event.items():
                        if step_id != "__end__":
                            logger.debug(
                                "Step completed in resumed execution",
                                execution_id=execution_id,
                                step_id=step_id
                            )
            
            # Mark as completed
            state_manager.update_status(execution_id, ExecutionStatus.COMPLETED)
            
            logger.info(
                "Resumed execution completed",
                execution_id=execution_id,
                checkpoint_id=checkpoint_id
            )
        
        except Exception as e:
            logger.error(
                "Resumed execution failed",
                execution_id=execution_id,
                checkpoint_id=checkpoint_id,
                error=str(e),
                exc_info=e
            )
            state_manager.update_status(execution_id, ExecutionStatus.FAILED)
            state_manager.set_error(execution_id, str(e))
        
        return state_manager.get_state(execution_id)
    
    def get_execution_status(self, execution_id: str) -> Optional[ExecutionState]:
        """Get current execution status"""
        return state_manager.get_state(execution_id)
    
    def list_executions(self, status: Optional[ExecutionStatus] = None) -> List[ExecutionState]:
        """List all executions"""
        return state_manager.list_executions(status)
    
    def cancel_execution(self, execution_id: str) -> bool:
        """Cancel a running execution"""
        state = state_manager.get_state(execution_id)
        if not state:
            return False
        
        if state.status == ExecutionStatus.RUNNING:
            state_manager.update_status(execution_id, ExecutionStatus.CANCELLED)
            logger.info("Execution cancelled", execution_id=execution_id)
            return True
        
        return False


# Global orchestrator instance
orchestrator = WorkflowOrchestrator()
