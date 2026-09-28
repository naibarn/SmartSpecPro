#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SMARTAIHUB_SERVER_URL:-https://smartaihub.app}"
INSTALL_ROOT="${SMARTAIHUB_EXECUTOR_ROOT:-$HOME/Library/Application Support/SmartAIHub/RemotionExecutor}"
SCRIPT_ROOT="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_KEY="${SMARTAIHUB_RUNTIME_PACK_PUBLIC_KEY:-}"
if [[ -z "$PUBLIC_KEY" && -f "$SCRIPT_ROOT/runtime-pack-public-key.pem" ]]; then PUBLIC_KEY="$(cat "$SCRIPT_ROOT/runtime-pack-public-key.pem")"; fi
RUNTIME_ID="$(uname -m | grep -q arm64 && echo remotion-executor-macos-arm64 || echo remotion-executor-macos-x64)"

if [[ -z "$PUBLIC_KEY" ]]; then
  echo "This installer has no pinned SmartAIHub runtime-pack public key. Download the complete signed runtime pack and run the installer from its extracted packaging directory." >&2
  exit 2
fi
command -v node >/dev/null || { echo "Node.js 22 is required for the signed bootstrap verifier." >&2; exit 2; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
manifest="$tmp/manifest.json"
archive="$tmp/runtime.zip"
curl --fail --location --proto '=https' --tlsv1.2 -sS "$SERVER_URL/api/workers/runtime-pack/manifest?runtimeId=$RUNTIME_ID" -o "$manifest"
archive_url="$(SERVER_URL="$SERVER_URL" node -e 'const m=require(process.argv[1]); process.stdout.write(new URL(m.archiveUrl, process.env.SERVER_URL).toString())' "$manifest")"
curl --fail --location --proto '=https' --tlsv1.2 -sS "$archive_url" -o "$archive"
expected="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.archiveSha256)' "$manifest")"
actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
[[ "$expected" == "$actual" ]] || { echo "Runtime pack checksum verification failed." >&2; exit 2; }
ARCHIVE="$archive" EXPECTED="$actual" SIGNATURE="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.archiveSignature)' "$manifest")" PUBLIC_KEY="$PUBLIC_KEY" node --input-type=module -e 'import crypto from "node:crypto"; import fs from "node:fs"; const d=crypto.createHash("sha256").update(fs.readFileSync(process.env.ARCHIVE)).digest("hex"); if (!crypto.verify(null,Buffer.from(d),crypto.createPublicKey(process.env.PUBLIC_KEY),Buffer.from(process.env.SIGNATURE,"base64"))) throw new Error("signature_invalid");'
mkdir -p "$INSTALL_ROOT"
ditto -x -k "$archive" "$tmp/extract"
rm -rf "$INSTALL_ROOT/runtime-pack"
mv "$tmp/extract/runtime-pack" "$INSTALL_ROOT/runtime-pack"
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/smartaihub-remotion-executor" <<EOF
#!/usr/bin/env bash
exec "$INSTALL_ROOT/runtime-pack/node/bin/node" "$INSTALL_ROOT/runtime-pack/executor/dist/cli.js" "\$@"
EOF
chmod 700 "$HOME/.local/bin/smartaihub-remotion-executor"
echo "Remotion Executor installed. Run: smartaihub-remotion-executor doctor, connect, start"
