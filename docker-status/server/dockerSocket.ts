/**
 * Docker Socket Integration
 * 
 * This module provides direct connection to Docker daemon via Unix socket
 * for better performance compared to CLI commands.
 * 
 * Supports both Unix socket (/var/run/docker.sock) and TCP connections.
 */

import http from "http";
import https from "https";

// Docker API version
const DOCKER_API_VERSION = "v1.43";

// Connection configuration
export interface DockerConfig {
  socketPath?: string;  // Unix socket path (default: /var/run/docker.sock)
  host?: string;        // TCP host (e.g., localhost)
  port?: number;        // TCP port (e.g., 2375 or 2376 for TLS)
  useTLS?: boolean;     // Use HTTPS for TCP connection
}

// Default configuration
const defaultConfig: DockerConfig = {
  socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
};

// Container types from Docker API
export interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  Ports: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
  State: string;
  Status: string;
  HostConfig: {
    NetworkMode: string;
  };
  NetworkSettings: {
    Networks: Record<string, unknown>;
  };
  Mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
    Mode: string;
    RW: boolean;
    Propagation: string;
  }>;
}

export interface DockerStats {
  read: string;
  cpu_stats: {
    cpu_usage: {
      total_usage: number;
      percpu_usage?: number[];
      usage_in_kernelmode: number;
      usage_in_usermode: number;
    };
    system_cpu_usage: number;
    online_cpus: number;
  };
  precpu_stats: {
    cpu_usage: {
      total_usage: number;
      percpu_usage?: number[];
      usage_in_kernelmode: number;
      usage_in_usermode: number;
    };
    system_cpu_usage: number;
    online_cpus: number;
  };
  memory_stats: {
    usage: number;
    max_usage: number;
    limit: number;
    stats: Record<string, number>;
  };
  networks?: Record<string, {
    rx_bytes: number;
    rx_packets: number;
    tx_bytes: number;
    tx_packets: number;
  }>;
}

export interface DockerInfo {
  ID: string;
  Containers: number;
  ContainersRunning: number;
  ContainersPaused: number;
  ContainersStopped: number;
  Images: number;
  Driver: string;
  MemTotal: number;
  NCPU: number;
  ServerVersion: string;
  OperatingSystem: string;
  Architecture: string;
  KernelVersion: string;
}

/**
 * Docker Socket Client
 */
export class DockerSocketClient {
  private config: DockerConfig;

  constructor(config: DockerConfig = defaultConfig) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Make HTTP request to Docker daemon
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        method,
        path: `/${DOCKER_API_VERSION}${path}`,
        headers: {
          "Content-Type": "application/json",
        },
      };

      // Use socket or TCP
      if (this.config.socketPath) {
        options.socketPath = this.config.socketPath;
      } else if (this.config.host) {
        options.hostname = this.config.host;
        options.port = this.config.port || (this.config.useTLS ? 2376 : 2375);
      }

      const protocol = this.config.useTLS ? https : http;
      
      const req = protocol.request(options, (res) => {
        let data = "";
        
        res.on("data", (chunk) => {
          data += chunk;
        });
        
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve(data as unknown as T);
            }
          } else {
            reject(new Error(`Docker API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Docker connection error: ${error.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Get Docker system info
   */
  async getInfo(): Promise<DockerInfo> {
    return this.request<DockerInfo>("GET", "/info");
  }

  /**
   * Get Docker version
   */
  async getVersion(): Promise<{ Version: string; ApiVersion: string }> {
    return this.request("GET", "/version");
  }

  /**
   * List all containers
   */
  async listContainers(all: boolean = true): Promise<DockerContainer[]> {
    return this.request<DockerContainer[]>("GET", `/containers/json?all=${all}`);
  }

  /**
   * Get container stats (one-shot, not streaming)
   */
  async getContainerStats(containerId: string): Promise<DockerStats> {
    return this.request<DockerStats>("GET", `/containers/${containerId}/stats?stream=false`);
  }

  /**
   * Get container logs
   */
  async getContainerLogs(
    containerId: string,
    options: { tail?: number; timestamps?: boolean } = {}
  ): Promise<string> {
    const { tail = 100, timestamps = true } = options;
    const params = new URLSearchParams({
      stdout: "true",
      stderr: "true",
      tail: tail.toString(),
      timestamps: timestamps.toString(),
    });
    return this.request<string>("GET", `/containers/${containerId}/logs?${params}`);
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<void> {
    await this.request("POST", `/containers/${containerId}/start`);
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string, timeout: number = 10): Promise<void> {
    await this.request("POST", `/containers/${containerId}/stop?t=${timeout}`);
  }

  /**
   * Restart a container
   */
  async restartContainer(containerId: string, timeout: number = 10): Promise<void> {
    await this.request("POST", `/containers/${containerId}/restart?t=${timeout}`);
  }

  /**
   * Check if Docker is available
   */
  async ping(): Promise<boolean> {
    try {
      await this.request("GET", "/_ping");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all images
   */
  async listImages(all: boolean = false): Promise<any[]> {
    return this.request<any[]>("GET", `/images/json?all=${all}`);
  }

  /**
   * Delete an image
   */
  async deleteImage(imageId: string, force: boolean = false): Promise<void> {
    await this.request("DELETE", `/images/${imageId}?force=${force}`);
  }

  /**
   * Prune unused images
   */
  async pruneImages(): Promise<{ SpaceReclaimed: number }> {
    return this.request<{ SpaceReclaimed: number }>("POST", "/images/prune");
  }

  /**
   * Get image details
   */
  async getImageDetails(imageId: string): Promise<any> {
    return this.request("GET", `/images/${imageId}/json`);
  }
}

// Calculate CPU percentage from stats
export function calculateCpuPercent(stats: DockerStats): number {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;

  if (systemDelta > 0 && cpuDelta > 0) {
    return (cpuDelta / systemDelta) * cpuCount * 100;
  }
  return 0;
}

// Calculate memory percentage from stats
export function calculateMemoryPercent(stats: DockerStats): number {
  if (stats.memory_stats.limit > 0) {
    return (stats.memory_stats.usage / stats.memory_stats.limit) * 100;
  }
  return 0;
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  
  return `${value.toFixed(value < 10 ? 1 : 0)}${units[i]}`;
}

// Format uptime from container status
export function formatUptime(status: string): string {
  if (status.toLowerCase().startsWith("up")) {
    return status.replace(/^up\s+/i, "").trim();
  }
  return "-";
}

// Parse port mappings
export function formatPorts(ports: DockerContainer["Ports"]): string[] {
  return ports.map(p => {
    if (p.PublicPort) {
      return `${p.IP || "0.0.0.0"}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`;
    }
    return `${p.PrivatePort}/${p.Type}`;
  });
}

// Default client instance
export const dockerClient = new DockerSocketClient();
