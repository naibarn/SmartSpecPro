import { describe, expect, it } from "vitest";

import {
  buildHyperframesDeadLetterReplayToken,
  buildHyperframesMetricsSnapshot,
  disableHyperframesTemplateAsOperator,
  disableHyperframesTemplateWithAuditAsOperator,
  enableHyperframesTemplateAsOperator,
  enableHyperframesTemplateWithAuditAsOperator,
  replayHyperframesDeadLetterJobAsOperator,
  replayHyperframesDeadLetterAsOperator,
  transitionHyperframesDeadLetterRenderJobAsOperator,
} from "../hyperframesOperatorService";
import { buildHyperframesRenderProjection } from "../hyperframesRenderService";
import { listHyperframesTemplateRegistry } from "../hyperframesTemplateRegistry";

const operatorAuth = {
  userId: 1,
  tenantId: "tenant_1",
  role: "operator",
  operatorEnabled: true,
} as const;

const templatePayload = {
  templateId: "marketplace_storyboard_motion_9x9_v1",
  templateVersion: "1.0.0",
  templateContentHash: "hf_template_storyboard_motion_9x9_v1",
};

describe("hyperframesOperatorService", () => {
  it("requires operator permission for template controls", () => {
    expect(() =>
      disableHyperframesTemplateAsOperator({
        auth: { userId: 1, tenantId: "tenant_1", role: "viewer" },
        templateId: "marketplace_storyboard_motion_9x9_v1",
        reason: "test",
      })
    ).toThrow(/permission/);
  });

  it("operator template disable affects registry projection and can be reversed", () => {
    disableHyperframesTemplateAsOperator({
      auth: operatorAuth,
      templateId: "marketplace_storyboard_motion_9x9_v1",
      reason: "Snapshot regression",
    });
    expect(
      listHyperframesTemplateRegistry({
        includeDisabled: true,
      }).find(template => template.templateId === "marketplace_storyboard_motion_9x9_v1")
        ?.enabled
    ).toBe(false);

    enableHyperframesTemplateAsOperator({
      auth: operatorAuth,
      templateId: "marketplace_storyboard_motion_9x9_v1",
    });
    expect(
      listHyperframesTemplateRegistry().some(
        template => template.templateId === "marketplace_storyboard_motion_9x9_v1"
      )
    ).toBe(true);
  });

  it("replays dead-lettered jobs only when the composition input hash is current", () => {
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "dead_lettered",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input_current",
        ...templatePayload,
      },
      safeDiagnostics: [
        "failed with signed URL https://cdn.example.com/file.mp4?sig=secret",
      ],
    });
    const replayToken = buildHyperframesDeadLetterReplayToken(render);

    expect(() =>
      replayHyperframesDeadLetterAsOperator({
        auth: { userId: 1, tenantId: "tenant_1", role: "viewer" },
        render,
        currentCompositionInputHash: "hf_input_current",
        replayToken,
        reason: "operator replay after diagnostics",
      })
    ).toThrow(/permission/);
    expect(() =>
      replayHyperframesDeadLetterAsOperator({
        auth: operatorAuth,
        render,
        currentCompositionInputHash: "hf_stale",
        replayToken,
        reason: "operator replay after diagnostics",
      })
    ).toThrow(/stale/);
    expect(() =>
      replayHyperframesDeadLetterAsOperator({
        auth: operatorAuth,
        render,
        currentCompositionInputHash: "hf_input_current",
        replayToken: "hf_replay_invalid",
        reason: "operator replay after diagnostics",
      })
    ).toThrow(/token/);
    expect(() =>
      replayHyperframesDeadLetterAsOperator({
        auth: operatorAuth,
        render,
        currentCompositionInputHash: "hf_input_current",
        replayToken,
        reason: "operator replay after diagnostics",
        access: { featureEnabled: false },
      })
    ).toThrow(/disabled/);

    const replay = replayHyperframesDeadLetterAsOperator({
      auth: operatorAuth,
      render,
      currentCompositionInputHash: "hf_input_current",
      replayToken,
      reason: "operator replay after diagnostics",
    });
    expect(replay).toMatchObject({
      replayable: true,
      nextStatus: "queued",
      audit: {
        action: "hyperframes_dead_letter_replayed",
        renderJobId: "hf_render_1",
        productId: "product_1",
        runId: "mar_1",
        redacted: true,
      },
    });
  });

  it("blocks dead-letter replay when the selected template is disabled", () => {
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_disabled_template",
      status: "dead_lettered",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input_current",
        ...templatePayload,
      },
    });
    const replayToken = buildHyperframesDeadLetterReplayToken(render);
    disableHyperframesTemplateAsOperator({
      auth: operatorAuth,
      templateId: templatePayload.templateId,
      reason: "Snapshot regression",
    });
    try {
      expect(() =>
        replayHyperframesDeadLetterAsOperator({
          auth: operatorAuth,
          render,
          currentCompositionInputHash: "hf_input_current",
          replayToken,
          reason: "operator replay after diagnostics",
        })
      ).toThrow(/template is disabled/);
    } finally {
      enableHyperframesTemplateAsOperator({
        auth: operatorAuth,
        templateId: templatePayload.templateId,
      });
    }
  });

  it("summarizes render metrics for operator dashboards", () => {
    const snapshot = buildHyperframesMetricsSnapshot({
      renders: [
        buildHyperframesRenderProjection({
          tenantId: "tenant_1",
          productId: "product_1",
          runId: "mar_1",
          renderJobId: "hf_queued",
          status: "queued",
        }),
        buildHyperframesRenderProjection({
          tenantId: "tenant_1",
          productId: "product_1",
          runId: "mar_1",
          renderJobId: "hf_rendering",
          status: "rendering",
        }),
        buildHyperframesRenderProjection({
          tenantId: "tenant_1",
          productId: "product_1",
          runId: "mar_1",
          renderJobId: "hf_done",
          status: "completed",
          payload: { qaStatus: "passed" },
        }),
        buildHyperframesRenderProjection({
          tenantId: "tenant_1",
          productId: "product_1",
          runId: "mar_1",
          renderJobId: "hf_failed",
          status: "failed_transient",
        }),
        buildHyperframesRenderProjection({
          tenantId: "tenant_1",
          productId: "product_1",
          runId: "mar_1",
          renderJobId: "hf_dead",
          status: "dead_lettered",
        }),
      ],
    });

    expect(snapshot).toEqual({
      queued: 1,
      started: 1,
      completed: 1,
      cancelled: 0,
      transientFailures: 1,
      permanentFailures: 0,
      deadLettered: 1,
      libraryReady: 1,
    });
  });

  it("persists replay audit and delegates the actual dead-letter transition", async () => {
    const auditEvents: unknown[] = [];
    const transitions: unknown[] = [];
    const render = buildHyperframesRenderProjection({
      tenantId: "tenant_1",
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      status: "dead_lettered",
      payload: {
        productId: "product_1",
        compositionInputHash: "hf_input_current",
        ...templatePayload,
      },
    });
    const replayToken = buildHyperframesDeadLetterReplayToken(render);

    const replay = await replayHyperframesDeadLetterJobAsOperator({
      auth: operatorAuth,
      render,
      currentCompositionInputHash: "hf_input_current",
      replayToken,
      reason: "operator replay after diagnostics",
      transitionJob: request => {
        transitions.push(request);
        return { updated: true };
      },
      auditSink: {
        recordAuditEvent: event => {
          auditEvents.push(event);
        },
      },
    });

    expect(replay.transition).toEqual({ updated: true });
    expect(replay.auditPersistence.persisted).toBe(true);
    expect(transitions).toEqual([
      {
        renderJobId: "hf_render_1",
        tenantId: "tenant_1",
        runId: "mar_1",
        productId: "product_1",
        nextStatus: "queued",
      },
    ]);
    expect(auditEvents).toEqual([
      expect.objectContaining({
        action: "hyperframes_dead_letter_replayed",
        redacted: true,
      }),
    ]);
  });

  it("persists template enable and disable audit through the async operator wrappers", async () => {
    const auditEvents: unknown[] = [];

    const disabled = await disableHyperframesTemplateWithAuditAsOperator({
      auth: operatorAuth,
      templateId: templatePayload.templateId,
      reason: "Snapshot regression",
      auditSink: {
        recordAuditEvent: event => {
          auditEvents.push(event);
        },
      },
    });
    expect(disabled.auditPersistence.persisted).toBe(true);
    expect(disabled.audit).toMatchObject({
      action: "hyperframes_template_disabled",
      templateId: templatePayload.templateId,
      redacted: true,
    });

    const enabled = await enableHyperframesTemplateWithAuditAsOperator({
      auth: operatorAuth,
      templateId: templatePayload.templateId,
      auditSink: {
        recordAuditEvent: event => {
          auditEvents.push(event);
        },
      },
    });
    expect(enabled.auditPersistence.persisted).toBe(true);
    expect(auditEvents).toEqual([
      expect.objectContaining({ action: "hyperframes_template_disabled" }),
      expect.objectContaining({ action: "hyperframes_template_enabled" }),
    ]);
  });

  it("requires operator permission before dead-letter transition", async () => {
    await expect(
      transitionHyperframesDeadLetterRenderJobAsOperator({
        auth: { userId: 1, tenantId: "tenant_1", role: "viewer" },
        renderJobId: "hf_render_1",
        tenantId: "tenant_1",
        runId: "mar_1",
        productId: "product_1",
        nextStatus: "queued",
      })
    ).rejects.toThrow(/permission/);
  });
});
