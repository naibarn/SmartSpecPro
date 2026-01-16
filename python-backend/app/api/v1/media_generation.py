from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import ImageGenerationRequest, ImageGenerationResponse, VideoGenerationRequest, VideoGenerationResponse, AudioGenerationRequest, AudioGenerationResponse
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User

logger = structlog.get_logger()
router = APIRouter()

@router.post("/image", response_model=ImageGenerationResponse)
async def generate_image_endpoint(
    request: ImageGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate an image using Kie.ai and handle credit deduction.
    """
    gateway = LLMGateway(db)
    try:
        response = await gateway.generate_image(request, current_user)
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("image_generation_endpoint_error", user_id=current_user.id, error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")

@router.post("/video", response_model=VideoGenerationResponse)
async def generate_video_endpoint(
    request: VideoGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate a video using Kie.ai and handle credit deduction.
    """
    gateway = LLMGateway(db)
    try:
        response = await gateway.generate_video(request, current_user)
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("video_generation_endpoint_error", user_id=current_user.id, error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")

@router.post("/audio", response_model=AudioGenerationResponse)
async def generate_audio_endpoint(
    request: AudioGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate audio using Kie.ai and handle credit deduction.
    """
    gateway = LLMGateway(db)
    try:
        response = await gateway.generate_audio(request, current_user)
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("audio_generation_endpoint_error", user_id=current_user.id, error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")
