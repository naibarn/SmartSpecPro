/**
 * GPU encoding policy for every `renderMedia()` call in this repo.
 *
 * `renderMedia()` defaults `hardwareAcceleration` to `"disable"`, which pins
 * the H.264 encode to libx264 regardless of what hardware is present —
 * measured 2026-08-02 on a worker with an RTX 5060 Ti, Task Manager's Video
 * Encode graph sat at 0% for the whole render while the CPU carried it.
 *
 * Kept as a function rather than a constant so the environment is read at
 * render time: the worker sets these variables per job, not at import.
 */
export type RemotionHardwareAcceleration = "disable" | "if-possible" | "required";

/**
 * `"if-possible"`, never `"required"`: a machine with no NVENC then falls back
 * to libx264 silently instead of failing the job outright. Set
 * `SMARTAIHUB_ENABLE_GPU_ENCODING=0` to force software encoding — the same
 * switch the HyperFrames lane reads (Rust `DEFAULT_RENDER_ENV` sets it to
 * "1"), so GPU encoding has ONE operator knob across both renderers.
 *
 * CAUTION when touching the other `renderMedia()` options: Remotion silently
 * drops back to software encoding whenever `crf`, `encodingMaxRate`, or
 * `encodingBufferSize` is set (`hasSpecifiedUnsupportedHardwareQualifySettings`
 * in @remotion/renderer). No call site in this repo sets them — adding one
 * turns NVENC off again with nothing but a log line to show for it.
 */
export function resolveHardwareAcceleration(
  env: NodeJS.ProcessEnv = process.env,
): RemotionHardwareAcceleration {
  return env.SMARTAIHUB_ENABLE_GPU_ENCODING === "0" ? "disable" : "if-possible";
}
