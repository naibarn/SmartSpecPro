# OpenSandbox — Hetzner Production Setup

Deployment scripts for the SmartAIHub OpenSandbox execution plane on a Hetzner CPX31 server in Singapore (`sgp1`). OpenSandbox provides isolated code/media execution for Python skills and media generation workflows.

## Architecture

```
Client Browser
      |
      v
GCP Cloud Run (Node.js tRPC)
      |
      v
GCP Cloud Run (Python FastAPI)
      |  HTTPS :443, X-API-Key header
      v
Hetzner CPX31 (Singapore) — sandbox.smartaihub.app
  Nginx (TLS termination + API key validation)
      |
      v
  OpenSandbox Server (:8080, Docker)
      |
      v
  Sandbox Containers (sandbox-exec — no internet access)
```

Artifact transfer is mediated through the Python backend via the OpenSandbox Filesystem API — sandbox containers never need direct internet access.

## Files

| File | Purpose |
|------|---------|
| `../setup-hetzner-sandbox.sh` | Idempotent server provisioning script (run as root on Hetzner) |
| `docker-compose.hetzner-sandbox.yml` | Production Docker Compose stack |
| `nginx-sandbox.conf` | Nginx TLS termination + reverse proxy config |
| `opensandbox.service` | systemd unit for the Docker Compose stack |
| `verify-connectivity.sh` | Post-deployment connectivity verification |

## Prerequisites

1. **Hetzner account** with a CPX31 server provisioned in Singapore (`sgp1`) running Ubuntu 22.04 LTS or Debian 12.
2. **SSH key** added to the server during provisioning.
3. **DNS record** — `sandbox.smartaihub.app` A record pointing to the server's public IP. DNS must be propagated before running the setup script (Let's Encrypt needs to resolve the domain).
4. **GCP Cloud Run egress IP** — For production security, use a Cloud NAT with a static external IP for the Python backend's outbound traffic. Whitelist only that static IP on Hetzner.

## Provisioning a New Server

### Using hcloud CLI (recommended)

```bash
hcloud server create \
  --name opensandbox-prod \
  --type cpx31 \
  --location sgp1 \
  --image ubuntu-22.04 \
  --ssh-key <your-ssh-key-name>
```

### Setting DNS

Point `sandbox.smartaihub.app` to the server's public IP in your DNS provider. Wait for propagation before proceeding.

## Step-by-Step Deployment

### 1. Copy scripts to the server

```bash
scp -r scripts/hetzner-sandbox root@<HETZNER_IP>:/tmp/hetzner-sandbox
scp scripts/setup-hetzner-sandbox.sh root@<HETZNER_IP>:/tmp/
```

Or clone the repository directly on the server:

```bash
ssh root@<HETZNER_IP>
git clone <repo-url> /opt/smartspecpro
```

### 2. Run the provisioning script

```bash
ssh root@<HETZNER_IP>
export ADMIN_EMAIL="ops@example.com"
export OPENSANDBOX_API_KEY="$(openssl rand -hex 32)"
export ADMIN_SSH_IPS="203.0.113.10"        # Your admin IP
export GCP_EGRESS_IPS="35.186.0.0/16"      # GCP Cloud NAT static IP or CIDR

bash /tmp/setup-hetzner-sandbox.sh
```

The script is **idempotent** — it is safe to re-run on the same server.

### 3. Verify connectivity

From a machine with access to the GCP egress IP:

```bash
export OPENSANDBOX_API_KEY="<the-key-you-set-above>"
bash scripts/hetzner-sandbox/verify-connectivity.sh
```

All 6 tests should pass.

### 4. Update environment in GCP Cloud Run

Set the following environment variables on the Python FastAPI Cloud Run service (section 11):

```
OPENSANDBOX_BASE_URL=https://sandbox.smartaihub.app
OPENSANDBOX_API_KEY=<the-key-you-set-above>
OPENSANDBOX_ENABLED=true
```

## Updating the OpenSandbox Image

To pull the latest OpenSandbox server image and restart:

```bash
ssh root@<HETZNER_IP>
docker compose \
  -f /opt/opensandbox/docker-compose.hetzner-sandbox.yml \
  --env-file /opt/opensandbox/.env \
  pull

sudo systemctl restart opensandbox.service
```

## Rotating the API Key

1. Generate a new key:
   ```bash
   NEW_KEY="$(openssl rand -hex 32)"
   ```

2. Update `/opt/opensandbox/.env` on the Hetzner server:
   ```bash
   ssh root@<HETZNER_IP>
   sed -i "s/^OPENSANDBOX_API_KEY=.*/OPENSANDBOX_API_KEY=${NEW_KEY}/" /opt/opensandbox/.env
   ```

3. Update the Nginx config (replaces the API key validation literal):
   ```bash
   sed -i "s|EXPECTED_API_KEY_PLACEHOLDER|${NEW_KEY}|g" /etc/nginx/sites-available/sandbox
   nginx -t && systemctl reload nginx
   ```

4. Restart OpenSandbox:
   ```bash
   sudo systemctl restart opensandbox.service
   ```

5. Update `OPENSANDBOX_API_KEY` in GCP Cloud Run environment variables.

6. Deploy new revision of the Python backend Cloud Run service.

## Adding or Removing GCP Egress IPs from the Firewall

```bash
ssh root@<HETZNER_IP>

# Add a new CIDR
ufw allow from 34.87.0.0/16 to any port 443 proto tcp comment "gcp-sandbox"

# Remove a CIDR
ufw delete allow from 34.87.0.0/16 to any port 443 proto tcp

# Review current rules
ufw status numbered
```

Always verify with `verify-connectivity.sh` after changing firewall rules.

## Monitoring and Alerting

### Uptime monitoring

Configure an external uptime monitor (UptimeRobot, Healthchecks.io, GCP Uptime Checks) to poll:

```
https://sandbox.smartaihub.app/health
```

- Frequency: 60 seconds
- Alert: If check fails for more than 1 consecutive minute

### Disk usage

A cron job logs disk usage warnings to `/var/log/opensandbox/disk-alerts.log` when usage exceeds 80%.

```bash
# View alerts
tail -f /var/log/opensandbox/disk-alerts.log

# Current disk usage
df -h /
```

### Container count

```bash
# Live container count on sandbox-exec network
watch -n5 "docker ps --filter 'network=sandbox-exec' | wc -l"

# Historical log
tail -f /var/log/opensandbox/container-count.log
```

### Service status

```bash
systemctl status opensandbox nginx fail2ban
docker ps | grep opensandbox
journalctl -u opensandbox -f
journalctl -u nginx -f
```

## Troubleshooting

### Health endpoint returns 502 Bad Gateway

OpenSandbox server container is not running or not ready.

```bash
docker ps | grep opensandbox
docker logs smartspec-opensandbox --tail 50
sudo systemctl restart opensandbox.service
```

### TLS certificate expired or missing

```bash
certbot certificates
certbot renew --nginx --force-renewal -d sandbox.smartaihub.app
systemctl reload nginx
```

### Firewall blocking GCP requests

```bash
ufw status verbose
# Check that GCP egress IPs are whitelisted on port 443
```

If the GCP Cloud NAT IP changed, add the new IP and remove the old one (see "Adding or Removing GCP Egress IPs" above).

### Sandbox containers not being cleaned up

```bash
# List all containers on sandbox-exec network
docker ps --filter 'network=sandbox-exec'

# Force remove all stopped sandbox containers
docker container prune --filter 'network=sandbox-exec' -f
```

### Port 8080 not reachable from Nginx

The OpenSandbox server exposes port 8080 to the `opensandbox-network` Docker bridge. Nginx uses Docker DNS (`opensandbox-server:8080`) to route requests. If Nginx cannot reach OpenSandbox:

```bash
# Check that both Nginx and OpenSandbox are on the same Docker network
docker network inspect opensandbox-network

# The opensandbox-server container must be listed under "Containers"
# Nginx is on the host network and accesses Docker containers via the bridge gateway
```

## Tearing Down the Server

### Rollback procedure (keep server running)

1. Set `OPENSANDBOX_ENABLED=false` in the Python backend GCP environment.
2. Workloads automatically fall back to the legacy subprocess path.
3. No data loss — in-progress sandbox jobs can be retried.

### Full teardown

```bash
# On the Hetzner server
sudo systemctl stop opensandbox
docker compose -f /opt/opensandbox/docker-compose.hetzner-sandbox.yml down -v

# Delete the Hetzner server via hcloud CLI or Cloud Console
hcloud server delete opensandbox-prod
```

After teardown, update DNS to remove the `sandbox.smartaihub.app` A record and set `OPENSANDBOX_ENABLED=false` in GCP.
