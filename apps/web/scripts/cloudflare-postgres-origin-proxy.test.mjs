import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect as connectNet, createServer as createNetServer } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { after, before, test } from "node:test";
import { createPostgresOriginTlsProxy } from "./cloudflare-postgres-origin-proxy.mjs";

let directory;
let proxy;
let backend;
let address;
let certificate;
let privateKey;

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
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "certificate.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=db.smartaihub.app",
    "-addext", "subjectAltName=DNS:db.smartaihub.app", "-keyout", keyPath, "-out", certPath], { stdio: "ignore" });
  certificate = await readFile(certPath);
  privateKey = await readFile(keyPath);
  backend = createNetServer(socket => socket.pipe(socket));
  await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
  proxy = createPostgresOriginTlsProxy({ certificate, privateKey, listenPort: 0, upstreamPort: backend.address().port, maxConnections: 1 });
  address = await proxy.listen();
});

after(async () => {
  await proxy?.close();
  await new Promise(resolve => backend?.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("terminates Cloudflare PostgreSQL TLS and forwards decrypted wire bytes only to loopback", async () => {
  const response = await new Promise((resolve, reject) => {
    void connectPostgres(address.port).then(socket => {
      socket.once("data", data => { resolve(data.toString()); socket.end(); });
      socket.write("PG_STARTUP_TEST");
    }, reject);
  });
  assert.equal(response, "PG_STARTUP_TEST");
});

test("rejects non-loopback listeners and unbounded origin connection limits", () => {
  assert.throws(() => createPostgresOriginTlsProxy({ certificate, privateKey, listenHost: "0.0.0.0" }),
    /CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CONFIG_INVALID/);
  assert.throws(() => createPostgresOriginTlsProxy({ certificate, privateKey, maxConnections: 21 }),
    /CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CONFIG_INVALID/);
});

test("rejects plaintext PostgreSQL startup packets", async () => {
  const socket = connectNet({ host: "127.0.0.1", port: address.port });
  const outcome = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("proxy accepted a plaintext PostgreSQL connection")), 1_000);
    socket.once("close", () => { clearTimeout(timeout); resolve("closed"); });
    socket.once("error", () => { clearTimeout(timeout); resolve("closed"); });
    socket.once("connect", () => socket.write(Buffer.from([0, 0, 0, 8, 0, 3, 0, 0])));
  });
  assert.equal(outcome, "closed");
});
