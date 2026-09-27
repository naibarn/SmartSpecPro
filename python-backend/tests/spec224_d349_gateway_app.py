"""Small test-only FastAPI surface using the real approvals router and DB service."""

from fastapi import FastAPI

from app.api.approvals import router as approvals_router

app = FastAPI()
app.include_router(approvals_router)
