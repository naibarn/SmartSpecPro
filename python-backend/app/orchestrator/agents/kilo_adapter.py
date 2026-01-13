"""
SmartSpec Pro - Kilo Code Adapter
Phase 1.1: Supervisor & Kilo Integration

Adapter layer between Supervisor Agent and Kilo Code Session Manager.
Provides a clean interface for the Supervisor to interact with Kilo.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog

from app.services.kilo_session_manager import (
    KiloSessionManager,
    KiloSession,
    KiloMode,
    KiloSessionStatus,
    KiloCheckpoint,
    KiloTask,
)
from app.services.kilo_state_sync import (
    KiloStateSync,
    CheckpointMapping,
    TaskMapping,
    SyncDirection,
)

logger = structlog.get_logger()


# ==================== DATA CLASSES ====================

@dataclass
class KiloExecutionRequest:
    """Request to execute a task in Kilo."""
    request_id: str = field(default_factory=lambda: str(uuid4()))
    project_id: str = ""
    user_id: str = ""
    prompt: str = ""
    mode: KiloMode = KiloMode.ORCHESTRATOR
    context: Dict[str, Any] = field(default_factory=dict)
    timeout_seconds: int = 300
    max_tokens: int = 10000
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "prompt": self.prompt,
            "mode": self.mode.value,
            "context": self.context,
            "timeout_seconds": self.timeout_seconds,
            "max_tokens": self.max_tokens,
        }


@dataclass
class KiloExecutionResult:
    """Result from Kilo execution."""
    request_id: str
    session_id: str
    success: bool
    output: str = ""
    files_created: List[str] = field(default_factory=list)
    files_modified: List[str] = field(default_factory=list)
    checkpoint: Optional[KiloCheckpoint] = None
    tokens_used: int = 0
    cost: float = 0.0
    duration_ms: int = 0
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "session_id": self.session_id,
            "success": self.success,
            "output": self.output,
            "files_created": self.files_created,
            "files_modified": self.files_modified,
            "checkpoint": self.checkpoint.to_dict() if self.checkpoint else None,
            "tokens_used": self.tokens_used,
            "cost": self.cost,
            "duration_ms": self.duration_ms,
            "error": self.error,
        }


# ==================== KILO ADAPTER ====================

class KiloAdapter:
    """
    Adapter for Kilo Code integration.
    
    Provides a clean interface between the Supervisor Agent and Kilo Code,
    handling session management, state synchronization, and result processing.
    """
    
    def __init__(
        self,
        session_manager: Optional[KiloSessionManager] = None,
        state_sync: Optional[KiloStateSync] = None,
    ):
        """Initialize the Kilo Adapter."""
        self.session_manager = session_manager or KiloSessionManager()
        self.state_sync = state_sync or KiloStateSync()
        self._sessions: Dict[str, KiloSession] = {}
        
        logger.info("kilo_adapter_initialized")
    
    async def execute(self, request: KiloExecutionRequest) -> KiloExecutionResult:
        """
        Execute a task in Kilo Code.
        
        Args:
            request: The execution request
            
        Returns:
            KiloExecutionResult with the outcome
        """
        start_time = datetime.utcnow()
        
        try:
            # Step 1: Get or create session
            session = await self._ensure_session(
                project_id=request.project_id,
                mode=request.mode,
            )
            
            logger.info(
                "kilo_execution_started",
                request_id=request.request_id,
                session_id=session.session_id,
                mode=request.mode.value,
            )
            
            # Step 2: Execute the task
            result = await self._execute_in_session(session, request)
            
            # Step 3: Sync state
            await self._sync_state(session, request, result)
            
            # Step 4: Calculate duration
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            result.duration_ms = duration_ms
            
            logger.info(
                "kilo_execution_completed",
                request_id=request.request_id,
                success=result.success,
                duration_ms=duration_ms,
            )
            
            return result
            
        except asyncio.TimeoutError:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error("kilo_execution_timeout", request_id=request.request_id)
            
            return KiloExecutionResult(
                request_id=request.request_id,
                session_id="",
                success=False,
                error=f"Execution timed out after {request.timeout_seconds} seconds",
                duration_ms=duration_ms,
            )
            
        except Exception as e:
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            logger.error("kilo_execution_error", request_id=request.request_id, error=str(e))
            
            return KiloExecutionResult(
                request_id=request.request_id,
                session_id="",
                success=False,
                error=str(e),
                duration_ms=duration_ms,
            )
    
    async def _ensure_session(
        self,
        project_id: str,
        mode: KiloMode,
    ) -> KiloSession:
        """Ensure a Kilo session exists for the project and mode."""
        session_key = f"{project_id}:{mode.value}"
        
        # Check for existing session
        if session_key in self._sessions:
            session = self._sessions[session_key]
            
            # Verify session is still active
            if await self._is_session_active(session):
                return session
            else:
                # Remove stale session
                del self._sessions[session_key]
        
        # Create new session
        session = await self.session_manager.create_session(
            project_id=project_id,
            mode=mode,
        )
        
        self._sessions[session_key] = session
        return session
    
    async def _is_session_active(self, session: KiloSession) -> bool:
        """Check if a Kilo session is still active."""
        try:
            status = await self.session_manager.get_session_status(session.session_id)
            return status in [
                KiloSessionStatus.RUNNING,
                KiloSessionStatus.IDLE,
            ]
        except Exception:
            return False
    
    async def _execute_in_session(
        self,
        session: KiloSession,
        request: KiloExecutionRequest,
    ) -> KiloExecutionResult:
        """Execute a task within a Kilo session."""
        try:
            # Prepare context for Kilo
            kilo_context = self._prepare_context(request)
            
            # Execute with timeout
            result = await asyncio.wait_for(
                self.session_manager.execute_task(
                    session_id=session.session_id,
                    prompt=request.prompt,
                    context=kilo_context,
                ),
                timeout=request.timeout_seconds,
            )
            
            # Parse result
            return self._parse_kilo_result(request, session, result)
            
        except asyncio.TimeoutError:
            raise
        except Exception as e:
            logger.error(
                "kilo_session_execution_error",
                session_id=session.session_id,
                error=str(e),
            )
            raise
    
    def _prepare_context(self, request: KiloExecutionRequest) -> Dict[str, Any]:
        """Prepare context for Kilo execution."""
        context = {
            "request_id": request.request_id,
            "user_id": request.user_id,
            "max_tokens": request.max_tokens,
            **request.context,
        }
        
        # Add mode-specific context
        if request.mode == KiloMode.ARCHITECT:
            context["output_format"] = "spec_plan_tasks"
            context["generate_files"] = ["spec.md", "plan.md", "tasks.md"]
        elif request.mode == KiloMode.CODE:
            context["output_format"] = "code"
        elif request.mode == KiloMode.DEBUG:
            context["output_format"] = "debug_analysis"
        
        return context
    
    def _parse_kilo_result(
        self,
        request: KiloExecutionRequest,
        session: KiloSession,
        raw_result: Dict[str, Any],
    ) -> KiloExecutionResult:
        """Parse raw Kilo result into structured format."""
        return KiloExecutionResult(
            request_id=request.request_id,
            session_id=session.session_id,
            success=raw_result.get("success", False),
            output=raw_result.get("output", ""),
            files_created=raw_result.get("files_created", []),
            files_modified=raw_result.get("files_modified", []),
            checkpoint=self._parse_checkpoint(raw_result.get("checkpoint")),
            tokens_used=raw_result.get("tokens_used", 0),
            cost=raw_result.get("cost", 0.0),
        )
    
    def _parse_checkpoint(self, checkpoint_data: Optional[Dict]) -> Optional[KiloCheckpoint]:
        """Parse checkpoint data from Kilo result."""
        if not checkpoint_data:
            return None
        
        return KiloCheckpoint(
            hash=checkpoint_data.get("hash", ""),
            timestamp=datetime.fromisoformat(checkpoint_data.get("timestamp", datetime.utcnow().isoformat())),
            message=checkpoint_data.get("message", ""),
            is_auto_saved=checkpoint_data.get("is_auto_saved", False),
        )
    
    async def _sync_state(
        self,
        session: KiloSession,
        request: KiloExecutionRequest,
        result: KiloExecutionResult,
    ):
        """Synchronize state after Kilo execution."""
        try:
            if result.success and result.checkpoint:
                # Create checkpoint mapping
                await self.state_sync.create_checkpoint_mapping(
                    execution_id=request.request_id,
                    step_id=f"{request.request_id}_step_1",
                    kilo_checkpoint_hash=result.checkpoint.hash,
                )
                
                # Create task mapping
                await self.state_sync.create_task_mapping(
                    execution_id=request.request_id,
                    step_id=f"{request.request_id}_step_1",
                    kilo_task_id=session.session_id,
                    prompt=request.prompt,
                    result=result.output,
                    success=result.success,
                )
                
                logger.debug(
                    "state_synced",
                    request_id=request.request_id,
                    checkpoint_hash=result.checkpoint.hash,
                )
                
        except Exception as e:
            # State sync failure should not fail the overall execution
            logger.warning(
                "state_sync_failed",
                request_id=request.request_id,
                error=str(e),
            )
    
    async def get_session_history(
        self,
        project_id: str,
        mode: Optional[KiloMode] = None,
    ) -> List[KiloTask]:
        """Get task history for a project."""
        session_key = f"{project_id}:{mode.value}" if mode else None
        
        if session_key and session_key in self._sessions:
            session = self._sessions[session_key]
            return await self.session_manager.get_task_history(session.session_id)
        
        return []
    
    async def restore_checkpoint(
        self,
        project_id: str,
        checkpoint_hash: str,
    ) -> bool:
        """Restore a project to a specific checkpoint."""
        try:
            # Find the session for this project
            for key, session in self._sessions.items():
                if key.startswith(f"{project_id}:"):
                    await self.session_manager.restore_checkpoint(
                        session_id=session.session_id,
                        checkpoint_hash=checkpoint_hash,
                    )
                    return True
            
            return False
            
        except Exception as e:
            logger.error(
                "checkpoint_restore_failed",
                project_id=project_id,
                checkpoint_hash=checkpoint_hash,
                error=str(e),
            )
            return False
    
    async def cleanup(self):
        """Cleanup all sessions."""
        for session in self._sessions.values():
            try:
                await self.session_manager.stop_session(session.session_id)
            except Exception as e:
                logger.warning(
                    "session_cleanup_failed",
                    session_id=session.session_id,
                    error=str(e),
                )
        
        self._sessions.clear()
        logger.info("kilo_adapter_cleanup_complete")
