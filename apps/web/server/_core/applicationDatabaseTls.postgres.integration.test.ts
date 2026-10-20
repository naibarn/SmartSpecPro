import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { createApplicationDatabaseTls } from "./applicationDatabaseTls";
import { createSpec277DisposablePostgres } from "../services/__tests__/support/spec277DisposablePostgres";

const exec = promisify(execFile);
const suite = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("application TLS against an owned disposable PostgreSQL", () => {
  let db: Awaited<ReturnType<typeof createSpec277DisposablePostgres>>;
  let admin: postgres.Sql;
  let ca: string;
  const environment = () => ({ NODE_ENV: "production", SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", CLOUDFLARE_CONTAINER_POLICY: "on-demand", DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: ca });
  beforeAll(async () => {
    db = await createSpec277DisposablePostgres();
    const certificate = join(db.root, "server.crt"), key = join(db.root, "server.key");
    await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-keyout", key, "-out", certificate,
      "-days", "1", "-subj", "/CN=localhost", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,digitalSignature,keyCertSign,cRLSign",
      "-addext", "subjectAltName=DNS:localhost,DNS:db.private.test,IP:127.0.0.1"], { timeout: 10_000 });
    ca = await readFile(certificate, "utf8");
    admin = postgres(db.databaseUrl, { max: 1 });
    await admin.unsafe(`ALTER SYSTEM SET ssl_cert_file = '${certificate}'`);
    await admin.unsafe(`ALTER SYSTEM SET ssl_key_file = '${key}'`);
    await admin.unsafe("ALTER SYSTEM SET ssl = 'on'");
    await admin`SELECT pg_reload_conf()`;
    // Only the owner-marked disposable server configuration is changed.
    await new Promise(resolve => setTimeout(resolve, 300));
  }, 30_000);
  afterAll(async () => { if (admin) await admin.end({ timeout: 2 }); if (db) await db.close(); }, 20_000);
  it("connects with postgres-js only after chain and host verification; rejects wrong CA, hostname and URL downgrades", async () => {
    const ssl = createApplicationDatabaseTls(db.databaseUrl, environment());
    const client = postgres(db.databaseUrl, { ssl, max: 1, connect_timeout: 2 });
    try { expect((await client`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`)[0].ssl).toBe(true); }
    finally { await client.end({ timeout: 1 }); }
    for (const options of [{ ...ssl, ca: undefined }, { ...ssl, checkServerIdentity: createApplicationDatabaseTls(db.databaseUrl, { ...environment(), DATABASE_SSL_SERVER_NAME: "wrong-host.example" })!.checkServerIdentity }]) {
      const rejected = postgres(db.databaseUrl, { ssl: options, max: 1, connect_timeout: 2 });
      try { await expect(rejected`SELECT 1`).rejects.toThrow(); }
      finally { await rejected.end({ timeout: 1 }); }
    }
    expect(() => createApplicationDatabaseTls(db.databaseUrl + "?sslmode=require", environment())).toThrow("APPLICATION_DATABASE_TLS_REQUIRED");
  });
  it.skipIf(!process.env.CLOUDFLARE_TEST_PYTHON)("uses the same verified transport with asyncpg and rejects a different trust root", async () => {
    const script = join(db.root, "verify.py");
    await writeFile(script, `import asyncio, os, ssl\nimport asyncpg\nfrom app.core.application_database_tls import application_database_connect_args\nasync def main():\n args=application_database_connect_args('production')\n connection=await asyncpg.connect(os.environ['TEST_DATABASE_URL'], **args)\n try:\n  assert await connection.fetchval('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()') is True\n finally:\n  await connection.close()\n try:\n  connection=await asyncpg.connect(os.environ['TEST_DATABASE_URL'], ssl=ssl.create_default_context(), timeout=3)\n except ssl.SSLCertVerificationError:\n  print('VERIFIED_TLS_AND_UNTRUSTED_CA_REJECTED')\n else:\n  await connection.close()\n  raise AssertionError('untrusted certificate accepted')\nasyncio.run(main())\n`);
    const python = process.env.CLOUDFLARE_TEST_PYTHON;
    if (!python) throw new Error("CLOUDFLARE_TEST_PYTHON_REQUIRED");
    const result = await exec(python, [script], { env: { ...process.env, ...environment(), DEBUG: "false", PYTHONPATH: resolve(import.meta.dirname, "../../../../python-backend"), TEST_DATABASE_URL: db.databaseUrl }, timeout: 15_000 });
    expect(result.stdout.trim()).toBe("VERIFIED_TLS_AND_UNTRUSTED_CA_REJECTED");
  });
  it.skipIf(!process.env.CLOUDFLARE_TEST_PYTHON)("preserves PostgreSQL hostname verification through Python's local connector", async () => {
    const script = join(db.root, "verify-connector.py");
    await writeFile(script, `import asyncio, os, ssl
from urllib.parse import urlsplit, urlunsplit
import asyncpg
from app.core.application_database_tls import application_database_connect_args
from app.core.cloudflare_http_entrypoint import DatabaseConnectorEventLoop
address = urlsplit(os.environ['TEST_DATABASE_URL'])
async def verify(hostname):
 args = application_database_connect_args('production')
 authority = address.netloc.rsplit('@', 1)[0]
 dsn = urlunsplit(address._replace(netloc=f'{authority}@{hostname}:{address.port}'))
 connection = await asyncpg.connect(dsn, timeout=3, **args)
 try:
  assert await connection.fetchval('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()') is True
 finally:
  await connection.close()
asyncio.run(verify('db.private.test'), loop_factory=lambda: DatabaseConnectorEventLoop('db.private.test', address.port))
try:
 asyncio.run(verify('wrong.private.test'), loop_factory=lambda: DatabaseConnectorEventLoop('wrong.private.test', address.port))
except ssl.SSLCertVerificationError:
 print('VERIFIED_ORIGINAL_HOSTNAME_AND_REJECTED_WRONG_HOST')
else:
 raise AssertionError('wrong hostname accepted')
`);
    const python = process.env.CLOUDFLARE_TEST_PYTHON;
    if (!python) throw new Error("CLOUDFLARE_TEST_PYTHON_REQUIRED");
    const result = await exec(python, [script], { env: { ...process.env, ...environment(), DEBUG: "false", PYTHONPATH: resolve(import.meta.dirname, "../../../../python-backend"), TEST_DATABASE_URL: db.databaseUrl }, timeout: 15_000 });
    expect(result.stdout.trim()).toBe("VERIFIED_ORIGINAL_HOSTNAME_AND_REJECTED_WRONG_HOST");
  });
});
