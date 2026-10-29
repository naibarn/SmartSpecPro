/** Workspace permissions are the user-facing boundary. Runner candidates and
 * SPEC-293 leases still enforce that boundary at source apply time. */
export const SPEC224_WORKSPACE_ACCESS_MODES = ["workspace", "exclude_risky"] as const;
export type Spec224WorkspaceAccessMode = (typeof SPEC224_WORKSPACE_ACCESS_MODES)[number];

export const SPEC224_RISKY_PATH_RULES = [
  "environment files (.env and variants)",
  "credential and secret files or directories",
  "private keys and certificate bundles",
  "deployment and infrastructure configuration",
] as const;

export function isSpec224WorkspaceAccessMode(value: unknown): value is Spec224WorkspaceAccessMode {
  return SPEC224_WORKSPACE_ACCESS_MODES.includes(value as Spec224WorkspaceAccessMode);
}

export function resolveSpec224WorkspaceWritePolicy(mode: Spec224WorkspaceAccessMode) {
  return {
    allowedWriteSet: ["**"],
    accessMode: mode,
  } as const;
}
