/**
 * Docker API Integration
 * 
 * This module provides functions to interact with Docker daemon
 * Supports both Docker Socket (preferred) and CLI fallback
 */

import { exec } from "child_process";
import { promisify } from "util";
import {
  DockerSocketClient,
  DockerContainer,
  DockerStats,
  calculateCpuPercent,
  calculateMemoryPercent,
  formatBytes,
  formatUptime,
  formatPorts,
} from "./dockerSocket";

const execAsync = promisify(exec);

// Container status types
export type ContainerStatus = "running" | "stopped" | "restarting" | "paused" | "exited" | "dead";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  created: string;
  ports: string[];
  uptime: string;
  cpu: string;
  memory: string;
  memoryLimit: string;
}

export interface ContainerStatsData {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
}

export interface ContainerLogs {
  logs: string;
  timestamp: Date;
}

export interface DockerInfoResult {
  version: string;
  containers: number;
  running: number;
  paused: number;
  stopped: number;
  connectionType: "socket" | "cli";
}

// Docker client instance
const dockerClient = new DockerSocketClient();

// Track connection type
let useSocketConnection = true;

/**
 * Check if Docker Socket is available
 */
async function checkSocketConnection(): Promise<boolean> {
  try {
    return await dockerClient.ping();
  } catch {
    return false;
  }
}

/**
 * Initialize and determine best connection method
 */
export async function initDockerConnection(): Promise<"socket" | "cli" | "none"> {
  // Try socket first
  if (await checkSocketConnection()) {
    useSocketConnection = true;
    console.log("[Docker] Using socket connection");
    return "socket";
  }

  // Try CLI
  try {
    await execAsync("docker version --format '{{.Server.Version}}'");
    useSocketConnection = false;
    console.log("[Docker] Using CLI connection");
    return "cli";
  } catch {
    console.log("[Docker] No connection available");
    return "none";
  }
}

/**
 * Get Docker system info
 */
export async function getDockerInfo(): Promise<DockerInfoResult> {
  // Try socket first
  if (useSocketConnection) {
    try {
      const [info, version] = await Promise.all([
        dockerClient.getInfo(),
        dockerClient.getVersion(),
      ]);

      return {
        version: version.Version,
        containers: info.Containers,
        running: info.ContainersRunning,
        paused: info.ContainersPaused,
        stopped: info.ContainersStopped,
        connectionType: "socket",
      };
    } catch (error) {
      console.error("[Docker Socket] Error getting info:", error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    const { stdout: versionOut } = await execAsync('docker version --format "{{.Server.Version}}"');
    const { stdout: infoOut } = await execAsync(
      'docker info --format "{{.Containers}}|{{.ContainersRunning}}|{{.ContainersPaused}}|{{.ContainersStopped}}"'
    );

    const [containers, running, paused, stopped] = infoOut.trim().split("|").map(Number);

    return {
      version: versionOut.trim(),
      containers,
      running,
      paused,
      stopped,
      connectionType: "cli",
    };
  } catch (error) {
    console.error("Error getting Docker info:", error);
    throw new Error("Failed to get Docker info. Is Docker running?");
  }
}

/**
 * List all containers
 */
export async function listContainers(): Promise<ContainerInfo[]> {
  // Try socket first
  if (useSocketConnection) {
    try {
      const containers = await dockerClient.listContainers(true);
      
      const result: ContainerInfo[] = [];
      
      for (const container of containers) {
        let cpu = "0%";
        let memory = "0MB";
        let memoryLimit = "0MB";

        if (container.State === "running") {
          try {
            const stats = await dockerClient.getContainerStats(container.Id);
            cpu = `${calculateCpuPercent(stats).toFixed(1)}%`;
            memory = formatBytes(stats.memory_stats.usage);
            memoryLimit = formatBytes(stats.memory_stats.limit);
          } catch {
            // Stats not available
          }
        }

        result.push({
          id: container.Id.substring(0, 12),
          name: container.Names[0]?.replace(/^\//, "") || container.Id.substring(0, 12),
          image: container.Image,
          status: mapState(container.State),
          state: container.State,
          created: new Date(container.Created * 1000).toISOString(),
          ports: formatPorts(container.Ports),
          uptime: formatUptime(container.Status),
          cpu,
          memory,
          memoryLimit,
        });
      }

      return result;
    } catch (error) {
      console.error("[Docker Socket] Error listing containers:", error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    const { stdout: psOutput } = await execAsync(
      'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.CreatedAt}}|{{.Ports}}"'
    );

    if (!psOutput.trim()) {
      return [];
    }

    const containers: ContainerInfo[] = [];
    const lines = psOutput.trim().split("\n");

    for (const line of lines) {
      const [id, name, image, status, state, created, ports] = line.split("|");
      
      let cpu = "0%";
      let memory = "0MB";
      let memoryLimit = "0MB";

      if (state === "running") {
        try {
          const stats = await getContainerStats(id);
          cpu = `${stats.cpuPercent.toFixed(1)}%`;
          memory = formatBytes(stats.memoryUsage);
          memoryLimit = formatBytes(stats.memoryLimit);
        } catch {
          // Stats not available
        }
      }

      const uptime = parseUptime(status);

      containers.push({
        id: id.substring(0, 12),
        name,
        image,
        status: mapState(state),
        state,
        created,
        ports: ports ? ports.split(",").map(p => p.trim()) : [],
        uptime,
        cpu,
        memory,
        memoryLimit,
      });
    }

    return containers;
  } catch (error) {
    console.error("Error listing containers:", error);
    throw new Error("Failed to list containers. Is Docker running?");
  }
}

/**
 * Get container stats
 */
export async function getContainerStats(containerId: string): Promise<ContainerStatsData> {
  // Try socket first
  if (useSocketConnection) {
    try {
      const stats = await dockerClient.getContainerStats(containerId);
      
      let networkRx = 0;
      let networkTx = 0;
      
      if (stats.networks) {
        for (const network of Object.values(stats.networks)) {
          networkRx += network.rx_bytes;
          networkTx += network.tx_bytes;
        }
      }

      return {
        cpuPercent: calculateCpuPercent(stats),
        memoryUsage: stats.memory_stats.usage,
        memoryLimit: stats.memory_stats.limit,
        memoryPercent: calculateMemoryPercent(stats),
        networkRx,
        networkTx,
      };
    } catch (error) {
      console.error(`[Docker Socket] Error getting stats for ${containerId}:`, error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    const { stdout } = await execAsync(
      `docker stats ${containerId} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}"`
    );

    const [cpuStr, memStr] = stdout.trim().split("|");
    
    const cpuPercent = parseFloat(cpuStr.replace("%", "")) || 0;
    
    const memParts = memStr.split("/").map(s => s.trim());
    const memoryUsage = parseMemory(memParts[0]);
    const memoryLimit = parseMemory(memParts[1]);
    const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

    return {
      cpuPercent,
      memoryUsage,
      memoryLimit,
      memoryPercent,
      networkRx: 0,
      networkTx: 0,
    };
  } catch (error) {
    console.error(`Error getting stats for ${containerId}:`, error);
    return {
      cpuPercent: 0,
      memoryUsage: 0,
      memoryLimit: 0,
      memoryPercent: 0,
      networkRx: 0,
      networkTx: 0,
    };
  }
}

/**
 * Get container logs
 */
export async function getContainerLogs(
  containerId: string,
  tail: number = 100
): Promise<ContainerLogs> {
  // Try socket first
  if (useSocketConnection) {
    try {
      const logs = await dockerClient.getContainerLogs(containerId, { tail, timestamps: true });
      return {
        logs: cleanLogs(logs),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`[Docker Socket] Error getting logs for ${containerId}:`, error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    const { stdout, stderr } = await execAsync(
      `docker logs ${containerId} --tail ${tail} --timestamps 2>&1`
    );

    return {
      logs: stdout || stderr || "No logs available",
      timestamp: new Date(),
    };
  } catch (error) {
    console.error(`Error getting logs for ${containerId}:`, error);
    return {
      logs: `Error fetching logs: ${error}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Start a container
 */
export async function startContainer(containerId: string): Promise<boolean> {
  // Try socket first
  if (useSocketConnection) {
    try {
      await dockerClient.startContainer(containerId);
      return true;
    } catch (error) {
      console.error(`[Docker Socket] Error starting container ${containerId}:`, error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    await execAsync(`docker start ${containerId}`);
    return true;
  } catch (error) {
    console.error(`Error starting container ${containerId}:`, error);
    throw new Error(`Failed to start container: ${error}`);
  }
}

/**
 * Stop a container
 */
export async function stopContainer(containerId: string): Promise<boolean> {
  // Try socket first
  if (useSocketConnection) {
    try {
      await dockerClient.stopContainer(containerId);
      return true;
    } catch (error) {
      console.error(`[Docker Socket] Error stopping container ${containerId}:`, error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    await execAsync(`docker stop ${containerId}`);
    return true;
  } catch (error) {
    console.error(`Error stopping container ${containerId}:`, error);
    throw new Error(`Failed to stop container: ${error}`);
  }
}

/**
 * Restart a container
 */
export async function restartContainer(containerId: string): Promise<boolean> {
  // Try socket first
  if (useSocketConnection) {
    try {
      await dockerClient.restartContainer(containerId);
      return true;
    } catch (error) {
      console.error(`[Docker Socket] Error restarting container ${containerId}:`, error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    await execAsync(`docker restart ${containerId}`);
    return true;
  } catch (error) {
    console.error(`Error restarting container ${containerId}:`, error);
    throw new Error(`Failed to restart container: ${error}`);
  }
}

// Helper functions

function mapState(state: string): ContainerStatus {
  const stateMap: Record<string, ContainerStatus> = {
    running: "running",
    exited: "exited",
    paused: "paused",
    restarting: "restarting",
    dead: "dead",
  };
  return stateMap[state.toLowerCase()] || "stopped";
}

function parseUptime(status: string): string {
  if (status.toLowerCase().startsWith("up")) {
    return status.replace(/^up\s+/i, "").trim();
  }
  return "-";
}

function parseMemory(memStr: string): number {
  if (!memStr) return 0;
  
  const match = memStr.match(/^([\d.]+)\s*([KMGT]?i?B)/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const multipliers: Record<string, number> = {
    "B": 1,
    "KB": 1024,
    "KIB": 1024,
    "MB": 1024 * 1024,
    "MIB": 1024 * 1024,
    "GB": 1024 * 1024 * 1024,
    "GIB": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024,
    "TIB": 1024 * 1024 * 1024 * 1024,
  };

  return value * (multipliers[unit] || 1);
}

function cleanLogs(logs: string): string {
  // Docker socket returns logs with binary headers, clean them
  return logs.replace(/[\x00-\x08]/g, "").trim();
}

// Re-export formatBytes for use in other modules
export { formatBytes };


// ============================================
// Docker Image Management
// ============================================

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  sizeFormatted: string;
  created: string;
  createdAt: Date;
  inUse: boolean;
}

/**
 * List all Docker images
 */
export async function listImages(): Promise<DockerImage[]> {
  // Try socket first
  if (useSocketConnection) {
    try {
      const images = await dockerClient.listImages();
      const containers = await dockerClient.listContainers(true);
      
      // Get list of images in use
      const imagesInUse = new Set(containers.map(c => c.ImageID));

      return images.map(img => {
        const repoTag = img.RepoTags?.[0] || "<none>:<none>";
        const [repository, tag] = repoTag.split(":");
        
        return {
          id: img.Id.replace("sha256:", "").substring(0, 12),
          repository: repository || "<none>",
          tag: tag || "<none>",
          size: img.Size,
          sizeFormatted: formatBytes(img.Size),
          created: new Date(img.Created * 1000).toISOString(),
          createdAt: new Date(img.Created * 1000),
          inUse: imagesInUse.has(img.Id),
        };
      });
    } catch (error) {
      console.error("[Docker Socket] Error listing images:", error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    const { stdout: imageOutput } = await execAsync(
      'docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"'
    );

    const { stdout: psOutput } = await execAsync(
      'docker ps -a --format "{{.Image}}"'
    );

    const imagesInUse = new Set(psOutput.trim().split("\n").filter(Boolean));

    if (!imageOutput.trim()) {
      return [];
    }

    return imageOutput.trim().split("\n").map(line => {
      const [id, repository, tag, sizeStr, created] = line.split("|");
      const size = parseSizeString(sizeStr);
      
      return {
        id,
        repository,
        tag,
        size,
        sizeFormatted: sizeStr,
        created,
        createdAt: new Date(created),
        inUse: imagesInUse.has(`${repository}:${tag}`) || imagesInUse.has(id),
      };
    });
  } catch (error) {
    console.error("Error listing images:", error);
    throw new Error("Failed to list images. Is Docker running?");
  }
}

/**
 * Delete a Docker image
 */
export async function deleteImage(imageId: string, force: boolean = false): Promise<boolean> {
  // Try socket first
  if (useSocketConnection) {
    try {
      await dockerClient.deleteImage(imageId, force);
      return true;
    } catch (error) {
      console.error(`[Docker Socket] Error deleting image ${imageId}:`, error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    const forceFlag = force ? "-f" : "";
    await execAsync(`docker rmi ${forceFlag} ${imageId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting image ${imageId}:`, error);
    throw new Error(`Failed to delete image: ${error}`);
  }
}

/**
 * Prune unused images
 */
export async function pruneImages(): Promise<{ deleted: string[]; spaceReclaimed: number }> {
  // Try socket first
  if (useSocketConnection) {
    try {
      const result = await dockerClient.pruneImages() as any;
      return {
        deleted: result.ImagesDeleted?.map((d: any) => d.Deleted || d.Untagged).filter(Boolean) || [],
        spaceReclaimed: result.SpaceReclaimed || 0,
      };
    } catch (error) {
      console.error("[Docker Socket] Error pruning images:", error);
      // Fall through to CLI
    }
  }

  // CLI fallback
  try {
    const { stdout } = await execAsync("docker image prune -f");
    const match = stdout.match(/Total reclaimed space:\s*([\d.]+\s*[KMGT]?B)/i);
    const spaceReclaimed = match ? parseSizeString(match[1]) : 0;
    
    return {
      deleted: [],
      spaceReclaimed,
    };
  } catch (error) {
    console.error("Error pruning images:", error);
    throw new Error(`Failed to prune images: ${error}`);
  }
}

// ============================================
// Docker Compose Support
// ============================================

export interface ComposeService {
  name: string;
  image: string;
  status: ContainerStatus;
  containerId?: string;
  ports: string[];
  depends_on?: string[];
}

export interface ComposeProject {
  name: string;
  path: string;
  services: ComposeService[];
  status: "running" | "partial" | "stopped";
}

/**
 * List Docker Compose projects
 */
export async function listComposeProjects(): Promise<ComposeProject[]> {
  try {
    // Try docker compose ls (newer versions)
    const { stdout } = await execAsync('docker compose ls --format json 2>/dev/null || docker-compose ls --format json 2>/dev/null || echo "[]"');
    
    const projects: any[] = JSON.parse(stdout.trim() || "[]");
    const result: ComposeProject[] = [];

    for (const project of projects) {
      const projectName = project.Name || project.name;
      
      // Get services for this project
      try {
        const { stdout: psOutput } = await execAsync(
          `docker compose -p ${projectName} ps --format json 2>/dev/null || docker-compose -p ${projectName} ps --format json 2>/dev/null || echo "[]"`
        );
        
        const services: ComposeService[] = [];
        const serviceData = JSON.parse(psOutput.trim() || "[]");
        
        // Handle both array and single object responses
        const serviceList = Array.isArray(serviceData) ? serviceData : [serviceData];
        
        for (const svc of serviceList) {
          if (!svc.Service && !svc.service) continue;
          
          services.push({
            name: svc.Service || svc.service,
            image: svc.Image || svc.image || "",
            status: mapState(svc.State || svc.state || "stopped"),
            containerId: svc.ID || svc.id,
            ports: (svc.Ports || svc.ports || "").split(",").filter(Boolean),
          });
        }

        const runningCount = services.filter(s => s.status === "running").length;
        const projectStatus = runningCount === 0 ? "stopped" : 
                             runningCount === services.length ? "running" : "partial";

        result.push({
          name: projectName,
          path: project.ConfigFiles || project.configFiles || "",
          services,
          status: projectStatus,
        });
      } catch (err) {
        console.error(`Error getting services for project ${projectName}:`, err);
      }
    }

    return result;
  } catch (error) {
    console.error("Error listing compose projects:", error);
    return [];
  }
}

/**
 * Start all services in a compose project
 */
export async function startComposeProject(projectName: string): Promise<boolean> {
  try {
    await execAsync(`docker compose -p ${projectName} start 2>/dev/null || docker-compose -p ${projectName} start`);
    return true;
  } catch (error) {
    console.error(`Error starting compose project ${projectName}:`, error);
    throw new Error(`Failed to start compose project: ${error}`);
  }
}

/**
 * Stop all services in a compose project
 */
export async function stopComposeProject(projectName: string): Promise<boolean> {
  try {
    await execAsync(`docker compose -p ${projectName} stop 2>/dev/null || docker-compose -p ${projectName} stop`);
    return true;
  } catch (error) {
    console.error(`Error stopping compose project ${projectName}:`, error);
    throw new Error(`Failed to stop compose project: ${error}`);
  }
}

/**
 * Restart all services in a compose project
 */
export async function restartComposeProject(projectName: string): Promise<boolean> {
  try {
    await execAsync(`docker compose -p ${projectName} restart 2>/dev/null || docker-compose -p ${projectName} restart`);
    return true;
  } catch (error) {
    console.error(`Error restarting compose project ${projectName}:`, error);
    throw new Error(`Failed to restart compose project: ${error}`);
  }
}

// Helper function to parse size strings like "1.5GB" to bytes
function parseSizeString(sizeStr: string): number {
  if (!sizeStr) return 0;
  
  const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B)/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const multipliers: Record<string, number> = {
    "B": 1,
    "KB": 1024,
    "MB": 1024 * 1024,
    "GB": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024,
  };

  return value * (multipliers[unit] || 1);
}
