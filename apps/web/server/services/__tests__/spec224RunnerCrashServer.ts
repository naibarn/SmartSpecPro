import express from "express";
import { createServer } from "node:http";
import { defaultRunnerGateway } from "../runnerGateway";
import {
  handleRunnerUpgrade,
  registerRunnerControlRoutes,
} from "../../routes/runnerControl";
import type { WebSocket } from "ws";

type CrashPoint =
  "disconnect-before-ack" | "after-persist-before-ack" | "after-ack-written";
type ServerMessage = {
  type: string;
  point?: CrashPoint;
  receiptEventId?: string;
  commandId?: string;
  origin?: string;
  requestId?: string;
  count?: number;
  result?: unknown;
};

const childProcess = process as NodeJS.Process & {
  send?: (message: ServerMessage) => void;
};

process.env.NODE_ENV = "test";
const pauseAt = process.env.SPEC224_TEST_PAUSE_AT as CrashPoint | undefined;
let paused = false;
let runnerCommandFrameCount = 0;

process.on("message", message => {
  const request = message as { type?: unknown; requestId?: unknown };
  if (request?.type === "get-runner-command-count") {
    childProcess.send?.({
      type: "runner-command-count",
      requestId:
        typeof request.requestId === "string" ? request.requestId : undefined,
      count: runnerCommandFrameCount,
    });
    return;
  }
  if (request?.type !== "reconcile-now") return;
  void import("../spec224RunnerContinuationReconciler")
    .then(async module => {
      const result = await module.reconcileSpec224RunnerContinuations({
        limit: 100,
      });
      childProcess.send?.({ type: "reconciled", result });
    })
    .catch(error => {
      childProcess.send?.({ type: "reconcile-error", result: String(error) });
    });
});

async function pauseAtBoundary(
  point: CrashPoint,
  receiptEventId: string
): Promise<void> {
  if (paused || pauseAt !== point) return;
  paused = true;
  childProcess.send?.({ type: "failpoint", point, receiptEventId });
  await new Promise<void>(resolve => {
    const onMessage = (message: unknown) => {
      if ((message as { type?: unknown })?.type !== "release") return;
      process.off("message", onMessage);
      resolve();
    };
    process.on("message", onMessage);
  });
}

const app = express();
app.use(express.json());
registerRunnerControlRoutes(app, defaultRunnerGateway);
const server = createServer(app);
server.on("upgrade", (req, socket, head) =>
  handleRunnerUpgrade(req, socket, head, defaultRunnerGateway, {
    afterChannelAuthenticated: (origin, ws) => {
      childProcess.send?.({ type: "authenticated", origin });
      const send = ws.send.bind(ws);
      ws.send = ((data: unknown, ...args: unknown[]) => {
        if (typeof data === "string") {
          try {
            const envelope = JSON.parse(data) as {
              payload?: { type?: unknown; command?: { commandId?: unknown } };
            };
            if (envelope.payload?.type === "runner.job.command") {
              runnerCommandFrameCount += 1;
              childProcess.send?.({
                type: "runner-command-sent",
                commandId:
                  typeof envelope.payload.command?.commandId === "string"
                    ? envelope.payload.command.commandId
                    : undefined,
              });
            }
          } catch {
            // Other server frames are not command observations.
          }
        }
        return send(data as never, ...(args as never[]));
      }) as typeof ws.send;
    },
    afterReceiptPersisted: async (receiptEventId: string, ws: WebSocket) => {
      if (pauseAt === "disconnect-before-ack") {
        childProcess.send?.({
          type: "failpoint",
          point: pauseAt,
          receiptEventId,
        });
        ws.close(1011, "certification_disconnect_before_ack");
        return;
      }
      await pauseAtBoundary("after-persist-before-ack", receiptEventId);
    },
    afterAckWritten: receiptEventId =>
      pauseAtBoundary("after-ack-written", receiptEventId),
  })
);
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("WSS test server failed to bind");
  const origin = `http://127.0.0.1:${address.port}`;
  process.env.RUNNER_CONTROL_PLANE_ORIGIN =
    process.env.SPEC224_TEST_CONFIGURED_ORIGIN ?? origin;
  process.env.NODE_SERVER_INTERNAL_URL = origin;
  process.env.SMARTSPEC_INTERNAL_URL = origin;
  childProcess.send?.({ type: "ready", origin });
  if (process.env.SPEC224_TEST_RECONCILE_ON_START === "true") {
    void import("../spec224RunnerContinuationReconciler")
      .then(async module => {
        const result = await module.reconcileSpec224RunnerContinuations({
          limit: 100,
        });
        childProcess.send?.({ type: "reconciled", result });
      })
      .catch(error => {
        childProcess.send?.({ type: "reconcile-error", result: String(error) });
      });
  }
});
