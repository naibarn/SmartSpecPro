const SHA_PATTERN = /^[0-9a-f]{40,64}$/;

/** Permit a pinned dev artifact across a newer checkout only for handoff-only commits. */
export function isCompatibleDevelopmentBuildSource({
  artifactSourceSha,
  runtimeSourceSha,
  isAncestor,
  interveningPaths,
}) {
  if (!SHA_PATTERN.test(artifactSourceSha || "") || !SHA_PATTERN.test(runtimeSourceSha || "")) {
    return false;
  }
  if (artifactSourceSha === runtimeSourceSha) return true;
  if (!isAncestor || !Array.isArray(interveningPaths) || interveningPaths.length === 0) return false;
  return interveningPaths.every(path =>
    typeof path === "string" && path.startsWith("specs/") && path.includes("/handoff/")
  );
}
