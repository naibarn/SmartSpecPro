# Spec 224 admission Python profile

This is a development-only dependency profile for the authenticated Spec 224
approval and recovery-grant API/service tests. It does not replace the Python
backend's operational dependency policy in `../requirements.txt`.

Resolution evidence:

- Resolver: uv 0.9.28 (`uv lock --check`)
- Python: CPython 3.12.12 (matches the backend Dockerfile's Python 3.12 runtime line)
- Target observed on resolver host: Linux x86_64, glibc 2.41
- Registry: `https://pypi.org/simple`
- Operational input SHA-256: `ba73a5aa1bee995784166e0923ebfb99137985e43094e329e504e826e7d00e39`
- Focused manifest SHA-256: `abfc47e638a68a8bc30194535c38442a30c3ff3ebab6cb1b7ee3b9970ac7ba85`
- Lock SHA-256: `56cd8ab4664a2cd6a2bd0d11d4337e31c59e489cdf2a3ca32dae5979b597f3c9`

The focused manifest selects only runtime imports for the approval API/service
and the two focused test files. Unselected operational requirements remain
outside this profile; they are not represented as resolved runtime edges.
The lock records exact versions, registry URLs, artifact hashes and platform
markers. No package lifecycle hook is run by lock or sync.

Install without project build hooks using `uv sync --locked --no-install-project
--project python-backend/spec224-admission --group admission-tests` in a fresh
profile-specific environment. This profile is evidence for this exact
non-production execution slice only and is not production certification.

The failed initial Python 3.13.5 install attempt is not reused: canonical
`requirements.txt` pins asyncpg 0.29.0, whose sdist does not build against the
observed Python 3.13 C API. Python 3.12.12 is the backend's declared container
runtime line and its locked cp312 wheel installed successfully without a source
build.
