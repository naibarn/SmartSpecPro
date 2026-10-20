const PINNED_IMAGE = /^[a-z0-9][a-z0-9.:-]*\/[a-zA-Z0-9/_-]+@sha256:[a-f0-9]{64}$/;

/** Pure build input validation, never a registry publication or execution API.
 * The release owner must supply approved compatible build/runtime images. */
export function cloudflareRunnerImagePlan({ buildImage, runtimeImage, capability, ffmpegVersion }) {
  if (!PINNED_IMAGE.test(buildImage ?? "") || !PINNED_IMAGE.test(runtimeImage ?? "")) {
    throw new Error("RUNNER_BASE_IMAGE_DIGEST_REQUIRED");
  }
  if (capability !== undefined && capability !== "container-media-probe-v1") throw new Error("RUNNER_IMAGE_CAPABILITY_NOT_ADMITTED");
  if (capability && !/^[0-9]+:[0-9][a-zA-Z0-9.+:~_-]{0,100}$/.test(ffmpegVersion ?? "")) throw new Error("RUNNER_FFMPEG_VERSION_REQUIRED");
  return {
    context: ".", containerfile: capability ? "apps/runner-app/MediaProbe.Containerfile" : "apps/runner-app/Containerfile", binary: "smartaihub-runner",
    buildArguments: { RUST_BUILD_IMAGE: buildImage, RUNNER_RUNTIME_IMAGE: runtimeImage, ...(capability ? { FFMPEG_VERSION: ffmpegVersion } : {}) },
    target: "runtime", capability: capability ?? null,
    entrypoint: ["smartaihub-runner", "run"], profile: "shared_container", healthPort: 8787,
    healthPath: "/health/runner", publish: false,
  };
}
