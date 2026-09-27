"""Loopback-only ASGI host for the real Spec 224 approval API router."""

from fastapi import FastAPI

from app.api.approvals import router as approvals_router

app = FastAPI()
app.include_router(approvals_router)
