"""
Prompt Enhancement API
Provides AI-powered prompt enhancement and optimization for media generation
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
import structlog

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.llm_proxy.gateway_unified import LLMGateway

logger = structlog.get_logger()
router = APIRouter()


# ==================== Request/Response Models ====================

class PromptEnhancementRequest(BaseModel):
    """Request model for prompt enhancement"""
    userInput: str
    mediaType: str  # "image" or "video"
    targetModel: Optional[str] = None
    style: Optional[str] = None
    referenceImages: Optional[List[str]] = None
    additionalContext: Optional[str] = None


class PromptEnhancementResponse(BaseModel):
    """Response model for enhanced prompt"""
    enhancedPrompt: str
    originalPrompt: str
    improvements: List[str]
    suggestions: List[str]
    estimatedQuality: int  # 1-10


class PromptVariationsRequest(BaseModel):
    """Request model for prompt variations"""
    basePrompt: str
    mediaType: str
    count: int = 3


class PromptVariationsResponse(BaseModel):
    """Response model for prompt variations"""
    variations: List[str]


class PromptAnalysisRequest(BaseModel):
    """Request model for prompt analysis"""
    prompt: str
    mediaType: str


class PromptAnalysisResponse(BaseModel):
    """Response model for prompt analysis"""
    score: int  # 1-10
    issues: List[str]
    suggestions: List[str]


# ==================== Helper Functions ====================

async def enhance_prompt_with_ai(
    user_input: str,
    media_type: str,
    target_model: Optional[str],
    style: Optional[str],
    reference_images: Optional[List[str]],
    additional_context: Optional[str],
    db: AsyncSession,
    current_user: User
) -> PromptEnhancementResponse:
    """Use AI to enhance the user's prompt"""

    # Build enhancement prompt for LLM
    system_prompt = f"""You are an expert prompt engineer specialized in {media_type} generation.
Your task is to enhance user prompts to create better, more detailed, and more effective prompts for AI {media_type} generation models.

Guidelines:
1. For IMAGES: Add details about composition, lighting, style, mood, quality, camera angle
2. For VIDEOS: Add details about movement, transitions, pacing, camera motion, scene flow
3. Keep the core idea but enhance with professional details
4. Be specific and descriptive
5. Use industry-standard terminology
6. Optimize for the target model: {target_model or 'general'}
"""

    if style:
        system_prompt += f"\n7. Apply {style} style characteristics"

    if reference_images:
        system_prompt += f"\n8. Consider reference elements: {', '.join(reference_images)}"

    if additional_context:
        system_prompt += f"\n9. Context: {additional_context}"

    user_prompt = f"""Original user input: "{user_input}"

Please provide:
1. An enhanced, professional prompt (2-3 sentences)
2. List 3-5 specific improvements you made
3. List 2-3 additional suggestions for variation

Format your response as JSON:
{{
    "enhancedPrompt": "...",
    "improvements": ["...", "..."],
    "suggestions": ["...", "..."],
    "estimatedQuality": 8
}}"""

    # Call LLM Gateway
    gateway = LLMGateway(db)

    try:
        # Use chat completion for prompt enhancement
        from app.llm_proxy.models import ChatCompletionRequest, Message

        chat_request = ChatCompletionRequest(
            model="claude-3-5-sonnet-20241022",  # Use Claude for best prompt engineering
            messages=[
                Message(role="system", content=system_prompt),
                Message(role="user", content=user_prompt)
            ],
            max_tokens=1000,
            temperature=0.7
        )

        response = await gateway.chat_completion(chat_request, current_user)

        # Parse response
        import json
        result_text = response.message.content

        # Try to extract JSON from response
        try:
            # Find JSON in response
            start_idx = result_text.find('{')
            end_idx = result_text.rfind('}') + 1
            json_str = result_text[start_idx:end_idx]
            result = json.loads(json_str)

            return PromptEnhancementResponse(
                enhancedPrompt=result.get("enhancedPrompt", user_input),
                originalPrompt=user_input,
                improvements=result.get("improvements", []),
                suggestions=result.get("suggestions", []),
                estimatedQuality=result.get("estimatedQuality", 7)
            )
        except (json.JSONDecodeError, ValueError):
            # Fallback if JSON parsing fails
            logger.warning("Failed to parse JSON from LLM response, using fallback")
            return PromptEnhancementResponse(
                enhancedPrompt=result_text[:500] if len(result_text) > 500 else result_text,
                originalPrompt=user_input,
                improvements=["Enhanced with AI assistance"],
                suggestions=["Try different styles", "Add more details"],
                estimatedQuality=7
            )

    except Exception as e:
        logger.error("prompt_enhancement_error", error=str(e))
        # Return original prompt if enhancement fails
        return PromptEnhancementResponse(
            enhancedPrompt=user_input,
            originalPrompt=user_input,
            improvements=[],
            suggestions=["Enhancement service temporarily unavailable"],
            estimatedQuality=5
        )


# ==================== API Endpoints ====================

@router.post("/enhance", response_model=PromptEnhancementResponse)
async def enhance_prompt(
    request: PromptEnhancementRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Enhance a user prompt with AI assistance.
    Optimizes prompts for better image/video generation results.
    """
    try:
        result = await enhance_prompt_with_ai(
            user_input=request.userInput,
            media_type=request.mediaType,
            target_model=request.targetModel,
            style=request.style,
            reference_images=request.referenceImages,
            additional_context=request.additionalContext,
            db=db,
            current_user=current_user
        )
        return result
    except Exception as e:
        logger.error("enhance_prompt_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enhance prompt: {str(e)}"
        )


@router.post("/variations", response_model=PromptVariationsResponse)
async def generate_variations(
    request: PromptVariationsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate multiple variations of a prompt.
    Useful for exploring different creative directions.
    """
    try:
        gateway = LLMGateway(db)

        from app.llm_proxy.models import ChatCompletionRequest, Message

        system_prompt = f"""Generate {request.count} creative variations of the user's {request.mediaType} prompt.
Each variation should:
1. Maintain the core concept
2. Explore different angles/perspectives
3. Add unique details
4. Be ready to use directly

Return ONLY a JSON array of strings, no other text."""

        chat_request = ChatCompletionRequest(
            model="claude-3-5-sonnet-20241022",
            messages=[
                Message(role="system", content=system_prompt),
                Message(role="user", content=f"Base prompt: {request.basePrompt}")
            ],
            max_tokens=800,
            temperature=0.9  # Higher temperature for more creativity
        )

        response = await gateway.chat_completion(chat_request, current_user)

        # Parse variations
        import json
        result_text = response.message.content

        try:
            # Try to extract JSON array
            start_idx = result_text.find('[')
            end_idx = result_text.rfind(']') + 1
            json_str = result_text[start_idx:end_idx]
            variations = json.loads(json_str)

            return PromptVariationsResponse(variations=variations[:request.count])
        except (json.JSONDecodeError, ValueError):
            # Fallback: split by newlines
            lines = [line.strip() for line in result_text.split('\n') if line.strip() and len(line.strip()) > 20]
            return PromptVariationsResponse(variations=lines[:request.count])

    except Exception as e:
        logger.error("generate_variations_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate variations: {str(e)}"
        )


@router.post("/analyze", response_model=PromptAnalysisResponse)
async def analyze_prompt(
    request: PromptAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Analyze prompt quality and provide improvement suggestions.
    Helps users understand what makes a good prompt.
    """
    try:
        gateway = LLMGateway(db)

        from app.llm_proxy.models import ChatCompletionRequest, Message

        system_prompt = f"""Analyze this {request.mediaType} generation prompt for quality and effectiveness.

Provide:
1. A score from 1-10 (10 being excellent)
2. List of specific issues (if any)
3. List of actionable suggestions for improvement

Return as JSON:
{{
    "score": 7,
    "issues": ["..."],
    "suggestions": ["..."]
}}"""

        chat_request = ChatCompletionRequest(
            model="claude-3-5-sonnet-20241022",
            messages=[
                Message(role="system", content=system_prompt),
                Message(role="user", content=f"Prompt to analyze: {request.prompt}")
            ],
            max_tokens=500,
            temperature=0.3  # Lower temperature for consistent analysis
        )

        response = await gateway.chat_completion(chat_request, current_user)

        # Parse analysis
        import json
        result_text = response.message.content

        try:
            start_idx = result_text.find('{')
            end_idx = result_text.rfind('}') + 1
            json_str = result_text[start_idx:end_idx]
            result = json.loads(json_str)

            return PromptAnalysisResponse(
                score=min(10, max(1, result.get("score", 5))),
                issues=result.get("issues", []),
                suggestions=result.get("suggestions", [])
            )
        except (json.JSONDecodeError, ValueError):
            # Fallback
            return PromptAnalysisResponse(
                score=5,
                issues=["Unable to analyze prompt structure"],
                suggestions=["Try adding more descriptive details", "Specify style and mood"]
            )

    except Exception as e:
        logger.error("analyze_prompt_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze prompt: {str(e)}"
        )
