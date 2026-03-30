/**
 * Services Management Router
 * API endpoints for managing Docker services + Host processes (hybrid mode)
 */

import type { Express } from "express";
import { db } from "../db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import Docker from 'dockerode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { sdk } from "../_core/sdk";

const execAsync = promisify(exec);

// Try to connect to Docker, may fail if not available
let docker: Docker | null = null;
try {
  docker = new Docker({ socketPath: '/var/run/docker.sock' });
} catch (e) {
  console.log('[Services] Docker not available, running in host-only mode');
}

// Service type: docker = Docker container, host = host process, systemd = system service
type ServiceType = 'docker' | 'host' | 'systemd';

interface ServiceConfig {
  id: string;
  name: string;
  displayName: string;
  ports: string[];
  type: ServiceType;
  description: string;       // What this service does
  checkPort?: number;        // For host processes (by port)
  checkProcess?: string;     // For host processes (by process name pattern)
  systemdName?: string;      // For systemd services
  dockerContainer?: string;  // For Docker containers (if different from id)
}

// Service configurations - supports Docker, host processes, and systemd services
const SERVICE_CONFIGS: ServiceConfig[] = [
  // Infrastructure (Docker containers via docker-compose.infra.yml)
  {
    id: 'smartspec-postgres', name: 'postgres', displayName: 'PostgreSQL',
    ports: ['5432'], type: 'docker',
    description: 'Database - stores all application data'
  },
  {
    id: 'smartspec-redis', name: 'redis', displayName: 'Redis',
    ports: ['6379'], type: 'docker',
    description: 'Cache & message broker for background tasks'
  },

  // Applications (can be Docker or host processes)
  {
    id: 'smartspec-web', name: 'smartspec-web', displayName: 'SmartAIHub Web',
    ports: ['3000'], type: 'host', checkPort: 3000,
    description: 'Frontend & tRPC API (Node.js)'
  },
  {
    id: 'smartspec-backend', name: 'python-backend', displayName: 'Python Backend',
    ports: ['8000'], type: 'host', checkPort: 8000,
    description: 'REST API & AI services (FastAPI)'
  },

  // System services
  {
    id: 'docker', name: 'docker', displayName: 'Docker',
    ports: [], type: 'systemd', systemdName: 'docker',
    description: 'Container runtime engine'
  },
  {
    id: 'cloudflared', name: 'cloudflared', displayName: 'Cloudflare Tunnel',
    ports: [], type: 'host', checkProcess: 'cloudflared.*tunnel',
    description: 'Cloudflare Tunnel for public access (smartaihub.app)'
  },
  {
    id: 'nginx', name: 'nginx', displayName: 'Nginx',
    ports: ['80', '443'], type: 'systemd', systemdName: 'nginx',
    description: 'Reverse proxy with HTTPS (optional)'
  },

  // Media Processing (Docker containers via docker-compose.media.yml)
  {
    id: 'smartspec-celery-media', name: 'celery-media', displayName: 'Celery Media Worker',
    ports: [], type: 'docker',
    description: 'API-bound media generation tasks (2 CPUs, 3GB)'
  },
  {
    id: 'smartspec-celery-video', name: 'celery-video', displayName: 'Celery Video Worker',
    ports: [], type: 'docker',
    description: 'FFmpeg video rendering tasks (4 CPUs, 8GB)'
  },
  {
    id: 'smartspec-celery-beat', name: 'celery-beat', displayName: 'Celery Beat',
    ports: [], type: 'docker',
    description: 'Periodic task scheduler (cleanup, retry)'
  },
  {
    id: 'smartspec-flower', name: 'flower', displayName: 'Flower Dashboard',
    ports: ['5555'], type: 'docker',
    description: 'Celery monitoring UI → http://localhost:5555'
  },
];

export interface ServiceStatus {
  id: string;
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'starting' | 'unhealthy' | 'unknown';
  uptime: string;
  ports: string[];
  type: ServiceType;       // docker, host, or systemd
  description?: string;    // What this service does
  healthCheck?: string;
  cpu?: number;
  memory?: number;
  restarts?: number;
}

// Middleware to check admin role
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    // Authenticate user from session cookie
    const user = await sdk.authenticateRequest(req).catch(() => null);

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const [dbUser] = await db.select({ id: users.id, role: users.role, name: users.name, email: users.email }).from(users).where(eq(users.id, user.id));
    if (!dbUser || dbUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // Attach user to request for downstream use
    req.user = dbUser;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Format uptime duration
function formatUptime(startedAt: string): string {
  const started = new Date(startedAt).getTime();
  const now = Date.now();
  const diff = now - started;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** Validate port number to prevent shell injection */
function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid port number");
  }
}

/** Validate service/process name — alphanumeric, hyphens, dots, regex wildcards only */
function validateName(name: string): void {
  if (!/^[a-zA-Z0-9._*-]+$/.test(name) || name.length > 128) {
    throw new Error("Invalid service/process name");
  }
}

// Check if a port is in use (for host processes)
async function isPortInUse(port: number): Promise<boolean> {
  try {
    validatePort(port);
    const { stdout } = await execAsync(`lsof -i:${port} -t 2>/dev/null || true`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// Get process info by port
async function getProcessByPort(port: number): Promise<{ pid: number; uptime: string; memory?: number; cpu?: number } | null> {
  try {
    validatePort(port);
    const { stdout: pidStr } = await execAsync(`lsof -i:${port} -t 2>/dev/null | head -1 || true`);
    const pid = parseInt(pidStr.trim());
    if (!pid || !Number.isInteger(pid)) return null;

    // Get process start time for uptime calculation
    const { stdout: startTime } = await execAsync(`ps -o lstart= -p ${pid} 2>/dev/null || true`);
    let uptime = '-';
    if (startTime.trim()) {
      const started = new Date(startTime.trim()).getTime();
      uptime = formatUptime(new Date(started).toISOString());
    }

    // Get memory usage in MB and CPU percentage
    const { stdout: statsStr } = await execAsync(`ps -o rss=,pcpu= -p ${pid} 2>/dev/null || true`);
    const parts = statsStr.trim().split(/\s+/);
    const memoryKB = parseInt(parts[0]) || 0;
    const cpuPercent = parseFloat(parts[1]) || 0;

    return { pid, uptime, memory: memoryKB / 1024, cpu: cpuPercent };
  } catch {
    return null;
  }
}

// Get process info by name pattern (using pgrep)
async function getProcessByName(pattern: string): Promise<{ pid: number; uptime: string; memory?: number; cpu?: number } | null> {
  try {
    // Find process by name pattern
    validateName(pattern);
    const { stdout: pidStr } = await execAsync(`pgrep -f "${pattern}" 2>/dev/null | head -1 || true`);
    const pid = parseInt(pidStr.trim());
    if (!pid) return null;

    // Get process start time for uptime calculation
    const { stdout: startTime } = await execAsync(`ps -o lstart= -p ${pid} 2>/dev/null || true`);
    let uptime = '-';
    if (startTime.trim()) {
      const started = new Date(startTime.trim()).getTime();
      uptime = formatUptime(new Date(started).toISOString());
    }

    // Get memory usage in MB and CPU percentage
    const { stdout: statsStr } = await execAsync(`ps -o rss=,pcpu= -p ${pid} 2>/dev/null || true`);
    const parts = statsStr.trim().split(/\s+/);
    const memoryKB = parseInt(parts[0]) || 0;
    const cpuPercent = parseFloat(parts[1]) || 0;

    return { pid, uptime, memory: memoryKB / 1024, cpu: cpuPercent };
  } catch {
    return null;
  }
}

// Check systemd service status
async function getSystemdStatus(serviceName: string): Promise<{ running: boolean; uptime: string }> {
  try {
    validateName(serviceName);
    const { stdout: activeState } = await execAsync(`systemctl is-active ${serviceName} 2>/dev/null || true`);
    const running = activeState.trim() === 'active';

    let uptime = '-';
    if (running) {
      try {
        const { stdout: propStr } = await execAsync(
          `systemctl show ${serviceName} --property=ActiveEnterTimestamp 2>/dev/null || true`
        );
        const match = propStr.match(/ActiveEnterTimestamp=(.+)/);
        if (match && match[1] && match[1] !== 'n/a') {
          const started = new Date(match[1]).getTime();
          uptime = formatUptime(new Date(started).toISOString());
        }
      } catch {}
    }

    return { running, uptime };
  } catch {
    return { running: false, uptime: '-' };
  }
}

// Get Docker container status
async function getDockerContainerStatus(containerId: string): Promise<{
  running: boolean;
  uptime: string;
  cpu?: number;
  memory?: number;
  health?: string;
  restarts?: number;
} | null> {
  if (!docker) return null;

  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    let cpu = 0;
    let memory = 0;

    if (info.State.Running) {
      try {
        const stats = await container.stats({ stream: false });
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        cpu = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;
        memory = stats.memory_stats.usage / (1024 * 1024);
      } catch {}
    }

    return {
      running: info.State.Running,
      uptime: info.State.Running ? formatUptime(info.State.StartedAt) : '-',
      cpu: Math.min(100, Math.max(0, cpu)),
      memory,
      health: info.State.Health?.Status,
      restarts: info.RestartCount,
    };
  } catch {
    return null;
  }
}

// Get service status (hybrid: Docker, host process, or systemd)
async function getServiceStatus(serviceId: string): Promise<ServiceStatus> {
  const config = SERVICE_CONFIGS.find(s => s.id === serviceId);
  if (!config) {
    throw new Error(`Service not found: ${serviceId}`);
  }

  // Default response
  const baseStatus: ServiceStatus = {
    id: serviceId,
    name: config.name,
    displayName: config.displayName,
    status: 'stopped',
    uptime: '-',
    ports: config.ports,
    type: config.type,
    description: config.description,
  };

  try {
    // Handle different service types
    switch (config.type) {
      case 'docker': {
        // First check if running as Docker container
        const dockerStatus = await getDockerContainerStatus(serviceId);
        if (dockerStatus) {
          return {
            ...baseStatus,
            status: dockerStatus.running
              ? (dockerStatus.health === 'unhealthy' ? 'unhealthy' : dockerStatus.health === 'starting' ? 'starting' : 'running')
              : 'stopped',
            uptime: dockerStatus.uptime,
            cpu: dockerStatus.cpu,
            memory: dockerStatus.memory,
            healthCheck: dockerStatus.health,
            restarts: dockerStatus.restarts,
          };
        }
        // Container not found - might not exist in this mode
        return baseStatus;
      }

      case 'host': {
        // First check if running as Docker container (full Docker mode)
        const dockerStatus = await getDockerContainerStatus(serviceId);
        if (dockerStatus && dockerStatus.running) {
          return {
            ...baseStatus,
            status: 'running',
            uptime: dockerStatus.uptime,
            cpu: dockerStatus.cpu,
            memory: dockerStatus.memory,
            healthCheck: dockerStatus.health,
            restarts: dockerStatus.restarts,
          };
        }

        // Check if running as host process by port
        if (config.checkPort) {
          const processInfo = await getProcessByPort(config.checkPort);
          if (processInfo) {
            return {
              ...baseStatus,
              status: 'running',
              uptime: processInfo.uptime,
              memory: processInfo.memory,
              cpu: processInfo.cpu,
            };
          }
        }

        // Check if running as host process by name pattern (for services without ports like Celery)
        if (config.checkProcess) {
          const processInfo = await getProcessByName(config.checkProcess);
          if (processInfo) {
            return {
              ...baseStatus,
              status: 'running',
              uptime: processInfo.uptime,
              memory: processInfo.memory,
              cpu: processInfo.cpu,
            };
          }
        }

        return baseStatus;
      }

      case 'systemd': {
        // First check if running as Docker container (full Docker mode)
        const dockerStatus = await getDockerContainerStatus(`smartspec-${config.name}`);
        if (dockerStatus && dockerStatus.running) {
          return {
            ...baseStatus,
            status: 'running',
            uptime: dockerStatus.uptime,
            cpu: dockerStatus.cpu,
            memory: dockerStatus.memory,
            healthCheck: dockerStatus.health,
            restarts: dockerStatus.restarts,
          };
        }

        // Check systemd service
        if (config.systemdName) {
          const systemdStatus = await getSystemdStatus(config.systemdName);
          return {
            ...baseStatus,
            status: systemdStatus.running ? 'running' : 'stopped',
            uptime: systemdStatus.uptime,
          };
        }
        return baseStatus;
      }

      default:
        return baseStatus;
    }
  } catch (error) {
    console.error(`Error getting status for ${serviceId}:`, error);
    return baseStatus;
  }
}

// Docker API helper functions
async function startContainer(containerId: string): Promise<void> {
  if (!docker) throw new Error('Docker not available');
  const container = docker.getContainer(containerId);
  await container.start();
}

async function stopContainer(containerId: string): Promise<void> {
  if (!docker) throw new Error('Docker not available');
  const container = docker.getContainer(containerId);
  await container.stop({ t: 10 }); // 10 second graceful shutdown
}

async function restartContainer(containerId: string): Promise<void> {
  if (!docker) throw new Error('Docker not available');
  const container = docker.getContainer(containerId);
  await container.restart({ t: 10 }); // 10 second graceful shutdown
}

// Host process helper functions
async function stopHostProcess(port: number): Promise<void> {
  try {
    validatePort(port);
    await execAsync(`lsof -t -i:${port} | xargs -r kill 2>/dev/null || true`);
  } catch (e) {
    console.error(`Failed to stop process on port ${port}:`, e);
  }
}

// Systemd service helper functions
async function startSystemdService(serviceName: string): Promise<void> {
  validateName(serviceName);
  await execAsync(`sudo systemctl start ${serviceName}`);
}

async function stopSystemdService(serviceName: string): Promise<void> {
  validateName(serviceName);
  await execAsync(`sudo systemctl stop ${serviceName}`);
}

async function restartSystemdService(serviceName: string): Promise<void> {
  validateName(serviceName);
  await execAsync(`sudo systemctl restart ${serviceName}`);
}

// Get system memory (RAM) information
async function getSystemMemory(): Promise<{
  total: number;
  used: number;
  free: number;
  available: number;
  usedPercent: number;
} | null> {
  try {
    const { stdout } = await execAsync("free -m | grep Mem:");
    const parts = stdout.trim().split(/\s+/);
    // Format: Mem: total used free shared buff/cache available
    const total = parseInt(parts[1]) || 0;
    const used = parseInt(parts[2]) || 0;
    const free = parseInt(parts[3]) || 0;
    const available = parseInt(parts[6]) || 0;

    return {
      total,
      used,
      free,
      available,
      usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
    };
  } catch (error) {
    console.error('Error fetching memory info:', error);
    return null;
  }
}

// Get system disk space information
async function getSystemDisk(): Promise<{
  total: number;
  used: number;
  available: number;
  usedPercent: number;
  mountPoint: string;
} | null> {
  try {
    const { stdout } = await execAsync("df -BG / | tail -1");
    const parts = stdout.trim().split(/\s+/);
    // Format: Filesystem Size Used Avail Use% Mounted
    const total = parseFloat(parts[1].replace('G', '')) || 0;
    const used = parseFloat(parts[2].replace('G', '')) || 0;
    const available = parseFloat(parts[3].replace('G', '')) || 0;
    const usedPercent = parseInt(parts[4].replace('%', '')) || 0;

    return {
      total,
      used,
      available,
      usedPercent,
      mountPoint: parts[5] || '/',
    };
  } catch (error) {
    console.error('Error fetching disk info:', error);
    return null;
  }
}

// Get GPU information (supports NVIDIA and AMD)
async function getGPUInfo(): Promise<Array<{
  id: number;
  name: string;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  temperature: number;
  powerUsage: number;
  powerLimit: number;
}> | null> {
  try {
    // Try NVIDIA first
    try {
      const { stdout } = await execAsync(
        "nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits 2>/dev/null"
      );

      const gpus = stdout.trim().split('\n').map(line => {
        const parts = line.split(',').map(p => p.trim());
        const memoryUsed = parseFloat(parts[3]) || 0;
        const memoryTotal = parseFloat(parts[4]) || 0;

        return {
          id: parseInt(parts[0]) || 0,
          name: parts[1] || 'Unknown GPU',
          utilization: parseFloat(parts[2]) || 0,
          memoryUsed,
          memoryTotal,
          memoryPercent: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0,
          temperature: parseFloat(parts[5]) || 0,
          powerUsage: parseFloat(parts[6]) || 0,
          powerLimit: parseFloat(parts[7]) || 0,
        };
      });

      if (gpus.length > 0) {
        return gpus;
      }
    } catch (nvidiaError) {
      // NVIDIA not available, try AMD
    }

    // Try AMD ROCm
    try {
      const { stdout } = await execAsync("rocm-smi --showuse --showmeminfo vram --json 2>/dev/null");
      const data = JSON.parse(stdout);

      const gpus = Object.keys(data).map((key, index) => {
        const gpu = data[key];
        const memoryUsed = parseInt(gpu?.['VRAM Total Memory (B)']?.['VRAM Total Used Memory (B)']) / (1024 ** 3) || 0;
        const memoryTotal = parseInt(gpu?.['VRAM Total Memory (B)']?.['VRAM Total Memory (B)']) / (1024 ** 3) || 0;

        return {
          id: index,
          name: gpu?.['Card series'] || 'AMD GPU',
          utilization: parseFloat(gpu?.['GPU use (%)']) || 0,
          memoryUsed,
          memoryTotal,
          memoryPercent: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0,
          temperature: parseFloat(gpu?.['Temperature (Sensor edge) (C)']) || 0,
          powerUsage: 0,
          powerLimit: 0,
        };
      });

      if (gpus.length > 0) {
        return gpus;
      }
    } catch (amdError) {
      // AMD not available
    }

    return null;
  } catch (error) {
    console.error('Error fetching GPU info:', error);
    return null;
  }
}

export async function collectServiceRuntimeSnapshot(): Promise<{
  services: ServiceStatus[];
  system: {
    memory: Awaited<ReturnType<typeof getSystemMemory>>;
    disk: Awaited<ReturnType<typeof getSystemDisk>>;
    gpu: Awaited<ReturnType<typeof getGPUInfo>>;
    docker: {
      volumesSize: number;
      imagesSize: number;
      totalUsed: number;
    } | null;
  };
}> {
  const services = await Promise.all(
    SERVICE_CONFIGS.map(config => getServiceStatus(config.id))
  );

  const [memoryInfo, diskInfo, gpuInfo] = await Promise.all([
    getSystemMemory(),
    getSystemDisk(),
    getGPUInfo(),
  ]);

  let dockerDiskInfo = null;
  try {
    if (docker) {
      const dfResult = await docker.df();
      const volumes = dfResult.Volumes || [];
      const images = dfResult.Images || [];

      const volumesSize = volumes.reduce((sum: number, v: any) => sum + (v.UsageData?.Size || 0), 0);
      const imagesSize = images.reduce((sum: number, img: any) => sum + (img.Size || 0), 0);

      dockerDiskInfo = {
        volumesSize: Math.round(volumesSize / (1024 * 1024 * 1024) * 100) / 100,
        imagesSize: Math.round(imagesSize / (1024 * 1024 * 1024) * 100) / 100,
        totalUsed: Math.round((volumesSize + imagesSize) / (1024 * 1024 * 1024) * 100) / 100,
      };
    }
  } catch (dockerError) {
    console.error('Error fetching Docker disk info:', dockerError);
  }

  return {
    services,
    system: {
      memory: memoryInfo,
      disk: diskInfo,
      gpu: gpuInfo,
      docker: dockerDiskInfo,
    },
  };
}

export function registerServicesRoutes(app: Express) {
  // Get all services status
  app.get('/api/admin/services/status', requireAdmin, async (req, res) => {
    try {
      const snapshot = await collectServiceRuntimeSnapshot();

      res.json({
        services: snapshot.services,
        system: snapshot.system,
      });
    } catch (error) {
      console.error('Error fetching services status:', error);
      res.status(500).json({ error: 'Failed to fetch services status' });
    }
  });

  // List all Docker containers (dynamic discovery)
  app.get('/api/admin/services/docker/containers', requireAdmin, async (req, res) => {
    if (!docker) {
      return res.json({ containers: [], summary: { total: 0, running: 0, stopped: 0, images: 0 } });
    }

    try {
      const rawContainers = await docker.listContainers({ all: true });

      const containers = rawContainers.map((c: any) => {
        // Format port mappings
        const ports = (c.Ports || [])
          .filter((p: any) => p.PublicPort)
          .map((p: any) => `${p.IP || '0.0.0.0'}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`)
          .concat(
            (c.Ports || [])
              .filter((p: any) => !p.PublicPort && p.PrivatePort)
              .map((p: any) => `${p.PrivatePort}/${p.Type}`)
          );

        // Extract network names
        const networks = Object.keys(c.NetworkSettings?.Networks || {});

        return {
          id: (c.Id || '').substring(0, 12),
          name: (c.Names?.[0] || '').replace(/^\//, ''),
          image: c.Image || '',
          state: c.State || 'unknown',
          status: c.Status || '',
          ports,
          created: c.Created ? new Date(c.Created * 1000).toISOString() : '',
          networks,
        };
      });

      const running = containers.filter((c: any) => c.state === 'running').length;
      const uniqueImages = new Set(containers.map((c: any) => c.image)).size;

      res.json({
        containers,
        summary: {
          total: containers.length,
          running,
          stopped: containers.length - running,
          images: uniqueImages,
        },
      });
    } catch (error) {
      console.error('Error listing Docker containers:', error);
      res.status(500).json({ error: 'Failed to list Docker containers' });
    }
  });

  // Start a service
  app.post('/api/admin/services/:serviceId/start', requireAdmin, async (req, res) => {
    try {
      const { serviceId } = req.params;
      const config = SERVICE_CONFIGS.find(s => s.id === serviceId);

      if (!config) {
        return res.status(404).json({ error: 'Service not found' });
      }

      console.log(`[Services] Starting service: ${config.name} (${serviceId})`);

      switch (config.type) {
        case 'docker':
          await startContainer(serviceId);
          break;
        case 'host':
          // Host processes need to be started via dev-local.sh script
          return res.status(400).json({
            error: 'Cannot start host process from web UI',
            details: 'Use: bash dev-local.sh web (or backend)'
          });
        case 'systemd':
          if (config.systemdName) {
            await startSystemdService(config.systemdName);
          }
          break;
      }

      console.log(`[Services] Service ${config.name} started successfully`);
      res.json({ message: `Service ${config.displayName} started successfully` });
    } catch (error: any) {
      console.error('Error starting service:', error);
      res.status(500).json({
        error: 'Failed to start service',
        details: error.message
      });
    }
  });

  // Stop a service
  app.post('/api/admin/services/:serviceId/stop', requireAdmin, async (req, res) => {
    try {
      const { serviceId } = req.params;
      const config = SERVICE_CONFIGS.find(s => s.id === serviceId);

      if (!config) {
        return res.status(404).json({ error: 'Service not found' });
      }

      console.log(`[Services] Stopping service: ${config.name} (${serviceId})`);

      switch (config.type) {
        case 'docker':
          await stopContainer(serviceId);
          break;
        case 'host':
          if (config.checkPort) {
            await stopHostProcess(config.checkPort);
          }
          break;
        case 'systemd':
          if (config.systemdName) {
            await stopSystemdService(config.systemdName);
          }
          break;
      }

      console.log(`[Services] Service ${config.name} stopped successfully`);
      res.json({ message: `Service ${config.displayName} stopped successfully` });
    } catch (error: any) {
      console.error('Error stopping service:', error);
      res.status(500).json({
        error: 'Failed to stop service',
        details: error.message
      });
    }
  });

  // Restart a service
  app.post('/api/admin/services/:serviceId/restart', requireAdmin, async (req, res) => {
    try {
      const { serviceId } = req.params;
      const config = SERVICE_CONFIGS.find(s => s.id === serviceId);

      if (!config) {
        return res.status(404).json({ error: 'Service not found' });
      }

      console.log(`[Services] Restarting service: ${config.name} (${serviceId})`);

      switch (config.type) {
        case 'docker':
          await restartContainer(serviceId);
          break;
        case 'host':
          // Host processes need to be restarted manually
          return res.status(400).json({
            error: 'Cannot restart host process from web UI',
            details: 'Use: bash dev-local.sh stop && bash dev-local.sh web (or backend)'
          });
        case 'systemd':
          if (config.systemdName) {
            await restartSystemdService(config.systemdName);
          }
          break;
      }

      console.log(`[Services] Service ${config.name} restarted successfully`);
      res.json({ message: `Service ${config.displayName} restarted successfully` });
    } catch (error: any) {
      console.error('Error restarting service:', error);
      res.status(500).json({
        error: 'Failed to restart service',
        details: error.message
      });
    }
  });

  // Get service logs
  app.get('/api/admin/services/:serviceId/logs', requireAdmin, async (req, res) => {
    try {
      const { serviceId } = req.params;
      const config = SERVICE_CONFIGS.find(s => s.id === serviceId);

      if (!config) {
        return res.status(404).json({ error: 'Service not found' });
      }

      let logs = '';

      switch (config.type) {
        case 'docker':
          if (docker) {
            try {
              const container = docker.getContainer(serviceId);
              const containerLogs = await container.logs({
                stdout: true,
                stderr: true,
                tail: 100,
                timestamps: true
              });
              logs = containerLogs.toString('utf-8');
            } catch {
              logs = 'Container not found or not running';
            }
          } else {
            logs = 'Docker not available';
          }
          break;
        case 'host':
          logs = `Host process logs are not available from web UI.\n\nView logs in the terminal where the process is running, or check:\n- SmartAIHub Web: terminal running 'bash dev-local.sh web'\n- Python Backend: terminal running 'bash dev-local.sh backend'`;
          break;
        case 'systemd':
          if (config.systemdName) {
            try {
              validateName(config.systemdName);
              const { stdout } = await execAsync(`sudo journalctl -u ${config.systemdName} -n 100 --no-pager 2>/dev/null || journalctl -u ${config.systemdName} -n 100 --no-pager 2>/dev/null || echo "Cannot read logs"`);
              logs = stdout;
            } catch {
              logs = 'Cannot read systemd logs (may require sudo)';
            }
          }
          break;
      }

      res.json({ logs });
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      res.status(500).json({
        error: 'Failed to fetch logs',
        details: error.message
      });
    }
  });

  // Start all services (Docker and systemd only, host processes need manual start)
  app.post('/api/admin/services/start-all', requireAdmin, async (req, res) => {
    try {
      const results = await Promise.allSettled(
        SERVICE_CONFIGS.filter(c => c.type !== 'host').map(async (config) => {
          if (config.type === 'docker') {
            await startContainer(config.id);
          } else if (config.type === 'systemd' && config.systemdName) {
            await startSystemdService(config.systemdName);
          }
        })
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      res.json({
        message: `Services started (${results.length - failed} succeeded, ${failed} failed)`,
        note: 'Host processes need to be started manually with dev-local.sh'
      });
    } catch (error: any) {
      console.error('Error starting all services:', error);
      res.status(500).json({
        error: 'Failed to start all services',
        details: error.message
      });
    }
  });

  // Stop all services
  app.post('/api/admin/services/stop-all', requireAdmin, async (req, res) => {
    try {
      const results = await Promise.allSettled(
        SERVICE_CONFIGS.map(async (config) => {
          if (config.type === 'docker') {
            await stopContainer(config.id);
          } else if (config.type === 'host' && config.checkPort) {
            await stopHostProcess(config.checkPort);
          } else if (config.type === 'systemd' && config.systemdName) {
            await stopSystemdService(config.systemdName);
          }
        })
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      res.json({ message: `Services stopped (${results.length - failed} succeeded, ${failed} failed)` });
    } catch (error: any) {
      console.error('Error stopping all services:', error);
      res.status(500).json({
        error: 'Failed to stop all services',
        details: error.message
      });
    }
  });

  // Restart all services (Docker and systemd only)
  app.post('/api/admin/services/restart-all', requireAdmin, async (req, res) => {
    try {
      const results = await Promise.allSettled(
        SERVICE_CONFIGS.filter(c => c.type !== 'host').map(async (config) => {
          if (config.type === 'docker') {
            await restartContainer(config.id);
          } else if (config.type === 'systemd' && config.systemdName) {
            await restartSystemdService(config.systemdName);
          }
        })
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      res.json({
        message: `Services restarted (${results.length - failed} succeeded, ${failed} failed)`,
        note: 'Host processes need to be restarted manually with dev-local.sh'
      });
    } catch (error: any) {
      console.error('Error restarting all services:', error);
      res.status(500).json({
        error: 'Failed to restart all services',
        details: error.message
      });
    }
  });
}
