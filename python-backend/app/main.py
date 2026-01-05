# Patch: OpenAI-compatible chat (multimodal) via website gateway + MCP-ready

from fastapi import FastAPI

from app.api.orchestrator import router as orchestrator_router
from app.api.control_plane_proxy import router as control_plane_proxy_router

from app.api.kilo_cli import router as kilo_compat_router
from app.api.kilo_pty import router as kilo_pty_router
from app.api.kilo_media import router as kilo_media_router

from app.api.llm_openai_compat import router as llm_openai_compat_router

app = FastAPI(title="SmartSpec Python Backend")

app.include_router(orchestrator_router)
app.include_router(control_plane_proxy_router)

app.include_router(kilo_compat_router)
app.include_router(kilo_pty_router)
app.include_router(kilo_media_router)

# OpenAI-compatible surface for chat UI / proxy-LLM clients
app.include_router(llm_openai_compat_router)

@app.get("/healthz")
def healthz():
    return {"ok": True}
