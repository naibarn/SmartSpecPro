"""
Prompt Template Service
Manage reusable prompt templates with variables
"""

import uuid
import re
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.models.prompt_template import PromptTemplate


class PromptTemplateService:
    """Service for managing prompt templates"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_template(
        self,
        user_id: str,
        name: str,
        template: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        is_public: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new prompt template
        
        Args:
            user_id: User ID
            name: Template name
            template: Template string with {{variables}}
            description: Template description
            category: Template category
            is_public: Whether template is public
        
        Returns:
            Created template
        """
        # Extract variables from template
        variables = self._extract_variables(template)
        
        template_obj = PromptTemplate(
            id=str(uuid.uuid4()),
            user_id=user_id,
            name=name,
            description=description,
            template=template,
            variables=variables,
            category=category,
            is_public=is_public,
            is_favorite=False,
            use_count=0,
            version=1,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        self.db.add(template_obj)
        await self.db.commit()
        await self.db.refresh(template_obj)
        
        return self._template_to_dict(template_obj)
    
    async def get_template(
        self,
        template_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a template by ID
        
        Args:
            template_id: Template ID
            user_id: User ID (for permission check)
        
        Returns:
            Template or None
        """
        result = await self.db.execute(
            select(PromptTemplate).where(
                and_(
                    PromptTemplate.id == template_id,
                    or_(
                        PromptTemplate.user_id == user_id,
                        PromptTemplate.is_public == True
                    )
                )
            )
        )
        template = result.scalar_one_or_none()
        
        if not template:
            return None
        
        return self._template_to_dict(template)
    
    async def list_templates(
        self,
        user_id: str,
        category: Optional[str] = None,
        is_public: Optional[bool] = None,
        is_favorite: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List user's templates
        
        Args:
            user_id: User ID
            category: Filter by category
            is_public: Filter by public status
            is_favorite: Filter by favorite status
            limit: Maximum number of results
            offset: Offset for pagination
        
        Returns:
            List of templates
        """
        query = select(PromptTemplate).where(
            or_(
                PromptTemplate.user_id == user_id,
                PromptTemplate.is_public == True
            )
        )
        
        if category:
            query = query.where(PromptTemplate.category == category)
        
        if is_public is not None:
            query = query.where(PromptTemplate.is_public == is_public)
        
        if is_favorite is not None:
            query = query.where(PromptTemplate.is_favorite == is_favorite)
        
        query = query.order_by(PromptTemplate.updated_at.desc())
        query = query.limit(limit).offset(offset)
        
        result = await self.db.execute(query)
        templates = result.scalars().all()
        
        return [self._template_to_dict(t) for t in templates]
    
    async def update_template(
        self,
        template_id: str,
        user_id: str,
        name: Optional[str] = None,
        template: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        is_public: Optional[bool] = None,
        is_favorite: Optional[bool] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update a template
        
        Args:
            template_id: Template ID
            user_id: User ID (must be owner)
            name: New name
            template: New template
            description: New description
            category: New category
            is_public: New public status
            is_favorite: New favorite status
        
        Returns:
            Updated template or None
        """
        result = await self.db.execute(
            select(PromptTemplate).where(
                and_(
                    PromptTemplate.id == template_id,
                    PromptTemplate.user_id == user_id
                )
            )
        )
        template_obj = result.scalar_one_or_none()
        
        if not template_obj:
            return None
        
        if name is not None:
            template_obj.name = name
        
        if template is not None:
            template_obj.template = template
            template_obj.variables = self._extract_variables(template)
        
        if description is not None:
            template_obj.description = description
        
        if category is not None:
            template_obj.category = category
        
        if is_public is not None:
            template_obj.is_public = is_public
        
        if is_favorite is not None:
            template_obj.is_favorite = is_favorite
        
        template_obj.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(template_obj)
        
        return self._template_to_dict(template_obj)
    
    async def delete_template(
        self,
        template_id: str,
        user_id: str
    ) -> bool:
        """
        Delete a template
        
        Args:
            template_id: Template ID
            user_id: User ID (must be owner)
        
        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            select(PromptTemplate).where(
                and_(
                    PromptTemplate.id == template_id,
                    PromptTemplate.user_id == user_id
                )
            )
        )
        template = result.scalar_one_or_none()
        
        if not template:
            return False
        
        await self.db.delete(template)
        await self.db.commit()
        
        return True
    
    async def render_template(
        self,
        template_id: str,
        user_id: str,
        variables: Dict[str, str]
    ) -> Optional[str]:
        """
        Render a template with variables
        
        Args:
            template_id: Template ID
            user_id: User ID
            variables: Variable values
        
        Returns:
            Rendered prompt or None
        """
        template = await self.get_template(template_id, user_id)
        
        if not template:
            return None
        
        rendered = self._render_template_string(
            template["template"],
            variables
        )
        
        # Increment use count
        await self._increment_use_count(template_id)
        
        return rendered
    
    async def create_version(
        self,
        template_id: str,
        user_id: str,
        template: str,
        description: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Create a new version of a template
        
        Args:
            template_id: Parent template ID
            user_id: User ID (must be owner)
            template: New template string
            description: Version description
        
        Returns:
            New version or None
        """
        # Get parent template
        result = await self.db.execute(
            select(PromptTemplate).where(
                and_(
                    PromptTemplate.id == template_id,
                    PromptTemplate.user_id == user_id
                )
            )
        )
        parent = result.scalar_one_or_none()
        
        if not parent:
            return None
        
        # Create new version
        variables = self._extract_variables(template)
        
        new_version = PromptTemplate(
            id=str(uuid.uuid4()),
            user_id=user_id,
            name=parent.name,
            description=description or parent.description,
            template=template,
            variables=variables,
            category=parent.category,
            is_public=parent.is_public,
            is_favorite=False,
            use_count=0,
            version=parent.version + 1,
            parent_id=template_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        self.db.add(new_version)
        await self.db.commit()
        await self.db.refresh(new_version)
        
        return self._template_to_dict(new_version)
    
    async def get_versions(
        self,
        template_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all versions of a template
        
        Args:
            template_id: Template ID
            user_id: User ID
        
        Returns:
            List of versions
        """
        # Get template and all its versions
        result = await self.db.execute(
            select(PromptTemplate).where(
                and_(
                    or_(
                        PromptTemplate.id == template_id,
                        PromptTemplate.parent_id == template_id
                    ),
                    PromptTemplate.user_id == user_id
                )
            ).order_by(PromptTemplate.version.asc())
        )
        versions = result.scalars().all()
        
        return [self._template_to_dict(v) for v in versions]
    
    def _extract_variables(self, template: str) -> List[str]:
        """
        Extract variable names from template
        
        Variables are in the format {{variable_name}}
        
        Args:
            template: Template string
        
        Returns:
            List of variable names
        """
        pattern = r'\{\{(\w+)\}\}'
        matches = re.findall(pattern, template)
        return list(set(matches))  # Remove duplicates
    
    def _render_template_string(
        self,
        template: str,
        variables: Dict[str, str]
    ) -> str:
        """
        Render template string with variables
        
        Args:
            template: Template string
            variables: Variable values
        
        Returns:
            Rendered string
        """
        rendered = template
        
        for key, value in variables.items():
            pattern = r'\{\{' + key + r'\}\}'
            rendered = re.sub(pattern, value, rendered)
        
        return rendered
    
    async def _increment_use_count(self, template_id: str):
        """Increment template use count"""
        result = await self.db.execute(
            select(PromptTemplate).where(PromptTemplate.id == template_id)
        )
        template = result.scalar_one_or_none()
        
        if template:
            template.use_count += 1
            await self.db.commit()
    
    def _template_to_dict(self, template: PromptTemplate) -> Dict[str, Any]:
        """Convert template to dictionary"""
        return {
            "id": template.id,
            "user_id": template.user_id,
            "name": template.name,
            "description": template.description,
            "template": template.template,
            "variables": template.variables or [],
            "category": template.category,
            "is_public": template.is_public,
            "is_favorite": template.is_favorite,
            "use_count": template.use_count,
            "version": template.version,
            "parent_id": template.parent_id,
            "created_at": template.created_at.isoformat(),
            "updated_at": template.updated_at.isoformat()
        }
