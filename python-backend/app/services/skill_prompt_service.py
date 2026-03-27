"""
Skill Prompt Service
Manages custom skill prompts and templates
"""

from typing import Optional, List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime
import structlog

from app.models.custom_skill_prompt import CustomSkillPrompt, SkillPromptTemplate
from app.models.user import User

logger = structlog.get_logger()


# Default system prompts for built-in skills
DEFAULT_SKILL_PROMPTS = {
    "image-prompt-enhancer": """You are an expert prompt engineer specialized in image generation.
Your task is to enhance user prompts to create better, more detailed, and more effective prompts for AI image generation models.

Guidelines:
1. Add details about composition, lighting, style, mood, quality, camera angle
2. Keep the core idea but enhance with professional details
3. Be specific and descriptive
4. Use industry-standard terminology
5. Optimize for the target model

Provide enhanced prompts that will generate high-quality, professional images.""",

    "video-prompt-enhancer": """You are a cinematic expert specialized in video generation.
Your task is to enhance user prompts for AI video generation with professional details.

Guidelines:
1. Add details about movement, transitions, pacing, camera motion, scene flow
2. Describe temporal elements (how things change over time)
3. Include cinematography terms (dolly, pan, zoom, tracking shot)
4. Specify mood and atmosphere
5. Consider continuity and narrative flow

Provide enhanced prompts that will generate compelling, cinematic videos.""",

    "code-reviewer": """You are a senior software engineer specialized in code review.
Your task is to review code for bugs, best practices, and improvements.

Guidelines:
1. Check for common bugs and logic errors
2. Verify best practices are followed
3. Look for security vulnerabilities
4. Suggest performance improvements
5. Ensure code readability and maintainability

Provide constructive feedback with specific suggestions.""",

    "text-summarizer": """You are an expert at summarizing text clearly and concisely.
Your task is to create accurate, well-structured summaries.

Guidelines:
1. Capture the main points and key ideas
2. Maintain factual accuracy
3. Keep the summary clear and concise
4. Preserve important context
5. Use neutral, objective language

Provide summaries that effectively communicate the essence of the content.""",
}


class SkillPromptService:
    """Service for managing custom skill prompts"""

    @staticmethod
    async def get_effective_prompt(
        db: AsyncSession,
        user_id: int,
        skill_id: str,
        template_variables: Optional[Dict] = None
    ) -> str:
        """
        Get the effective system prompt for a skill.
        Returns custom prompt if exists and active, otherwise default.
        """
        # Try to get custom prompt
        query = select(CustomSkillPrompt).where(
            and_(
                CustomSkillPrompt.user_id == user_id,
                CustomSkillPrompt.skill_id == skill_id,
                CustomSkillPrompt.is_active == True
            )
        )
        result = await db.execute(query)
        custom = result.scalar_one_or_none()

        if custom:
            prompt = custom.custom_system_prompt

            # Apply template variables if provided
            if template_variables:
                # Merge with stored variables
                all_vars = {**(custom.template_variables or {}), **template_variables}
                try:
                    prompt = prompt.format(**all_vars)
                except KeyError as e:
                    logger.warning(
                        "template_variable_missing",
                        skill_id=skill_id,
                        missing_var=str(e)
                    )
                    # Continue with unformatted prompt

            logger.info(
                "using_custom_prompt",
                user_id=user_id,
                skill_id=skill_id,
                prompt_length=len(prompt)
            )
            return prompt

        # Return default prompt
        default_prompt = DEFAULT_SKILL_PROMPTS.get(
            skill_id,
            "You are a helpful AI assistant. Provide clear and accurate responses."
        )

        logger.info(
            "using_default_prompt",
            user_id=user_id,
            skill_id=skill_id
        )
        return default_prompt

    @staticmethod
    async def get_custom_prompt(
        db: AsyncSession,
        user_id: int,
        skill_id: str
    ) -> Optional[CustomSkillPrompt]:
        """Get user's custom prompt for a skill"""
        query = select(CustomSkillPrompt).where(
            and_(
                CustomSkillPrompt.user_id == user_id,
                CustomSkillPrompt.skill_id == skill_id
            )
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def save_custom_prompt(
        db: AsyncSession,
        user_id: int,
        skill_id: str,
        custom_prompt: str,
        template_variables: Optional[Dict] = None,
        is_active: bool = True
    ) -> CustomSkillPrompt:
        """Save or update custom prompt"""
        # Validate prompt
        if not custom_prompt or len(custom_prompt.strip()) == 0:
            raise ValueError("Custom prompt cannot be empty")

        if len(custom_prompt) > 50000:
            raise ValueError("Custom prompt is too long (max 50000 characters)")

        # Security check - prevent dangerous patterns
        dangerous_patterns = [
            "ignore previous instructions",
            "system: you are now",
            "disregard all previous",
        ]
        prompt_lower = custom_prompt.lower()
        for pattern in dangerous_patterns:
            if pattern in prompt_lower:
                raise ValueError(f"Prompt contains potentially dangerous pattern: {pattern}")

        # Check if exists
        existing = await SkillPromptService.get_custom_prompt(db, user_id, skill_id)

        if existing:
            # Update
            existing.custom_system_prompt = custom_prompt
            existing.template_variables = template_variables
            existing.is_active = is_active
            existing.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing)
            logger.info(
                "custom_prompt_updated",
                user_id=user_id,
                skill_id=skill_id,
                prompt_length=len(custom_prompt)
            )
            return existing
        else:
            # Create
            new_prompt = CustomSkillPrompt(
                user_id=user_id,
                skill_id=skill_id,
                custom_system_prompt=custom_prompt,
                template_variables=template_variables,
                is_active=is_active
            )
            db.add(new_prompt)
            await db.commit()
            await db.refresh(new_prompt)
            logger.info(
                "custom_prompt_created",
                user_id=user_id,
                skill_id=skill_id,
                prompt_length=len(custom_prompt)
            )
            return new_prompt

    @staticmethod
    async def delete_custom_prompt(
        db: AsyncSession,
        user_id: int,
        skill_id: str
    ) -> bool:
        """Delete custom prompt (reset to default)"""
        custom = await SkillPromptService.get_custom_prompt(db, user_id, skill_id)
        if custom:
            await db.delete(custom)
            await db.commit()
            logger.info(
                "custom_prompt_deleted",
                user_id=user_id,
                skill_id=skill_id
            )
            return True
        return False

    @staticmethod
    async def toggle_prompt_active(
        db: AsyncSession,
        user_id: int,
        skill_id: str,
        is_active: bool
    ) -> Optional[CustomSkillPrompt]:
        """Toggle custom prompt active status"""
        custom = await SkillPromptService.get_custom_prompt(db, user_id, skill_id)
        if custom:
            custom.is_active = is_active
            custom.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(custom)
            logger.info(
                "custom_prompt_toggled",
                user_id=user_id,
                skill_id=skill_id,
                is_active=is_active
            )
            return custom
        return None

    @staticmethod
    async def list_user_custom_prompts(
        db: AsyncSession,
        user_id: int
    ) -> List[CustomSkillPrompt]:
        """List all custom prompts for a user"""
        query = select(CustomSkillPrompt).where(
            CustomSkillPrompt.user_id == user_id
        ).order_by(CustomSkillPrompt.updated_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    def get_available_skills() -> List[Dict]:
        """Get list of skills that support customization"""
        return [
            {
                "skill_id": "image-prompt-enhancer",
                "name": "Image Prompt Enhancement",
                "category": "media_generation",
                "description": "Enhance prompts for image generation",
                "default_prompt": DEFAULT_SKILL_PROMPTS["image-prompt-enhancer"],
                "template_variables": ["style", "model", "quality", "mood"]
            },
            {
                "skill_id": "video-prompt-enhancer",
                "name": "Video Prompt Enhancement",
                "category": "media_generation",
                "description": "Enhance prompts for video generation",
                "default_prompt": DEFAULT_SKILL_PROMPTS["video-prompt-enhancer"],
                "template_variables": ["duration", "model", "style", "camera_work"]
            },
            {
                "skill_id": "code-reviewer",
                "name": "Code Review",
                "category": "development",
                "description": "Review code for quality and issues",
                "default_prompt": DEFAULT_SKILL_PROMPTS["code-reviewer"],
                "template_variables": ["language", "focus_area"]
            },
            {
                "skill_id": "text-summarizer",
                "name": "Text Summarization",
                "category": "text_processing",
                "description": "Summarize text content",
                "default_prompt": DEFAULT_SKILL_PROMPTS["text-summarizer"],
                "template_variables": ["length", "format"]
            },
        ]

    # Template Management

    @staticmethod
    async def get_templates_for_skill(
        db: AsyncSession,
        skill_id: str
    ) -> List[SkillPromptTemplate]:
        """Get available templates for a skill"""
        query = select(SkillPromptTemplate).where(
            and_(
                SkillPromptTemplate.skill_id == skill_id,
                SkillPromptTemplate.is_public == True
            )
        ).order_by(SkillPromptTemplate.usage_count.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def apply_template(
        db: AsyncSession,
        user_id: int,
        template_id: str
    ) -> CustomSkillPrompt:
        """Apply a template to user's custom prompt"""
        # Get template
        query = select(SkillPromptTemplate).where(SkillPromptTemplate.id == template_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise ValueError(f"Template {template_id} not found")

        # Increment usage count
        template.usage_count += 1

        # Apply template
        custom_prompt = await SkillPromptService.save_custom_prompt(
            db,
            user_id,
            template.skill_id,
            template.system_prompt,
            template.template_variables,
            is_active=True
        )

        await db.commit()

        logger.info(
            "template_applied",
            user_id=user_id,
            template_id=template_id,
            skill_id=template.skill_id
        )

        return custom_prompt
# mypy: ignore-errors
# mypy: ignore-errors
