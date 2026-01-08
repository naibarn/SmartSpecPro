"""Safety tests for verify_evidence_* scripts.

These tests make sure that the enhanced / strict evidence verifiers
never walk or read obviously sensitive files like `.git` or `.env`.
"""

from pathlib import Path
import importlib.util

import pytest


# python-backend/tests/unit/test_*.py
# parents[0] = unit/, [1] = tests/, [2] = python-backend/, [3] = repo root
REPO_ROOT = Path(__file__).resolve().parents[3]


def _load_module(rel_path: str, name: str):
    """Dynamically load a module from a repository-relative path."""
    path = REPO_ROOT / rel_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def enhanced():
    return _load_module(".smartspec/scripts/verify_evidence_enhanced.py", "verify_evidence_enhanced")


@pytest.fixture(scope="module")
def strict():
    return _load_module(".smartspec/scripts/verify_evidence_strict.py", "verify_evidence_strict")


class TestEnhancedVerifierSafety:
    def test_is_path_allowed_blocks_sensitive_files(self, tmp_path: Path, enhanced):
        # .git directory should be denied
        git_dir = tmp_path / ".git"
        git_dir.mkdir()
        assert enhanced._is_path_allowed(git_dir / "config") is False

        # .env file should be denied
        env_file = tmp_path / ".env"
        env_file.write_text("SECRET=1")
        assert enhanced._is_path_allowed(env_file) is False

        # normal source file should be allowed
        src = tmp_path / "src" / "main.py"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("print('ok')")
        assert enhanced._is_path_allowed(src) is True

    def test_bounded_walk_skips_denied_paths(self, tmp_path: Path, enhanced):
        root = tmp_path / "repo"
        root.mkdir()

        secret = root / ".env"
        secret.write_text("SECRET=1")

        src = root / "src" / "main.py"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("print('ok')")

        files = list(enhanced._bounded_walk(root, max_files=10))
        names = {p.name for p in files}
        # should include normal file
        assert "main.py" in names
        # but never yield the secret file
        assert ".env" not in names

    def test_verify_code_does_not_expose_secret_file(self, tmp_path: Path, enhanced):
        Evidence = enhanced.Evidence

        root = tmp_path / "repo"
        root.mkdir()

        # even if a .env file exists, it should be treated as non-existent by get_file_info
        secret = root / ".env"
        secret.write_text("SECRET=1")

        ev = Evidence(
            etype="code",
            kv={"path": ".env"},
            raw="code .env",
            line_no=1,
        )

        res = enhanced.verify_code(root, ev)
        assert res.ok is False
        # file_info should be present but marked as non-existing
        assert res.file_info is not None
        assert res.file_info.exists is False

    def test_verify_code_allows_normal_file(self, tmp_path: Path, enhanced):
        Evidence = enhanced.Evidence

        root = tmp_path / "repo"
        root.mkdir()

        src = root / "src" / "main.py"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("print('ok')")

        ev = Evidence(
            etype="code",
            kv={"path": "src/main.py"},
            raw="code src/main.py",
            line_no=1,
        )

        res = enhanced.verify_code(root, ev)
        assert res.ok is True
        assert res.file_info is not None
        assert res.file_info.exists is True


class TestStrictVerifierSafety:
    def test_is_path_allowed_blocks_sensitive_files(self, tmp_path: Path, strict):
        # .git directory should be denied
        git_dir = tmp_path / ".git"
        git_dir.mkdir()
        assert strict._is_path_allowed(git_dir / "config") is False

        # .env file should be denied
        env_file = tmp_path / ".env"
        env_file.write_text("SECRET=1")
        assert strict._is_path_allowed(env_file) is False

        # normal source file should be allowed
        src = tmp_path / "src" / "main.py"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("print('ok')")
        assert strict._is_path_allowed(src) is True

    def test_bounded_walk_skips_denied_paths(self, tmp_path: Path, strict):
        root = tmp_path / "repo"
        root.mkdir()

        secret = root / ".env"
        secret.write_text("SECRET=1")

        src = root / "src" / "main.py"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("print('ok')")

        files = list(strict._bounded_walk(root, max_files=10))
        names = {p.name for p in files}
        assert "main.py" in names
        assert ".env" not in names

    def test_verify_code_rejects_not_allowed_path(self, tmp_path: Path, strict):
        Evidence = strict.Evidence

        root = tmp_path / "repo"
        root.mkdir()

        secret = root / ".env"
        secret.write_text("SECRET=1")

        ev = Evidence(
            etype="code",
            kv={"path": ".env"},
            raw="code .env",
            line_no=1,
        )

        res = strict.verify_code(root, ev)
        assert res.ok is False
        assert "path not allowed" in res.reason

    def test_verify_docs_rejects_not_allowed_path(self, tmp_path: Path, strict):
        Evidence = strict.Evidence

        root = tmp_path / "repo"
        root.mkdir()

        secret = root / ".env"
        secret.write_text("SECRET=1")

        ev = Evidence(
            etype="docs",
            kv={"path": ".env"},
            raw="docs .env" ,
            line_no=1,
        )

        res = strict.verify_docs(root, ev)
        assert res.ok is False
        assert "path not allowed" in res.reason

    def test_verify_ui_rejects_not_allowed_path(self, tmp_path: Path, strict):
        Evidence = strict.Evidence

        root = tmp_path / "repo"
        root.mkdir()

        secret = root / ".env"
        secret.write_text("SECRET=1")

        ev = Evidence(
            etype="ui",
            kv={"path": ".env"},
            raw="ui .env",
            line_no=1,
        )

        res = strict.verify_ui(root, ev)
        assert res.ok is False
        assert "path not allowed" in res.reason
