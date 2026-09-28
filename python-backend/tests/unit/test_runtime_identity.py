import json

from app.core import runtime_identity


def test_source_fingerprint_is_deterministic_and_non_empty():
    first = runtime_identity.compute_source_fingerprint()
    second = runtime_identity.compute_source_fingerprint()

    assert first
    assert first == second


def test_write_runtime_identity_is_atomic_and_redacts_no_runtime_secrets(tmp_path, monkeypatch):
    target = tmp_path / "runtime.json"
    monkeypatch.setattr(runtime_identity, "RUNTIME_IDENTITY_FILE", target)

    identity = runtime_identity.write_runtime_identity()

    assert target.exists()
    assert json.loads(target.read_text()) == identity
    assert set(identity) == {"sourceFingerprint", "startedAt", "pid", "buildId"}
