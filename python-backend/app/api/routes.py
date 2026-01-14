from __future__ import annotations

from fastapi import APIRouter
from app.api import llm_openai_compat
from app.api.v1 import api_router as v1_api_router

api_router = APIRouter()
api_router.include_router(llm_openai_compat.router, tags=["openai-compat"])
api_router.include_router(v1_api_router, prefix="/v1")
