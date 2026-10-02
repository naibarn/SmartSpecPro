# Spec 224 admission Python profile

This is a non-production dependency profile for the Spec 224 approval/recovery
source projection and focused tests. Its direct runtime selections mirror the
corresponding constrained entries in the Python backend requirements manifest.

Resolution evidence:

- Resolver: uv 0.9.28 (`uv lock --check`)
- Python: CPython 3.12.12 (matches the backend Dockerfile's Python 3.12 runtime line)
- Target observed on resolver host: Linux x86_64, glibc 2.41
- Registry: `https://pypi.org/simple`
- Operational input SHA-256: `77c297e33f93dfa9ad02dbcfc49f0e0d79c8c3abc0fff0481f9cf0ea0227e2bf`
- Focused manifest SHA-256: `d5e7d2ae271b4e4dfd51b09d5b6f5abb4151ab9366dca855a6869275f02fe42e`
- Lock SHA-256: `5114c7aa54ed26a7319f911b24f4457df7d182e6afda71505d59a9b536151134`

The profile directly selects packages imported by the reachable Python
projection, plus its test dependencies. The lock records exact versions,
registry URLs, artifact hashes and platform markers. No package lifecycle hook
is run by lock or sync. Optional feature dependencies not selected or declared
by the operational manifest remain explicit source-closure blockers.

Install without project build hooks using `uv sync --locked --no-install-project
--project python-backend/spec224-admission --group admission-tests` in a fresh
profile-specific environment. This profile is evidence for this exact
non-production execution slice only and is not production certification.

The failed initial Python 3.13.5 install attempt is not reused: canonical
`requirements.txt` pins asyncpg 0.29.0, whose sdist does not build against the
observed Python 3.13 C API. Python 3.12.12 is the backend's declared container
runtime line and its locked cp312 wheel installed successfully without a source
build.
