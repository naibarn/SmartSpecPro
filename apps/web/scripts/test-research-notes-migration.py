#!/usr/bin/env python3
"""Apply migration 0393 to a disposable local PostgreSQL cluster and probe its constraints."""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import getpass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "apps/web/drizzle/0393_spec302_canonical_project_identity.sql"


def binary(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    pg_config = shutil.which("pg_config")
    if pg_config:
        bindir = subprocess.check_output([pg_config, "--bindir"], text=True).strip()
        candidate = Path(bindir) / name
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError(f"required local PostgreSQL binary is missing: {name}")


def run(args: list[str], *, timeout: int = 60, expect: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)
    if expect and result.returncode:
        raise RuntimeError(f"command failed ({Path(args[0]).name}, exit {result.returncode})")
    if not expect and result.returncode == 0:
        raise RuntimeError(f"negative constraint probe unexpectedly succeeded ({Path(args[0]).name})")
    return result


def main() -> int:
    if os.name != "posix" or os.geteuid() == 0:
        raise RuntimeError("run this isolated-cluster test as a non-root POSIX user")
    initdb, pg_ctl, psql = (binary(name) for name in ("initdb", "pg_ctl", "psql"))
    db_user = getpass.getuser()
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        port = port_socket.getsockname()[1]

    with tempfile.TemporaryDirectory(prefix="research-notes-pg-") as temporary:
        base = Path(temporary)
        data_dir = base / "data"
        log_path = base / "postgres.log"
        run([initdb, "--pgdata", str(data_dir), "--username", db_user, "--auth-local=trust", "--auth-host=trust", "--no-instructions"])
        started = False
        try:
            run([pg_ctl, "--pgdata", str(data_dir), "--log", str(log_path), "--options", f"-h 127.0.0.1 -p {port} -k {temporary}", "--wait", "start"])
            started = True
            psql_base = [psql, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--username", db_user, "--host", "127.0.0.1", "--port", str(port), "--dbname", "postgres"]
            run(psql_base + ["--command", '''
              CREATE TABLE tenants (id varchar(36) PRIMARY KEY);
              CREATE TABLE app_identities (
                tenant_id varchar(36) NOT NULL REFERENCES tenants(id),
                app_id varchar(128) NOT NULL,
                PRIMARY KEY (tenant_id, app_id)
              );
              INSERT INTO tenants (id) VALUES ('tenant-a'), ('tenant-b');
              INSERT INTO app_identities (tenant_id, app_id) VALUES ('tenant-a', 'app-a'), ('tenant-b', 'app-b');
            '''])
            run(psql_base + ["--file", str(MIGRATION)])
            run(psql_base + ["--command", '''
              INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
                VALUES ('project-a', 'tenant-a', 'research', 'Research', 'user:1');
              INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role)
                VALUES ('tenant-a', 'project-a', 'user:1', 'owner');
              INSERT INTO canonical_project_app_bindings (tenant_id, project_id, app_id)
                VALUES ('tenant-a', 'project-a', 'app-a');
              INSERT INTO mini_app_research_notes (note_id, tenant_id, project_id, app_id, owner_principal_id, title, content)
                VALUES ('note-a', 'tenant-a', 'project-a', 'app-a', 'user:1', 'Interview', 'synthetic fixture');
            '''])
            count = run(psql_base + ["--tuples-only", "--no-align", "--command", "SELECT count(*) FROM mini_app_research_notes WHERE tenant_id='tenant-a' AND project_id='project-a' AND app_id='app-a'"]).stdout.strip()
            if count != "1":
                raise RuntimeError("tenant/project/App-scoped fixture read returned an unexpected count")

            cross_tenant = run(psql_base + ["--command", "INSERT INTO mini_app_research_notes (tenant_id, project_id, app_id, owner_principal_id, title) VALUES ('tenant-b', 'project-a', 'app-b', 'user:2', 'Cross tenant')"], expect=False)
            oversized = run(psql_base + ["--command", "INSERT INTO mini_app_research_notes (tenant_id, project_id, app_id, owner_principal_id, title, content) VALUES ('tenant-a', 'project-a', 'app-a', 'user:1', 'Too large', repeat('x', 262145))"], expect=False)
            bad_role = run(psql_base + ["--command", "INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role) VALUES ('tenant-a', 'project-a', 'user:3', 'admin')"], expect=False)
            print(json.dumps({
                "status": "PASS",
                "target": "disposable local PostgreSQL cluster",
                "migration": MIGRATION.name,
                "syntheticScopedRows": int(count),
                "rejectedCrossTenantProjectReference": cross_tenant.returncode != 0,
                "rejectedOversizedNote": oversized.returncode != 0,
                "rejectedInvalidMembershipRole": bad_role.returncode != 0,
                "productionDatabaseTouched": False,
            }))
        finally:
            if started:
                subprocess.run([pg_ctl, "--pgdata", str(data_dir), "--mode", "fast", "--wait", "stop"], text=True, capture_output=True, timeout=30, check=False)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"status": "FAIL", "error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
