#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
case "$action" in install|upgrade|uninstall) ;; *) echo "usage: $0 install|upgrade|uninstall" >&2; exit 2;; esac
if [[ "${EUID:-$(id -u)}" == 0 ]]; then echo "RUNNER_INSTALL_ROOT_FORBIDDEN: run as the target user" >&2; exit 2; fi
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then echo "RUNNER_INSTALL_PLATFORM_UNSUPPORTED" >&2; exit 2; fi
command -v systemctl >/dev/null || { echo "RUNNER_INSTALL_SYSTEMD_MISSING" >&2; exit 2; }

bin_dir="${HOME}/.local/bin"
unit_dir="${HOME}/.config/systemd/user"
target="${bin_dir}/smartaihub-runner"
unit="${unit_dir}/smartaihub-runner.service"
data_dir="${XDG_DATA_HOME:-${HOME}/.local/share}/smartaihub-runner"
source_bin="$(cd "$(dirname "$0")" && pwd)/smartaihub-runner"
source_unit="$(cd "$(dirname "$0")" && pwd)/smartaihub-runner.service"

if [[ "$action" == uninstall ]]; then
  systemctl --user disable --now smartaihub-runner.service >/dev/null 2>&1 || true
  rm -f -- "$target" "$unit"
  systemctl --user daemon-reload
  echo "Runner removed; enrollment and workspace data preserved at ${data_dir}."
  exit 0
fi

[[ -x "$source_bin" ]] || { echo "RUNNER_INSTALL_BINARY_MISSING" >&2; exit 2; }
[[ -f "$source_unit" ]] || { echo "RUNNER_INSTALL_UNIT_MISSING" >&2; exit 2; }
mkdir -p -- "$bin_dir" "$unit_dir"
was_active=0
systemctl --user is-active --quiet smartaihub-runner.service && was_active=1 || true
stage_bin="${target}.new.$$"
stage_unit="${unit}.new.$$"
backup_bin="${target}.previous.$$"
backup_unit="${unit}.previous.$$"
cp -- "$source_bin" "$stage_bin"
chmod 755 "$stage_bin"
cp -- "$source_unit" "$stage_unit"
[[ ! -e "$target" ]] || cp -p -- "$target" "$backup_bin"
[[ ! -e "$unit" ]] || cp -p -- "$unit" "$backup_unit"
rollback() {
  local code=$?
  if (( code != 0 )); then
    if [[ -e "$backup_bin" ]]; then mv -f -- "$backup_bin" "$target"; else rm -f -- "$target"; fi
    if [[ -e "$backup_unit" ]]; then mv -f -- "$backup_unit" "$unit"; else rm -f -- "$unit"; fi
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    if (( was_active )); then systemctl --user restart smartaihub-runner.service >/dev/null 2>&1 || true; fi
  fi
  rm -f -- "$stage_bin" "$stage_unit" "$backup_bin" "$backup_unit"
  return "$code"
}
trap rollback EXIT
mv -f -- "$stage_bin" "$target"
mv -f -- "$stage_unit" "$unit"
systemctl --user daemon-reload
if (( was_active )); then systemctl --user restart smartaihub-runner.service; fi
trap - EXIT
rm -f -- "$backup_bin" "$backup_unit"
if [[ "$action" == install ]]; then
  echo "Installed. First run: ${target} connect; after approval: systemctl --user enable --now smartaihub-runner.service"
else
  echo "Upgraded. Service state preserved; Runner data remains at ${data_dir}."
fi
