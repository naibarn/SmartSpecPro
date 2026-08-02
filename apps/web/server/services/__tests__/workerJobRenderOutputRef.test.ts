import { describe, expect, it } from "vitest";

import { resolveWorkerJobRenderOutputRefForTest } from "../marketplaceAutoReviewService";

const job = (outputJson: unknown) =>
  ({ id: "job-1", outputJson }) as never;

/**
 * Field incident 2026-07-30 — worker job `b9d76a54…` for run
 * `mar_341efe636f0e6d11fc938a37dd4b19a1`. The Remotion render finished
 * correctly (1080x1920, 90.4s, loudnorm + ass_burn, artifact published as
 * library item 644) but the run stayed in `waiting_provider` and threw
 *
 *   Staged Remotion render worker job … completed but is missing
 *   outputJson.outputUrl
 *
 * once per sweep, because the reconciler only looked at `outputJson.outputUrl`
 * — the key LANE A (in-process) writes. A Lane B worker-app reports through
 * the worker EVENT protocol, so the URL lands under
 * `outputJson.lastEventPayload.outputUrl`.
 */
describe("resolveWorkerJobRenderOutputRef", () => {
  it("prefers the Lane A top-level outputUrl", () => {
    expect(
      resolveWorkerJobRenderOutputRefForTest(
        job({
          outputUrl: "https://cdn.test/a.mp4",
          lastEventPayload: { outputUrl: "worker-artifacts/b.mp4" },
        })
      )
    ).toBe("https://cdn.test/a.mp4");
  });

  it("falls back to the Lane B event payload — the real-world shape that broke", () => {
    expect(
      resolveWorkerJobRenderOutputRefForTest(
        job({
          lastEventType: "job.completed",
          lastEventPayload: {
            outputUrl:
              "worker-artifacts/tenant-X/job-1/b68a4ee1-render.mp4",
          },
        })
      )
    ).toBe("worker-artifacts/tenant-X/job-1/b68a4ee1-render.mp4");
  });

  it("falls back to a published artifact's already-servable sourceUrl", () => {
    expect(
      resolveWorkerJobRenderOutputRefForTest(
        job({
          publishedArtifacts: [
            {
              sourceUrl: "/api/storage/files/worker-artifacts/x/render.mp4",
              artifactId: "a1",
            },
          ],
        })
      )
    ).toBe("/api/storage/files/worker-artifacts/x/render.mp4");
  });

  it("falls back to outputArtifactRef.url before the bare storage ref", () => {
    expect(
      resolveWorkerJobRenderOutputRefForTest(
        job({
          outputArtifactRef: { url: "worker-artifacts/ref.mp4" },
          lastArtifactStorageRef: "worker-artifacts/last.mp4",
        })
      )
    ).toBe("worker-artifacts/ref.mp4");
  });

  it("uses lastArtifactStorageRef as the final fallback", () => {
    expect(
      resolveWorkerJobRenderOutputRefForTest(
        job({ lastArtifactStorageRef: "worker-artifacts/last.mp4" })
      )
    ).toBe("worker-artifacts/last.mp4");
  });

  it("returns empty string when the job genuinely produced nothing", () => {
    expect(resolveWorkerJobRenderOutputRefForTest(job({}))).toBe("");
    expect(resolveWorkerJobRenderOutputRefForTest(job(null))).toBe("");
  });
});
