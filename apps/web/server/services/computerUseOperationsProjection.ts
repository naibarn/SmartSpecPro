export function buildComputerUseOperationsProjection(input: {
  route: "structured" | "semantic" | "localRunner" | "visual" | null;
  readiness: "loading" | "ready" | "setup_required" | "denied" | "error";
  preview: "none" | "pending" | "approved" | "cancelled";
  session: "idle" | "running" | "approval" | "completed" | "failed";
  verification: "none" | "pending" | "verified" | "mismatch";
  blocker: string | null;
}): {
  surface: "inspector_and_run_drawer";
  status:
    | "loading"
    | "idle"
    | "ready"
    | "running"
    | "approval"
    | "verified"
    | "blocked"
    | "error";
  route: typeof input.route;
  nextAction:
    | "select_route"
    | "preview"
    | "approve"
    | "wait_for_verification"
    | "retry"
    | "show_reason"
    | "none";
} {
  if (input.readiness === "loading")
    return {
      surface: "inspector_and_run_drawer",
      status: "loading",
      route: input.route,
      nextAction: "none",
    };
  if (input.blocker || input.readiness === "denied")
    return {
      surface: "inspector_and_run_drawer",
      status: "blocked",
      route: input.route,
      nextAction: "show_reason",
    };
  if (input.readiness === "error")
    return {
      surface: "inspector_and_run_drawer",
      status: "error",
      route: input.route,
      nextAction: "retry",
    };
  if (!input.route)
    return {
      surface: "inspector_and_run_drawer",
      status: "idle",
      route: null,
      nextAction: "select_route",
    };
  if (input.preview === "pending")
    return {
      surface: "inspector_and_run_drawer",
      status: "approval",
      route: input.route,
      nextAction: "approve",
    };
  if (input.preview === "none")
    return {
      surface: "inspector_and_run_drawer",
      status: "ready",
      route: input.route,
      nextAction: "preview",
    };
  if (input.verification === "verified")
    return {
      surface: "inspector_and_run_drawer",
      status: "verified",
      route: input.route,
      nextAction: "none",
    };
  if (input.verification === "mismatch" || input.session === "failed")
    return {
      surface: "inspector_and_run_drawer",
      status: "error",
      route: input.route,
      nextAction: "retry",
    };
  return {
    surface: "inspector_and_run_drawer",
    status: "running",
    route: input.route,
    nextAction: "wait_for_verification",
  };
}
