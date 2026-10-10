import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";

const exec = promisify(execFile);
const DATABASE = "spec267_native_test";
const ROLE = "spec267_native_test";

async function postgresBin(): Promise<string> {
  if (process.env.SPEC267_TEST_PG_BIN) {
    const directory = resolve(process.env.SPEC267_TEST_PG_BIN);
    await access(join(directory, "initdb"));
    await access(join(directory, "pg_ctl"));
    return directory;
  }
  // Debian installs server tools outside PATH. No installation or shared server access.
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
  } catch { /* Report missing tooling instead of using DATABASE_URL. */ }
  throw new Error("SPEC267_NATIVE_POSTGRES_TOOLS_UNAVAILABLE");
}

/**
 * Creates its own cluster, role and database; never reads DATABASE_URL or connects
 * to TCP. The private socket and ownership marker also bound restart/cleanup.
 * Call close() in finally, after ending every client returned by connect().
 */
export async function createSpec267NativePostgres() {
  if (process.getuid?.() === 0) throw new Error("SPEC267_NATIVE_POSTGRES_ROOT_FORBIDDEN");
  const bin = await postgresBin();
  const root = await mkdtemp(join(tmpdir(), "spec267-native-pg-"));
  const data = join(root, "data");
  const socket = join(root, "socket");
  const markerPath = join(root, "owner.json");
  const marker = JSON.stringify({ nonce: randomUUID(), pid: process.pid, root });
  let started = false;
  let initialized = false;
  let closed = false;
  await chmod(root, 0o700);
  await writeFile(markerPath, marker, { mode: 0o600 });
  await mkdir(socket, { mode: 0o700 });

  async function assertOwned() {
    if (closed || (await lstat(root)).isSymbolicLink()
      || await readFile(markerPath, "utf8") !== marker) {
      throw new Error("SPEC267_NATIVE_POSTGRES_OWNERSHIP_MISMATCH");
    }
    if (initialized) {
      const config = await readFile(join(data, "postgresql.conf"), "utf8");
      if (!config.includes(`unix_socket_directories = '${socket}'`)
        || !config.includes("listen_addresses = ''")) {
        throw new Error("SPEC267_NATIVE_POSTGRES_CONFIGURATION_MISMATCH");
      }
    }
  }
  async function start() {
    await assertOwned();
    // Treat a timed-out start as possibly running until stop() proves otherwise.
    started = true;
    await exec(join(bin, "pg_ctl"), ["-D", data, "-l", join(root, "postgres.log"), "-w", "-t", "10", "start"],
      { timeout: 15_000, maxBuffer: 64 * 1024 });
  }
  async function stop() {
    await assertOwned();
    if (started) {
      let pidFile: string;
      try { pidFile = await readFile(join(data, "postmaster.pid"), "utf8"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        started = false;
        return;
      }
      const [pid, recordedData] = pidFile.split("\n");
      if (!/^\d+$/.test(pid) || recordedData !== data) {
        throw new Error("SPEC267_NATIVE_POSTGRES_PID_IDENTITY_MISMATCH");
      }
      const command = await readFile(`/proc/${pid}/cmdline`, "utf8");
      if (!command.split("\0").includes(data)) {
        throw new Error("SPEC267_NATIVE_POSTGRES_PROCESS_IDENTITY_MISMATCH");
      }
      await exec(join(bin, "pg_ctl"), ["-D", data, "-w", "-t", "10", "-m", "fast", "stop"],
        { timeout: 15_000, maxBuffer: 64 * 1024 });
      started = false;
    }
  }
  function connect(database = DATABASE) {
    if (!started || closed) throw new Error("SPEC267_NATIVE_POSTGRES_NOT_RUNNING");
    return postgres({ host: socket, port: 5432, database, username: ROLE,
      max: 4, idle_timeout: 2, connect_timeout: 3,
      connection: { statement_timeout: "5000", lock_timeout: "2000" } });
  }
  async function close() {
    if (closed) return;
    await stop(); // Failed ownership/stop preserves the directory for investigation.
    await assertOwned();
    await rm(root, { recursive: true });
    closed = true;
  }
  try {
    await exec(join(bin, "initdb"), ["-D", data, "--username", ROLE, "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--locale=C", "--no-instructions"],
      { timeout: 20_000, maxBuffer: 64 * 1024 });
    const config = await readFile(join(data, "postgresql.conf"), "utf8");
    if (!/^\/[a-zA-Z0-9_.\/-]+$/.test(socket) || socket.length > 85) throw new Error("SPEC267_NATIVE_POSTGRES_SOCKET_PATH_INVALID");
    await writeFile(join(data, "postgresql.conf"), `${config}\n# Task-owned SPEC-267 test cluster\nlisten_addresses = ''\nport = 5432\nunix_socket_directories = '${socket}'\nunix_socket_permissions = 0700\nshared_buffers = '16MB'\nwork_mem = '1MB'\nmaintenance_work_mem = '16MB'\nmax_connections = 12\nautovacuum = off\n`);
    initialized = true;
    await start();
    const admin = connect("postgres");
    try { await admin.unsafe(`CREATE DATABASE ${DATABASE}`); }
    finally { await admin.end({ timeout: 2 }); }
    return { root, data, socket, database: DATABASE, username: ROLE, connect,
      async restart() { await stop(); await start(); }, close };
  } catch (error) {
    await close();
    throw error;
  }
}
