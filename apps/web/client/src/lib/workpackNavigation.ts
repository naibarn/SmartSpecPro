export const WORKPACK_ROUTES = {
  intake: "/workpacks/intake",
  detail: (workpackId: string) => `/workpacks/${workpackId}`,
  replay: (workpackId: string) => `/workpacks/${workpackId}/replay`,
  connectors: (workpackId: string) => `/workpacks/${workpackId}/connectors`,
  exceptions: "/workpacks/exceptions",
  roi: "/workpacks/roi",
  discovery: "/workpacks/discovery",
} as const;

export type WorkpackEntrypoint = "chat" | "workflow_gallery" | "teams" | "desktop_open" | "dashboard";
export type WorkpackSurface = keyof typeof WORKPACK_ROUTES;

export function buildWorkpackDetailHref(workpackId: string, section?: "replay" | "connectors"): string {
  if (section === "replay") return WORKPACK_ROUTES.replay(workpackId);
  if (section === "connectors") return WORKPACK_ROUTES.connectors(workpackId);
  return WORKPACK_ROUTES.detail(workpackId);
}

export function buildWorkpackEntrypointHref(input: {
  entrypoint: WorkpackEntrypoint;
  workpackId?: string | null;
  surface?: "detail" | "replay" | "connectors" | "intake" | "exceptions" | "roi" | "discovery";
}): string {
  const surface = input.surface ?? (input.workpackId ? "detail" : "intake");
  const base = surface === "detail" && input.workpackId
    ? WORKPACK_ROUTES.detail(input.workpackId)
    : surface === "replay" && input.workpackId
      ? WORKPACK_ROUTES.replay(input.workpackId)
      : surface === "connectors" && input.workpackId
        ? WORKPACK_ROUTES.connectors(input.workpackId)
        : surface === "exceptions"
          ? WORKPACK_ROUTES.exceptions
          : surface === "roi"
            ? WORKPACK_ROUTES.roi
            : surface === "discovery"
              ? WORKPACK_ROUTES.discovery
              : WORKPACK_ROUTES.intake;

  return `${base}?entrypoint=${input.entrypoint}`;
}

export function describeWorkpackEntrypoint(entrypoint: WorkpackEntrypoint): string {
  switch (entrypoint) {
    case "chat":
      return "Open from chat-originated case intake";
    case "workflow_gallery":
      return "Open from workflow starter or template";
    case "teams":
      return "Open from team or agency operations";
    case "desktop_open":
      return "Open from desktop or local-file context";
    case "dashboard":
    default:
      return "Open from dashboard overview";
  }
}
