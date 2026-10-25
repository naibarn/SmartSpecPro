import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect as connectNet, createServer as createNetServer } from "node:net";
import { createSecureContext, connect as tlsConnect, TLSSocket } from "node:tls";
import { after, before, test } from "node:test";
import { createPostgresOriginTlsProxy } from "./cloudflare-postgres-origin-proxy.mjs";

let directory;
let proxy;
let backend;
let address;
let certificate;
let privateKey;
let backendSecureContext;
let fingerprint;

const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);

function connectPostgres(port) {
  return new Promise((resolve, reject) => {
    const raw = connectNet({ host: "127.0.0.1", port });
    const onReply = data => {
      if (data.length !== 1 || data[0] !== 0x53) {
        raw.destroy();
        reject(new Error("PostgreSQL SSL negotiation rejected"));
        return;
      }
      raw.off("data", onReply);
      const socket = tlsConnect({ socket: raw, servername: "db.smartaihub.app", ca: certificate, rejectUnauthorized: true });
      socket.once("secureConnect", () => resolve(socket));
      socket.once("error", reject);
    };
    raw.once("error", reject);
    raw.once("connect", () => {
      raw.on("data", onReply);
      raw.write(SSL_REQUEST);
    });
  });
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "cloudflare-postgres-proxy-test-"));
  const key = join(directory, "key.pem");
  const certPath = join(directory, "certificate.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=db.smartaihub.app",
    "-addext", "subjectAltName=DNS:db.smartaihub.app,DNS:db-staging.smartaihub.app", "-keyout", key, "-out", certPath], { stdio: "ignore" });
  certificate = await readFile(certPath);
  privateKey = await readFile(key);
  backendSecureContext = createSecureContext({ key: privateKey, cert: certificate });
  fingerprint = execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-fingerprint", "-sha256"], { encoding: "utf8" })
    .trim().split("=").at(-1).replaceAll(":", "");

  backend = createNetServer({ allowHalfOpen: false }, socket => {
    let packet = Buffer.alloc(0);
    const onSslRequest = chunk => {
      packet = Buffer.concat([packet, chunk]);
      if (packet.length < 8) return;
      socket.off("data", onSslRequest);
      if (!packet.subarray(0, 8).equals(SSL_REQUEST)) return socket.destroy();
      socket.write("S");
      const tlsSocket = new TLSSocket(socket, { isServer: true, secureContext: backendSecureContext });
      tlsSocket.once("secure", () => tlsSocket.pipe(tlsSocket));
      tlsSocket.once("error", () => tlsSocket.destroy());
    };
    socket.on("data", onSslRequest);
  });
  await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
  proxy = createPostgresOriginTlsProxy({ certificate, privateKey, expectedUpstreamFingerprint: fingerprint,
    listenPort: 0, upstreamPort: backend.address().port, maxConnections: 1 });
  address = await proxy.listen();
});

after(async () => {
  await proxy?.close();
  await new Promise(resolve => backend?.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("bridges PostgreSQL SSL negotiation and pins the existing database certificate", async () => {
  const response = await new Promise((resolve, reject) => {
    void connectPostgres(address.port).then(socket => {
      socket.once("data", data => { resolve(data.toString()); socket.end(); });
      socket.write("PG_STARTUP_TEST");
    }, reject);
  });
  assert.equal(response, "PG_STARTUP_TEST");
});

test("rejects non-loopback listeners, unbounded limits, and missing upstream certificate pins", () => {
  assert.throws(() => createPostgresOriginTlsProxy({ certificate, privateKey, expectedUpstreamFingerprint: fingerprint, listenHost: "0.0.0.0" }),
    /CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CONFIG_INVALID/);
  assert.throws(() => createPostgresOriginTlsProxy({ certificate, privateKey, expectedUpstreamFingerprint: fingerprint, maxConnections: 21 }),
    /CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CONFIG_INVALID/);
  assert.throws(() => createPostgresOriginTlsProxy({ certificate, privateKey, listenPort: 0 }),
    /CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CONFIG_INVALID/);
});

test("rejects a PostgreSQL certificate that does not match the pinned origin identity", async () => {
  const wrongPinProxy = createPostgresOriginTlsProxy({ certificate, privateKey,
    expectedUpstreamFingerprint: "0".repeat(64), listenPort: 0, upstreamPort: backend.address().port });
  const wrongPinAddress = await wrongPinProxy.listen();
  try {
    const socket = await connectPostgres(wrongPinAddress.port);
    const outcome = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("proxy did not reject mismatched upstream certificate pin")), 1_000);
      socket.once("close", () => { clearTimeout(timeout); resolve("closed"); });
      socket.once("error", () => { clearTimeout(timeout); resolve("closed"); });
      socket.once("data", () => { clearTimeout(timeout); reject(new Error("proxy forwarded data for mismatched upstream certificate pin")); });
      socket.write("PG_STARTUP_TEST");
    });
    assert.equal(outcome, "closed");
  } finally {
    await wrongPinProxy.close();
  }
});
