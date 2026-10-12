#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
mkdir -p "$HOME" "$tmp/bin" "$tmp/bundle"
cp "$repo/apps/runner-app/install-linux-runner.sh" "$tmp/bundle/"
cp "$repo/apps/runner-app/systemd/smartaihub-runner.service" "$tmp/bundle/"
printf '#!/bin/sh\necho runner\n' > "$tmp/bundle/smartaihub-runner"
printf '#!/bin/sh\necho session-host\n' > "$tmp/bundle/smartaihub-session-host"
chmod +x "$tmp/bundle/smartaihub-runner"
chmod +x "$tmp/bundle/smartaihub-session-host"
cat > "$tmp/bin/uname" <<'EOF'
#!/bin/sh
case "$1" in -s) echo Linux;; -m) echo x86_64;; esac
EOF
cat > "$tmp/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"
if [[ "${1:-}" == --user && "${2:-}" == is-active ]]; then exit "${SERVICE_ACTIVE:-1}"; fi
if [[ "${FAIL_RESTART:-0}" == 1 && "${2:-}" == restart ]]; then exit 1; fi
exit 0
EOF
chmod +x "$tmp/bin/uname" "$tmp/bin/systemctl"
export PATH="$tmp/bin:$PATH" SYSTEMCTL_LOG="$tmp/systemctl.log"

bash "$tmp/bundle/install-linux-runner.sh" install > "$tmp/install.out"
test -x "$HOME/.local/bin/smartaihub-runner"
test -x "$HOME/.local/bin/smartaihub-session-host"
test -f "$HOME/.config/systemd/user/smartaihub-runner.service"
! rg -q 'enable|start' "$SYSTEMCTL_LOG"
rg -q 'connect' "$tmp/install.out"

mkdir -p "$HOME/.local/share/smartaihub-runner"
printf 'preserve\n' > "$HOME/.local/share/smartaihub-runner/marker"
printf '#!/bin/sh\necho upgraded\n' > "$tmp/bundle/smartaihub-runner"
printf '#!/bin/sh\necho upgraded-session-host\n' > "$tmp/bundle/smartaihub-session-host"
chmod +x "$tmp/bundle/smartaihub-runner"
chmod +x "$tmp/bundle/smartaihub-session-host"
export SERVICE_ACTIVE=0 FAIL_RESTART=1
if bash "$tmp/bundle/install-linux-runner.sh" upgrade >/dev/null 2>&1; then echo 'expected upgrade failure' >&2; exit 1; fi
rg -q 'echo runner' "$HOME/.local/bin/smartaihub-runner"
rg -q 'echo session-host' "$HOME/.local/bin/smartaihub-session-host"
test -f "$HOME/.local/share/smartaihub-runner/marker"

unset FAIL_RESTART
bash "$tmp/bundle/install-linux-runner.sh" uninstall >/dev/null
test ! -e "$HOME/.local/bin/smartaihub-runner"
test ! -e "$HOME/.local/bin/smartaihub-session-host"
test ! -e "$HOME/.config/systemd/user/smartaihub-runner.service"
test -f "$HOME/.local/share/smartaihub-runner/marker"

mkdir -p "$tmp/legacy-bundle"
cp "$repo/apps/runner-app/install-linux-runner.sh" "$tmp/legacy-bundle/"
cp "$repo/apps/runner-app/systemd/smartaihub-runner.service" "$tmp/legacy-bundle/"
printf '#!/bin/sh\necho legacy-runner\n' > "$tmp/legacy-bundle/smartaihub-runner"
chmod +x "$tmp/legacy-bundle/smartaihub-runner"
bash "$tmp/legacy-bundle/install-linux-runner.sh" install >/dev/null
test -x "$HOME/.local/bin/smartaihub-runner"
test ! -e "$HOME/.local/bin/smartaihub-session-host"
bash "$tmp/legacy-bundle/install-linux-runner.sh" uninstall >/dev/null

if rg -q 'sudo|enable-linger|chmod.*HOME|--system' "$repo/apps/runner-app/install-linux-runner.sh"; then
  echo 'installer contains forbidden privilege or lingering action' >&2; exit 1
fi
echo 'linux runner install lifecycle: PASS'
