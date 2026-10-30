import { validateApplicationHttpProfilePair, type ApplicationHttpProfile } from "./applicationHttpContainer";

export const APPLICATION_DATABASE_HOST = "database.application.internal";
export const APPLICATION_DATABASE_TRANSPORT = "private-vpc-websocket-v1";
export type ApplicationDatabasePolicy = {
  transport: typeof APPLICATION_DATABASE_TRANSPORT;
  environment: "staging" | "production"; targetId: "smartspec-cloudflare-staging" | "smartspec-cloudflare-runtime";
  configurationRef: string; namespace: string; tunnelId: string;
  hostname: "db-staging.smartaihub.app" | "db.smartaihub.app"; port: 5432 | 5433; expiresAt: string;
};
export function validateApplicationDatabasePolicy(policy: ApplicationDatabasePolicy, node: ApplicationHttpProfile, python: ApplicationHttpProfile, now = Date.now()) {
  validateApplicationHttpProfilePair(node, python, now);
  const staging = node.targetId === "smartspec-cloudflare-staging";
  if (!policy || policy.transport !== APPLICATION_DATABASE_TRANSPORT ||
      policy.environment !== (staging ? "staging" : "production") || policy.targetId !== node.targetId ||
      node.targetId !== "smartspec-cloudflare-runtime" && !staging ||
      policy.configurationRef !== node.configurationRef || policy.namespace !== node.namespace ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(policy.tunnelId) ||
      policy.hostname !== (staging ? "db-staging.smartaihub.app" : "db.smartaihub.app") || policy.port !== (staging ? 5432 : 5433) ||
      policy.expiresAt !== node.expiresAt || Date.parse(policy.expiresAt) - now > 600_000)
    throw Error("APPLICATION_DATABASE_POLICY_DENIED");
  return policy;
}

type Socket = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): Promise<void> };
type BinarySocket = { send(data: ArrayBuffer | ArrayBufferView): void; close(code: number, reason: string): void;
  addEventListener(type: string, listener: (event: any) => void): void; removeEventListener(type: string, listener: (event: any) => void): void };
/** Newer Workers WebSockets default binary messages to Blob. Select the byte
 * representation before accept; otherwise valid PostgreSQL TLS frames are
 * rejected by the bounded binary pipe. Reproduced in real SIN preview SQL. */
export function acceptApplicationDatabaseWebSocket(socket: { binaryType: string; accept(): void }) {
  socket.binaryType = "arraybuffer";
  socket.accept();
}
/** Opaque PostgreSQL bytes: the application driver negotiates TLS and verifies
 * the origin certificate through this pipe. No SQL API, credentials, host/port
 * selector or public Worker route is introduced. Bound queues, bytes and time. */
export async function pipeApplicationDatabase(socket: Socket, websocket: BinarySocket, expiresAt: number, signal?: AbortSignal) {
  const writer = socket.writable.getWriter(), reader = socket.readable.getReader();
  let closed = false, queued = 0, transferred = 0, writes = Promise.resolve();
  const stop = () => {
    if (closed) return; closed = true;
    try { websocket.close(1000, "database connection closed"); } catch { /* Already closed. */ }
    void socket.close().catch(() => undefined);
    void reader.cancel().catch(() => undefined);
  };
  const message = (event: { data: unknown }) => {
    if (closed) return;
    if (!(event.data instanceof ArrayBuffer) || event.data.byteLength > 1_048_576 ||
        (queued += event.data.byteLength) > 1_048_576 || (transferred += event.data.byteLength) > 67_108_864) { stop(); return; }
    const data = new Uint8Array(event.data);
    writes = writes.then(async () => { if (!closed) await writer.write(data); queued -= data.byteLength; }).catch(stop);
  };
  const remaining = expiresAt - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 600_000 || signal?.aborted) { stop(); return; }
  const timer = setTimeout(stop, remaining);
  websocket.addEventListener("message", message); websocket.addEventListener("close", stop); websocket.addEventListener("error", stop);
  signal?.addEventListener("abort", stop, { once: true });
  try {
    while (!closed) {
      const item = await reader.read(); if (item.done) break;
      transferred += item.value.byteLength;
      if (item.value.byteLength > 1_048_576 || transferred > 67_108_864) break;
      websocket.send(item.value);
    }
  } catch { /* Never expose driver, socket or database errors. */ }
  finally {
    stop(); clearTimeout(timer);
    websocket.removeEventListener("message", message); websocket.removeEventListener("close", stop); websocket.removeEventListener("error", stop);
    signal?.removeEventListener("abort", stop);
    await writes; writer.releaseLock(); reader.releaseLock();
  }
}
