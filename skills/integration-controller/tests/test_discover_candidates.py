import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[3]
DISCOVERY_SCRIPT = SOURCE_ROOT / "skills/integration-controller/scripts/discover-candidates.sh"


def run(command, *, cwd=None, env=None):
    return subprocess.run(command, cwd=cwd, env=env, check=True, text=True, capture_output=True)


class DiscoverCandidatesTests(unittest.TestCase):
    def test_worktree_status_is_collected_once_per_worktree(self):
        with tempfile.TemporaryDirectory(prefix="discover-candidates-") as temp:
            root = Path(temp) / "repo"
            remote = Path(temp) / "remote.git"
            run(["git", "init", "--bare", str(remote)])
            run(["git", "init", "-b", "main", str(root)])
            run(["git", "-C", str(root), "config", "user.name", "Test"])
            run(["git", "-C", str(root), "config", "user.email", "test@example.invalid"])
            (root / ".development-repository.toml").write_text(
                "[repository]\n"
                "repository_id = 'fixture'\n"
                "remote = 'origin'\n"
                "canonical_ref = 'refs/heads/main'\n"
                f"source_root = '{temp}/sources'\n"
                "build_target = 'fixture'\n",
                encoding="utf-8",
            )
            support = root / "scripts/development-lifecycle"
            support.mkdir(parents=True)
            shutil.copy2(SOURCE_ROOT / "scripts/development-lifecycle/resolve-policy.sh", support)
            shutil.copy2(SOURCE_ROOT / "scripts/development-lifecycle/canonical_source.py", support)
            script = root / "skills/integration-controller/scripts/discover-candidates.sh"
            script.parent.mkdir(parents=True)
            shutil.copy2(DISCOVERY_SCRIPT, script)
            (root / "base.txt").write_text("base\n", encoding="utf-8")
            run(["git", "-C", str(root), "add", "."])
            run(["git", "-C", str(root), "commit", "-m", "base"])
            run(["git", "-C", str(root), "remote", "add", "origin", str(remote)])
            run(["git", "-C", str(root), "push", "-u", "origin", "main"])

            for name in ("slice-a", "slice-b"):
                run(["git", "-C", str(root), "switch", "-c", name])
                (root / f"{name}.txt").write_text(name, encoding="utf-8")
                run(["git", "-C", str(root), "add", "."])
                run(["git", "-C", str(root), "commit", "-m", name])
                run(["git", "-C", str(root), "push", "-u", "origin", name])
                run(["git", "-C", str(root), "switch", "main"])
            for name in ("slice-a", "slice-b"):
                run(["git", "-C", str(root), "worktree", "add", str(Path(temp) / name), name])

            wrapper_dir = Path(temp) / "bin"
            wrapper_dir.mkdir()
            git_calls = Path(temp) / "git-calls.log"
            real_git = shutil.which("git")
            wrapper = wrapper_dir / "git"
            wrapper.write_text(
                "#!/usr/bin/env bash\n"
                "for arg in \"$@\"; do\n"
                "  if [[ \"$arg\" == status ]]; then printf 'status\\n' >> \"$GIT_CALL_LOG\"; fi\n"
                "done\n"
                "if [[ \" $* \" == *' worktree list '* ]]; then printf 'worktree-list\\n' >> \"$GIT_CALL_LOG\"; fi\n"
                "exec \"$REAL_GIT\" \"$@\"\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)
            env = dict(os.environ, PATH=f"{wrapper_dir}:{os.environ['PATH']}", REAL_GIT=real_git, GIT_CALL_LOG=str(git_calls))
            result = run(["bash", str(script)], cwd=root, env=env)

            calls = git_calls.read_text(encoding="utf-8").splitlines()
            self.assertEqual(3, calls.count("status"), result.stdout)
            self.assertEqual(1, calls.count("worktree-list"), result.stdout)
            self.assertEqual(3, sum(line.startswith("WORKTREE\t") for line in result.stdout.splitlines()))


if __name__ == "__main__":
    unittest.main()
