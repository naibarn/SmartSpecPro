"""
SmartSpec Pro - Kilo Code CLI Session Manager
Phase 2.1

Manages Kilo Code CLI sessions for AI-assisted code generation
and task execution.
"""

import asyncio
import json
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, AsyncGenerator
from uuid import uuid4

import structlog

from app.services.docker_executor import (
    DockerExecutor,
    DockerConfig,
    DockerExecutionMode,
    get_docker_executor,
)

logger = structlog.get_logger()


# ==================== ENUMS ====================

class KiloMode(str, Enum):
    """Kilo Code CLI modes."""
    ARCHITECT = "architect"
    CODE = "code"
    DEBUG = "debug"
    ASK = "ask"
    ORCHESTRATOR = "orchestrator"


class KiloSessionStatus(str, Enum):
    """Session status."""
    CREATED = "created"
    STARTING = "starting"
    RUNNING = "running"
    IDLE = "idle"
    EXECUTING = "executing"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


class KiloExitCode(int, Enum):
    """Kilo CLI exit codes."""
    SUCCESS = 0
    ERROR = 1
    TIMEOUT = 124


# ==================== DATA CLASSES ====================

@dataclass
class KiloCheckpoint:
    """Represents a Kilo Code checkpoint."""
    hash: str
    timestamp: datetime
    message: str
    is_auto_saved: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "hash": self.hash,
            "timestamp": self.timestamp.isoformat(),
            "message": self.message,
            "is_auto_saved": self.is_auto_saved,
        }


@dataclass
class KiloTask:
    """Represents a Kilo Code task."""
    task_id: str
    description: str
    timestamp: datetime
    cost: float = 0.0
    tokens_used: int = 0
    is_favorite: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "description": self.description,
            "timestamp": self.timestamp.isoformat(),
            "cost": self.cost,
            "tokens_used": self.tokens_used,
            "is_favorite": self.is_favorite,
        }


@dataclass
class KiloResult:
    """Result from Kilo Code CLI execution."""
    success: bool
    exit_code: int
    output: str
    error: Optional[str] = None
    json_data: Optional[Dict[str, Any]] = None
    duration_seconds: float = 0.0
    tokens_used: int = 0
    cost: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "exit_code": self.exit_code,
            "output": self.output,
            "error": self.error,
            "json_data": self.json_data,
            "duration_seconds": self.duration_seconds,
            "tokens_used": self.tokens_used,
            "cost": self.cost,
        }


@dataclass
class KiloSession:
    """Represents a Kilo Code CLI session."""
    session_id: str
    workspace: str
    mode: KiloMode
    status: KiloSessionStatus = KiloSessionStatus.CREATED
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    process: Optional[asyncio.subprocess.Process] = None
    task_history: List[KiloTask] = field(default_factory=list)
    checkpoints: List[KiloCheckpoint] = field(default_factory=list)
    auto_approval_enabled: bool = True
    timeout: int = 300
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "workspace": self.workspace,
            "mode": self.mode.value,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "task_count": len(self.task_history),
            "checkpoint_count": len(self.checkpoints),
            "auto_approval_enabled": self.auto_approval_enabled,
            "timeout": self.timeout,
        }


# ==================== CONFIGURATION ====================

@dataclass
class KiloConfig:
    """Configuration for Kilo Code CLI."""
    cli_path: str = "kilocode"  # Path to kilocode CLI
    default_mode: KiloMode = KiloMode.CODE
    default_timeout: int = 300
    auto_approval: bool = True
    json_output: bool = True
    parallel_mode: bool = False
    
    # Auto-approval settings
    auto_approve_read: bool = True
    auto_approve_write: bool = True
    auto_approve_execute: bool = True
    allowed_commands: List[str] = field(default_factory=lambda: ["npm", "git", "pnpm", "python", "pip"])
    denied_commands: List[str] = field(default_factory=lambda: ["rm -rf", "sudo"])
    
    # Docker execution settings
    use_docker: bool = False  # Enable Docker execution
    docker_container: str = "smartspec-dev"  # Container name
    docker_user: str = "devuser"  # User in container
    docker_workdir: str = "/workspace"  # Working directory in container
    docker_mode: DockerExecutionMode = DockerExecutionMode.AUTO  # Execution mode
    
    def to_config_dict(self) -> Dict[str, Any]:
        """Convert to Kilo config.json format."""
        return {
            "autoApproval": {
                "enabled": self.auto_approval,
                "read": {
                    "enabled": self.auto_approve_read,
                    "outside": False,
                },
                "write": {
                    "enabled": self.auto_approve_write,
                    "outside": False,
                    "protected": False,
                },
                "execute": {
                    "enabled": self.auto_approve_execute,
                    "allowed": self.allowed_commands,
                    "denied": self.denied_commands,
                },
                "browser": {"enabled": False},
                "mcp": {"enabled": True},
                "mode": {"enabled": True},
                "subtasks": {"enabled": True},
            }
        }


# ==================== SESSION MANAGER ====================

class KiloSessionManager:
    """
    Manages Kilo Code CLI sessions.
    
    This service handles:
    - Starting and stopping Kilo CLI sessions
    - Executing tasks in autonomous mode
    - Managing checkpoints
    - Tracking task history
    - Injecting skills
    """
    
    def __init__(self, config: Optional[KiloConfig] = None):
        """
        Initialize the session manager.
        
        Args:
            config: Kilo configuration
        """
        self.config = config or KiloConfig()
        self._sessions: Dict[str, KiloSession] = {}
        self._cli_available: Optional[bool] = None
        
        # Initialize Docker executor if enabled
        self._docker_executor: Optional[DockerExecutor] = None
        if self.config.use_docker:
            docker_config = DockerConfig(
                container_name=self.config.docker_container,
                user=self.config.docker_user,
                workdir=self.config.docker_workdir,
                mode=self.config.docker_mode,
            )
            self._docker_executor = DockerExecutor(docker_config)
        
        logger.info(
            "Kilo session manager initialized",
            cli_path=self.config.cli_path,
            default_mode=self.config.default_mode.value,
            use_docker=self.config.use_docker,
        )
    
    async def check_cli_available(self) -> bool:
        """
        Check if Kilo Code CLI is available.
        
        Returns:
            True if CLI is available
        """
        if self._cli_available is not None:
            return self._cli_available
        
        try:
            process = await asyncio.create_subprocess_exec(
                self.config.cli_path, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=10,
            )
            
            self._cli_available = process.returncode == 0
            
            if self._cli_available:
                version = stdout.decode().strip()
                logger.info("Kilo CLI available", version=version)
            else:
                logger.warning(
                    "Kilo CLI not available",
                    stderr=stderr.decode().strip(),
                )
            
            return self._cli_available
        except FileNotFoundError:
            logger.warning("Kilo CLI not found", cli_path=self.config.cli_path)
            self._cli_available = False
            return False
        except asyncio.TimeoutError:
            logger.warning("Kilo CLI check timed out")
            self._cli_available = False
            return False
        except Exception as e:
            logger.error("Error checking Kilo CLI", error=str(e))
            self._cli_available = False
            return False
    
    async def create_session(
        self,
        workspace: str,
        mode: Optional[KiloMode] = None,
        timeout: Optional[int] = None,
        auto_approval: Optional[bool] = None,
    ) -> KiloSession:
        """
        Create a new Kilo session.
        
        Args:
            workspace: Path to workspace directory
            mode: Kilo mode (default: code)
            timeout: Timeout in seconds (default: 300)
            auto_approval: Enable auto-approval (default: True)
        
        Returns:
            Created KiloSession
        """
        # Validate workspace
        workspace_path = Path(workspace).resolve()
        if not workspace_path.exists():
            raise ValueError(f"Workspace does not exist: {workspace}")
        if not workspace_path.is_dir():
            raise ValueError(f"Workspace is not a directory: {workspace}")
        
        # Create session
        session = KiloSession(
            session_id=str(uuid4()),
            workspace=str(workspace_path),
            mode=mode or self.config.default_mode,
            timeout=timeout or self.config.default_timeout,
            auto_approval_enabled=auto_approval if auto_approval is not None else self.config.auto_approval,
        )
        
        self._sessions[session.session_id] = session
        
        logger.info(
            "Kilo session created",
            session_id=session.session_id,
            workspace=session.workspace,
            mode=session.mode.value,
        )
        
        return session
    
    def get_session(self, session_id: str) -> Optional[KiloSession]:
        """Get a session by ID."""
        return self._sessions.get(session_id)
    
    def list_sessions(self) -> List[KiloSession]:
        """List all active sessions."""
        return list(self._sessions.values())
    
    async def execute_task(
        self,
        session: KiloSession,
        prompt: str,
        json_output: bool = True,
        timeout: Optional[int] = None,
        parallel: bool = False,
    ) -> KiloResult:
        """
        Execute a task in the Kilo session.
        
        Args:
            session: The Kilo session
            prompt: Task prompt/description
            json_output: Return JSON output (default: True)
            timeout: Override timeout (optional)
            parallel: Run in parallel mode (optional)
        
        Returns:
            KiloResult with execution results
        """
        if session.status == KiloSessionStatus.STOPPED:
            raise ValueError("Session is stopped")
        
        session.status = KiloSessionStatus.EXECUTING
        session.last_activity = datetime.utcnow()
        start_time = datetime.utcnow()
        
        # Build command
        cmd = [self.config.cli_path]
        
        # Add workspace
        cmd.extend(["--workspace", session.workspace])
        
        # Add mode
        cmd.extend(["--mode", session.mode.value])
        
        # Add auto mode
        cmd.append("--auto")
        
        # Add JSON output if requested
        if json_output:
            cmd.append("--json")
        
        # Add parallel mode if requested
        if parallel:
            cmd.append("--parallel")
        
        # Add timeout
        task_timeout = timeout or session.timeout
        cmd.extend(["--timeout", str(task_timeout)])
        
        # Add prompt
        cmd.append(prompt)
        
        logger.info(
            "Executing Kilo task",
            session_id=session.session_id,
            prompt=prompt[:100],
            json_output=json_output,
            use_docker=self._docker_executor is not None,
        )
        
        try:
            # Execute command - either via Docker or directly
            if self._docker_executor:
                # Execute via Docker
                exit_code, output, error = await self._docker_executor.execute(
                    command=cmd,
                    cwd=session.workspace,
                    timeout=task_timeout + 30,
                )
                
                if exit_code == 124:  # Timeout
                    session.status = KiloSessionStatus.IDLE
                    return KiloResult(
                        success=False,
                        exit_code=KiloExitCode.TIMEOUT,
                        output="",
                        error="Task execution timed out",
                        duration_seconds=(datetime.utcnow() - start_time).total_seconds(),
                    )
            else:
                # Execute directly on host
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=session.workspace,
                )
                
                session.process = process
                
                # Wait for completion with timeout
                try:
                    stdout_bytes, stderr_bytes = await asyncio.wait_for(
                        process.communicate(),
                        timeout=task_timeout + 30,  # Extra buffer
                    )
                    output = stdout_bytes.decode()
                    error = stderr_bytes.decode() if stderr_bytes else None
                    exit_code = process.returncode
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
                    
                    session.status = KiloSessionStatus.IDLE
                    
                    return KiloResult(
                        success=False,
                        exit_code=KiloExitCode.TIMEOUT,
                        output="",
                        error="Task execution timed out",
                        duration_seconds=(datetime.utcnow() - start_time).total_seconds(),
                    )
            
            # Parse JSON if requested
            json_data = None
            if json_output and output:
                try:
                    json_data = json.loads(output)
                except json.JSONDecodeError:
                    # Output might not be pure JSON
                    pass
            
            # Determine success
            exit_code = process.returncode
            success = exit_code == KiloExitCode.SUCCESS
            
            # Extract metrics from JSON if available
            tokens_used = 0
            cost = 0.0
            if json_data:
                tokens_used = json_data.get("tokens_used", 0)
                cost = json_data.get("cost", 0.0)
            
            # Create task record
            task = KiloTask(
                task_id=str(uuid4()),
                description=prompt[:200],
                timestamp=datetime.utcnow(),
                cost=cost,
                tokens_used=tokens_used,
            )
            session.task_history.append(task)
            
            session.status = KiloSessionStatus.IDLE
            session.last_activity = datetime.utcnow()
            
            result = KiloResult(
                success=success,
                exit_code=exit_code,
                output=output,
                error=error if error else None,
                json_data=json_data,
                duration_seconds=(datetime.utcnow() - start_time).total_seconds(),
                tokens_used=tokens_used,
                cost=cost,
            )
            
            logger.info(
                "Kilo task completed",
                session_id=session.session_id,
                success=success,
                exit_code=exit_code,
                duration=result.duration_seconds,
            )
            
            return result
            
        except Exception as e:
            session.status = KiloSessionStatus.ERROR
            
            logger.error(
                "Kilo task execution failed",
                session_id=session.session_id,
                error=str(e),
            )
            
            return KiloResult(
                success=False,
                exit_code=KiloExitCode.ERROR,
                output="",
                error=str(e),
                duration_seconds=(datetime.utcnow() - start_time).total_seconds(),
            )
    
    async def execute_task_streaming(
        self,
        session: KiloSession,
        prompt: str,
        timeout: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Execute a task with streaming output.
        
        Args:
            session: The Kilo session
            prompt: Task prompt/description
            timeout: Override timeout (optional)
        
        Yields:
            Output chunks as they are generated
        """
        if session.status == KiloSessionStatus.STOPPED:
            raise ValueError("Session is stopped")
        
        session.status = KiloSessionStatus.EXECUTING
        session.last_activity = datetime.utcnow()
        
        # Build command (no JSON for streaming)
        cmd = [self.config.cli_path]
        cmd.extend(["--workspace", session.workspace])
        cmd.extend(["--mode", session.mode.value])
        cmd.append("--auto")
        
        task_timeout = timeout or session.timeout
        cmd.extend(["--timeout", str(task_timeout)])
        cmd.append(prompt)
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=session.workspace,
            )
            
            session.process = process
            
            # Stream stdout
            while True:
                line = await asyncio.wait_for(
                    process.stdout.readline(),
                    timeout=task_timeout,
                )
                
                if not line:
                    break
                
                yield line.decode()
            
            await process.wait()
            
            session.status = KiloSessionStatus.IDLE
            session.last_activity = datetime.utcnow()
            
        except asyncio.TimeoutError:
            if session.process:
                session.process.kill()
            session.status = KiloSessionStatus.IDLE
            yield "Error: Task execution timed out\n"
        except Exception as e:
            session.status = KiloSessionStatus.ERROR
            yield f"Error: {str(e)}\n"
    
    async def get_checkpoints(self, session: KiloSession) -> List[KiloCheckpoint]:
        """
        Get checkpoints for a session.
        
        Args:
            session: The Kilo session
        
        Returns:
            List of checkpoints
        """
        # Use git to list commits (Kilo checkpoints are git commits)
        try:
            process = await asyncio.create_subprocess_exec(
                "git", "log", "--oneline", "-n", "50",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=session.workspace,
            )
            
            stdout, _ = await process.communicate()
            
            checkpoints = []
            for line in stdout.decode().strip().split("\n"):
                if line:
                    parts = line.split(" ", 1)
                    if len(parts) >= 2:
                        hash_short = parts[0]
                        message = parts[1]
                        
                        checkpoints.append(KiloCheckpoint(
                            hash=hash_short,
                            timestamp=datetime.utcnow(),  # Would need git log --format for actual time
                            message=message,
                            is_auto_saved="[auto-saved]" in message,
                        ))
            
            session.checkpoints = checkpoints
            return checkpoints
            
        except Exception as e:
            logger.error("Failed to get checkpoints", error=str(e))
            return []
    
    async def restore_checkpoint(
        self,
        session: KiloSession,
        checkpoint_hash: str,
    ) -> bool:
        """
        Restore a checkpoint.
        
        WARNING: This is a destructive action that performs a git hard reset.
        
        Args:
            session: The Kilo session
            checkpoint_hash: Git commit hash to restore
        
        Returns:
            True if successful
        """
        try:
            # Execute git reset
            process = await asyncio.create_subprocess_exec(
                "git", "reset", "--hard", checkpoint_hash,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=session.workspace,
            )
            
            _, stderr = await process.communicate()
            
            if process.returncode == 0:
                logger.info(
                    "Checkpoint restored",
                    session_id=session.session_id,
                    checkpoint=checkpoint_hash,
                )
                return True
            else:
                logger.error(
                    "Failed to restore checkpoint",
                    error=stderr.decode(),
                )
                return False
                
        except Exception as e:
            logger.error("Checkpoint restoration failed", error=str(e))
            return False
    
    async def get_task_history(
        self,
        session: KiloSession,
        limit: int = 20,
    ) -> List[KiloTask]:
        """
        Get task history for a session.
        
        Args:
            session: The Kilo session
            limit: Maximum number of tasks to return
        
        Returns:
            List of tasks
        """
        return session.task_history[-limit:]
    
    async def close_session(self, session: KiloSession) -> None:
        """
        Close a Kilo session.
        
        Args:
            session: The session to close
        """
        session.status = KiloSessionStatus.STOPPING
        
        # Kill process if running
        if session.process and session.process.returncode is None:
            session.process.terminate()
            try:
                await asyncio.wait_for(session.process.wait(), timeout=5)
            except asyncio.TimeoutError:
                session.process.kill()
        
        session.status = KiloSessionStatus.STOPPED
        session.last_activity = datetime.utcnow()
        
        logger.info(
            "Kilo session closed",
            session_id=session.session_id,
        )
    
    async def close_all_sessions(self) -> None:
        """Close all active sessions."""
        for session in self._sessions.values():
            if session.status != KiloSessionStatus.STOPPED:
                await self.close_session(session)
    
    def remove_session(self, session_id: str) -> bool:
        """
        Remove a session from the manager.
        
        Args:
            session_id: Session ID to remove
        
        Returns:
            True if removed
        """
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False


# ==================== GLOBAL INSTANCE ====================

_session_manager: Optional[KiloSessionManager] = None


def get_kilo_session_manager(
    config: Optional[KiloConfig] = None,
    force_new: bool = False,
) -> KiloSessionManager:
    """
    Get the global Kilo session manager instance.
    
    Args:
        config: Optional configuration
        force_new: Force creation of new instance
    
    Returns:
        KiloSessionManager instance
    """
    global _session_manager
    
    if _session_manager is None or force_new:
        _session_manager = KiloSessionManager(config)
    
    return _session_manager


def reset_kilo_session_manager() -> None:
    """Reset the global session manager instance."""
    global _session_manager
    _session_manager = None
