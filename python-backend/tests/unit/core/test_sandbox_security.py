"""Tests for sandbox path helpers and workspace validation."""

from pathlib import Path

import pytest

from app.orchestrator.sandbox import is_within, is_path_allowed, validate_workspace


class TestIsWithin:
    def test_inside_same_tree(self, tmp_path: Path):
        base = tmp_path / "root"
        target = base / "subdir" / "file.txt"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("x")
        assert is_within(base, target)

    def test_sibling_directory_is_not_within(self, tmp_path: Path):
        base = tmp_path / "root"
        other = tmp_path / "root2" / "file.txt"
        base.mkdir(parents=True, exist_ok=True)
        other.parent.mkdir(parents=True, exist_ok=True)
        other.write_text("x")
        assert not is_within(base, other)

    def test_parent_not_within_child(self, tmp_path: Path):
        base = tmp_path / "root"
        child = base / "subdir"
        child.mkdir(parents=True, exist_ok=True)
        assert not is_within(child, base)


class TestIsPathAllowed:
    def test_denies_secret_files_and_dirs(self, tmp_path: Path):
        # denied directory
        git_dir = tmp_path / ".git"
        git_dir.mkdir()
        assert not is_path_allowed(git_dir / "config")

        # denied file prefix
        env_file = tmp_path / ".env"
        env_file.write_text("SECRET=1")
        assert not is_path_allowed(env_file)

    def test_allows_normal_source_file(self, tmp_path: Path):
        src = tmp_path / "src" / "main.py"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("print('ok')")
        assert is_path_allowed(src)


class TestValidateWorkspace:
    def test_validate_workspace_ok_when_within_root(self, tmp_path: Path):
        root = tmp_path / "projects"
        ws = root / "proj1"
        ws.mkdir(parents=True, exist_ok=True)

        validated = validate_workspace(str(ws), root=str(root))
        assert validated == str(ws.resolve())

    def test_validate_workspace_raises_for_outside_root(self, tmp_path: Path):
        root = tmp_path / "projects"
        ws = tmp_path / "other" / "proj2"
        ws.mkdir(parents=True, exist_ok=True)

        with pytest.raises(ValueError):
            validate_workspace(str(ws), root=str(root))

from app.orchestrator.sandbox import sanitize_env


class TestSanitizeEnv:
    def test_drops_blocked_prefixes_and_sets_ci(self):
        raw = {
            "OPENAI_API_KEY": "sk-xxx",
            "AWS_SECRET_ACCESS_KEY": "aws-secret",
            "R2_TOKEN": "r2",
            "STRIPE_KEY": "stripe",
            "DATABASE_URL": "postgres://...",
            "JWT_SECRET": "jwt",
            "CONTROL_PLANE_API_KEY": "cp",
            "ORCHESTRATOR_TOKEN": "orc",
            "NORMAL_VAR": "ok",
        }
        cleaned = sanitize_env(raw)
        # All blocked keys must be removed
        assert "OPENAI_API_KEY" not in cleaned
        assert "AWS_SECRET_ACCESS_KEY" not in cleaned
        assert "R2_TOKEN" not in cleaned
        assert "STRIPE_KEY" not in cleaned
        assert "DATABASE_URL" not in cleaned
        assert "JWT_SECRET" not in cleaned
        assert "CONTROL_PLANE_API_KEY" not in cleaned
        assert "ORCHESTRATOR_TOKEN" not in cleaned

        # Non-blocked vars stay
        assert cleaned["NORMAL_VAR"] == "ok"

        # CI must always be forced to "1"
        assert cleaned["CI"] == "1"

    def test_ci_overrides_existing_ci_value(self):
        raw = {"CI": "0"}
        cleaned = sanitize_env(raw)
        assert cleaned["CI"] == "1"
