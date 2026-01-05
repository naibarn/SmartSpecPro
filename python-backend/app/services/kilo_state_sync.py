"""
SmartSpec Pro - Kilo Code State Synchronization
Phase 2.4

Manages state synchronization between SmartSpec and Kilo Code CLI.
Handles checkpoint tracking, task history sync, and state recovery.
"""

import asyncio
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import structlog

from app.services.kilo_session_manager import (
    KiloSession,
    KiloCheckpoint,
    KiloTask,
    KiloSessionStatus,
)

logger = structlog.get_logger()


# ==================== ENUMS ====================

class SyncStatus(str, Enum):
    """State synchronization status."""
    SYNCED = "synced"
    PENDING = "pending"
    CONFLICT = "conflict"
    ERROR = "error"


class SyncDirection(str, Enum):
    """Synchronization direction."""
    SMARTSPEC_TO_KILO = "smartspec_to_kilo"
    KILO_TO_SMARTSPEC = "kilo_to_smartspec"
    BIDIRECTIONAL = "bidirectional"


# ==================== DATA CLASSES ====================

@dataclass
class CheckpointMapping:
    """Maps SmartSpec execution state to Kilo checkpoint."""
    execution_id: str
    step_id: str
    kilo_checkpoint_hash: str
    smartspec_checkpoint_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    sync_status: SyncStatus = SyncStatus.SYNCED
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "step_id": self.step_id,
            "kilo_checkpoint_hash": self.kilo_checkpoint_hash,
            "smartspec_checkpoint_id": self.smartspec_checkpoint_id,
            "created_at": self.created_at.isoformat(),
            "sync_status": self.sync_status.value,
        }


@dataclass
class TaskMapping:
    """Maps SmartSpec workflow step to Kilo task."""
    execution_id: str
    step_id: str
    kilo_task_id: str
    prompt: str
    result: Optional[str] = None
    success: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "step_id": self.step_id,
            "kilo_task_id": self.kilo_task_id,
            "prompt": self.prompt,
            "result": self.result,
            "success": self.success,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class SyncState:
    """Represents the synchronization state for an execution."""
    execution_id: str
    workspace: str
    checkpoint_mappings: List[CheckpointMapping] = field(default_factory=list)
    task_mappings: List[TaskMapping] = field(default_factory=list)
    last_sync: Optional[datetime] = None
    sync_status: SyncStatus = SyncStatus.SYNCED
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "workspace": self.workspace,
            "checkpoint_mappings": [m.to_dict() for m in self.checkpoint_mappings],
            "task_mappings": [m.to_dict() for m in self.task_mappings],
            "last_sync": self.last_sync.isoformat() if self.last_sync else None,
            "sync_status": self.sync_status.value,
        }
    
    def add_checkpoint_mapping(
        self,
        step_id: str,
        kilo_checkpoint_hash: str,
        smartspec_checkpoint_id: Optional[str] = None,
    ) -> CheckpointMapping:
        """Add a checkpoint mapping."""
        mapping = CheckpointMapping(
            execution_id=self.execution_id,
            step_id=step_id,
            kilo_checkpoint_hash=kilo_checkpoint_hash,
            smartspec_checkpoint_id=smartspec_checkpoint_id,
        )
        self.checkpoint_mappings.append(mapping)
        return mapping
    
    def add_task_mapping(
        self,
        step_id: str,
        kilo_task_id: str,
        prompt: str,
        result: Optional[str] = None,
        success: bool = False,
    ) -> TaskMapping:
        """Add a task mapping."""
        mapping = TaskMapping(
            execution_id=self.execution_id,
            step_id=step_id,
            kilo_task_id=kilo_task_id,
            prompt=prompt,
            result=result,
            success=success,
        )
        self.task_mappings.append(mapping)
        return mapping
    
    def get_checkpoint_for_step(self, step_id: str) -> Optional[CheckpointMapping]:
        """Get checkpoint mapping for a step."""
        for mapping in reversed(self.checkpoint_mappings):
            if mapping.step_id == step_id:
                return mapping
        return None
    
    def get_latest_checkpoint(self) -> Optional[CheckpointMapping]:
        """Get the latest checkpoint mapping."""
        if self.checkpoint_mappings:
            return self.checkpoint_mappings[-1]
        return None


# ==================== STATE SYNC SERVICE ====================

class KiloStateSync:
    """
    Manages state synchronization between SmartSpec and Kilo Code.
    
    This service handles:
    - Tracking checkpoint mappings
    - Synchronizing task history
    - State recovery and rollback
    - Conflict resolution
    """
    
    def __init__(self, state_dir: Optional[str] = None):
        """
        Initialize the state sync service.
        
        Args:
            state_dir: Directory to store sync state files
        """
        self.state_dir = Path(state_dir or os.path.expanduser("~/.smartspec/kilo_sync"))
        self.state_dir.mkdir(parents=True, exist_ok=True)
        
        self._sync_states: Dict[str, SyncState] = {}
        
        logger.info(
            "Kilo state sync initialized",
            state_dir=str(self.state_dir),
        )
    
    def _get_state_file(self, execution_id: str) -> Path:
        """Get the state file path for an execution."""
        return self.state_dir / f"{execution_id}.json"
    
    def create_sync_state(
        self,
        execution_id: str,
        workspace: str,
    ) -> SyncState:
        """
        Create a new sync state for an execution.
        
        Args:
            execution_id: Workflow execution ID
            workspace: Workspace directory
        
        Returns:
            Created SyncState
        """
        state = SyncState(
            execution_id=execution_id,
            workspace=workspace,
        )
        
        self._sync_states[execution_id] = state
        
        logger.info(
            "Sync state created",
            execution_id=execution_id,
        )
        
        return state
    
    def get_sync_state(self, execution_id: str) -> Optional[SyncState]:
        """
        Get sync state for an execution.
        
        Args:
            execution_id: Workflow execution ID
        
        Returns:
            SyncState if found
        """
        # Check memory first
        if execution_id in self._sync_states:
            return self._sync_states[execution_id]
        
        # Try to load from file
        state_file = self._get_state_file(execution_id)
        if state_file.exists():
            return self._load_state(execution_id)
        
        return None
    
    def _load_state(self, execution_id: str) -> Optional[SyncState]:
        """Load sync state from file."""
        state_file = self._get_state_file(execution_id)
        
        try:
            with open(state_file, 'r') as f:
                data = json.load(f)
            
            state = SyncState(
                execution_id=data["execution_id"],
                workspace=data["workspace"],
                last_sync=datetime.fromisoformat(data["last_sync"]) if data.get("last_sync") else None,
                sync_status=SyncStatus(data.get("sync_status", "synced")),
            )
            
            # Load checkpoint mappings
            for cp_data in data.get("checkpoint_mappings", []):
                state.checkpoint_mappings.append(CheckpointMapping(
                    execution_id=cp_data["execution_id"],
                    step_id=cp_data["step_id"],
                    kilo_checkpoint_hash=cp_data["kilo_checkpoint_hash"],
                    smartspec_checkpoint_id=cp_data.get("smartspec_checkpoint_id"),
                    created_at=datetime.fromisoformat(cp_data["created_at"]),
                    sync_status=SyncStatus(cp_data.get("sync_status", "synced")),
                ))
            
            # Load task mappings
            for task_data in data.get("task_mappings", []):
                state.task_mappings.append(TaskMapping(
                    execution_id=task_data["execution_id"],
                    step_id=task_data["step_id"],
                    kilo_task_id=task_data["kilo_task_id"],
                    prompt=task_data["prompt"],
                    result=task_data.get("result"),
                    success=task_data.get("success", False),
                    created_at=datetime.fromisoformat(task_data["created_at"]),
                ))
            
            self._sync_states[execution_id] = state
            return state
            
        except Exception as e:
            logger.error(
                "Failed to load sync state",
                execution_id=execution_id,
                error=str(e),
            )
            return None
    
    def save_state(self, execution_id: str) -> bool:
        """
        Save sync state to file.
        
        Args:
            execution_id: Workflow execution ID
        
        Returns:
            True if saved successfully
        """
        state = self._sync_states.get(execution_id)
        if not state:
            return False
        
        state_file = self._get_state_file(execution_id)
        
        try:
            with open(state_file, 'w') as f:
                json.dump(state.to_dict(), f, indent=2)
            
            logger.debug(
                "Sync state saved",
                execution_id=execution_id,
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "Failed to save sync state",
                execution_id=execution_id,
                error=str(e),
            )
            return False
    
    async def record_checkpoint(
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
        state = self.get_sync_state(execution_id)
        if not state:
            logger.warning(
                "No sync state found for execution",
                execution_id=execution_id,
            )
            return None
        
        mapping = state.add_checkpoint_mapping(
            step_id=step_id,
            kilo_checkpoint_hash=kilo_checkpoint_hash,
            smartspec_checkpoint_id=smartspec_checkpoint_id,
        )
        
        state.last_sync = datetime.utcnow()
        self.save_state(execution_id)
        
        logger.info(
            "Checkpoint recorded",
            execution_id=execution_id,
            step_id=step_id,
            kilo_hash=kilo_checkpoint_hash,
        )
        
        return mapping
    
    async def record_task(
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
        state = self.get_sync_state(execution_id)
        if not state:
            logger.warning(
                "No sync state found for execution",
                execution_id=execution_id,
            )
            return None
        
        mapping = state.add_task_mapping(
            step_id=step_id,
            kilo_task_id=kilo_task_id,
            prompt=prompt,
            result=result,
            success=success,
        )
        
        state.last_sync = datetime.utcnow()
        self.save_state(execution_id)
        
        logger.info(
            "Task recorded",
            execution_id=execution_id,
            step_id=step_id,
            kilo_task_id=kilo_task_id,
        )
        
        return mapping
    
    async def get_rollback_point(
        self,
        execution_id: str,
        step_id: str,
    ) -> Optional[Tuple[str, str]]:
        """
        Get the rollback point for a step.
        
        Returns the Kilo checkpoint hash and SmartSpec checkpoint ID
        that can be used to rollback to the state before the step.
        
        Args:
            execution_id: Workflow execution ID
            step_id: Step ID to rollback to
        
        Returns:
            Tuple of (kilo_hash, smartspec_id) or None
        """
        state = self.get_sync_state(execution_id)
        if not state:
            return None
        
        mapping = state.get_checkpoint_for_step(step_id)
        if mapping:
            return (mapping.kilo_checkpoint_hash, mapping.smartspec_checkpoint_id)
        
        return None
    
    async def sync_checkpoints_from_kilo(
        self,
        execution_id: str,
        kilo_checkpoints: List[KiloCheckpoint],
    ) -> int:
        """
        Sync checkpoints from Kilo to SmartSpec.
        
        Args:
            execution_id: Workflow execution ID
            kilo_checkpoints: List of Kilo checkpoints
        
        Returns:
            Number of new checkpoints synced
        """
        state = self.get_sync_state(execution_id)
        if not state:
            return 0
        
        # Get existing checkpoint hashes
        existing_hashes = {
            m.kilo_checkpoint_hash for m in state.checkpoint_mappings
        }
        
        # Add new checkpoints
        new_count = 0
        for cp in kilo_checkpoints:
            if cp.hash not in existing_hashes:
                state.checkpoint_mappings.append(CheckpointMapping(
                    execution_id=execution_id,
                    step_id=f"kilo_sync_{cp.hash[:8]}",
                    kilo_checkpoint_hash=cp.hash,
                    created_at=cp.timestamp,
                ))
                new_count += 1
        
        if new_count > 0:
            state.last_sync = datetime.utcnow()
            self.save_state(execution_id)
            
            logger.info(
                "Checkpoints synced from Kilo",
                execution_id=execution_id,
                new_count=new_count,
            )
        
        return new_count
    
    async def sync_tasks_from_kilo(
        self,
        execution_id: str,
        kilo_tasks: List[KiloTask],
    ) -> int:
        """
        Sync tasks from Kilo to SmartSpec.
        
        Args:
            execution_id: Workflow execution ID
            kilo_tasks: List of Kilo tasks
        
        Returns:
            Number of new tasks synced
        """
        state = self.get_sync_state(execution_id)
        if not state:
            return 0
        
        # Get existing task IDs
        existing_ids = {m.kilo_task_id for m in state.task_mappings}
        
        # Add new tasks
        new_count = 0
        for task in kilo_tasks:
            if task.task_id not in existing_ids:
                state.task_mappings.append(TaskMapping(
                    execution_id=execution_id,
                    step_id=f"kilo_sync_{task.task_id[:8]}",
                    kilo_task_id=task.task_id,
                    prompt=task.description,
                    created_at=task.timestamp,
                ))
                new_count += 1
        
        if new_count > 0:
            state.last_sync = datetime.utcnow()
            self.save_state(execution_id)
            
            logger.info(
                "Tasks synced from Kilo",
                execution_id=execution_id,
                new_count=new_count,
            )
        
        return new_count
    
    def get_sync_summary(self, execution_id: str) -> Dict[str, Any]:
        """
        Get a summary of the sync state.
        
        Args:
            execution_id: Workflow execution ID
        
        Returns:
            Summary dictionary
        """
        state = self.get_sync_state(execution_id)
        if not state:
            return {
                "execution_id": execution_id,
                "found": False,
            }
        
        return {
            "execution_id": execution_id,
            "found": True,
            "workspace": state.workspace,
            "checkpoint_count": len(state.checkpoint_mappings),
            "task_count": len(state.task_mappings),
            "last_sync": state.last_sync.isoformat() if state.last_sync else None,
            "sync_status": state.sync_status.value,
            "latest_checkpoint": state.get_latest_checkpoint().to_dict() if state.get_latest_checkpoint() else None,
        }
    
    def delete_sync_state(self, execution_id: str) -> bool:
        """
        Delete sync state for an execution.
        
        Args:
            execution_id: Workflow execution ID
        
        Returns:
            True if deleted
        """
        # Remove from memory
        if execution_id in self._sync_states:
            del self._sync_states[execution_id]
        
        # Remove file
        state_file = self._get_state_file(execution_id)
        if state_file.exists():
            state_file.unlink()
            logger.info(
                "Sync state deleted",
                execution_id=execution_id,
            )
            return True
        
        return False
    
    def list_sync_states(self) -> List[str]:
        """
        List all execution IDs with sync states.
        
        Returns:
            List of execution IDs
        """
        execution_ids = set(self._sync_states.keys())
        
        # Add from files
        for state_file in self.state_dir.glob("*.json"):
            execution_ids.add(state_file.stem)
        
        return list(execution_ids)


# ==================== GLOBAL INSTANCE ====================

_state_sync: Optional[KiloStateSync] = None


def get_kilo_state_sync(
    state_dir: Optional[str] = None,
    force_new: bool = False,
) -> KiloStateSync:
    """
    Get the global Kilo state sync instance.
    
    Args:
        state_dir: Optional state directory
        force_new: Force creation of new instance
    
    Returns:
        KiloStateSync instance
    """
    global _state_sync
    
    if _state_sync is None or force_new:
        _state_sync = KiloStateSync(state_dir)
    
    return _state_sync


def reset_kilo_state_sync() -> None:
    """Reset the global state sync instance."""
    global _state_sync
    _state_sync = None
