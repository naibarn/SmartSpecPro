from fastapi import APIRouter

from app.api.v1.auth_generator import router as auth_generator_router
from app.api.v1.skills import router as skills_router
from app.api.v1.media_generation import router as media_generation_router

api_router = APIRouter()
api_router.include_router(auth_generator_router, prefix="/auth", tags=["auth"])
api_router.include_router(skills_router, prefix="/skills", tags=["skills"])
api_router.include_router(media_generation_router, prefix="/media", tags=["media"])
