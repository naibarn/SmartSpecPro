/**
 * Docker Compose Integration
 * 
 * Provides functionality to manage Docker Compose services
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

export interface ComposeService {
  name: string;
  status: "running" | "stopped" | "paused" | "restarting" | "exited";
  image: string;
  ports: string[];
  replicas: string;
  containerId?: string;
}

export interface ComposeProject {
  name: string;
  configPath: string;
  services: ComposeService[];
  status: "running" | "partial" | "stopped";
  workingDir: string;
}

// Parse docker compose ps output
function parseComposePs(output: string): ComposeService[] {
  const lines = output.trim().split("\n").filter(Boolean);
  if (lines.length <= 1) return []; // Only header or empty
  
  // Skip header line
  const dataLines = lines.slice(1);
  
  return dataLines.map(line => {
    // Format: NAME  IMAGE  COMMAND  SERVICE  CREATED  STATUS  PORTS
    const parts = line.split(/\s{2,}/);
    const name = parts[0] || "";
    const image = parts[1] || "";
    const service = parts[3] || name;
    const status = parts[5]?.toLowerCase() || "";
    const ports = parts[6]?.split(",").map(p => p.trim()).filter(Boolean) || [];
    
    let serviceStatus: ComposeService["status"] = "stopped";
    if (status.includes("up") || status.includes("running")) {
      serviceStatus = "running";
    } else if (status.includes("paused")) {
      serviceStatus = "paused";
    } else if (status.includes("restarting")) {
      serviceStatus = "restarting";
    } else if (status.includes("exited")) {
      serviceStatus = "exited";
    }
    
    return {
      name: service,
      status: serviceStatus,
      image,
      ports,
      replicas: "1/1",
      containerId: name,
    };
  });
}

// List Docker Compose projects
export async function listComposeProjects(searchPaths: string[] = ["/home", "/var/lib"]): Promise<ComposeProject[]> {
  const projects: ComposeProject[] = [];
  
  // Find docker-compose.yml files
  for (const searchPath of searchPaths) {
    try {
      const { stdout } = await execAsync(
        `find ${searchPath} -maxdepth 4 -name "docker-compose.yml" -o -name "docker-compose.yaml" -o -name "compose.yml" -o -name "compose.yaml" 2>/dev/null || true`
      );
      
      const files = stdout.trim().split("\n").filter(Boolean);
      
      for (const file of files) {
        try {
          const workingDir = path.dirname(file);
          const projectName = path.basename(workingDir);
          
          // Get services status
          const { stdout: psOutput } = await execAsync(
            `cd "${workingDir}" && docker compose ps --format "table {{.Name}}\t{{.Image}}\t{{.Command}}\t{{.Service}}\t{{.Created}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker-compose ps 2>/dev/null || echo ""`
          );
          
          const services = parseComposePs(psOutput);
          
          // Determine project status
          let projectStatus: ComposeProject["status"] = "stopped";
          if (services.length > 0) {
            const runningCount = services.filter(s => s.status === "running").length;
            if (runningCount === services.length) {
              projectStatus = "running";
            } else if (runningCount > 0) {
              projectStatus = "partial";
            }
          }
          
          projects.push({
            name: projectName,
            configPath: file,
            services,
            status: projectStatus,
            workingDir,
          });
        } catch (error) {
          console.error(`Error processing compose file ${file}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error searching in ${searchPath}:`, error);
    }
  }
  
  return projects;
}

// Get compose project details
export async function getComposeProject(configPath: string): Promise<ComposeProject | null> {
  try {
    const workingDir = path.dirname(configPath);
    const projectName = path.basename(workingDir);
    
    // Read compose file to get service definitions
    const composeContent = fs.readFileSync(configPath, "utf-8");
    
    // Get services status
    const { stdout: psOutput } = await execAsync(
      `cd "${workingDir}" && docker compose ps --format "table {{.Name}}\t{{.Image}}\t{{.Command}}\t{{.Service}}\t{{.Created}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker-compose ps 2>/dev/null || echo ""`
    );
    
    const services = parseComposePs(psOutput);
    
    // Determine project status
    let projectStatus: ComposeProject["status"] = "stopped";
    if (services.length > 0) {
      const runningCount = services.filter(s => s.status === "running").length;
      if (runningCount === services.length) {
        projectStatus = "running";
      } else if (runningCount > 0) {
        projectStatus = "partial";
      }
    }
    
    return {
      name: projectName,
      configPath,
      services,
      status: projectStatus,
      workingDir,
    };
  } catch (error) {
    console.error(`Error getting compose project ${configPath}:`, error);
    return null;
  }
}

// Start compose project
export async function startComposeProject(configPath: string, services?: string[]): Promise<void> {
  const workingDir = path.dirname(configPath);
  const serviceArg = services?.length ? services.join(" ") : "";
  
  await execAsync(
    `cd "${workingDir}" && docker compose up -d ${serviceArg} 2>&1 || docker-compose up -d ${serviceArg} 2>&1`
  );
}

// Stop compose project
export async function stopComposeProject(configPath: string, services?: string[]): Promise<void> {
  const workingDir = path.dirname(configPath);
  const serviceArg = services?.length ? services.join(" ") : "";
  
  await execAsync(
    `cd "${workingDir}" && docker compose stop ${serviceArg} 2>&1 || docker-compose stop ${serviceArg} 2>&1`
  );
}

// Restart compose project
export async function restartComposeProject(configPath: string, services?: string[]): Promise<void> {
  const workingDir = path.dirname(configPath);
  const serviceArg = services?.length ? services.join(" ") : "";
  
  await execAsync(
    `cd "${workingDir}" && docker compose restart ${serviceArg} 2>&1 || docker-compose restart ${serviceArg} 2>&1`
  );
}

// Down compose project (stop and remove containers)
export async function downComposeProject(configPath: string, removeVolumes: boolean = false): Promise<void> {
  const workingDir = path.dirname(configPath);
  const volumeArg = removeVolumes ? "-v" : "";
  
  await execAsync(
    `cd "${workingDir}" && docker compose down ${volumeArg} 2>&1 || docker-compose down ${volumeArg} 2>&1`
  );
}

// Pull latest images for compose project
export async function pullComposeProject(configPath: string): Promise<void> {
  const workingDir = path.dirname(configPath);
  
  await execAsync(
    `cd "${workingDir}" && docker compose pull 2>&1 || docker-compose pull 2>&1`
  );
}

// Get compose logs
export async function getComposeLogs(
  configPath: string,
  services?: string[],
  tail: number = 100
): Promise<string> {
  const workingDir = path.dirname(configPath);
  const serviceArg = services?.length ? services.join(" ") : "";
  
  const { stdout } = await execAsync(
    `cd "${workingDir}" && docker compose logs --tail=${tail} ${serviceArg} 2>&1 || docker-compose logs --tail=${tail} ${serviceArg} 2>&1`
  );
  
  return stdout;
}

// Validate compose file
export async function validateComposeFile(configPath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const workingDir = path.dirname(configPath);
    
    await execAsync(
      `cd "${workingDir}" && docker compose config -q 2>&1 || docker-compose config -q 2>&1`
    );
    
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
