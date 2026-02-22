"""Tests for evaluator CLI entrypoint -- Phase 5.4."""

import json
import os
import sys
import tempfile
import pytest

from app.orchestrator.rag.evaluator import EvalDataset, EvalItem


class TestCLIWithValidDataset:
    def test_cli_exits_cleanly(self):
        """CLI must exit with code 0 for valid inputs."""
        # Create a temp dataset
        dataset = {
            "items": [
                {
                    "query": "What is the refund policy?",
                    "expected_answer": "Returns within 30 days.",
                    "expected_doc_ids": ["doc-1"],
                    "tags": ["policy"],
                }
            ],
            "documents": [
                {
                    "doc_id": "doc-1",
                    "content": "Our refund policy allows returns within 30 days.",
                    "metadata": {"title": "Policies"},
                }
            ],
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(dataset, f)
            dataset_path = f.name

        try:
            import subprocess
            result = subprocess.run(
                [
                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
                    "--dataset", dataset_path,
                    "--k", "5",
                ],
                cwd="/home/dev/projects/SmartSpecPro/python-backend",
                capture_output=True,
                text=True,
                timeout=30,
                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
            )
            assert result.returncode == 0, f"CLI failed: {result.stderr}"
        finally:
            os.unlink(dataset_path)


class TestCLIProducesOutputFile:
    def test_output_file_created(self):
        """CLI must create the output file at the specified path."""
        dataset = {
            "items": [
                {
                    "query": "Test query?",
                    "expected_answer": "Answer.",
                    "expected_doc_ids": ["doc-1"],
                }
            ],
            "documents": [
                {"doc_id": "doc-1", "content": "Test content.", "metadata": {}}
            ],
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(dataset, f)
            dataset_path = f.name

        output_path = tempfile.mktemp(suffix=".md")

        try:
            import subprocess
            result = subprocess.run(
                [
                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
                    "--dataset", dataset_path,
                    "--output", output_path,
                ],
                cwd="/home/dev/projects/SmartSpecPro/python-backend",
                capture_output=True,
                text=True,
                timeout=30,
                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
            )
            assert result.returncode == 0, f"CLI failed: {result.stderr}"
            assert os.path.exists(output_path)
            content = open(output_path).read()
            assert len(content) > 0
        finally:
            os.unlink(dataset_path)
            if os.path.exists(output_path):
                os.unlink(output_path)


class TestCLIOutputContent:
    def test_output_has_all_metrics(self):
        """Output file must contain all metric category headers."""
        dataset = {
            "items": [
                {
                    "query": "Test?",
                    "expected_answer": "Yes.",
                    "expected_doc_ids": ["doc-1"],
                }
            ],
            "documents": [
                {"doc_id": "doc-1", "content": "Test content.", "metadata": {}}
            ],
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(dataset, f)
            dataset_path = f.name

        output_path = tempfile.mktemp(suffix=".md")

        try:
            import subprocess
            result = subprocess.run(
                [
                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
                    "--dataset", dataset_path,
                    "--output", output_path,
                ],
                cwd="/home/dev/projects/SmartSpecPro/python-backend",
                capture_output=True,
                text=True,
                timeout=30,
                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
            )
            assert result.returncode == 0
            content = open(output_path).read()
            assert "Precision@K" in content
            assert "Recall@K" in content
            assert "MRR" in content
            assert "NDCG@K" in content
        finally:
            os.unlink(dataset_path)
            if os.path.exists(output_path):
                os.unlink(output_path)


class TestCLIInvalidDataset:
    def test_invalid_path_error_message(self):
        """CLI must show clear error for non-existent dataset path."""
        import subprocess
        result = subprocess.run(
            [
                sys.executable, "-m", "app.orchestrator.rag.evaluator",
                "--dataset", "/nonexistent/path.json",
            ],
            cwd="/home/dev/projects/SmartSpecPro/python-backend",
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
        )
        assert result.returncode != 0
        assert "not found" in result.stderr.lower() or "error" in result.stderr.lower()

    def test_malformed_json_error(self):
        """CLI must show clear error for malformed JSON dataset."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("{invalid json")
            path = f.name
        try:
            import subprocess
            result = subprocess.run(
                [
                    sys.executable, "-m", "app.orchestrator.rag.evaluator",
                    "--dataset", path,
                ],
                cwd="/home/dev/projects/SmartSpecPro/python-backend",
                capture_output=True,
                text=True,
                timeout=10,
                env={**os.environ, "VIRTUAL_ENV": "/home/dev/projects/SmartSpecPro/python-backend/.venv"},
            )
            assert result.returncode != 0
        finally:
            os.unlink(path)
