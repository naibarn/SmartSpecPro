"""Durable handoff and interruption scenarios, not additional workflow gates."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from scripts.lib import config
from scripts.lib.config import (save_session_config, load_session_config,
                                mutate_session_config, refresh_handoff)
from scripts.lib import task_storage
from scripts.lib.task_storage import TaskToWrite, TaskStatus, write_tasks

TOOL = Path(__file__).resolve().parents[1] / "scripts/tools/update_section_state.py"


def initial(tmp_path: Path) -> Path:
    state = tmp_path / "implementation"
    save_session_config(state, {
        "sections_dir": str(tmp_path / "sections"),
        "target_dir": str(tmp_path / "repo"),
        "sections": ["section-01", "section-02"],
        "sections_state": {},
    })
    return state


def run_cli(state: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(TOOL), "--state-dir", str(state), *args],
                          text=True, capture_output=True)


def test_initial_handoff_is_created(tmp_path):
    state = initial(tmp_path)
    txt = (state / "HANDOFF.md").read_text()
    assert "section-01" in txt and "NOT_VERIFIED" in txt


def test_initial_progress_not_final_acceptance(tmp_path):
    state = initial(tmp_path)
    assert "NOT_ACCEPTED" in (state / "HANDOFF.md").read_text()


def test_in_progress_before_commit_survives_resume(tmp_path):
    state = initial(tmp_path)
    run = run_cli(state, "--section", "section-01", "--status", "in_progress",
                  "--next-action", "Continue writing component without repeating setup",
                  "--worktree", "/tmp/s1", "--gap", "Preview not yet available")
    assert run.returncode == 0, run.stdout + run.stderr
    result = load_session_config(state)
    assert result["sections_state"]["section-01"]["status"] == "in_progress"
    assert result["progress"]["worktree"] == "/tmp/s1"
    assert "Continue writing component" in (state / "HANDOFF.md").read_text()


def test_checkpoint_is_not_merged_main(tmp_path):
    state = initial(tmp_path)
    run = run_cli(state, "--section", "section-01", "--commit-hash", "abc123")
    assert run.returncode == 0
    txt = (state / "HANDOFF.md").read_text()
    assert "abc123" in txt and "NOT_VERIFIED" in txt
    assert "merged_main_sha" not in load_session_config(state)["sections_state"]["section-01"]


def test_explicit_merge_sha_recorded_separately(tmp_path):
    state = initial(tmp_path)
    assert run_cli(state, "--section", "section-01", "--commit-hash", "abc123").returncode == 0
    run = run_cli(state, "--section", "section-01", "--merged-main-sha", "main456",
                  "--next-action", "Build latest Main")
    assert run.returncode == 0, run.stdout + run.stderr
    assert load_session_config(state)["sections_state"]["section-01"]["merged_main_sha"] == "main456"
    assert "Build latest Main" in (state / "HANDOFF.md").read_text()


def test_cannot_fake_merge_without_checkpoint(tmp_path):
    state = initial(tmp_path)
    run = run_cli(state, "--section", "section-01", "--merged-main-sha", "main456")
    assert run.returncode == 1
    assert "without a local checkpoint" in run.stdout


def test_handoff_show_is_read_only_for_authoritative_state(tmp_path):
    state = initial(tmp_path)
    before = (state / config.CONFIG_FILE).read_bytes()
    output = run_cli(state, "--show")
    assert output.returncode == 0
    assert "Live HandOff" in output.stdout
    assert (state / config.CONFIG_FILE).read_bytes() == before


def test_missing_handoff_is_regenerated(tmp_path):
    state = initial(tmp_path)
    (state / "HANDOFF.md").unlink()
    assert refresh_handoff(state) == state / "HANDOFF.md"
    assert (state / "HANDOFF.md").is_file()


def test_crash_between_config_and_handoff_is_repaired(tmp_path, monkeypatch):
    state = initial(tmp_path)
    original = config._atomic_write
    def fail_handoff(path, contents):
        if path.name == "HANDOFF.md":
            raise OSError("simulated crash after authoritative JSON")
        return original(path, contents)
    with monkeypatch.context() as ctx:
        ctx.setattr(config, "_atomic_write", fail_handoff)
        with pytest.raises(OSError):
            mutate_session_config(state, lambda c: c.setdefault("progress", {}).update(next_action="resume me"))
    assert "resume me" not in (state / "HANDOFF.md").read_text()
    refresh_handoff(state)
    assert "resume me" in (state / "HANDOFF.md").read_text()


def test_failed_primary_replace_does_not_truncate_state(tmp_path, monkeypatch):
    state = initial(tmp_path)
    before = (state / config.CONFIG_FILE).read_bytes()
    old = os.replace
    def fail_replace(a, b):
        if Path(b).name == config.CONFIG_FILE:
            raise OSError("interruption")
        return old(a, b)
    monkeypatch.setattr(config.os, "replace", fail_replace)
    with pytest.raises(OSError):
        mutate_session_config(state, lambda c: c.setdefault("progress", {}).update(next_action="not committed"))
    assert (state / config.CONFIG_FILE).read_bytes() == before


def test_parallel_writers_to_distinct_sections_preserve_both(tmp_path):
    state = initial(tmp_path)
    def worker(i):
        return run_cli(state, "--section", f"section-{i:02}", "--status", "in_progress",
                       "--next-action", f"Owner of section {i}")
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, (1, 2)))
    assert all(x.returncode == 0 for x in results), [x.stdout for x in results]
    assert set(load_session_config(state)["sections_state"]) == {"section-01", "section-02"}
    assert json.loads((state / config.CONFIG_FILE).read_text())["generation"] == 3


def test_history_records_monotonic_generations(tmp_path):
    state = initial(tmp_path)
    for i in range(2):
        assert run_cli(state, "--section", "section-01", "--status", "in_progress",
                       "--next-action", f"step{i}").returncode == 0
    events = [json.loads(l) for l in (state / "handoff_history.jsonl").read_text().splitlines()]
    assert [e["generation"] for e in events] == [1, 2, 3]


def test_task_write_failure_preserves_previous_bytes(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    first = [TaskToWrite(position=1, subject="saved task", status=TaskStatus.PENDING)]
    assert write_tasks("test-id", first).success
    target = tmp_path / ".claude/tasks/test-id/1.json"
    before = target.read_bytes()
    old = task_storage.os.replace
    def fail_replace(a, b):
        if Path(b) == target:
            raise OSError("simulated interrupted task write")
        return old(a, b)
    monkeypatch.setattr(task_storage.os, "replace", fail_replace)
    second = [TaskToWrite(position=1, subject="new", status=TaskStatus.COMPLETED)]
    assert not write_tasks("test-id", second).success
    assert target.read_bytes() == before
    assert not list(target.parent.glob(".1.json.*"))


def test_rerun_checkpoint_does_not_erase_prior_merged_sha(tmp_path):
    state = initial(tmp_path)
    assert run_cli(state, "--section", "section-01", "--commit-hash", "abc123").returncode == 0
    assert run_cli(state, "--section", "section-01", "--merged-main-sha", "main456").returncode == 0
    assert run_cli(state, "--section", "section-01", "--status", "in_progress").returncode == 0
    assert load_session_config(state)["sections_state"]["section-01"]["merged_main_sha"] == "main456"


def test_stale_generation_cannot_overwrite_newer_progress(tmp_path):
    state = initial(tmp_path)
    stale = load_session_config(state)
    mutate_session_config(state, lambda c: c.setdefault("sections_state", {}).update({"section-02": {"status": "in_progress"}}))
    with pytest.raises(ValueError, match="STALE_STATE"):
        save_session_config(state, stale)
    assert "section-02" in load_session_config(state)["sections_state"]


def test_resolve_gap_updates_live_handoff_without_erasing_other_gaps(tmp_path):
    state = initial(tmp_path)
    assert run_cli(state, "--section", "section-01", "--status", "in_progress",
                   "--gap", "missing UI copy", "--gap", "missing preview").returncode == 0
    assert run_cli(state, "--section", "section-01", "--status", "in_progress",
                   "--resolve-gap", "missing UI copy").returncode == 0
    handoff = (state / "HANDOFF.md").read_text()
    assert "missing UI copy" not in handoff and "missing preview" in handoff


def test_per_section_ownership_exposed_without_blocking_other_section(tmp_path):
    state = initial(tmp_path)
    assert run_cli(state, "--section", "section-01", "--status", "in_progress",
                   "--session-id", "lane1", "--worktree", "/workspace/lane1").returncode == 0
    assert run_cli(state, "--section", "section-02", "--status", "in_progress",
                   "--session-id", "lane2", "--worktree", "/workspace/lane2").returncode == 0
    handoff = (state / "HANDOFF.md").read_text()
    assert "lane1" in handoff and "lane2" in handoff
    assert "/workspace/lane1" in handoff and "/workspace/lane2" in handoff
