"""Real Git/process integration with a local GitHub adapter; no external mutations."""

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "skills/integration-controller/scripts/promote_ready_pr.py"
SPEC = importlib.util.spec_from_file_location("progressive_promoter", SCRIPT)
PROMOTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROMOTER)


class ProgressiveExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.remote = self.root / "origin.git"
        self.git(self.root, "init", "--bare", str(self.remote))
        self.git(self.root, "init", "-b", "trunk", str(self.repo))
        self.git(self.repo, "config", "user.email", "fixture@example.invalid")
        self.git(self.repo, "config", "user.name", "Progressive fixture")
        self.git(self.repo, "remote", "add", "origin", str(self.remote))
        policy = self.repo / "skills/development-lifecycle/lifecycle_policy.py"
        policy.parent.mkdir(parents=True)
        shutil.copy2(ROOT / "skills/development-lifecycle/lifecycle_policy.py", policy)
        lifecycle_scripts = self.repo / "scripts/development-lifecycle"
        lifecycle_scripts.mkdir(parents=True)
        for name in ("canonical_source.py", "workspace_authority.py", "convergence_contract.py"):
            shutil.copy2(ROOT / "scripts/development-lifecycle" / name, lifecycle_scripts / name)
        (self.repo / ".development-repository.toml").write_text(
            '[repository]\n'
            'repository_id = "progressive-fixture"\n'
            'remote = "origin"\n'
            'canonical_ref = "refs/heads/trunk"\n'
            f'source_root = "{self.root / "sources"}"\n'
            f'source_fallback_roots = ["{self.root / "fallback-sources"}"]\n'
            f'lease_root = "{self.root / "leases"}"\n'
        )
        (self.repo / "spec.json").write_text('{"status":"OPEN"}')
        self.git(
            self.repo, "add", ".development-repository.toml", "spec.json", str(policy),
            *(str(lifecycle_scripts / name) for name in ("canonical_source.py", "workspace_authority.py", "convergence_contract.py")),
        )
        self.git(self.repo, "commit", "-m", "baseline")
        self.git(self.repo, "push", "origin", "trunk")
        self.git(self.repo, "switch", "-c", "slice-one")
        (self.repo / "feature.py").write_text(
            'def preview(enabled=False):\n    return "preview" if enabled else "baseline"\n'
        )
        self.git(self.repo, "add", "feature.py")
        self.git(self.repo, "commit", "-m", "first independently safe slice")
        self.head = self.git(self.repo, "rev-parse", "HEAD").stdout.strip()
        self.git(self.repo, "push", "origin", "slice-one")
        self.git(self.repo, "switch", "trunk")
        self.bin = self.root / "bin"
        self.bin.mkdir()
        adapter = self.bin / "gh"
        adapter.write_text("#!/usr/bin/env python3\n" + '''
import json, os, subprocess, sys
from pathlib import Path
root = Path(os.environ["PROGRESSIVE_FIXTURE_ROOT"])
number = sys.argv[3]
state_file = root / ("state-" + number + ".json")
branch = "slice-one" if number == "7" else "slice-next"
def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, check=True).stdout.strip()
if sys.argv[2] == "checks":
    state = "FAILURE" if os.environ.get("PROGRESSIVE_FAIL_GATE") else "SUCCESS"
    print(json.dumps([{"name":"required-security", "state":state}]))
elif sys.argv[2] == "view":
    if state_file.exists():
        print(state_file.read_text())
    else:
        print(json.dumps({"state":"OPEN", "isDraft":False,
            "headRefOid":git("rev-parse", "origin/" + branch),
            "baseRefOid":git("rev-parse", "origin/trunk"), "baseRefName":"trunk",
            "mergeable":"MERGEABLE", "mergeStateStatus":"CLEAN", "reviewDecision":""}))
elif sys.argv[2] == "merge":
    head = git("rev-parse", "origin/" + branch)
    assert sys.argv[sys.argv.index("--match-head-commit") + 1] == head
    workspace = root / ("provider-merge-" + number)
    git("worktree", "add", "--detach", str(workspace), "origin/trunk")
    git("merge", "--no-ff", head, "-m", "merge verified slice", cwd=workspace)
    git("push", "origin", "HEAD:refs/heads/trunk", cwd=workspace)
    state_file.write_text(json.dumps({"state":"MERGED", "mergeCommit":{"oid":git("rev-parse", "HEAD", cwd=workspace)}}))
else:
    raise SystemExit(2)
''')
        adapter.chmod(0o755)
        self.env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
                    "PROGRESSIVE_FIXTURE_ROOT": str(self.root), "PYTHONDONTWRITEBYTECODE": "1"}

    @staticmethod
    def git(cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, check=True)

    def invoke(self, *args, env=None):
        return subprocess.run([sys.executable, str(SCRIPT), "--repository", str(self.repo),
                               "--pr", "7", "--expected-head", self.head, *args],
                              env=env or self.env, text=True, capture_output=True)

    def test_merge_open_spec_then_implement_and_merge_next_unit_without_prompt(self):
        worker = self.root / "worker.py"
        worker.write_text('''
import argparse, json, subprocess, sys
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument("--workunit-id")
parser.add_argument("--canonical-sha")
args = parser.parse_args()
def run(*command):
    return subprocess.run(command, text=True, capture_output=True, check=True).stdout.strip()
assert run("git", "rev-parse", "HEAD") == args.canonical_sha
assert json.loads(Path("spec.json").read_text())["status"] == "OPEN"
sys.path.insert(0, str(Path.cwd()))
from feature import preview
assert preview() == "baseline" and preview(True) == "preview"
run("git", "switch", "-c", "slice-next")
Path("next_feature.py").write_text("def next_value():\\n    return 2\\n")
run(sys.executable, "-m", "py_compile", "feature.py", "next_feature.py")
run("git", "add", "next_feature.py")
run("git", "commit", "-m", "implement second ready WorkUnit")
run("git", "push", "origin", "HEAD:refs/heads/slice-next")
next_result = json.loads(run(sys.executable, SCRIPT_PATH, "--pr", "8", "--execute"))
assert next_result["status"] == "MERGED", next_result
Path(REPORT_PATH).write_text(json.dumps({"unit":args.workunit_id, "baseline":args.canonical_sha,
    "second_merge":next_result["merge_sha"], "build":"PASS", "spec":"OPEN"}))
'''.replace("SCRIPT_PATH", repr(str(SCRIPT))).replace("REPORT_PATH", repr(str(self.root / "worker-report.json"))))
        work = self.root / "workunits.json"
        work.write_text(json.dumps({"workunits": [
            {"id": "external", "status": "WAITING_EXTERNAL"},
            {"id": "independent-next", "status": "READY", "completion_predicate":
                {"kind": "test_passes", "source": "next_feature.py"}},
        ]}))
        receipt = self.root / "receipt.json"
        process = self.invoke("--execute", "--workunits", str(work), "--worker-command",
            json.dumps([sys.executable, str(worker)]), "--next-worktree", str(self.root / "next"),
            "--receipt", str(receipt))
        self.assertEqual(0, process.returncode, process.stdout + process.stderr)
        result = json.loads(process.stdout)
        self.assertEqual("MERGED", result["status"])
        self.assertEqual("WORKER_SUCCEEDED", result["continuation"]["status"])
        report = json.loads((self.root / "worker-report.json").read_text())
        self.assertEqual(result["merge_sha"], report["baseline"])
        self.assertEqual("independent-next", report["unit"])
        self.assertEqual("PASS", report["build"])
        self.assertEqual(result, json.loads(receipt.read_text()))
        self.git(self.repo, "fetch", "origin", "trunk")
        for sha in [result["merge_sha"], report["second_merge"]]:
            self.git(self.repo, "merge-base", "--is-ancestor", sha, "origin/trunk")
        self.assertEqual("OPEN", json.loads(self.git(self.repo, "show", "origin/trunk:spec.json").stdout)["status"])

    def test_security_failure_blocks_real_git_merge(self):
        before = self.git(self.repo, "rev-parse", "origin/trunk").stdout
        process = self.invoke("--execute", env={**self.env, "PROGRESSIVE_FAIL_GATE": "1"})
        self.assertEqual(3, process.returncode)
        self.assertEqual("BLOCKED_BEFORE_MERGE", json.loads(process.stdout)["status"])
        self.assertFalse((self.root / "state-7.json").exists())
        self.assertEqual(before, self.git(self.repo, "rev-parse", "origin/trunk").stdout)

    def test_pr_merged_by_another_session_is_reconciled_without_second_merge(self):
        external_merge = self.root / "external-merge"
        self.git(self.repo, "worktree", "add", "--detach", str(external_merge), "origin/trunk")
        self.git(external_merge, "merge", "--no-ff", "origin/slice-one", "-m", "external session merge")
        self.git(external_merge, "push", "origin", "HEAD:refs/heads/trunk")
        merge_sha = self.git(external_merge, "rev-parse", "HEAD").stdout.strip()
        (self.root / "state-7.json").write_text(json.dumps({
            "state": "MERGED", "mergeCommit": {"oid": merge_sha},
            "mergedAt": "2026-10-12T10:00:00Z",
        }))

        process = self.invoke("--execute")

        self.assertEqual(0, process.returncode, process.stdout + process.stderr)
        result = json.loads(process.stdout)
        self.assertEqual("ALREADY_MERGED", result["status"])
        self.assertEqual("ANOTHER_SESSION", result["merge_source"])
        self.assertEqual(merge_sha, result["merge_sha"])
        self.assertEqual(merge_sha, result["canonical_sha"])
        self.assertEqual(merge_sha, self.git(self.repo, "rev-parse", "origin/trunk").stdout.strip())

    def test_failed_worker_preserves_merge_receipt_and_does_not_repeat_merge(self):
        work = self.root / "workunits.json"
        work.write_text(json.dumps({"workunits": [{"id": "next", "status": "READY",
            "completion_predicate": {"kind": "test_passes", "source": "next.py"}}]}))
        receipt = self.root / "receipt.json"
        arguments = ("--execute", "--workunits", str(work), "--worker-command",
            json.dumps([sys.executable, "-c", "raise SystemExit(19)"]),
            "--next-worktree", str(self.root / "next"), "--receipt", str(receipt))
        process = self.invoke(*arguments)
        self.assertEqual(3, process.returncode, process.stdout + process.stderr)
        result = json.loads(receipt.read_text())
        self.assertEqual("MERGED", result["status"])
        self.assertEqual("WORKER_FAILED", result["continuation"]["status"])
        self.assertEqual(19, result["continuation"]["exit_code"])
        repeated = self.invoke(*arguments)
        self.assertNotEqual(0, repeated.returncode)
        self.assertEqual(result, json.loads(receipt.read_text()))

    def test_stale_dependency_evidence_does_not_dispatch_worker(self):
        result = PROMOTER.continue_next_workunit(self.repo,
            {"status": "MERGED", "canonical_sha": "a" * 40},
            {"workunits": [{"id": "next", "status": "READY", "prerequisites": ["previous"],
                "completion_predicate": {"kind": "test_passes", "source": "next.py"}}],
             "completed_workunits": [{"id": "previous", "status": "COMPLETE",
                "canonical_sha": "b" * 40, "completion_evidence": ["test.log"], "evidence_fresh": True}]},
            ["never-execute"], self.root / "never-created")
        self.assertEqual("NO_READY_WORKUNIT", result["status"])
        self.assertFalse((self.root / "never-created").exists())

    def test_merge_lock_is_shared_across_worktrees_and_released(self):
        other = self.root / "other"
        self.git(self.repo, "worktree", "add", "--detach", str(other), "HEAD")
        with PROMOTER.repository_merge_lock(self.repo):
            with self.assertRaisesRegex(RuntimeError, "MERGE_CRITICAL_SECTION_BUSY"):
                with PROMOTER.repository_merge_lock(other):
                    self.fail("Concurrent promotion acquired the same repository lock")
        with PROMOTER.repository_merge_lock(other):
            pass

    def test_continuation_does_not_dispatch_before_verified_merge(self):
        result = PROMOTER.continue_next_workunit(self.repo, {"status": "MERGE_QUEUED_OR_PENDING"},
            {}, ["never-execute"], self.root / "never-created")
        self.assertEqual("NOT_INTEGRATED", result["status"])
        self.assertFalse((self.root / "never-created").exists())


if __name__ == "__main__":
    unittest.main()
