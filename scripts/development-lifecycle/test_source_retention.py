"""Real Git fixtures for ownership-safe immutable build cache retirement."""
import json
import os
import subprocess
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import test_canonical_source as fixtures
from canonical_source import FileLock, LifecycleError, collect_build_sources


@unittest.skipUnless(sys.platform == 'linux', 'Local source consumers use /proc')
class SourceRetentionTests(unittest.TestCase):
    setUp = fixtures.CanonicalSourceTests.setUp
    tearDown = fixtures.CanonicalSourceTests.tearDown
    write_policy = fixtures.CanonicalSourceTests.write_policy
    prepare = fixtures.CanonicalSourceTests.prepare

    def old_source(self):
        lease = self.prepare()
        state = Path(lease['lease_file'])
        lease.pop('lease_file', None)
        lease['created_at'] = time.time() - 7200
        lease['expires_at'] = 0
        state.write_text(json.dumps(lease))
        os.utime(state, (time.time() - 7200,) * 2)
        return Path(lease['isolated_workspace']), state, lease

    def collect(self, apply=False):
        # Retain two new tuple records so the old source is a collection candidate.
        return collect_build_sources(self.shared, self.policy, apply=apply,
                                     release_root=self.root / 'releases')

    def two_new_sources(self):
        for number in range(2):
            (self.seed / 'app.txt').write_text(f'new revision {number}')
            fixtures.command('git', '-C', str(self.seed), 'commit', '-am', f'next {number}')
            fixtures.command('git', '-C', str(self.seed), 'push', 'origin', 'trunk')
            self.prepare()

    def test_dry_run_then_remove_only_integrated_old_generated_source(self):
        workspace, state, lease = self.old_source()
        # Local exclude models the generated dependency directory.
        exclude = Path(fixtures.command('git', '-C', str(workspace), 'rev-parse', '--git-path', 'info/exclude'))
        with exclude.open('a') as stream:
            stream.write('\nnode_modules/\n')
        (workspace / 'node_modules').mkdir()
        (workspace / 'node_modules/cache').write_text('reproducible output')
        self.two_new_sources()
        before = (self.shared / 'local-only.txt').read_text()
        report = self.collect()
        self.assertEqual(report['eligible'], [str(workspace)])
        self.assertTrue(workspace.exists())
        result = self.collect(apply=True)
        self.assertEqual(result['removed'], [str(workspace)])
        self.assertFalse(workspace.exists())
        self.assertTrue(state.exists(), 'Keep historical fence evidence')
        self.assertEqual((self.shared / 'local-only.txt').read_text(), before)
        self.assertNotIn(str(workspace), fixtures.command('git', '-C', str(self.shared), 'worktree', 'list'))

    def test_active_lease_dirty_unknown_ignored_and_process_consumers_are_preserved(self):
        workspace, state, lease = self.old_source()
        self.two_new_sources()
        lease['expires_at'] = time.time() + 300
        state.write_text(json.dumps(lease)); os.utime(state, (time.time() - 7200,) * 2)
        self.assertIn('SOURCE_LEASE_CHANGED_OR_ACTIVE', str(self.collect(True)['retained']))
        lease['expires_at'] = 0
        state.write_text(json.dumps(lease)); os.utime(state, (time.time() - 7200,) * 2)
        (workspace / 'app.txt').write_text('unfinished edits')
        self.assertIn('SOURCE_HAS_USER_OR_UNKNOWN_CONTENT', str(self.collect(True)['retained']))
        fixtures.command('git', '-C', str(workspace), 'restore', 'app.txt')
        exclude = Path(fixtures.command('git', '-C', str(workspace), 'rev-parse', '--git-path', 'info/exclude'))
        with exclude.open('a') as stream: stream.write('\nprivate.env\n')
        (workspace / 'private.env').write_text('keep unknown user content')
        self.assertIn('SOURCE_HAS_USER_OR_UNKNOWN_CONTENT', str(self.collect(True)['retained']))
        (workspace / 'private.env').unlink()
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(20)'], cwd=workspace)
        try:
            self.assertIn('SOURCE_PROCESS_ACTIVE', str(self.collect(True)['retained']))
        finally:
            child.terminate(); child.wait()
        self.assertTrue(workspace.exists())

    def test_release_source_and_tuple_lock_are_preserved(self):
        workspace, state, lease = self.old_source()
        self.two_new_sources()
        release = self.root / 'releases/current-g1'; release.mkdir(parents=True)
        (release / 'release-manifest.json').write_text(json.dumps({'source_revision': lease['source_revision']}))
        self.assertIn('SERVING_OR_RETAINED_RELEASE', str(self.collect(True)['retained']))
        (release / 'release-manifest.json').unlink()
        with FileLock(state.with_suffix('.active')):
            self.assertIn('SOURCE_LEASE_ACTIVE', str(self.collect(True)['retained']))
        self.assertTrue(workspace.exists())

    def test_recent_receipt_extends_activity_and_unregistered_copy_is_preserved(self):
        workspace, state, lease = self.old_source()
        self.two_new_sources()
        key = workspace.parent.name
        results = workspace.parents[1] / '.development-build-results' / key
        results.mkdir(parents=True)
        (results / f"{lease['source_revision']}-last.json").write_text(json.dumps({
            'isolated_workspace': str(workspace), 'completed_at': time.time(),
        }))
        self.assertNotIn(str(workspace), self.collect(True)['removed'])
        self.assertTrue(workspace.exists())

    def test_release_lock_supports_read_only_existing_file(self):
        workspace, state, lease = self.old_source()
        self.two_new_sources()
        lock = state.parent / 'production-release.lock'
        lock.touch(); lock.chmod(0o444)
        self.assertEqual(self.collect(True)['removed'], [str(workspace)])

    def test_frozen_artifacts_are_collected_without_removing_receipts_or_symlink_targets(self):
        workspace, state, lease = self.old_source()
        self.two_new_sources()
        results = workspace.parents[1] / '.development-build-results' / workspace.parent.name
        store = results / 'artifacts'
        store.mkdir(parents=True)
        outside = self.root / 'user-content'; outside.mkdir()
        (outside / 'keep.txt').write_text('keep this')
        artifacts = []
        for number in range(3):
            revision = lease['source_revision']
            release_id = f"smartspec-web-{revision}-{number:012x}"
            artifact = store / release_id; artifact.mkdir()
            (artifact / 'public').mkdir()
            (artifact / 'public/index.html').write_text('generated')
            (artifact / 'external').symlink_to(outside, target_is_directory=True)
            receipt = results / f"{revision}-{number}.json"
            receipt.write_text(json.dumps({'status': 'BUILD_PASSED', 'source_revision': revision}))
            manifest = artifact / 'release-manifest.json'
            manifest.write_text(json.dumps({
                'schemaVersion': 1, 'releaseId': release_id, 'sourceSha': revision,
                'frontendSourceSha': revision, 'backendSourceSha': revision,
                'canonicalBuildResult': str(receipt), 'releaseArtifactDigest': 'sha256:' + 'a' * 64,
            }))
            os.utime(manifest, (time.time() - (7200 if number == 0 else 10),) * 2)
            (artifact / 'public').chmod(0o555); artifact.chmod(0o555)
            artifacts.append(artifact)
        unknown = store / 'unknown-user-copy'; unknown.mkdir()
        (unknown / 'keep').write_text('unknown content')
        release = self.root / 'releases/rollback-g1'; release.mkdir(parents=True)
        (release / 'release-manifest.json').write_text(json.dumps({'source_revision': lease['source_revision']}))
        self.assertEqual(self.collect()['artifact_eligible'], [])
        (release / 'release-manifest.json').unlink()
        with FileLock(store / '.artifact-publish.lock'):
            deferred = self.collect()
            self.assertEqual(deferred['artifact_status'], 'DEFERRED')
        report = self.collect(apply=True)
        self.assertEqual(report['artifact_removed'], [str(artifacts[0])])
        self.assertTrue(all(path.exists() for path in artifacts[1:]))
        self.assertEqual((outside / 'keep.txt').read_text(), 'keep this')
        self.assertTrue((unknown / 'keep').exists())
        self.assertTrue((results / f"{lease['source_revision']}-0.json").exists())


if __name__ == '__main__':
    unittest.main()
