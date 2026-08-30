export type CanonicalWorkerRouteId =
  | "overview"
  | "connection"
  | "series"
  | "media-workspace"
  | "queue"
  | "workflows"
  | "comfy-jobs"
  | "comfy"
  | "runtime"
  | "settings";

export type LegacyWorkerRouteId =
  | "binding"
  | "render"
  | "hermes"
  | "published"
  | "ai-plan"
  | "home"
  | "footage"
  | "jobs";

export type WorkerRouteId = CanonicalWorkerRouteId | LegacyWorkerRouteId;

export type WorkerRoute = {
  id: CanonicalWorkerRouteId;
  label: string;
  hint: string;
};

export type WorkerLocale = "th" | "en";

const ROUTE_COPY: Record<CanonicalWorkerRouteId, { th: [string, string]; en: [string, string] }> = {
  overview: { th: ["ภาพรวม", "สุขภาพ Worker"], en: ["Overview", "Worker health"] },
  connection: { th: ["การเชื่อมต่อ", "เชื่อมเครื่องนี้"], en: ["Connection", "Link this machine"] },
  series: { th: ["พื้นที่ Series", "Series และโฟลเดอร์ในเครื่อง"], en: ["Series workspace", "Series and local folder"] },
  "media-workspace": { th: ["พื้นที่สื่อ", "รับเข้าไปจนพร้อมใช้"], en: ["Media Workspace", "Intake to publish"] },
  queue: { th: ["คิวงาน", "งานและความคืบหน้า"], en: ["Queue", "Jobs & progress"] },
  workflows: { th: ["ComfyUI Workbench", "ตรวจ input และสั่งรัน MCP"], en: ["ComfyUI Workbench", "Inspect inputs and run MCP"] },
  "comfy-jobs": { th: ["งาน ComfyUI", "งาน GPU และผลลัพธ์"], en: ["ComfyUI Jobs", "GPU jobs and outputs"] },
  comfy: { th: ["ComfyUI", "การเชื่อมต่อและ workflow"], en: ["ComfyUI", "Connections & workflows"] },
  runtime: { th: ["Runtime และ agents", "Runtime และการวินิจฉัย"], en: ["Runtime & agents", "Runtime and diagnostics"] },
  settings: { th: ["ตั้งค่า", "ค่ากำหนด"], en: ["Settings", "Preferences"] },
};

/** Canonical route registry for the Worker App shell. Old tab ids remain
 * aliases so existing deep links and automation do not break while screens
 * are split into a sidebar workspace. */
export const WORKER_ROUTES: readonly WorkerRoute[] = [
  { id: "overview", label: "Overview", hint: "Worker health" },
  { id: "connection", label: "Connection", hint: "Link this machine" },
  { id: "series", label: "Series workspace", hint: "Series and local folder" },
  { id: "media-workspace", label: "Media Workspace", hint: "Intake to publish" },
  { id: "queue", label: "Queue", hint: "Jobs & progress" },
  { id: "workflows", label: "ComfyUI Workbench", hint: "Inspect and run MCP workflows" },
  { id: "comfy-jobs", label: "ComfyUI Jobs", hint: "GPU jobs and outputs" },
  { id: "comfy", label: "ComfyUI", hint: "Connections & workflows" },
  { id: "runtime", label: "Runtime & agents", hint: "Runtime and diagnostics" },
  { id: "settings", label: "Settings", hint: "Preferences" },
];

export function localizedWorkerRoute(route: CanonicalWorkerRouteId, locale: WorkerLocale): WorkerRoute {
  const [label, hint] = ROUTE_COPY[route][locale];
  return { id: route, label, hint };
}

export function localizedWorkerRoutes(locale: WorkerLocale): readonly WorkerRoute[] {
  return WORKER_ROUTES.map(route => localizedWorkerRoute(route.id, locale));
}

export const WORKER_ROUTE_ALIASES: Record<string, CanonicalWorkerRouteId> = {
  home: "overview",
  binding: "series",
  render: "queue",
  hermes: "runtime",
  footage: "media-workspace",
  jobs: "queue",
  published: "media-workspace",
  "ai-plan": "media-workspace",
  workflows: "workflows",
  "comfy-jobs": "comfy-jobs",
};

export function resolveWorkerRoute(route: string): CanonicalWorkerRouteId {
  if (WORKER_ROUTES.some((item) => item.id === route)) {
    return route as CanonicalWorkerRouteId;
  }
  return WORKER_ROUTE_ALIASES[route] ?? "overview";
}
