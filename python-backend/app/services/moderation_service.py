"""
Content Moderation Service
Handles content moderation for LLM requests and responses
"""

import re
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.database import Base


# ============================================================
# Moderation Models
# ============================================================

class ModerationLog(Base):
    """Log of moderation checks"""
    __tablename__ = "moderation_logs"
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    content_type = Column(String(20), nullable=False)  # "request" or "response"
    content = Column(Text, nullable=False)
    flagged = Column(Boolean, nullable=False, default=False)
    categories = Column(Text, nullable=True)  # JSON string
    action_taken = Column(String(50), nullable=True)  # "blocked", "warned", "allowed"
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ============================================================
# Moderation Service
# ============================================================

class ModerationService:
    """Service for content moderation"""
    
    # Blocked keywords (basic filter)
    BLOCKED_KEYWORDS = [
        # Add your blocked keywords here
        # This is a placeholder - customize based on your requirements
    ]
    
    # Sensitive topics that require extra scrutiny
    SENSITIVE_TOPICS = [
        "violence", "self-harm", "hate", "harassment", 
        "sexual", "illegal", "dangerous"
    ]
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.openai_client = AsyncOpenAI() if settings.OPENAI_API_KEY else None
    
    async def moderate_request(
        self,
        user_id: str,
        content: str,
        strict_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Moderate user request before sending to LLM
        
        Args:
            user_id: User ID
            content: Request content to moderate
            strict_mode: Enable strict moderation
        
        Returns:
            Moderation result:
            {
                "flagged": bool,
                "categories": dict,
                "action": str,  # "allowed", "blocked", "warned"
                "reason": str
            }
        """
        # 1. Basic keyword filter
        keyword_result = self._check_keywords(content)
        if keyword_result["flagged"]:
            await self._log_moderation(
                user_id=user_id,
                content_type="request",
                content=content,
                flagged=True,
                categories=keyword_result["categories"],
                action_taken="blocked"
            )
            return {
                "flagged": True,
                "categories": keyword_result["categories"],
                "action": "blocked",
                "reason": "Content contains blocked keywords"
            }
        
        # 2. OpenAI Moderation API (if available)
        if self.openai_client:
            try:
                openai_result = await self._check_openai_moderation(content)
            except Exception as e:
                # Fallback to pattern matching if OpenAI API fails
                import structlog
                logger = structlog.get_logger()
                logger.warning(
                    "openai_moderation_failed",
                    error=str(e),
                    user_id=user_id,
                    fallback="pattern_matching"
                )
                # Continue to pattern matching below
                openai_result = {"flagged": False}
            
            if openai_result["flagged"]:
                action = "blocked" if strict_mode else "warned"
                
                await self._log_moderation(
                    user_id=user_id,
                    content_type="request",
                    content=content,
                    flagged=True,
                    categories=openai_result["categories"],
                    action_taken=action
                )
                
                if strict_mode:
                    return {
                        "flagged": True,
                        "categories": openai_result["categories"],
                        "action": "blocked",
                        "reason": "Content flagged by moderation system"
                    }
                else:
                    return {
                        "flagged": True,
                        "categories": openai_result["categories"],
                        "action": "warned",
                        "reason": "Content may be sensitive"
                    }
        
        # 3. Pattern matching for sensitive topics
        pattern_result = self._check_patterns(content)
        if pattern_result["flagged"]:
            await self._log_moderation(
                user_id=user_id,
                content_type="request",
                content=content,
                flagged=True,
                categories=pattern_result["categories"],
                action_taken="warned"
            )
            return {
                "flagged": True,
                "categories": pattern_result["categories"],
                "action": "warned",
                "reason": "Content contains sensitive topics"
            }
        
        # All checks passed
        await self._log_moderation(
            user_id=user_id,
            content_type="request",
            content=content,
            flagged=False,
            categories={},
            action_taken="allowed"
        )
        
        return {
            "flagged": False,
            "categories": {},
            "action": "allowed",
            "reason": "Content passed moderation"
        }
    
    async def moderate_response(
        self,
        user_id: str,
        content: str
    ) -> Dict[str, Any]:
        """
        Moderate LLM response before returning to user
        
        Args:
            user_id: User ID
            content: Response content to moderate
        
        Returns:
            Moderation result
        """
        # Similar to request moderation but less strict
        # Usually we trust LLM providers' own moderation
        
        # Basic checks
        keyword_result = self._check_keywords(content)
        
        if keyword_result["flagged"]:
            await self._log_moderation(
                user_id=user_id,
                content_type="response",
                content=content,
                flagged=True,
                categories=keyword_result["categories"],
                action_taken="filtered"
            )
            return {
                "flagged": True,
                "categories": keyword_result["categories"],
                "action": "filtered",
                "reason": "Response contains inappropriate content"
            }
        
        await self._log_moderation(
            user_id=user_id,
            content_type="response",
            content=content,
            flagged=False,
            categories={},
            action_taken="allowed"
        )
        
        return {
            "flagged": False,
            "categories": {},
            "action": "allowed",
            "reason": "Response passed moderation"
        }
    
    def _check_keywords(self, content: str) -> Dict[str, Any]:
        """
        Check for blocked keywords
        
        Args:
            content: Content to check
        
        Returns:
            Result with flagged status and categories
        """
        content_lower = content.lower()
        
        flagged_keywords = []
        for keyword in self.BLOCKED_KEYWORDS:
            if keyword.lower() in content_lower:
                flagged_keywords.append(keyword)
        
        if flagged_keywords:
            return {
                "flagged": True,
                "categories": {
                    "blocked_keywords": flagged_keywords
                }
            }
        
        return {
            "flagged": False,
            "categories": {}
        }
    
    async def _check_openai_moderation(self, content: str) -> Dict[str, Any]:
        """
        Check content using OpenAI Moderation API
        
        Args:
            content: Content to check
        
        Returns:
            Moderation result
        """
        if not self.openai_client:
            return {"flagged": False, "categories": {}}
        
        # Let exceptions propagate to be handled by the caller (moderate_request)
        # This allows proper logging via structlog in the except block
        response = await self.openai_client.moderations.create(input=content)
        result = response.results[0]
        
        # Extract flagged categories
        flagged_categories = {}
        if result.flagged:
            for category, flagged in result.categories.model_dump().items():
                if flagged:
                    flagged_categories[category] = True
        
        return {
            "flagged": result.flagged,
            "categories": flagged_categories
        }
    
    def _check_patterns(self, content: str) -> Dict[str, Any]:
        """
        Check for sensitive patterns
        
        Args:
            content: Content to check
        
        Returns:
            Result with flagged status and categories
        """
        content_lower = content.lower()
        
        flagged_topics = []
        for topic in self.SENSITIVE_TOPICS:
            # Simple word boundary matching
            pattern = r'\b' + re.escape(topic) + r'\b'
            if re.search(pattern, content_lower):
                flagged_topics.append(topic)
        
        if flagged_topics:
            return {
                "flagged": True,
                "categories": {
                    "sensitive_topics": flagged_topics
                }
            }
        
        return {
            "flagged": False,
            "categories": {}
        }
    
    async def _log_moderation(
        self,
        user_id: str,
        content_type: str,
        content: str,
        flagged: bool,
        categories: Dict[str, Any],
        action_taken: str
    ):
        """
        Log moderation check to database
        
        Args:
            user_id: User ID
            content_type: "request" or "response"
            content: Content that was moderated
            flagged: Whether content was flagged
            categories: Flagged categories
            action_taken: Action taken
        """
        import uuid
        import json
        
        log = ModerationLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            content_type=content_type,
            content=content[:1000],  # Truncate for storage
            flagged=flagged,
            categories=json.dumps(categories),
            action_taken=action_taken,
            created_at=datetime.utcnow()
        )
        
        self.db.add(log)
        await self.db.commit()
    
    async def get_user_moderation_history(
        self,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get user's moderation history
        
        Args:
            user_id: User ID
            limit: Maximum number of records
        
        Returns:
            List of moderation logs
        """
        from sqlalchemy import select
        import json
        
        result = await self.db.execute(
            select(ModerationLog)
            .where(ModerationLog.user_id == user_id)
            .order_by(ModerationLog.created_at.desc())
            .limit(limit)
        )
        logs = result.scalars().all()
        
        return [
            {
                "id": log.id,
                "content_type": log.content_type,
                "flagged": log.flagged,
                "categories": json.loads(log.categories) if log.categories else {},
                "action_taken": log.action_taken,
                "created_at": log.created_at.isoformat()
            }
            for log in logs
        ]
    
    async def get_flagged_content(
        self,
        limit: int = 100,
        content_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get flagged content for admin review
        
        Args:
            limit: Maximum number of records
            content_type: Filter by content type
        
        Returns:
            List of flagged content
        """
        from sqlalchemy import select
        import json
        
        query = select(ModerationLog).where(ModerationLog.flagged == True)
        
        if content_type:
            query = query.where(ModerationLog.content_type == content_type)
        
        query = query.order_by(ModerationLog.created_at.desc()).limit(limit)
        
        result = await self.db.execute(query)
        logs = result.scalars().all()
        
        return [
            {
                "id": log.id,
                "user_id": log.user_id,
                "content_type": log.content_type,
                "content": log.content,
                "flagged": log.flagged,
                "categories": json.loads(log.categories) if log.categories else {},
                "action_taken": log.action_taken,
                "created_at": log.created_at.isoformat()
            }
            for log in logs
        ]
