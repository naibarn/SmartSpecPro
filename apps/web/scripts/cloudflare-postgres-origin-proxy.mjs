import { createReadStream } from "node:fs";
import { createConnection, createServer as createNetServer } from "node:net";
import { createSecureContext, TLSSocket } from "node:tls";
import { pathToFileURL } from "node:url";

const LOOPBACKS = new Set(["127.0.0.1", "::1", "localhost"]);
const POSTGRES_SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);

export function createPostgresOriginTlsProxy({
  certificate,
  privateKey,
  listenHost = "127.0.0.1",
  listenPort = 5433,
  upstreamHost = "127.0.0.1",
  upstreamPort = 5432,
  maxConnections = 12,
  netConnect = createConnection,
} = {}) {
  if (!certificate || !privateKey ||
      !LOOPBACKS.has(listenHost) || !LOOPBACKS.has(upstreamHost) ||
      !Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535 ||
      !Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535 ||
      !Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 20) {
    throw new Error("CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CONFIG_INVALID");
  }

  const secureContext = createSecureContext({ cert: certificate, key: privateKey, minVersion: "TLSv1.2" });
  const sockets = new Set();
  let activeConnections = 0;

  const server = createNetServer({ allowHalfOpen: false }, client => {
    if (activeConnections >= maxConnections) {
      client.destroy();
      return;
    }
    activeConnections += 1;
    sockets.add(client);
    client.setNoDelay(true);
    client.setTimeout(5_000, () => client.destroy());

    let firstPacket = Buffer.alloc(0);
    let negotiating = true;
    const reject = () => {
      client.destroy();
    };
    const onInitialData = chunk => {
      firstPacket = Buffer.concat([firstPacket, chunk]);
      if (firstPacket.length < POSTGRES_SSL_REQUEST.length) return;
      client.off("data", onInitialData);
      negotiating = false;
      if (!firstPacket.subarray(0, 8).equals(POSTGRES_SSL_REQUEST) || firstPacket.length !== 8) {
        reject();
        return;
      }

      const upstream = netConnect({ host: upstreamHost, port: upstreamPort });
      sockets.add(upstream);
      upstream.setNoDelay(true);
      upstream.setTimeout(5_000, () => upstream.destroy());
      upstream.once("connect", () => {
        client.write("S");
        client.setTimeout(0);
        upstream.setTimeout(0);
        const clientTls = new TLSSocket(client, { isServer: true, secureContext, handshakeTimeout: 5_000 });
        sockets.add(clientTls);
        const closePair = () => {
          sockets.delete(client);
          sockets.delete(upstream);
          sockets.delete(clientTls);
          clientTls.destroy();
          upstream.destroy();
        };
        clientTls.once("secure", () => {
          clientTls.setTimeout(0);
          // PostgreSQL stays on this host's loopback. Keeping its socket unwrapped
          // preserves PostgreSQL SCRAM channel-binding negotiation and never sends
          // decrypted database traffic over a non-local interface.
          clientTls.pipe(upstream);
          upstream.pipe(clientTls);
        });
        clientTls.once("error", closePair);
        clientTls.setTimeout(5_000, () => closePair());
        client.once("close", closePair);
        upstream.once("close", closePair);
        client.once("error", closePair);
        upstream.once("error", closePair);
      });
      upstream.once("error", () => reject());
    };
    client.on("data", onInitialData);
    client.once("close", () => {
      activeConnections = Math.max(0, activeConnections - 1);
      sockets.delete(client);
      if (negotiating) client.off("data", onInitialData);
    });
    client.once("error", reject);
  });

  server.on("error", () => process.stderr.write("CLOUDFLARE_POSTGRES_ORIGIN_PROXY_SERVER_ERROR\n"));

  return {
    server,
    listen() {
      return new Promise((resolve, reject) => {
        const onError = error => { server.off("listening", onListening); reject(error); };
        const onListening = () => { server.off("error", onError); resolve(server.address()); };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(listenPort, listenHost);
      });
    },
    close() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      return new Promise(resolve => server.close(() => resolve()));
    },
  };
}

async function readFile(path) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = createReadStream(path);
    stream.on("data", chunk => chunks.push(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function main() {
  const certificatePath = process.env.PG_ORIGIN_TLS_CERT_FILE;
  const privateKeyPath = process.env.PG_ORIGIN_TLS_KEY_FILE;
  if (!certificatePath || !privateKeyPath) {
    throw new Error("CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CERTIFICATE_CONFIG_MISSING");
  }
  const proxy = createPostgresOriginTlsProxy({
    certificate: await readFile(certificatePath),
    privateKey: await readFile(privateKeyPath),
    listenHost: process.env.PG_ORIGIN_TLS_LISTEN_HOST ?? "127.0.0.1",
    listenPort: Number(process.env.PG_ORIGIN_TLS_LISTEN_PORT ?? 5433),
    upstreamHost: process.env.PG_ORIGIN_TLS_UPSTREAM_HOST ?? "127.0.0.1",
    upstreamPort: Number(process.env.PG_ORIGIN_TLS_UPSTREAM_PORT ?? 5432),
    maxConnections: Number(process.env.PG_ORIGIN_TLS_MAX_CONNECTIONS ?? 12),
  });
  await proxy.listen();
  process.stdout.write("CLOUDFLARE_POSTGRES_ORIGIN_PROXY_LISTENING\n");
  const shutdown = () => { void proxy.close().finally(() => process.exit(0)); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("CLOUDFLARE_POSTGRES_ORIGIN_PROXY_START_FAILED\n");
    process.exitCode = 1;
  });
}
