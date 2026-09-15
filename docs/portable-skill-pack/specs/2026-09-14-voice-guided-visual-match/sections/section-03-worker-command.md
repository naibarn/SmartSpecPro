# Section 03 — Worker Native Command

Add and register a Tauri command. Load connected worker credentials, read one local image, enforce workspace/path boundary when available, validate MIME and bytes, convert to a bounded data URL, and call the server route using device-proof-signed helpers. Return only structured analysis; never expose credentials or log image payloads.

Use bounded timeout/retry. Auth, unavailable skill, unsupported image, and provider errors become safe typed errors. Do not silently call the unregistered tauri-shell local Gemma command. Add Rust tests for validation, URL normalization, and safe error mapping.
