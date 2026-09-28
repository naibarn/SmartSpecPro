"""Regression inventory for direct Python LLM inference entrypoints.

This AST check intentionally covers statically visible client calls only. It
does not claim to find dynamic imports, reflection, string-built SDK methods,
or calls made by external processes.
"""

import ast
import json
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
REPO_ROOT = Path(__file__).resolve().parents[2]
ADOPTION_INVENTORY = (
    REPO_ROOT
    / "specs/feature/231-Unified LLM Routing & Inference Orchestration/implementation/consumer-adoption-inventory.json"
)
GATEWAY_METHODS = {
    "chat",
    "chat_completion",
    "chat_completion_stream",
    "complete",
    "invoke",
    "responses_completion",
}
PROVIDER_ENDPOINTS = {
    "chat.completions.create",
    "responses.create",
    "messages.create",
    "embeddings.create",
    "audio.transcriptions.create",
    "audio.speech.create",
    "moderations.create",
}

# (source path relative to app/, outer source function, call target, count)
EXPECTED_CALLERS = {
    ("api/internal_library.py", "_call_gateway_multimodal_vision_bytes", "gateway.chat_completion", 1),
    ("api/internal_library.py", "_call_gateway_multimodal_vision_bytes", "gateway.responses_completion", 1),
    ("api/llm_proxy.py", "invoke_llm", "gateway.invoke", 1),
    ("api/llm_proxy.py", "simple_llm", "gateway.invoke", 1),
    ("api/llm_proxy.py", "test_llm", "gateway.invoke", 1),
    ("api/llm_v1.py", "chat_completion", "llm_client.chat_completion", 1),
    ("api/openai_compat.py", "chat_completions", "client.chat", 1),
    ("api/opencode_gateway.py", "create_chat_completion", "gateway.chat_completion", 1),
    ("api/opencode_gateway.py", "_stream_completion", "gateway.chat_completion_stream", 1),
    ("api/v1/prompt_enhancement.py", "enhance_prompt_with_ai", "gateway.chat_completion", 1),
    ("api/v1/prompt_enhancement.py", "generate_variations", "gateway.chat_completion", 1),
    ("api/v1/prompt_enhancement.py", "analyze_prompt", "gateway.chat_completion", 1),
    ("kilo/memory_extractor.py", "extract_memories", "self.client.chat.completions.create", 1),
    ("kilo/memory_extractor.py", "_save_embedding", "self.client.embeddings.create", 1),
    ("kilo/memory_extractor.py", "get_relevant_memories", "self.client.embeddings.create", 1),
    ("orchestrator/node_executors/social/classify_intent_executor.py", "execute", "client.chat", 1),
    ("orchestrator/node_executors/social/draft_reply_executor.py", "execute", "client.chat", 1),
    ("orchestrator/orchestrator.py", "_execute_llm_step_legacy", "llm_proxy.invoke", 1),
    ("orchestrator/rag/reranker.py", "_score_document", "self._llm_client.chat.completions.create", 1),
    ("orchestrator/rag/vector_retriever.py", "_get_openai_embedding", "self._embedding_client.embeddings.create", 1),
    ("orchestrator/vector_store/embedding_service.py", "_openai_embed", "self._openai_client.embeddings.create", 1),
    ("orchestrator/vector_store/embedding_service.py", "_openai_embed_batch", "self._openai_client.embeddings.create", 1),
    ("services/automation_copilot.py", "_analyze_intent", "self._gateway.chat_completion", 1),
    ("services/embedding_service.py", "embed_text", "self._client.embeddings.create", 1),
    ("services/embedding_service.py", "embed_texts", "self._client.embeddings.create", 1),
    ("services/llm_gateway_client.py", "vision_call", "self.chat_completion", 1),
    ("services/model_comparison_service.py", "_run_single_model", "self.llm_client.invoke", 1),
    ("services/moderation_service.py", "_check_openai_moderation", "self.openai_client.moderations.create", 1),
    ("services/playwright_script_generator.py", "_vision_llm_call", "self._gateway.chat_completion", 1),
    ("services/self_healing_executor.py", "_diagnose_failure", "self._gateway.chat_completion", 1),
    ("services/streaming_service.py", "stream", "client.chat.completions.create", 1),
    ("services/streaming_service.py", "stream", "self.llm_client.chat_completion", 1),
    ("services/summary_generator.py", "generate", "self.llm_client.chat", 1),
    ("tasks/unified_job_task.py", "run_unified_job", "client.complete", 1),
}


def _call_target(node: ast.Call) -> str | None:
    function = node.func
    if not isinstance(function, ast.Attribute):
        return None

    parts: list[str] = []
    current: ast.expr = function
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        parts.append(current.id)
    target = ".".join(reversed(parts))

    if function.attr in GATEWAY_METHODS:
        return target
    if function.attr == "create" and any(
        target.endswith(endpoint) for endpoint in PROVIDER_ENDPOINTS
    ):
        return target
    return None


def collect_python_callers() -> set[tuple[str, str, str, int]]:
    callers: dict[tuple[str, str, str], int] = {}
    for source in sorted(APP_ROOT.rglob("*.py")):
        relative = source.relative_to(APP_ROOT)
        # These are central implementation adapters, not consumer callsites.
        if relative.parts[0] == "llm_proxy":
            continue
        try:
            tree = ast.parse(source.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue

        function_stack: list[str] = []

        class Collector(ast.NodeVisitor):
            def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
                function_stack.append(node.name)
                self.generic_visit(node)
                function_stack.pop()

            visit_AsyncFunctionDef = visit_FunctionDef

            def visit_Call(self, node: ast.Call) -> None:
                target = _call_target(node)
                if target:
                    function_name = function_stack[0] if function_stack else "<module>"
                    key = (relative.as_posix(), function_name, target)
                    callers[key] = callers.get(key, 0) + 1
                self.generic_visit(node)

        Collector().visit(tree)

    return {(*key, count) for key, count in callers.items()}


def test_direct_python_llm_callers_match_reviewed_inventory() -> None:
    assert collect_python_callers() == EXPECTED_CALLERS


def test_static_python_callers_have_runtime_owner_and_adoption_records() -> None:
    manifest = json.loads(ADOPTION_INVENTORY.read_text(encoding="utf-8"))
    rows = {
        (
            row["sourcePath"],
            row["functionName"],
            row["target"],
            row["callsiteCount"],
        )
        for row in manifest["python"]
    }
    assert rows == EXPECTED_CALLERS
    assert all(
        row.get("runtimeOwnerClass")
        and row.get("runtimeClosure")
        and row.get("adoptionState")
        for row in manifest["python"]
    )
    assert all(
        row["adoptionState"] == "retired-do-not-extend"
        and row["runtimeOwnerClass"] == "retired-custom-workflow"
        for row in manifest["python"]
        if row["sourcePath"].startswith("orchestrator/")
    )
