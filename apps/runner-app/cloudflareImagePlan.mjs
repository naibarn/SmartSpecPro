const PINNED_IMAGE = /^[a-z0-9][a-z0-9.:-]*\/[a-zA-Z0-9/_-]+@sha256:[a-f0-9]{64}$/;

/** Pure build input validation, never a registry publication or execution API.
 * The release owner must supply approved compatible build/runtime images. */
export function cloudflareRunnerImagePlan({ buildImage, runtimeImage }) {
  if (!PINNED_IMAGE.test(buildImage ?? "") || !PINNED_IMAGE.test(runtimeImage ?? "")) {
    throw new Error("RUNNER_BASE_IMAGE_DIGEST_REQUIRED");
  }
  return {
    context: ".", containerfile: "apps/runner-app/Containerfile", binary: "smartaihub-runner",
    buildArguments: { RUST_BUILD_IMAGE: buildImage, RUNNER_RUNTIME_IMAGE: runtimeImage },
    entrypoint: ["smartaihub-runner", "run"], profile: "shared_container", healthPort: 8787,
    healthPath: "/health/runner", publish: false,
  };
}
