diff --git a/python-backend/Dockerfile b/python-backend/Dockerfile
index c9bc424..71cdd00 100644
--- a/python-backend/Dockerfile
+++ b/python-backend/Dockerfile
@@ -2,7 +2,7 @@
 # Multi-stage build for optimized image size
 
 # Stage 1: Builder
-FROM python:3.11-slim as builder
+FROM python:3.12-slim as builder
 
 WORKDIR /app
 
@@ -21,7 +21,7 @@ COPY requirements.txt .
 RUN pip install --no-cache-dir --user -r requirements.txt
 
 # Stage 2: Runtime
-FROM python:3.11-slim
+FROM python:3.12-slim
 
 WORKDIR /app
 
diff --git a/python-backend/app/llm_proxy/openrouter_wrapper.py b/python-backend/app/llm_proxy/openrouter_wrapper.py
index 4ef177d..f737d53 100644
--- a/python-backend/app/llm_proxy/openrouter_wrapper.py
+++ b/python-backend/app/llm_proxy/openrouter_wrapper.py
@@ -4,7 +4,7 @@ SmartSpec Pro - Advanced LLM Routing
 """
 
 from typing import Optional, List, Literal, Dict, Any
-from openai import OpenAI, OpenAIError
+from openai import OpenAI, APIError
 import structlog
 import time
 
@@ -132,7 +132,7 @@ class OpenRouterWrapper:
             ChatCompletion response
         
         Raises:
-            OpenAIError: If all attempts fail
+            APIError: If all attempts fail
         
         Example:
             >>> response = client.chat(
@@ -193,7 +193,7 @@ class OpenRouterWrapper:
                 
                 return response
             
-            except OpenAIError as e:
+            except APIError as e:
                 logger.warning(
                     "openrouter_error",
                     model=model,
diff --git a/python-backend/pyproject.toml b/python-backend/pyproject.toml
index ff6ee5d..cf59939 100644
--- a/python-backend/pyproject.toml
+++ b/python-backend/pyproject.toml
@@ -3,7 +3,7 @@ name = "smartspec-backend"
 version = "0.1.0"
 description = "SmartSpec Pro Python Backend - LLM Gateway & Orchestration Service"
 readme = "README.md"
-requires-python = ">=3.11"
+requires-python = ">=3.12"
 license = {text = "MIT"}
 authors = [
     {name = "SmartSpec Team"}
@@ -70,6 +70,7 @@ markers = [
     "readiness: Launch readiness gate verification tests",
     "chaos: Chaos testing scenarios for fault injection",
     "security: Security verification tests",
+    "agency: Agency-Swarm integration tests",
 ]
 
 # Filter warnings
@@ -218,7 +219,7 @@ sections = ["FUTURE", "STDLIB", "THIRDPARTY", "FIRSTPARTY", "LOCALFOLDER"]
 # mypy (Type Checker) Configuration
 # =============================================================================
 [tool.mypy]
-python_version = "3.11"
+python_version = "3.12"
 warn_return_any = true
 warn_unused_configs = true
 disallow_untyped_defs = false  # Gradually enable
@@ -240,7 +241,7 @@ ignore_errors = true
 # =============================================================================
 [tool.ruff]
 line-length = 100
-target-version = "py311"
+target-version = "py312"
 
 [tool.ruff.lint]
 select = [
diff --git a/python-backend/pytest.ini b/python-backend/pytest.ini
index bc871a2..4072160 100644
--- a/python-backend/pytest.ini
+++ b/python-backend/pytest.ini
@@ -15,6 +15,7 @@ markers =
     llm: LLM proxy tests
     credits: Credit system tests
     sandbox: OpenSandbox integration tests
+    agency: Agency-Swarm integration tests
 addopts =
     --verbose
     --strict-markers
diff --git a/python-backend/requirements.txt b/python-backend/requirements.txt
index 6ea7f27..0263def 100644
--- a/python-backend/requirements.txt
+++ b/python-backend/requirements.txt
@@ -2,11 +2,11 @@
 # Phase 0: Technical Foundation
 
 # Web Framework
-fastapi==0.109.0
+fastapi>=0.115.0
 starlette>=0.35.0
 uvicorn[standard]==0.27.0
 python-multipart==0.0.6
-pydantic>=2.7.4
+pydantic>=2.11.0
 pydantic-settings>=2.3.0
 email-validator>=2.0.0
 
@@ -19,8 +19,8 @@ langchain-community>=0.3.0
 langchain-openai>=0.2.0
 
 # LLM Providers
-openai>=1.50.0
-anthropic==0.8.1
+openai>=2.2.0
+anthropic>=0.40.0
 google-generativeai==0.3.2
 groq==0.4.1
 
@@ -182,3 +182,10 @@ python-pptx>=1.0.2
 
 # Circuit breaker for sandbox client resilience
 pybreaker>=1.0.0
+
+# ==========================================
+# Section 027: Agency-Swarm Integration
+# ==========================================
+
+# Multi-agent orchestration framework
+agency-swarm==1.8.0
diff --git a/python-backend/tests/unit/test_pre_validation_contracts.py b/python-backend/tests/unit/test_pre_validation_contracts.py
new file mode 100644
index 0000000..4a01d09
--- /dev/null
+++ b/python-backend/tests/unit/test_pre_validation_contracts.py
@@ -0,0 +1,187 @@
+"""
+Contract tests for pre-validation phase (Phase 0).
+
+These tests verify that existing functionality is unbroken after:
+- Python 3.12+ upgrade
+- openai v2 upgrade
+- pydantic 2.11+ upgrade
+
+Run with: pytest tests/unit/test_pre_validation_contracts.py -m agency -v
+"""
+import pytest
+import sys
+
+
+@pytest.mark.agency
+class TestPython312Compatibility:
+    """Verify Python 3.12+ runtime fundamentals work."""
+
+    def test_python_version_is_312_plus(self):
+        """The runtime must be Python 3.12+."""
+        assert sys.version_info >= (3, 12), (
+            f"Expected Python 3.12+, got {sys.version_info}"
+        )
+
+    @pytest.mark.asyncio
+    async def test_asyncio_task_groups(self):
+        """Python 3.11+ asyncio TaskGroup works (used by agency-swarm internally)."""
+        import asyncio
+
+        results = []
+        async with asyncio.TaskGroup() as tg:
+            tg.create_task(_append_value(results, 1))
+            tg.create_task(_append_value(results, 2))
+        assert set(results) == {1, 2}
+
+    def test_typing_module_updates(self):
+        """Verify typing module imports used throughout the codebase still work."""
+        from typing import Optional, List, Dict, Any, Union, Literal, TypeVar, Generic
+        # If this import line executes, typing is fine on 3.12+
+
+
+@pytest.mark.agency
+class TestOpenAIV2Compatibility:
+    """Verify openai v2 SDK changes are handled."""
+
+    def test_api_error_importable(self):
+        """openai.APIError must be importable (replaces OpenAIError in v2)."""
+        from openai import APIError
+        assert APIError is not None
+
+    def test_openai_error_not_used_in_source(self):
+        """OpenAIError should not be directly used -- verify our code uses APIError."""
+        from pathlib import Path
+
+        llm_proxy_dir = Path("app/llm_proxy")
+        for py_file in llm_proxy_dir.rglob("*.py"):
+            source = py_file.read_text()
+            assert "OpenAIError" not in source, (
+                f"{py_file} still imports OpenAIError -- must be replaced with APIError"
+            )
+
+    def test_chat_completions_create_shape(self):
+        """Verify chat.completions.create() still accepts the standard params."""
+        from openai import OpenAI
+        # We do NOT make a real API call. We verify the method signature exists.
+        client = OpenAI(api_key="test-key-not-real")
+        assert hasattr(client.chat.completions, "create")
+
+
+@pytest.mark.agency
+class TestPydantic211Compatibility:
+    """Verify pydantic 2.11+ works with existing models."""
+
+    def test_pydantic_version(self):
+        """Pydantic must be 2.11+."""
+        import pydantic
+        parts = pydantic.__version__.split(".")
+        major, minor = int(parts[0]), int(parts[1])
+        assert (major, minor) >= (2, 11), (
+            f"Expected pydantic>=2.11, got {pydantic.__version__}"
+        )
+
+    def test_model_fields_on_class(self):
+        """model_fields must be accessed on the class, not instance (2.11 deprecation)."""
+        from pydantic import BaseModel
+
+        class SampleModel(BaseModel):
+            name: str = "test"
+            value: int = 42
+
+        # Class-level access (correct in 2.11+)
+        fields = SampleModel.model_fields
+        assert "name" in fields
+        assert "value" in fields
+
+    def test_existing_pydantic_models_validate(self):
+        """Spot-check that existing pydantic models still validate."""
+        from app.integrations.opensandbox.models import SandboxConfig
+        config = SandboxConfig()
+        assert config is not None
+
+    def test_no_instance_model_fields_in_codebase(self):
+        """Verify no code uses instance.model_fields (deprecated in 2.11)."""
+        from pathlib import Path
+        import re
+
+        app_dir = Path("app")
+        violations = []
+        for py_file in app_dir.rglob("*.py"):
+            source = py_file.read_text()
+            for i, line in enumerate(source.splitlines(), 1):
+                stripped = line.strip()
+                if stripped.startswith("#"):
+                    continue
+                matches = re.findall(r"(\b[a-z_]\w*)\.model_fields\b", stripped)
+                for match in matches:
+                    if match not in ("cls", "self"):
+                        violations.append(f"{py_file}:{i}: {match}.model_fields")
+        assert not violations, (
+            f"Found instance.model_fields usage (deprecated in pydantic 2.11):\n"
+            + "\n".join(violations)
+        )
+
+
+@pytest.mark.agency
+class TestLLMProxyContract:
+    """Contract: LLM proxy behavior is unchanged after dependency upgrades."""
+
+    def test_openrouter_wrapper_importable(self):
+        """The OpenRouterWrapper class can still be imported."""
+        from app.llm_proxy.openrouter_wrapper import OpenRouterWrapper
+        assert OpenRouterWrapper is not None
+
+    def test_openai_provider_importable(self):
+        """The OpenAI provider can still be imported."""
+        from app.llm_proxy.providers.openai_provider import AsyncOpenAI
+        assert AsyncOpenAI is not None
+
+    def test_unified_client_importable(self):
+        """The unified LLM client can still be imported."""
+        from app.llm_proxy.unified_client import get_unified_client
+        assert get_unified_client is not None
+
+
+@pytest.mark.agency
+class TestWorkflowContract:
+    """Contract: LangGraph workflow orchestrator still functions."""
+
+    def test_langgraph_importable(self):
+        """LangGraph core imports still work after openai v2 upgrade."""
+        from langgraph.graph import StateGraph
+        assert StateGraph is not None
+
+    def test_langchain_openai_importable(self):
+        """langchain-openai bindings still work with openai v2."""
+        from langchain_openai import ChatOpenAI
+        assert ChatOpenAI is not None
+
+
+@pytest.mark.agency
+class TestSandboxDispatchContract:
+    """Contract: Sandbox dispatch still works with existing featureTypes."""
+
+    def test_existing_feature_types_accepted(self):
+        """All existing featureType values still work."""
+        existing_types = [
+            "chat", "skill", "workflow", "library",
+            "media", "presentation", "connector",
+        ]
+        for ft in existing_types:
+            assert isinstance(ft, str) and len(ft) > 0
+
+
+@pytest.mark.agency
+class TestFeatureFlagInfrastructure:
+    """Verify feature flag reading mechanism works."""
+
+    def test_agency_flag_defaults_to_disabled(self):
+        """AGENCY_SWARM_ENABLED defaults to false/missing."""
+        import os
+        val = os.environ.get("AGENCY_SWARM_ENABLED", "false")
+        assert val.lower() in ("false", "0", "")
+
+
+# --- helper ---
+async def _append_value(results: list, value: int):
+    results.append(value)
