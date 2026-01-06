from __future__ import annotations

from fastapi import APIRouter
from app.api import llm_openai_compat

api_router = APIRouter()
api_router.include_router(llm_openai_compat.router, tags=["openai-compat"])
