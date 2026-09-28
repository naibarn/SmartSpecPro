# SocratiCode External Runtime Usage

## Normal use

Start a new Codex task in `/home/dev/projects/SmartSpecPro`. Codex loads:

```text
/home/dev/tools/socraticode-docker/socraticode-mcp.sh
```

The launcher uses only:

```text
Qdrant: http://192.168.1.119:16333
Ollama: http://192.168.1.119:11435
Model:  nomic-embed-text
```

It permits at most two MCP containers. Each is limited to 3 GiB memory, no
swap, and 256 PIDs; `socraticode.slice` caps the aggregate at 6 GiB with a
5 GiB throttle threshold.

## Failure handling

If either external endpoint or the embedding model is unavailable, the launcher
fails before starting an MCP container. Check firewall/ESET on
`192.168.1.119`; do not start local `socraticode-qdrant` or
`socraticode-ollama` on `192.168.1.124`.

## Verification

```bash
bash ops/socraticode-runtime/tests/test-external-launcher.sh
bash ops/socraticode-runtime/tests/test-cleanup.sh
node --test ops/socraticode-runtime/tests/watch-smartspecpro.test.mjs
node ops/socraticode-runtime/tests/live-mcp-smoke.mjs
systemctl show socraticode.slice \
  -p MemoryHigh -p MemoryMax -p MemorySwapMax -p TasksMax
```

## Rollback

Use:

```text
/home/dev/tools/socraticode-docker/backups/20260718T032904Z-external-only-cutover/RESTORE.md
```

Rollback must keep local Qdrant/Ollama stopped. Disable the SocratiCode MCP
entry if external services cannot be restored; do not restore a local fallback.
