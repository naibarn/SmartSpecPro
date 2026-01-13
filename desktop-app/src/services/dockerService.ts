/**
 * Docker Service - Frontend service for Docker management
 * 
 * Provides TypeScript interface to Tauri Docker commands
 * for managing local sandbox containers.
 */

import { invoke } from "@tauri-apps/api/core";

// Types
export type ContainerStatus = 
  | "running" 
  | "stopped" 
  | "restarting" 
  | "paused" 
  | "exited" 
  | "dead" 
  | "created";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  created: string;
  ports: string[];
  uptime: string;
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
}

export interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface DockerInfo {
  version: string;
  containers_total: number;
  containers_running: number;
  containers_paused: number;
  containers_stopped: number;
  images: number;
  docker_root_dir: string;
  os_type: string;
  architecture: string;
  available: boolean;
  error?: string;
}

export interface ContainerLogs {
  logs: string;
  timestamp: string;
}

export interface SandboxConfig {
  name: string;
  image: string;
  ports: string[];
  volumes: string[];
  env_vars: Record<string, string>;
  memory_limit?: string;
  cpu_limit?: number;
}

// Docker Service Class
class DockerService {
  /**
   * Check if Docker is available and get system info
   */
  async checkDocker(): Promise<DockerInfo> {
    try {
      return await invoke<DockerInfo>("docker_check");
    } catch (error) {
      return {
        version: "",
        containers_total: 0,
        containers_running: 0,
        containers_paused: 0,
        containers_stopped: 0,
        images: 0,
        docker_root_dir: "",
        os_type: "",
        architecture: "",
        available: false,
        error: String(error),
      };
    }
  }

  /**
   * List all containers
   */
  async listContainers(all: boolean = true): Promise<ContainerInfo[]> {
    try {
      return await invoke<ContainerInfo[]>("docker_list_containers", { all });
    } catch (error) {
      console.error("Failed to list containers:", error);
      throw error;
    }
  }

  /**
   * Get container statistics
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    try {
      return await invoke<ContainerStats>("docker_get_container_stats", { containerId });
    } catch (error) {
      console.error("Failed to get container stats:", error);
      throw error;
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(containerId: string, tail: number = 100): Promise<ContainerLogs> {
    try {
      return await invoke<ContainerLogs>("docker_get_container_logs", { containerId, tail });
    } catch (error) {
      console.error("Failed to get container logs:", error);
      throw error;
    }
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<void> {
    try {
      await invoke("docker_start_container", { containerId });
    } catch (error) {
      console.error("Failed to start container:", error);
      throw error;
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      await invoke("docker_stop_container", { containerId });
    } catch (error) {
      console.error("Failed to stop container:", error);
      throw error;
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(containerId: string): Promise<void> {
    try {
      await invoke("docker_restart_container", { containerId });
    } catch (error) {
      console.error("Failed to restart container:", error);
      throw error;
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(containerId: string, force: boolean = false): Promise<void> {
    try {
      await invoke("docker_remove_container", { containerId, force });
    } catch (error) {
      console.error("Failed to remove container:", error);
      throw error;
    }
  }

  /**
   * List Docker images
   */
  async listImages(): Promise<ImageInfo[]> {
    try {
      return await invoke<ImageInfo[]>("docker_list_images");
    } catch (error) {
      console.error("Failed to list images:", error);
      throw error;
    }
  }

  /**
   * Pull a Docker image
   */
  async pullImage(image: string): Promise<string> {
    try {
      return await invoke<string>("docker_pull_image", { image });
    } catch (error) {
      console.error("Failed to pull image:", error);
      throw error;
    }
  }

  /**
   * Remove a Docker image
   */
  async removeImage(imageId: string, force: boolean = false): Promise<void> {
    try {
      await invoke("docker_remove_image", { imageId, force });
    } catch (error) {
      console.error("Failed to remove image:", error);
      throw error;
    }
  }

  /**
   * Create a sandbox container
   */
  async createSandbox(config: SandboxConfig): Promise<string> {
    try {
      return await invoke<string>("docker_create_sandbox", { config });
    } catch (error) {
      console.error("Failed to create sandbox:", error);
      throw error;
    }
  }

  /**
   * Execute command in container
   */
  async execCommand(containerId: string, command: string): Promise<string> {
    try {
      return await invoke<string>("docker_exec_command", { containerId, command });
    } catch (error) {
      console.error("Failed to exec command:", error);
      throw error;
    }
  }

  /**
   * Prune unused containers
   */
  async pruneContainers(): Promise<string> {
    try {
      return await invoke<string>("docker_prune_containers");
    } catch (error) {
      console.error("Failed to prune containers:", error);
      throw error;
    }
  }

  /**
   * Prune unused images
   */
  async pruneImages(): Promise<string> {
    try {
      return await invoke<string>("docker_prune_images");
    } catch (error) {
      console.error("Failed to prune images:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const dockerService = new DockerService();

// Utility functions
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function getStatusColor(status: ContainerStatus): string {
  switch (status) {
    case "running":
      return "#10b981"; // green
    case "paused":
      return "#f59e0b"; // amber
    case "restarting":
      return "#3b82f6"; // blue
    case "exited":
    case "stopped":
      return "#6b7280"; // gray
    case "dead":
      return "#ef4444"; // red
    default:
      return "#6b7280"; // gray
  }
}

export function getStatusBadge(status: ContainerStatus): { color: string; bg: string; text: string } {
  switch (status) {
    case "running":
      return { color: "#059669", bg: "#d1fae5", text: "Running" };
    case "paused":
      return { color: "#d97706", bg: "#fef3c7", text: "Paused" };
    case "restarting":
      return { color: "#2563eb", bg: "#dbeafe", text: "Restarting" };
    case "exited":
      return { color: "#6b7280", bg: "#f3f4f6", text: "Exited" };
    case "stopped":
      return { color: "#6b7280", bg: "#f3f4f6", text: "Stopped" };
    case "dead":
      return { color: "#dc2626", bg: "#fee2e2", text: "Dead" };
    case "created":
      return { color: "#7c3aed", bg: "#ede9fe", text: "Created" };
    default:
      return { color: "#6b7280", bg: "#f3f4f6", text: status };
  }
}
