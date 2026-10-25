import { createReadStream } from "node:fs";
import { createConnection, createServer as createNetServer } from "node:net";
import { checkServerIdentity, createSecureContext, connect as connectTls, TLSSocket } from "node:tls";
import { pathToFileURL } from "node:url";

const LOOPBACKS = new Set(["127.0.0.1", "::1", "localhost"]);
const POSTGRES_SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);
const UPSTREAM_TLS_SERVERNAME = "db-staging.smartaihub.app";

function certFingerprint(socket) {
  return socket.getPeerCertificate()?.fingerprint256?.replaceAll(":", "").toUpperCase();
}

export function createPostgresOriginTlsProxy({
  certificate,
  privateKey,
  expectedUpstreamFingerprint,
  listenHost = "127.0.0.1",
  listenPort = 5433,
  upstreamHost = "127.0.0.1",
  upstreamPort = 5432,
  maxConnections = 12,
  netConnect = createConnection,
} = {}) {
  if (!certificate || !privateKey || !/^[A-Fa-f0-9]{64}$/.test(expectedUpstreamFingerprint ?? "") ||
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
      let response = Buffer.alloc(0);
      const onUpstreamResponse = chunk => {
        response = Buffer.concat([response, chunk]);
        if (response.length < 1) return;
        upstream.off("data", onUpstreamResponse);
        if (response[0] !== 0x53 || response.length !== 1) {
          reject();
          upstream.destroy();
          return;
        }
        client.write("S");
        client.setTimeout(0);
        upstream.setTimeout(0);

        const clientTls = new TLSSocket(client, { isServer: true, secureContext, handshakeTimeout: 5_000 });
        const upstreamTls = connectTls({ socket: upstream, servername: UPSTREAM_TLS_SERVERNAME,
          minVersion: "TLSv1.2", rejectUnauthorized: false });
        sockets.add(clientTls);
        sockets.add(upstreamTls);
        let clientSecure = false;
        let upstreamSecure = false;
        let bridged = false;
        const bridgeIfReady = () => {
          if (bridged || !clientSecure || !upstreamSecure) return;
          bridged = true;
          clientTls.setTimeout(0);
          upstreamTls.setTimeout(0);
          clientTls.pipe(upstreamTls);
          upstreamTls.pipe(clientTls);
        };
        const closePair = () => {
          sockets.delete(client);
          sockets.delete(upstream);
          sockets.delete(clientTls);
          sockets.delete(upstreamTls);
          clientTls.destroy();
          upstreamTls.destroy();
        };
        clientTls.once("secure", () => {
          clientSecure = true;
          bridgeIfReady();
        });
        upstreamTls.once("secureConnect", () => {
          const peer = upstreamTls.getPeerCertificate();
          const fingerprint = certFingerprint(upstreamTls);
          const identityError = checkServerIdentity(UPSTREAM_TLS_SERVERNAME, peer);
          const now = Date.now();
          // The existing PostgreSQL leaf is issued by a private CA not installed on this host.
          // Pin that exact leaf and still enforce its DNS identity and validity window.
          if (identityError || fingerprint !== expectedUpstreamFingerprint.toUpperCase() ||
              !Number.isFinite(Date.parse(peer.valid_from)) || !Number.isFinite(Date.parse(peer.valid_to)) ||
              Date.parse(peer.valid_from) > now || Date.parse(peer.valid_to) <= now) {
            process.stderr.write("CLOUDFLARE_POSTGRES_ORIGIN_PROXY_UPSTREAM_CERTIFICATE_REJECTED\n");
            closePair();
            return;
          }
          upstreamSecure = true;
          bridgeIfReady();
        });
        clientTls.once("error", closePair);
        upstreamTls.once("error", closePair);
        client.once("close", closePair);
        upstream.once("close", closePair);
        client.once("error", closePair);
        upstream.once("error", closePair);
        clientTls.setTimeout(5_000, () => closePair());
        upstreamTls.setTimeout(5_000, () => closePair());
      };
      upstream.on("data", onUpstreamResponse);
      upstream.once("connect", () => upstream.write(POSTGRES_SSL_REQUEST));
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
  const expectedUpstreamFingerprint = process.env.PG_ORIGIN_TLS_UPSTREAM_CERT_SHA256;
  if (!certificatePath || !privateKeyPath || !expectedUpstreamFingerprint) {
    throw new Error("CLOUDFLARE_POSTGRES_ORIGIN_PROXY_CERTIFICATE_CONFIG_MISSING");
  }
  const proxy = createPostgresOriginTlsProxy({
    certificate: await readFile(certificatePath),
    privateKey: await readFile(privateKeyPath),
    expectedUpstreamFingerprint,
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
