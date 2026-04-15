import type {
  DesktopPackageState,
  DesktopPackageTrustClass,
  DesktopRolloutGateState,
  DesktopRunLabels,
} from "@shared/desktopHost";

export const desktopTrustClassLabels: Record<DesktopPackageTrustClass, string> = {
  built_in_verified: "Built-in Verified",
  org_verified: "Org Verified",
  local_unverified: "Local Unverified",
  project_local: "Project Local",
};

export const desktopPackageStateLabels: Record<DesktopPackageState, string> = {
  trusted: "Trusted",
  restricted: "Restricted",
  quarantined: "Quarantined",
  blocked: "Blocked",
  revoked: "Revoked",
  requires_review: "Requires Review",
  incompatible: "Incompatible",
};

export function formatDesktopRunLabels(labels: DesktopRunLabels): string[] {
  return [
    `Surface: ${labels.surface === "desktop" ? "Desktop" : "Web"}`,
    `Runtime: ${labels.runtime.replace("_", " ")}`,
    `Locality: ${labels.locality}`,
    `Workspace: ${labels.workspace.replace("_", " ")}`,
    `Trust: ${desktopTrustClassLabels[labels.trustClass]}`,
  ];
}

export function buildDesktopHandoffLinks(input: {
  runId?: string;
  projectId?: string;
  skillId?: string;
  agencyId?: string;
}) {
  const params = new URLSearchParams();
  if (input.runId) params.set("runId", input.runId);
  if (input.projectId) params.set("projectId", input.projectId);
  if (input.skillId) params.set("skillId", input.skillId);
  if (input.agencyId) params.set("agencyId", input.agencyId);

  return {
    openInDesktop: `/desktop/open?${params.toString()}`,
    viewOnWeb: `/desktop/view?${params.toString()}`,
  };
}

export function buildDesktopLaunchUri(input: {
  runId?: string;
  projectId?: string;
  skillId?: string;
  agencyId?: string;
}): string {
  const params = new URLSearchParams();
  if (input.runId) params.set("runId", input.runId);
  if (input.projectId) params.set("projectId", input.projectId);
  if (input.skillId) params.set("skillId", input.skillId);
  if (input.agencyId) params.set("agencyId", input.agencyId);
  return `smartaihub://desktop/open?${params.toString()}`;
}

export function resolveDesktopViewHref(input: {
  runId?: string | null;
  projectId?: string | null;
  skillId?: string | null;
  agencyId?: string | null;
}): string {
  if (input.agencyId) {
    return `/agencies/${encodeURIComponent(input.agencyId)}`;
  }
  if (input.runId?.startsWith("chat-")) {
    return `/chat?conversationId=${encodeURIComponent(input.runId.replace(/^chat-/, ""))}`;
  }
  if (input.skillId) {
    return `/settings/skills?skill=${encodeURIComponent(input.skillId)}`;
  }
  if (input.projectId) {
    return `/dashboard?projectId=${encodeURIComponent(input.projectId)}`;
  }
  return "/dashboard";
}

export function summarizeRolloutGates(gates: DesktopRolloutGateState[]): {
  satisfied: number;
  blocked: number;
} {
  return gates.reduce(
    (summary, gate) => {
      if (gate.satisfied) {
        summary.satisfied += 1;
      } else {
        summary.blocked += 1;
      }
      return summary;
    },
    { satisfied: 0, blocked: 0 },
  );
}
