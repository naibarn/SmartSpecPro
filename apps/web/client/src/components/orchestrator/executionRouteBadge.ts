export type ExecutionRouteBadge = {
  label: string;
  title: string;
  className: string;
};

type ExecutionRouteBadgeInput = {
  route?: string | null;
  selectedSkillId?: string | null;
  routeReason?: string | null;
};

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function buildTitle(
  label: string,
  route?: string | null,
  selectedSkillId?: string | null,
  routeReason?: string | null
): string {
  const parts = [`Route: ${label}`];
  if (route) parts.push(`route=${route}`);
  if (selectedSkillId) parts.push(`skill=${selectedSkillId}`);
  if (routeReason) parts.push(`reason=${routeReason}`);
  return parts.join(" · ");
}

export function getExecutionRouteBadge(
  input: ExecutionRouteBadgeInput
): ExecutionRouteBadge | null {
  const route = normalize(input.route);
  const selectedSkillId = normalize(input.selectedSkillId);
  const routeReason = normalize(input.routeReason);

  if (
    route === "agency" ||
    selectedSkillId === "agency-swarm" ||
    routeReason.includes("agency")
  ) {
    return {
      label: "Agency swarm",
      title: buildTitle(
        "Agency swarm",
        input.route ?? null,
        input.selectedSkillId ?? null,
        input.routeReason ?? null
      ),
      className: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  if (
    route.includes("video") ||
    selectedSkillId === "video-creator" ||
    selectedSkillId === "video-prompt-engineer" ||
    selectedSkillId === "video-storyboard-to-prompts" ||
    selectedSkillId === "cinematic-video-createprompt" ||
    routeReason.includes("video")
  ) {
    return {
      label: "Video chain",
      title: buildTitle(
        "Video chain",
        input.route ?? null,
        input.selectedSkillId ?? null,
        input.routeReason ?? null
      ),
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (
    route.includes("image") ||
    selectedSkillId === "image-creator" ||
    selectedSkillId === "image_prompt_engineer" ||
    selectedSkillId === "smart-landscape-designer" ||
    routeReason.includes("image")
  ) {
    return {
      label: "Image chain",
      title: buildTitle(
        "Image chain",
        input.route ?? null,
        input.selectedSkillId ?? null,
        input.routeReason ?? null
      ),
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (
    route === "skill" ||
    selectedSkillId === "skill-orchestrator" ||
    routeReason.includes("orchestrator")
  ) {
    return {
      label: "Skill orchestrator",
      title: buildTitle(
        "Skill orchestrator",
        input.route ?? null,
        input.selectedSkillId ?? null,
        input.routeReason ?? null
      ),
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (route === "hybrid" || routeReason.includes("hybrid")) {
    return {
      label: "Hybrid route",
      title: buildTitle(
        "Hybrid route",
        input.route ?? null,
        input.selectedSkillId ?? null,
        input.routeReason ?? null
      ),
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return null;
}
