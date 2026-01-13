/**
 * Docker Images Management
 * 
 * Provides functionality to list, inspect, and delete Docker images
 */

import { exec } from "child_process";
import { promisify } from "util";
import { dockerClient, DockerContainer } from "./dockerSocket";

const execAsync = promisify(exec);

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  sizeFormatted: string;
  created: string;
  createdAt: number;
  containers: number;
  inUse: boolean;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Parse size string to bytes
function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B?)$/i);
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

// List all Docker images using Socket API
async function listImagesViaSocket(): Promise<DockerImage[]> {
  try {
    const response = await dockerClient.listImages(false);
    
    // Get container list to check which images are in use
    const containers = await dockerClient.listContainers(true);
    const usedImageIds = new Set(containers.map((c: DockerContainer) => c.ImageID));
    
    return response.map((img: any) => {
      const repoTag = img.RepoTags?.[0] || "<none>:<none>";
      const [repository, tag] = repoTag.split(":");
      
      return {
        id: img.Id.replace("sha256:", "").substring(0, 12),
        repository: repository || "<none>",
        tag: tag || "<none>",
        size: img.Size,
        sizeFormatted: formatBytes(img.Size),
        created: new Date(img.Created * 1000).toISOString(),
        createdAt: img.Created * 1000,
        containers: img.Containers || 0,
        inUse: usedImageIds.has(img.Id),
      };
    });
  } catch (error) {
    console.error("[Docker Socket] Error listing images:", error);
    throw error;
  }
}

// List all Docker images using CLI
async function listImagesViaCLI(): Promise<DockerImage[]> {
  try {
    // Get images list
    const { stdout: imagesOutput } = await execAsync(
      'docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"'
    );
    
    // Get containers to check which images are in use
    const { stdout: containersOutput } = await execAsync(
      'docker ps -a --format "{{.Image}}"'
    );
    const usedImages = new Set(containersOutput.trim().split("\n").filter(Boolean));
    
    const lines = imagesOutput.trim().split("\n").filter(Boolean);
    
    return lines.map(line => {
      const [id, repository, tag, size, created] = line.split("|");
      const fullName = `${repository}:${tag}`;
      
      return {
        id,
        repository: repository || "<none>",
        tag: tag || "<none>",
        size: parseSize(size),
        sizeFormatted: size,
        created,
        createdAt: new Date(created).getTime(),
        containers: 0,
        inUse: usedImages.has(fullName) || usedImages.has(repository) || usedImages.has(id),
      };
    });
  } catch (error) {
    console.error("Error listing images via CLI:", error);
    throw error;
  }
}

// List all Docker images (try socket first, fallback to CLI)
export async function listImages(): Promise<DockerImage[]> {
  try {
    return await listImagesViaSocket();
  } catch (socketError) {
    try {
      return await listImagesViaCLI();
    } catch (cliError) {
      console.error("Failed to list images via both socket and CLI");
      throw cliError;
    }
  }
}

// Delete Docker image via Socket
async function deleteImageViaSocket(imageId: string, force: boolean = false): Promise<void> {
  try {
    await dockerClient.deleteImage(imageId, force);
  } catch (error) {
    console.error(`[Docker Socket] Error deleting image ${imageId}:`, error);
    throw error;
  }
}

// Delete Docker image via CLI
async function deleteImageViaCLI(imageId: string, force: boolean = false): Promise<void> {
  try {
    const forceFlag = force ? "-f" : "";
    await execAsync(`docker rmi ${forceFlag} ${imageId}`);
  } catch (error) {
    console.error(`Error deleting image ${imageId} via CLI:`, error);
    throw error;
  }
}

// Delete Docker image (try socket first, fallback to CLI)
export async function deleteImage(imageId: string, force: boolean = false): Promise<void> {
  try {
    await deleteImageViaSocket(imageId, force);
  } catch (socketError) {
    try {
      await deleteImageViaCLI(imageId, force);
    } catch (cliError) {
      throw cliError;
    }
  }
}

// Prune unused images via Socket
async function pruneImagesViaSocket(): Promise<{ spaceReclaimed: number }> {
  try {
    const response = await dockerClient.pruneImages();
    return { spaceReclaimed: response.SpaceReclaimed || 0 };
  } catch (error) {
    console.error("[Docker Socket] Error pruning images:", error);
    throw error;
  }
}

// Prune unused images via CLI
async function pruneImagesViaCLI(): Promise<{ spaceReclaimed: number }> {
  try {
    const { stdout } = await execAsync("docker image prune -f");
    // Parse output to get space reclaimed
    const match = stdout.match(/Total reclaimed space:\s*([\d.]+\s*[KMGT]?B)/i);
    const spaceReclaimed = match ? parseSize(match[1]) : 0;
    return { spaceReclaimed };
  } catch (error) {
    console.error("Error pruning images via CLI:", error);
    throw error;
  }
}

// Prune unused images (try socket first, fallback to CLI)
export async function pruneImages(): Promise<{ spaceReclaimed: number; spaceReclaimedFormatted: string }> {
  let result: { spaceReclaimed: number };
  
  try {
    result = await pruneImagesViaSocket();
  } catch (socketError) {
    try {
      result = await pruneImagesViaCLI();
    } catch (cliError) {
      throw cliError;
    }
  }
  
  return {
    spaceReclaimed: result.spaceReclaimed,
    spaceReclaimedFormatted: formatBytes(result.spaceReclaimed),
  };
}

// Get image details
export async function getImageDetails(imageId: string): Promise<any> {
  try {
    return await dockerClient.getImageDetails(imageId);
  } catch (error) {
    // Fallback to CLI
    try {
      const { stdout } = await execAsync(`docker inspect ${imageId}`);
      return JSON.parse(stdout)[0];
    } catch (cliError) {
      throw cliError;
    }
  }
}
