# Worker runtime publish/update quick plan

1. Add a shared server admission gate for complete transcription and non-placeholder signature files.
2. Make managed WSL doctor output and status fail when transcription assets or signature are absent.
3. Add a force-capable runtime repair action to Runtime & agents.
4. Add focused tests and run package/Rust verification.
5. Build the current runtime only when a real release signing input is available; report any publish/deploy boundary separately.
