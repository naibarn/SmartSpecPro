import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function findPostgresBin(): Promise<string> {
  try {
    const versions = (await readdir("/usr/lib/postgresql"))
      .filter(version => /^\d+$/.test(version))
      .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const directory = `/usr/lib/postgresql/${version}/bin`;
      try {
        await access(join(directory, "initdb"));
        await access(join(directory, "pg_ctl"));
        return directory;
      } catch { /* Try the next installed version. */ }
    }
  } catch { /* Report missing tools rather than using shared infrastructure. */ }
  throw new Error("SPEC277_POSTGRES_TOOLS_UNAVAILABLE");
}

async function allocateLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SPEC277_LOOPBACK_PORT_UNAVAILABLE");
  const { port } = address;
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

/** Private owner-marked cluster, TCP bound only to loopback on an ephemeral port. */
export async function createSpec277DisposablePostgres() {
  if (process.getuid?.() === 0) throw new Error("SPEC277_POSTGRES_ROOT_FORBIDDEN");
  const bin = await findPostgresBin();
  const root = await mkdtemp(join(tmpdir(), "spec277-autoteam-pg-"));
  const data = join(root, "data");
  const socket = join(root, "socket");
  const markerPath = join(root, "owner.json");
  const database = `autoteam_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const username = "spec277_autoteam_test";
  const port = await allocateLoopbackPort();
  const marker = JSON.stringify({ nonce: randomUUID(), pid: process.pid, root, database, port });
  let started = false;
  let initialized = false;
  let closed = false;
  await chmod(root, 0o700);
  await writeFile(markerPath, marker, { mode: 0o600 });
  await mkdir(socket, { mode: 0o700 });

  async function assertOwned() {
    if (closed || (await lstat(root)).isSymbolicLink() || await readFile(markerPath, "utf8") !== marker) {
      throw new Error("SPEC277_POSTGRES_OWNERSHIP_MISMATCH");
    }
    if (initialized) {
      const config = await readFile(join(data, "postgresql.conf"), "utf8");
      if (!config.includes("listen_addresses = '127.0.0.1'") || !config.includes(`port = ${port}`)
        || !config.includes(`unix_socket_directories = '${socket}'`)) {
        throw new Error("SPEC277_POSTGRES_CONFIGURATION_MISMATCH");
      }
    }
  }

  async function start() {
    await assertOwned();
    started = true;
    await exec(join(bin, "pg_ctl"), ["-D", data, "-l", join(root, "postgres.log"), "-w", "-t", "10", "start"],
      { timeout: 15_000, maxBuffer: 64 * 1024 });
  }

  async function stop() {
    await assertOwned();
    if (!started) return;
    let pidFile: string;
    try { pidFile = await readFile(join(data, "postmaster.pid"), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      started = false;
      return;
    }
    const [pid, recordedData] = pidFile.split("\n");
    if (!/^\d+$/.test(pid) || recordedData !== data) throw new Error("SPEC277_POSTGRES_PID_IDENTITY_MISMATCH");
    const command = await readFile(`/proc/${pid}/cmdline`, "utf8");
    if (!command.split("\0").includes(data)) throw new Error("SPEC277_POSTGRES_PROCESS_IDENTITY_MISMATCH");
    await exec(join(bin, "pg_ctl"), ["-D", data, "-w", "-t", "10", "-m", "fast", "stop"],
      { timeout: 15_000, maxBuffer: 64 * 1024 });
    started = false;
  }

  async function close() {
    if (closed) return;
    await stop();
    await assertOwned();
    await rm(root, { recursive: true });
    closed = true;
  }

  try {
    await assertOwned();
    await exec(join(bin, "initdb"), ["-D", data, `--username=${username}`, "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--locale=C", "--no-instructions"],
      { timeout: 20_000, maxBuffer: 64 * 1024 });
    const config = await readFile(join(data, "postgresql.conf"), "utf8");
    if (!/^\/[a-zA-Z0-9_.\/-]+$/.test(socket) || socket.length > 85) throw new Error("SPEC277_SOCKET_PATH_INVALID");
    await writeFile(join(data, "postgresql.conf"), `${config}\n# Owner-marked SPEC-277 loopback-only cluster\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = '${socket}'\nunix_socket_permissions = 0700\nshared_buffers = '16MB'\nwork_mem = '1MB'\nmaintenance_work_mem = '16MB'\nmax_connections = 12\nautovacuum = off\n`);
    await writeFile(join(data, "pg_hba.conf"), `local all all trust\nhost all all 127.0.0.1/32 trust\n`);
    initialized = true;
    await start();
    await assertOwned();
    await exec(join(bin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", username, database],
      { env: { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: username }, timeout: 10_000 });
    return {
      root,
      data,
      database,
      username,
      port,
      databaseUrl: `postgresql://${username}@127.0.0.1:${port}/${database}`,
      async assertOwned() { await assertOwned(); },
      async close() { await close(); },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
