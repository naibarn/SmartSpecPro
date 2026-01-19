"""
Tests for CustomSkillPrompt Model
"""

import pytest
from datetime import datetime
import uuid

from app.models.custom_skill_prompt import CustomSkillPrompt, SkillPromptTemplate
from app.models.user import User


@pytest.mark.unit
class TestCustomSkillPromptModel:
    """Test CustomSkillPrompt model"""

    @pytest.mark.asyncio
    async def test_create_custom_prompt(self, test_db):
        """Test creating a custom skill prompt"""
        # Create user
        user = User(
            id=str(uuid.uuid4()),
            email="test@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        # Create custom prompt
        custom_prompt = CustomSkillPrompt(
            id=str(uuid.uuid4()),
            user_id=user.id,
            skill_id="image-prompt-enhancer",
            custom_system_prompt="You are a fantasy specialist.",
            template_variables={"style": "fantasy"},
            is_active=True
        )
        test_db.add(custom_prompt)
        await test_db.commit()
        await test_db.refresh(custom_prompt)

        assert custom_prompt.id is not None
        assert custom_prompt.user_id == user.id
        assert custom_prompt.skill_id == "image-prompt-enhancer"
        assert "fantasy" in custom_prompt.custom_system_prompt
        assert custom_prompt.is_active is True

    @pytest.mark.asyncio
    async def test_custom_prompt_to_dict(self, test_db):
        """Test to_dict method"""
        user = User(
            id=str(uuid.uuid4()),
            email="test2@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        custom_prompt = CustomSkillPrompt(
            user_id=user.id,
            skill_id="video-prompt-enhancer",
            custom_system_prompt="Test prompt",
            is_active=False
        )
        test_db.add(custom_prompt)
        await test_db.commit()
        await test_db.refresh(custom_prompt)

        result = custom_prompt.to_dict()

        assert result["id"] is not None
        assert result["user_id"] == user.id
        assert result["skill_id"] == "video-prompt-enhancer"
        assert result["custom_system_prompt"] == "Test prompt"
        assert result["is_active"] is False
        assert "created_at" in result
        assert "updated_at" in result

    @pytest.mark.asyncio
    async def test_template_variables(self, test_db):
        """Test template variables storage"""
        user = User(
            id=str(uuid.uuid4()),
            email="test3@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        variables = {
            "style": "photorealistic",
            "model": "dalle-3",
            "quality": "hd"
        }

        custom_prompt = CustomSkillPrompt(
            user_id=user.id,
            skill_id="image-prompt-enhancer",
            custom_system_prompt="Test with variables",
            template_variables=variables
        )
        test_db.add(custom_prompt)
        await test_db.commit()
        await test_db.refresh(custom_prompt)

        assert custom_prompt.template_variables == variables
        assert custom_prompt.template_variables["style"] == "photorealistic"


@pytest.mark.unit
class TestSkillPromptTemplateModel:
    """Test SkillPromptTemplate model"""

    @pytest.mark.asyncio
    async def test_create_template(self, test_db):
        """Test creating a prompt template"""
        template = SkillPromptTemplate(
            id=str(uuid.uuid4()),
            skill_id="image-prompt-enhancer",
            name="Fantasy Art",
            description="For fantasy themes",
            system_prompt="You are a fantasy specialist",
            category="art",
            is_public=True,
            usage_count=0
        )
        test_db.add(template)
        await test_db.commit()
        await test_db.refresh(template)

        assert template.id is not None
        assert template.skill_id == "image-prompt-enhancer"
        assert template.name == "Fantasy Art"
        assert template.is_public is True
        assert template.usage_count == 0

    @pytest.mark.asyncio
    async def test_template_to_dict(self, test_db):
        """Test template to_dict method"""
        template = SkillPromptTemplate(
            skill_id="video-prompt-enhancer",
            name="Documentary Style",
            system_prompt="You are a documentary filmmaker",
            category="video"
        )
        test_db.add(template)
        await test_db.commit()
        await test_db.refresh(template)

        result = template.to_dict()

        assert result["skill_id"] == "video-prompt-enhancer"
        assert result["name"] == "Documentary Style"
        assert result["category"] == "video"
        assert "created_at" in result

    @pytest.mark.asyncio
    async def test_template_usage_count(self, test_db):
        """Test template usage count tracking"""
        template = SkillPromptTemplate(
            skill_id="code-reviewer",
            name="Security Focus",
            system_prompt="Security-focused reviewer",
            usage_count=0
        )
        test_db.add(template)
        await test_db.commit()
        await test_db.refresh(template)

        # Increment usage
        template.usage_count += 1
        await test_db.commit()
        await test_db.refresh(template)

        assert template.usage_count == 1
