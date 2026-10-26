import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { acceptApplicationDatabaseWebSocket, pipeApplicationDatabase, validateApplicationDatabasePolicy } from "./applicationDatabaseBridge";
import { NODE_VPC_DATABASE_ENTRYPOINT, PYTHON_VPC_DATABASE_ENTRYPOINT, applicationVpcDatabaseEntrypoint } from "./applicationDatabaseEntrypoints";
function profiles() {
  const node = { configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-runtime" as const,
    runtime: "node-http" as const, accountRef: "a".repeat(32), namespace: "smartspec-production-abcdef012345",
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    maxStarts: 2, maxComputeSeconds: 120, hardLifetimeSeconds: 60, idleTimeoutSeconds: 10, instance: "basic" as const, networkAccess: "application-outbound" as const };
  const python = { ...node, runtime: "python-http" as const, image: node.image.replace("-node-http@", "-python-http@") };
  const policy = { transport: "private-vpc-websocket-v1" as const, configurationRef: node.configurationRef, namespace: node.namespace,
    tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", hostname: "db.smartaihub.app" as const, port: 5433 as const, expiresAt: node.expiresAt };
  return { node, python, policy };
}
describe("private VPC PostgreSQL transport", () => {
  it("selects ArrayBuffer before accepting the socket, avoiding the live Workers Blob-default regression", () => {
    const socket = { binaryType: "blob", accept: vi.fn(() => expect(socket.binaryType).toBe("arraybuffer")) };
    acceptApplicationDatabaseWebSocket(socket); expect(socket.accept).toHaveBeenCalledOnce();
  });
  it("accepts one bounded production configuration without an Access app or public DNS", () => {
    const f = profiles(); expect(validateApplicationDatabasePolicy(f.policy, f.node, f.python)).toEqual(f.policy);
  });
  it.each(["hostname", "port", "namespace", "configurationRef", "tunnelId", "expiresAt"])("rejects substituted %s before connection", field => {
    const f = profiles(); expect(() => validateApplicationDatabasePolicy({ ...f.policy, [field]: "foreign" }, f.node, f.python)).toThrow("POLICY_DENIED");
  });
  it("forwards opaque binary TLS bytes in both directions and closes on socket completion", async () => {
    let incoming!: ReadableStreamDefaultController<Uint8Array>;
    const events = new EventTarget(), sent: Uint8Array[] = [], written: Uint8Array[] = [];
    const ws = { send: vi.fn(data => sent.push(new Uint8Array(data))), close: vi.fn(),
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
    const socket = { readable: new ReadableStream<Uint8Array>({ start(c) { incoming = c; } }),
      writable: new WritableStream<Uint8Array>({ write(data) { written.push(data); } }), close: vi.fn(async () => {}) };
    const running = pipeApplicationDatabase(socket, ws as any, Date.now() + 1000);
    const bytes = new Uint8Array([22, 3, 3, 0, 8]); events.dispatchEvent(new MessageEvent("message", { data: bytes.buffer }));
    incoming.enqueue(new Uint8Array([83])); await new Promise(resolve => setTimeout(resolve, 0)); incoming.close(); await running;
    expect(written).toEqual([bytes]); expect(sent).toEqual([new Uint8Array([83])]); expect(socket.close).toHaveBeenCalledOnce();
  });
  it.each(["SQL SELECT secret", new ArrayBuffer(1_048_577)])("closes invalid or oversized messages without forwarding them", async data => {
    const events = new EventTarget(), close = vi.fn(async () => {}), write = vi.fn();
    const socket = { readable: new ReadableStream<Uint8Array>(), writable: new WritableStream<Uint8Array>({ write }), close };
    const ws = { send: vi.fn(), close: vi.fn(), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
    const running = pipeApplicationDatabase(socket, ws as any, Date.now() + 1000);
    events.dispatchEvent(new MessageEvent("message", { data })); await running;
    expect(close).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled();
  });
  it("syntax-checks both fixed startup programs without executing application code or republishing images", () => {
    const node = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: NODE_VPC_DATABASE_ENTRYPOINT });
    expect(node.status, node.stderr.toString()).toBe(0);
    const python = spawnSync("python3", ["-c", "import ast,sys;ast.parse(sys.stdin.read())"], { input: PYTHON_VPC_DATABASE_ENTRYPOINT });
    expect(python.status, python.stderr.toString()).toBe(0);
    expect(applicationVpcDatabaseEntrypoint("node-http")).toEqual(["node", "--import=tsx", "--input-type=module", "-e", NODE_VPC_DATABASE_ENTRYPOINT]);
    expect(applicationVpcDatabaseEntrypoint("python-http")).toEqual(["python", "-c", PYTHON_VPC_DATABASE_ENTRYPOINT]);
  });
});
