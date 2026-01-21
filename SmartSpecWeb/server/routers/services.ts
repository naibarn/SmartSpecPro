/**
 * Services Management Router
 * API endpoints for managing Docker services
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
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Service configurations matching docker-compose.dev.yml
const SERVICE_CONFIGS = [
  { id: 'smartspec-nginx', name: 'nginx', displayName: 'Nginx (Reverse Proxy)', ports: ['80', '443'] },
  { id: 'smartspec-postgres', name: 'postgres', displayName: 'PostgreSQL', ports: ['5432'] },
  { id: 'smartspec-redis', name: 'redis', displayName: 'Redis', ports: ['6379'] },
  { id: 'smartspec-backend', name: 'python-backend', displayName: 'Python Backend', ports: ['8001'] },
  { id: 'smartspec-celery-worker', name: 'celery-worker', displayName: 'Celery Worker', ports: [] },
  { id: 'smartspec-celery-beat', name: 'celery-beat', displayName: 'Celery Beat', ports: [] },
  { id: 'smartspec-flower', name: 'flower', displayName: 'Flower', ports: ['5555'] },
  { id: 'smartspec-control-plane', name: 'control-plane', displayName: 'Control Plane', ports: ['7070'] },
  { id: 'smartspec-web', name: 'smartspec-web', displayName: 'SmartSpec Web', ports: ['3000'] },
  { id: 'smartspec-docker-status', name: 'docker-status', displayName: 'Docker Status', ports: ['3001'] },
];

interface ServiceStatus {
  id: string;
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'starting' | 'unhealthy' | 'unknown';
  uptime: string;
  ports: string[];
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
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
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

// Get service status from Docker
async function getServiceStatus(serviceId: string): Promise<ServiceStatus> {
  const config = SERVICE_CONFIGS.find(s => s.id === serviceId);
  if (!config) {
    throw new Error(`Service not found: ${serviceId}`);
  }

  try {
    const container = docker.getContainer(serviceId);
    const info = await container.inspect();
    const stats = await container.stats({ stream: false });

    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

    // Calculate memory in MB
    const memoryMB = stats.memory_stats.usage / (1024 * 1024);

    // Determine status
    let status: ServiceStatus['status'] = 'unknown';
    if (info.State.Running) {
      if (info.State.Health?.Status === 'healthy') {
        status = 'running';
      } else if (info.State.Health?.Status === 'unhealthy') {
        status = 'unhealthy';
      } else if (info.State.Health?.Status === 'starting') {
        status = 'starting';
      } else {
        status = 'running';
      }
    } else {
      status = 'stopped';
    }

    return {
      id: serviceId,
      name: config.name,
      displayName: config.displayName,
      status,
      uptime: info.State.Running ? formatUptime(info.State.StartedAt) : '-',
      ports: config.ports,
      healthCheck: info.State.Health?.Status,
      cpu: Math.min(100, Math.max(0, cpuPercent)), // Clamp between 0-100
      memory: memoryMB,
      restarts: info.RestartCount,
    };
  } catch (error) {
    console.error(`Error getting status for ${serviceId}:`, error);
    return {
      id: serviceId,
      name: config.name,
      displayName: config.displayName,
      status: 'stopped',
      uptime: '-',
      ports: config.ports,
    };
  }
}

// Docker API helper functions
async function startContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.start();
}

async function stopContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.stop({ t: 10 }); // 10 second graceful shutdown
}

async function restartContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.restart({ t: 10 }); // 10 second graceful shutdown
}

export function registerServicesRoutes(app: Express) {
  // Get all services status
  app.get('/api/admin/services/status', requireAdmin, async (req, res) => {
    try {
      const statuses = await Promise.all(
        SERVICE_CONFIGS.map(config => getServiceStatus(config.id))
      );

      // Get system-wide disk usage using Docker system df
      let diskInfo = null;
      try {
        const dfResult = await docker.df();
        const volumes = dfResult.Volumes || [];
        const images = dfResult.Images || [];

        // Calculate total sizes
        const volumesSize = volumes.reduce((sum: number, v: any) => sum + (v.UsageData?.Size || 0), 0);
        const imagesSize = images.reduce((sum: number, img: any) => sum + (img.Size || 0), 0);

        diskInfo = {
          volumesSize: Math.round(volumesSize / (1024 * 1024 * 1024) * 100) / 100, // GB
          imagesSize: Math.round(imagesSize / (1024 * 1024 * 1024) * 100) / 100, // GB
          totalUsed: Math.round((volumesSize + imagesSize) / (1024 * 1024 * 1024) * 100) / 100, // GB
        };
      } catch (diskError) {
        console.error('Error fetching disk info:', diskError);
      }

      res.json({
        services: statuses,
        disk: diskInfo
      });
    } catch (error) {
      console.error('Error fetching services status:', error);
      res.status(500).json({ error: 'Failed to fetch services status' });
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
      await startContainer(serviceId);
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
      await stopContainer(serviceId);
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
      await restartContainer(serviceId);
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

      const container = docker.getContainer(serviceId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100,
        timestamps: true
      });

      res.json({ logs: logs.toString('utf-8') });
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      res.status(500).json({
        error: 'Failed to fetch logs',
        details: error.message
      });
    }
  });

  // Start all services
  app.post('/api/admin/services/start-all', requireAdmin, async (req, res) => {
    try {
      await Promise.all(
        SERVICE_CONFIGS.map(config => startContainer(config.id).catch(e => {
          console.error(`Failed to start ${config.id}:`, e);
        }))
      );
      res.json({ message: 'All services started successfully' });
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
      await Promise.all(
        SERVICE_CONFIGS.map(config => stopContainer(config.id).catch(e => {
          console.error(`Failed to stop ${config.id}:`, e);
        }))
      );
      res.json({ message: 'All services stopped successfully' });
    } catch (error: any) {
      console.error('Error stopping all services:', error);
      res.status(500).json({
        error: 'Failed to stop all services',
        details: error.message
      });
    }
  });

  // Restart all services
  app.post('/api/admin/services/restart-all', requireAdmin, async (req, res) => {
    try {
      await Promise.all(
        SERVICE_CONFIGS.map(config => restartContainer(config.id).catch(e => {
          console.error(`Failed to restart ${config.id}:`, e);
        }))
      );
      res.json({ message: 'All services restarted successfully' });
    } catch (error: any) {
      console.error('Error restarting all services:', error);
      res.status(500).json({
        error: 'Failed to restart all services',
        details: error.message
      });
    }
  });
}
