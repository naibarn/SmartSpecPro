# Plan self-review rounds

1. Completeness: covered persistence, runner capability, preflight, import, UI
   states, manual guidance, and tests. Auto-fix: added explicit runner rebuild
   note because published 0.1.0 cannot answer `--capabilities`.
2. Contradictions: verified model paths stay outside base runtime and no
   implicit download is described. Auto-fix: documented app-managed import.
3. Security: verified adapter allow-list, source immutability, symlink rejection,
   and token non-persistence. Auto-fix: rejected configuration for adapters
   without model environment variables.
4. Failure modes: verified missing runner, missing dependency, missing model,
   invalid extension, and blocked fallback are surfaced. Auto-fix: added format
   and non-empty checks for ONNX/TASK models and pipeline directories.
5. Implementability: verified Tauri registration, camelCase command arguments,
   startup environment application, and focused validation commands. No further
   must-do gaps found; Windows release rebuild remains an operational gate.
