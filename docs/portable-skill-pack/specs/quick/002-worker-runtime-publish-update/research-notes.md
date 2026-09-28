# Research notes

- `apps/worker-app/runtime-pack/manifest.json` declares whisper.cpp 1.9.3-dev,
  `whisper/whisper-cli`, and the large-v3 model with SHA-256 values.
- The public `hyperframes-wsl2@2026.08.18.1` archive contains no whisper,
  ggml, or transcription entries and carries the placeholder signature.
- `worker_app_check_runtime_update` compares the installed marker with the
  server manifest; `worker_app_install_runtime_pack` can reinstall the same
  version, while managed WSL uses `worker_app_open_managed_wsl_runtime_setup`.
- The Runtime & agents route had Hermes controls but no Worker runtime action.
- `package-runtime-release.mjs` and `package-windows-release.mjs` already know
  the transcription contract, but the runtime packager itself did not reject a
  placeholder signature.
- The server's HyperFrames admission gate did not require transcription or
  inspect the archive signature contents.
- No runtime signing private key is present in the local environment. The
  release workflow expects `SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY`.
