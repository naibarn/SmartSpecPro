"""
SmartSpec Pro - Checkpoint Manager
Phase 0.3 - LangGraph Integration

Manages checkpoints for workflow execution:
- Save state after each step
- Resume from any checkpoint
- List available checkpoints
- Clean up old checkpoints
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import structlog

from app.orchestrator.models import CheckpointData, ExecutionState
from app.core.config import settings

logger = structlog.get_logger()


class CheckpointManager:
    """Manages workflow execution checkpoints"""
    
    def __init__(self, checkpoint_dir: Optional[str] = None):
        self.checkpoint_dir = Path(checkpoint_dir or settings.CHECKPOINT_DIR)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Checkpoint manager initialized", checkpoint_dir=str(self.checkpoint_dir))
    
    def create_checkpoint(
        self,
        execution_id: str,
        state: ExecutionState,
        step_id: str,
        step_name: str,
        metadata: Optional[dict] = None
    ) -> CheckpointData:
        """
        Create a new checkpoint
        
        Args:
            execution_id: Unique execution ID
            state: Current execution state
            step_id: Current step ID
            step_name: Current step name
            metadata: Additional metadata
        
        Returns:
            CheckpointData object
        """
        checkpoint_id = f"{execution_id}_{step_id}_{int(datetime.utcnow().timestamp())}"
        
        checkpoint = CheckpointData(
            checkpoint_id=checkpoint_id,
            execution_id=execution_id,
            created_at=datetime.utcnow(),
            state=state,
            step_id=step_id,
            step_name=step_name,
            metadata=metadata or {}
        )
        
        # Save to disk
        self._save_checkpoint(checkpoint)
        
        logger.info(
            "Checkpoint created",
            checkpoint_id=checkpoint_id,
            execution_id=execution_id,
            step_id=step_id,
            step_name=step_name
        )
        
        return checkpoint
    
    def _save_checkpoint(self, checkpoint: CheckpointData):
        """Save checkpoint to disk"""
        execution_dir = self.checkpoint_dir / checkpoint.execution_id
        execution_dir.mkdir(parents=True, exist_ok=True)
        
        checkpoint_file = execution_dir / f"{checkpoint.checkpoint_id}.json"
        
        with open(checkpoint_file, 'w') as f:
            json.dump(checkpoint.model_dump(mode='json'), f, indent=2, default=str)
        
        logger.debug("Checkpoint saved to disk", file=str(checkpoint_file))
    
    def load_checkpoint(self, checkpoint_id: str) -> Optional[CheckpointData]:
        """
        Load checkpoint from disk
        
        Args:
            checkpoint_id: Checkpoint ID to load
        
        Returns:
            CheckpointData object or None if not found
        """
        # Find checkpoint file
        for execution_dir in self.checkpoint_dir.iterdir():
            if not execution_dir.is_dir():
                continue
            
            checkpoint_file = execution_dir / f"{checkpoint_id}.json"
            if checkpoint_file.exists():
                with open(checkpoint_file, 'r') as f:
                    data = json.load(f)
                    checkpoint = CheckpointData(**data)
                    logger.info("Checkpoint loaded", checkpoint_id=checkpoint_id)
                    return checkpoint
        
        logger.warning("Checkpoint not found", checkpoint_id=checkpoint_id)
        return None
    
    def list_checkpoints(self, execution_id: str) -> List[CheckpointData]:
        """
        List all checkpoints for an execution
        
        Args:
            execution_id: Execution ID
        
        Returns:
            List of CheckpointData objects
        """
        execution_dir = self.checkpoint_dir / execution_id
        
        if not execution_dir.exists():
            return []
        
        checkpoints = []
        for checkpoint_file in execution_dir.glob("*.json"):
            try:
                with open(checkpoint_file, 'r') as f:
                    data = json.load(f)
                    checkpoints.append(CheckpointData(**data))
            except Exception as e:
                logger.error(
                    "Failed to load checkpoint",
                    file=str(checkpoint_file),
                    error=str(e)
                )
        
        # Sort by creation time
        checkpoints.sort(key=lambda c: c.created_at, reverse=True)
        
        return checkpoints
    
    def get_latest_checkpoint(self, execution_id: str) -> Optional[CheckpointData]:
        """
        Get the latest checkpoint for an execution
        
        Args:
            execution_id: Execution ID
        
        Returns:
            Latest CheckpointData object or None
        """
        checkpoints = self.list_checkpoints(execution_id)
        return checkpoints[0] if checkpoints else None
    
    def delete_checkpoint(self, checkpoint_id: str) -> bool:
        """
        Delete a checkpoint
        
        Args:
            checkpoint_id: Checkpoint ID to delete
        
        Returns:
            True if deleted, False if not found
        """
        for execution_dir in self.checkpoint_dir.iterdir():
            if not execution_dir.is_dir():
                continue
            
            checkpoint_file = execution_dir / f"{checkpoint_id}.json"
            if checkpoint_file.exists():
                checkpoint_file.unlink()
                logger.info("Checkpoint deleted", checkpoint_id=checkpoint_id)
                return True
        
        return False
    
    def delete_execution_checkpoints(self, execution_id: str) -> int:
        """
        Delete all checkpoints for an execution
        
        Args:
            execution_id: Execution ID
        
        Returns:
            Number of checkpoints deleted
        """
        execution_dir = self.checkpoint_dir / execution_id
        
        if not execution_dir.exists():
            return 0
        
        count = 0
        for checkpoint_file in execution_dir.glob("*.json"):
            checkpoint_file.unlink()
            count += 1
        
        # Remove directory if empty
        try:
            execution_dir.rmdir()
        except OSError:
            pass
        
        logger.info("Execution checkpoints deleted", execution_id=execution_id, count=count)
        return count
    
    def cleanup_old_checkpoints(self, days: int = 7) -> int:
        """
        Clean up checkpoints older than specified days
        
        Args:
            days: Delete checkpoints older than this many days
        
        Returns:
            Number of checkpoints deleted
        """
        from datetime import timedelta
        
        cutoff_time = datetime.utcnow() - timedelta(days=days)
        count = 0
        
        for execution_dir in self.checkpoint_dir.iterdir():
            if not execution_dir.is_dir():
                continue
            
            for checkpoint_file in execution_dir.glob("*.json"):
                try:
                    with open(checkpoint_file, 'r') as f:
                        data = json.load(f)
                        created_at = datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                        
                        if created_at < cutoff_time:
                            checkpoint_file.unlink()
                            count += 1
                except Exception as e:
                    logger.error(
                        "Failed to process checkpoint during cleanup",
                        file=str(checkpoint_file),
                        error=str(e)
                    )
            
            # Remove empty directories
            try:
                if not any(execution_dir.iterdir()):
                    execution_dir.rmdir()
            except OSError:
                pass
        
        logger.info("Old checkpoints cleaned up", count=count, days=days)
        return count
    
    def get_checkpoint_stats(self) -> dict:
        """Get statistics about checkpoints"""
        total_checkpoints = 0
        total_executions = 0
        total_size_bytes = 0
        
        for execution_dir in self.checkpoint_dir.iterdir():
            if not execution_dir.is_dir():
                continue
            
            total_executions += 1
            
            for checkpoint_file in execution_dir.glob("*.json"):
                total_checkpoints += 1
                total_size_bytes += checkpoint_file.stat().st_size
        
        return {
            "total_checkpoints": total_checkpoints,
            "total_executions": total_executions,
            "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
            "checkpoint_dir": str(self.checkpoint_dir)
        }


# Global checkpoint manager instance
checkpoint_manager = CheckpointManager()
