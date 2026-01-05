"""
SmartSpec Pro - Memory Service

This module provides the MemoryService for managing semantic (long-term) memories.
It handles CRUD operations, retrieval, and memory lifecycle management.

Features:
- Store and retrieve user preferences
- Store and retrieve project facts
- Memory importance scoring
- Automatic cleanup of expired memories
- Batch operations for efficiency
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from sqlalchemy import select, update, delete, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.models.semantic_memory import SemanticMemory, MemoryType, MemoryScope


logger = structlog.get_logger(__name__)


class MemoryService:
    """
    Service for managing semantic memories.
    
    Provides methods for storing, retrieving, and managing long-term
    memories such as user preferences and project facts.
    """
    
    def __init__(self, db: AsyncSession):
        """
        Initialize MemoryService.
        
        Args:
            db: Async database session
        """
        self.db = db
    
    # ==================== CREATE ====================
    
    async def store(
        self,
        memory_key: str,
        content: str,
        memory_type: MemoryType,
        scope: MemoryScope = MemoryScope.USER,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        session_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None,
        importance: float = 1.0,
        source: Optional[str] = None,
        source_execution_id: Optional[str] = None,
        expires_in_days: Optional[int] = None,
        upsert: bool = True
    ) -> SemanticMemory:
        """
        Store a semantic memory.
        
        Args:
            memory_key: Unique key for this memory within its scope
            content: The memory content (text)
            memory_type: Type of memory (preference, fact, etc.)
            scope: Scope of the memory (user, project, etc.)
            user_id: User ID if user-scoped
            project_id: Project ID if project-scoped
            session_id: Session ID if session-scoped
            workflow_id: Workflow ID if workflow-scoped
            extra_data: Additional metadata as JSON
            importance: Importance score (0.0 to 1.0)
            source: Source of this memory
            source_execution_id: Execution ID that created this memory
            expires_in_days: Days until expiration (None = never)
            upsert: If True, update existing memory with same key
        
        Returns:
            The created or updated SemanticMemory
        """
        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
        # Check for existing memory if upsert
        if upsert:
            existing = await self.get_by_key(
                memory_key=memory_key,
                user_id=user_id,
                project_id=project_id,
                scope=scope
            )
            
            if existing:
                # Update existing memory
                existing.content = content
                existing.memory_type = memory_type
                existing.extra_data = extra_data or existing.extra_data
                existing.importance = importance
                existing.source = source or existing.source
                existing.source_execution_id = source_execution_id or existing.source_execution_id
                existing.expires_at = expires_at
                existing.updated_at = datetime.utcnow()
                
                await self.db.commit()
                await self.db.refresh(existing)
                
                logger.info(
                    "Updated semantic memory",
                    memory_id=existing.id,
                    memory_key=memory_key,
                    memory_type=memory_type.value
                )
                
                return existing
        
        # Create new memory
        memory = SemanticMemory(
            memory_key=memory_key,
            content=content,
            memory_type=memory_type,
            scope=scope,
            user_id=user_id,
            project_id=project_id,
            session_id=session_id,
            workflow_id=workflow_id,
            extra_data=extra_data or {},
            importance=importance,
            source=source,
            source_execution_id=source_execution_id,
            expires_at=expires_at
        )
        
        self.db.add(memory)
        await self.db.commit()
        await self.db.refresh(memory)
        
        logger.info(
            "Created semantic memory",
            memory_id=memory.id,
            memory_key=memory_key,
            memory_type=memory_type.value
        )
        
        return memory
    
    async def store_user_preference(
        self,
        user_id: str,
        key: str,
        value: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> SemanticMemory:
        """
        Store a user preference.
        
        Convenience method for storing user-specific preferences.
        
        Args:
            user_id: User ID
            key: Preference key (e.g., "coding_style", "preferred_framework")
            value: Preference value
            metadata: Additional metadata
        
        Returns:
            The created SemanticMemory
        """
        return await self.store(
            memory_key=f"pref:{key}",
            content=value,
            memory_type=MemoryType.USER_PREFERENCE,
            scope=MemoryScope.USER,
            user_id=user_id,
            extra_data=metadata,
            importance=0.8,
            source="user_preference"
        )
    
    async def store_project_fact(
        self,
        project_id: str,
        key: str,
        value: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> SemanticMemory:
        """
        Store a project fact.
        
        Convenience method for storing project-specific facts.
        
        Args:
            project_id: Project ID
            key: Fact key (e.g., "tech_stack", "database")
            value: Fact value
            user_id: Optional user ID
            metadata: Additional metadata
        
        Returns:
            The created SemanticMemory
        """
        return await self.store(
            memory_key=f"fact:{key}",
            content=value,
            memory_type=MemoryType.PROJECT_FACT,
            scope=MemoryScope.PROJECT,
            project_id=project_id,
            user_id=user_id,
            extra_data=metadata,
            importance=0.9,
            source="project_fact"
        )
    
    async def store_skill(
        self,
        user_id: str,
        skill_name: str,
        skill_content: str,
        project_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> SemanticMemory:
        """
        Store a learned skill (for Kilo integration).
        
        Args:
            user_id: User ID
            skill_name: Name of the skill
            skill_content: Skill content (markdown format)
            project_id: Optional project ID
            metadata: Additional metadata
        
        Returns:
            The created SemanticMemory
        """
        return await self.store(
            memory_key=f"skill:{skill_name}",
            content=skill_content,
            memory_type=MemoryType.SKILL,
            scope=MemoryScope.USER if not project_id else MemoryScope.PROJECT,
            user_id=user_id,
            project_id=project_id,
            extra_data=metadata or {"skill_name": skill_name},
            importance=0.95,
            source="skill_learning"
        )
    
    # ==================== READ ====================
    
    async def get_by_id(self, memory_id: int) -> Optional[SemanticMemory]:
        """Get a memory by ID."""
        result = await self.db.execute(
            select(SemanticMemory).where(
                and_(
                    SemanticMemory.id == memory_id,
                    SemanticMemory.is_active == 1
                )
            )
        )
        memory = result.scalar_one_or_none()
        
        if memory:
            memory.increment_access()
            await self.db.commit()
        
        return memory
    
    async def get_by_key(
        self,
        memory_key: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        scope: Optional[MemoryScope] = None
    ) -> Optional[SemanticMemory]:
        """
        Get a memory by its key.
        
        Args:
            memory_key: The memory key
            user_id: Optional user ID filter
            project_id: Optional project ID filter
            scope: Optional scope filter
        
        Returns:
            The SemanticMemory or None
        """
        conditions = [
            SemanticMemory.memory_key == memory_key,
            SemanticMemory.is_active == 1
        ]
        
        if user_id:
            conditions.append(SemanticMemory.user_id == user_id)
        if project_id:
            conditions.append(SemanticMemory.project_id == project_id)
        if scope:
            conditions.append(SemanticMemory.scope == scope)
        
        result = await self.db.execute(
            select(SemanticMemory).where(and_(*conditions))
        )
        memory = result.scalar_one_or_none()
        
        if memory:
            memory.increment_access()
            await self.db.commit()
        
        return memory
    
    async def get_user_preferences(
        self,
        user_id: str,
        limit: int = 100
    ) -> List[SemanticMemory]:
        """
        Get all preferences for a user.
        
        Args:
            user_id: User ID
            limit: Maximum number of results
        
        Returns:
            List of SemanticMemory objects
        """
        result = await self.db.execute(
            select(SemanticMemory)
            .where(
                and_(
                    SemanticMemory.user_id == user_id,
                    SemanticMemory.memory_type == MemoryType.USER_PREFERENCE,
                    SemanticMemory.is_active == 1
                )
            )
            .order_by(SemanticMemory.importance.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def get_project_facts(
        self,
        project_id: str,
        limit: int = 100
    ) -> List[SemanticMemory]:
        """
        Get all facts for a project.
        
        Args:
            project_id: Project ID
            limit: Maximum number of results
        
        Returns:
            List of SemanticMemory objects
        """
        result = await self.db.execute(
            select(SemanticMemory)
            .where(
                and_(
                    SemanticMemory.project_id == project_id,
                    SemanticMemory.memory_type.in_([
                        MemoryType.PROJECT_FACT,
                        MemoryType.PROJECT_CONVENTION,
                        MemoryType.PROJECT_TECH_STACK
                    ]),
                    SemanticMemory.is_active == 1
                )
            )
            .order_by(SemanticMemory.importance.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def get_skills(
        self,
        user_id: str,
        project_id: Optional[str] = None,
        limit: int = 50
    ) -> List[SemanticMemory]:
        """
        Get learned skills for a user.
        
        Args:
            user_id: User ID
            project_id: Optional project ID filter
            limit: Maximum number of results
        
        Returns:
            List of SemanticMemory objects
        """
        conditions = [
            SemanticMemory.user_id == user_id,
            SemanticMemory.memory_type == MemoryType.SKILL,
            SemanticMemory.is_active == 1
        ]
        
        if project_id:
            conditions.append(SemanticMemory.project_id == project_id)
        
        result = await self.db.execute(
            select(SemanticMemory)
            .where(and_(*conditions))
            .order_by(SemanticMemory.importance.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def search(
        self,
        query: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        memory_types: Optional[List[MemoryType]] = None,
        scope: Optional[MemoryScope] = None,
        min_importance: float = 0.0,
        limit: int = 20
    ) -> List[SemanticMemory]:
        """
        Search memories by content.
        
        Note: This is a simple LIKE search. For semantic search,
        use the EpisodicMemoryService with vector embeddings.
        
        Args:
            query: Search query
            user_id: Optional user ID filter
            project_id: Optional project ID filter
            memory_types: Optional list of memory types to filter
            scope: Optional scope filter
            min_importance: Minimum importance score
            limit: Maximum number of results
        
        Returns:
            List of matching SemanticMemory objects
        """
        conditions = [
            SemanticMemory.content.ilike(f"%{query}%"),
            SemanticMemory.is_active == 1,
            SemanticMemory.importance >= min_importance
        ]
        
        if user_id:
            conditions.append(SemanticMemory.user_id == user_id)
        if project_id:
            conditions.append(SemanticMemory.project_id == project_id)
        if memory_types:
            conditions.append(SemanticMemory.memory_type.in_(memory_types))
        if scope:
            conditions.append(SemanticMemory.scope == scope)
        
        result = await self.db.execute(
            select(SemanticMemory)
            .where(and_(*conditions))
            .order_by(SemanticMemory.importance.desc(), SemanticMemory.access_count.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def get_context_for_prompt(
        self,
        user_id: str,
        project_id: Optional[str] = None,
        include_preferences: bool = True,
        include_facts: bool = True,
        include_skills: bool = True,
        max_memories: int = 20
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get relevant memories for prompt context.
        
        This method retrieves the most relevant memories for a user/project
        to be included in LLM prompts.
        
        Args:
            user_id: User ID
            project_id: Optional project ID
            include_preferences: Include user preferences
            include_facts: Include project facts
            include_skills: Include learned skills
            max_memories: Maximum total memories to return
        
        Returns:
            Dictionary with categorized memories
        """
        context = {
            "preferences": [],
            "facts": [],
            "skills": []
        }
        
        per_category = max_memories // 3
        
        if include_preferences:
            prefs = await self.get_user_preferences(user_id, limit=per_category)
            context["preferences"] = [m.to_dict() for m in prefs]
        
        if include_facts and project_id:
            facts = await self.get_project_facts(project_id, limit=per_category)
            context["facts"] = [m.to_dict() for m in facts]
        
        if include_skills:
            skills = await self.get_skills(user_id, project_id, limit=per_category)
            context["skills"] = [m.to_dict() for m in skills]
        
        return context
    
    # ==================== UPDATE ====================
    
    async def update_importance(
        self,
        memory_id: int,
        importance: float
    ) -> Optional[SemanticMemory]:
        """
        Update the importance score of a memory.
        
        Args:
            memory_id: Memory ID
            importance: New importance score (0.0 to 1.0)
        
        Returns:
            Updated SemanticMemory or None
        """
        importance = max(0.0, min(1.0, importance))  # Clamp to [0, 1]
        
        await self.db.execute(
            update(SemanticMemory)
            .where(SemanticMemory.id == memory_id)
            .values(importance=importance, updated_at=datetime.utcnow())
        )
        await self.db.commit()
        
        return await self.get_by_id(memory_id)
    
    async def boost_importance(
        self,
        memory_id: int,
        boost: float = 0.1
    ) -> Optional[SemanticMemory]:
        """
        Boost the importance of a memory.
        
        Args:
            memory_id: Memory ID
            boost: Amount to boost (default 0.1)
        
        Returns:
            Updated SemanticMemory or None
        """
        memory = await self.get_by_id(memory_id)
        if memory:
            new_importance = min(1.0, memory.importance + boost)
            return await self.update_importance(memory_id, new_importance)
        return None
    
    # ==================== DELETE ====================
    
    async def delete(self, memory_id: int) -> bool:
        """
        Soft delete a memory.
        
        Args:
            memory_id: Memory ID
        
        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            update(SemanticMemory)
            .where(SemanticMemory.id == memory_id)
            .values(is_active=0, updated_at=datetime.utcnow())
        )
        await self.db.commit()
        
        return result.rowcount > 0
    
    async def delete_by_key(
        self,
        memory_key: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> int:
        """
        Delete memories by key.
        
        Args:
            memory_key: Memory key
            user_id: Optional user ID filter
            project_id: Optional project ID filter
        
        Returns:
            Number of deleted memories
        """
        conditions = [SemanticMemory.memory_key == memory_key]
        
        if user_id:
            conditions.append(SemanticMemory.user_id == user_id)
        if project_id:
            conditions.append(SemanticMemory.project_id == project_id)
        
        result = await self.db.execute(
            update(SemanticMemory)
            .where(and_(*conditions))
            .values(is_active=0, updated_at=datetime.utcnow())
        )
        await self.db.commit()
        
        return result.rowcount
    
    async def cleanup_expired(self) -> int:
        """
        Clean up expired memories.
        
        Returns:
            Number of cleaned up memories
        """
        result = await self.db.execute(
            update(SemanticMemory)
            .where(
                and_(
                    SemanticMemory.expires_at.isnot(None),
                    SemanticMemory.expires_at < datetime.utcnow(),
                    SemanticMemory.is_active == 1
                )
            )
            .values(is_active=0, updated_at=datetime.utcnow())
        )
        await self.db.commit()
        
        count = result.rowcount
        if count > 0:
            logger.info("Cleaned up expired memories", count=count)
        
        return count
    
    # ==================== STATISTICS ====================
    
    async def get_stats(
        self,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get memory statistics.
        
        Args:
            user_id: Optional user ID filter
            project_id: Optional project ID filter
        
        Returns:
            Dictionary with statistics
        """
        conditions = [SemanticMemory.is_active == 1]
        
        if user_id:
            conditions.append(SemanticMemory.user_id == user_id)
        if project_id:
            conditions.append(SemanticMemory.project_id == project_id)
        
        # Total count
        total_result = await self.db.execute(
            select(func.count(SemanticMemory.id)).where(and_(*conditions))
        )
        total = total_result.scalar() or 0
        
        # Count by type
        type_result = await self.db.execute(
            select(
                SemanticMemory.memory_type,
                func.count(SemanticMemory.id)
            )
            .where(and_(*conditions))
            .group_by(SemanticMemory.memory_type)
        )
        by_type = {row[0].value: row[1] for row in type_result.all()}
        
        # Average importance
        avg_result = await self.db.execute(
            select(func.avg(SemanticMemory.importance)).where(and_(*conditions))
        )
        avg_importance = avg_result.scalar() or 0.0
        
        return {
            "total": total,
            "by_type": by_type,
            "average_importance": round(avg_importance, 3)
        }


# Convenience function for creating service
def get_memory_service(db: AsyncSession) -> MemoryService:
    """
    Create a MemoryService instance.
    
    Args:
        db: Async database session
    
    Returns:
        MemoryService instance
    """
    return MemoryService(db)
