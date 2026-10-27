import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: number; role: string },
  list: vi.fn(),
}));
vi.mock("../../_core/sdk", () => ({
  sdk: { authenticateRequest: async () => mocks.user },
}));
vi.mock("../../services/workerAppBuildService", () => ({
  listWorkerAppBuilds: mocks.list,
  reconcileWorkerAppBuild: vi.fn(),
  startWorkerAppBuild: vi.fn(),
  startWorkerAppBuildReconciler: vi.fn(),
}));
import { createDesktopReleaseRouter } from "../desktopReleases";

async function call(method: "get" | "post", path: string) {
  const router = createDesktopReleaseRouter() as any;
  const layer = router.stack.find(
    (candidate: any) =>
      candidate.route?.path === path && candidate.route.methods[method]
  );
  const res = {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
  await layer.route.stack[0].handle(
    { headers: {}, body: {}, params: { id: "build-id" } },
    res
  );
  return res;
}

describe("Worker App build endpoints", () => {
  it("requires a signed-in admin for history, build and sync", async () => {
    for (const role of [null, "user", "domain_admin"]) {
      mocks.user = role ? { id: 1, role } : null;
      for (const [method, path] of [
        ["get", "/worker-app/builds"],
        ["post", "/worker-app/builds"],
        ["post", "/worker-app/builds/:id/sync"],
      ] as const) {
        const res = await call(method, path);
        expect(res.statusCode).toBe(role ? 403 : 401);
      }
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns build history to an admin", async () => {
    mocks.user = { id: 1, role: "admin" };
    mocks.list.mockResolvedValue([{ id: "build-id" }]);
    const res = await call("get", "/worker-app/builds");
    expect(res.statusCode).toBe(200);
    expect(res.body.builds).toEqual([{ id: "build-id" }]);
  });
});
