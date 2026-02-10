#!/usr/bin/env bash
set -euo pipefail

CF_CONFIG="/etc/cloudflared/config.yml"
TUNNEL_ID="191d047e-674a-48f4-b105-b37269c2dad6"
HOSTNAME_DOCKER="docker.smartaihub.app"
BACKUP_PATH="/etc/cloudflared/config.yml.bak.$(date +%Y%m%d%H%M%S)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

if [[ ! -f "${CF_CONFIG}" ]]; then
  echo "Missing ${CF_CONFIG}"
  exit 1
fi

cp "${CF_CONFIG}" "${BACKUP_PATH}"
echo "Backup created: ${BACKUP_PATH}"

if grep -q "hostname: ${HOSTNAME_DOCKER}" "${CF_CONFIG}"; then
  echo "${HOSTNAME_DOCKER} already exists in ${CF_CONFIG}"
else
  awk '
    /# Catch-all rule \(required\)/ && !done {
      print "  # Docker Status subdomain"
      print "  - hostname: docker.smartaihub.app"
      print "    service: http://localhost:3001"
      print ""
      done=1
    }
    { print }
  ' "${CF_CONFIG}" > /tmp/cloudflared-config.yml

  mv /tmp/cloudflared-config.yml "${CF_CONFIG}"
  echo "Inserted ingress for ${HOSTNAME_DOCKER}"
fi

cloudflared tunnel ingress validate "${CF_CONFIG}"
cloudflared tunnel route dns "${TUNNEL_ID}" "${HOSTNAME_DOCKER}"

systemctl restart cloudflared
systemctl status cloudflared --no-pager | head -n 20

echo ""
echo "Done. Test:"
echo "  curl -I https://${HOSTNAME_DOCKER}"
