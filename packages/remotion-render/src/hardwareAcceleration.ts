/**
 * GPU encoding policy for every `renderMedia()` call in this repo.
 *
 * `renderMedia()` defaults `hardwareAcceleration` to `"disable"`, which is
 * the safe choice for desktop workers. The bundled FFmpeg can advertise
 * NVENC even when the host has no usable NVIDIA device; Remotion may then
 * write to a closed encoder pipe (EPIPE) and terminate the sidecar.
 *
 * Kept as a function rather than a constant so the environment is read at
 * render time: the worker sets these variables per job, not at import.
 */
export type RemotionHardwareAcceleration = "disable" | "if-possible" | "required";

/**
 * GPU encoding is an explicit opt-in. Set
 * `SMARTAIHUB_ENABLE_GPU_ENCODING=1` only after validating the worker's
 * GPU/driver. The same switch is used by the HyperFrames lane, so GPU
 * encoding has ONE operator knob across both renderers.
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
  return env.SMARTAIHUB_ENABLE_GPU_ENCODING === "1" ? "if-possible" : "disable";
}
