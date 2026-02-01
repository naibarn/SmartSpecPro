//! Docker Manager Module for SmartSpec Desktop App
//! 
//! Provides Docker container and image management functionality
//! for local sandbox environments on PC/Mac.

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::collections::HashMap;

/// Container status types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerStatus {
    Running,
    Stopped,
    Restarting,
    Paused,
    Exited,
    Dead,
    Created,
}

impl From<&str> for ContainerStatus {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "running" => ContainerStatus::Running,
            "stopped" => ContainerStatus::Stopped,
            "restarting" => ContainerStatus::Restarting,
            "paused" => ContainerStatus::Paused,
            "exited" => ContainerStatus::Exited,
            "dead" => ContainerStatus::Dead,
            "created" => ContainerStatus::Created,
            _ => ContainerStatus::Stopped,
        }
    }
}

/// Container information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: ContainerStatus,
    pub state: String,
    pub created: String,
    pub ports: Vec<String>,
    pub uptime: String,
}

/// Container statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub memory_usage: u64,
    pub memory_limit: u64,
    pub memory_percent: f64,
    pub network_rx: u64,
    pub network_tx: u64,
    pub block_read: u64,
    pub block_write: u64,
}

/// Docker image information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created: String,
}

/// Docker system information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerInfo {
    pub version: String,
    pub containers_total: i32,
    pub containers_running: i32,
    pub containers_paused: i32,
    pub containers_stopped: i32,
    pub images: i32,
    pub docker_root_dir: String,
    pub os_type: String,
    pub architecture: String,
    pub available: bool,
    pub error: Option<String>,
}

/// Container logs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerLogs {
    pub logs: String,
    pub timestamp: String,
}

/// Sandbox workspace configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    pub name: String,
    pub image: String,
    pub ports: Vec<String>,
    pub volumes: Vec<String>,
    pub env_vars: HashMap<String, String>,
    pub memory_limit: Option<String>,
    pub cpu_limit: Option<f64>,
}

/// Docker Manager - handles all Docker operations
pub struct DockerManager;

impl DockerManager {
    /// Check if Docker is available on the system
    pub fn check_docker() -> Result<DockerInfo, String> {
        // Try to get Docker version
        let version_output = Command::new("docker")
            .args(["version", "--format", "{{.Server.Version}}"])
            .output();

        match version_output {
            Ok(output) if output.status.success() => {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                
                // Get Docker info
                let info_output = Command::new("docker")
                    .args(["info", "--format", 
                        "{{.Containers}}|{{.ContainersRunning}}|{{.ContainersPaused}}|{{.ContainersStopped}}|{{.Images}}|{{.DockerRootDir}}|{{.OSType}}|{{.Architecture}}"])
                    .output()
                    .map_err(|e| e.to_string())?;

                if info_output.status.success() {
                    let info_str = String::from_utf8_lossy(&info_output.stdout);
                    let parts: Vec<&str> = info_str.trim().split('|').collect();
                    
                    Ok(DockerInfo {
                        version,
                        containers_total: parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(0),
                        containers_running: parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
                        containers_paused: parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
                        containers_stopped: parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(0),
                        images: parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(0),
                        docker_root_dir: parts.get(5).unwrap_or(&"").to_string(),
                        os_type: parts.get(6).unwrap_or(&"").to_string(),
                        architecture: parts.get(7).unwrap_or(&"").to_string(),
                        available: true,
                        error: None,
                    })
                } else {
                    Ok(DockerInfo {
                        version,
                        containers_total: 0,
                        containers_running: 0,
                        containers_paused: 0,
                        containers_stopped: 0,
                        images: 0,
                        docker_root_dir: String::new(),
                        os_type: String::new(),
                        architecture: String::new(),
                        available: true,
                        error: Some("Could not get Docker info".to_string()),
                    })
                }
            }
            Ok(output) => {
                let error = String::from_utf8_lossy(&output.stderr).to_string();
                Ok(DockerInfo {
                    version: String::new(),
                    containers_total: 0,
                    containers_running: 0,
                    containers_paused: 0,
                    containers_stopped: 0,
                    images: 0,
                    docker_root_dir: String::new(),
                    os_type: String::new(),
                    architecture: String::new(),
                    available: false,
                    error: Some(format!("Docker not running: {}", error)),
                })
            }
            Err(e) => {
                Ok(DockerInfo {
                    version: String::new(),
                    containers_total: 0,
                    containers_running: 0,
                    containers_paused: 0,
                    containers_stopped: 0,
                    images: 0,
                    docker_root_dir: String::new(),
                    os_type: String::new(),
                    architecture: String::new(),
                    available: false,
                    error: Some(format!("Docker not installed: {}", e)),
                })
            }
        }
    }

    /// List all containers
    pub fn list_containers(all: bool) -> Result<Vec<ContainerInfo>, String> {
        let mut args = vec!["ps", "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.CreatedAt}}|{{.Ports}}"];
        if all {
            args.insert(1, "-a");
        }

        let output = Command::new("docker")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to execute docker ps: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let containers: Vec<ContainerInfo> = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.split('|').collect();
                ContainerInfo {
                    id: parts.get(0).unwrap_or(&"").to_string(),
                    name: parts.get(1).unwrap_or(&"").to_string(),
                    image: parts.get(2).unwrap_or(&"").to_string(),
                    uptime: parts.get(3).unwrap_or(&"").to_string(),
                    status: ContainerStatus::from(parts.get(4).unwrap_or(&"")),
                    state: parts.get(4).unwrap_or(&"").to_string(),
                    created: parts.get(5).unwrap_or(&"").to_string(),
                    ports: parts.get(6)
                        .map(|p| p.split(',').map(|s| s.trim().to_string()).collect())
                        .unwrap_or_default(),
                }
            })
            .collect();

        Ok(containers)
    }

    /// Get container statistics
    pub fn get_container_stats(container_id: &str) -> Result<ContainerStats, String> {
        let output = Command::new("docker")
            .args(["stats", container_id, "--no-stream", "--format", 
                "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}"])
            .output()
            .map_err(|e| format!("Failed to get stats: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.trim().split('|').collect();

        // Parse CPU percentage
        let cpu_percent = parts.get(0)
            .and_then(|s| s.trim_end_matches('%').parse::<f64>().ok())
            .unwrap_or(0.0);

        // Parse memory usage (e.g., "100MiB / 1GiB")
        let mem_parts: Vec<&str> = parts.get(1).unwrap_or(&"").split('/').collect();
        let memory_usage = Self::parse_size(mem_parts.get(0).unwrap_or(&"").trim());
        let memory_limit = Self::parse_size(mem_parts.get(1).unwrap_or(&"").trim());

        // Parse memory percentage
        let memory_percent = parts.get(2)
            .and_then(|s| s.trim_end_matches('%').parse::<f64>().ok())
            .unwrap_or(0.0);

        // Parse network I/O (e.g., "1.5kB / 2.3kB")
        let net_parts: Vec<&str> = parts.get(3).unwrap_or(&"").split('/').collect();
        let network_rx = Self::parse_size(net_parts.get(0).unwrap_or(&"").trim());
        let network_tx = Self::parse_size(net_parts.get(1).unwrap_or(&"").trim());

        // Parse block I/O
        let block_parts: Vec<&str> = parts.get(4).unwrap_or(&"").split('/').collect();
        let block_read = Self::parse_size(block_parts.get(0).unwrap_or(&"").trim());
        let block_write = Self::parse_size(block_parts.get(1).unwrap_or(&"").trim());

        Ok(ContainerStats {
            cpu_percent,
            memory_usage,
            memory_limit,
            memory_percent,
            network_rx,
            network_tx,
            block_read,
            block_write,
        })
    }

    /// Get container logs
    pub fn get_container_logs(container_id: &str, tail: u32) -> Result<ContainerLogs, String> {
        let output = Command::new("docker")
            .args(["logs", container_id, "--tail", &tail.to_string(), "--timestamps"])
            .output()
            .map_err(|e| format!("Failed to get logs: {}", e))?;

        // Docker logs outputs to stderr for some containers
        let logs = if output.stdout.is_empty() {
            String::from_utf8_lossy(&output.stderr).to_string()
        } else {
            String::from_utf8_lossy(&output.stdout).to_string()
        };

        Ok(ContainerLogs {
            logs,
            timestamp: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// Start a container
    pub fn start_container(container_id: &str) -> Result<(), String> {
        let output = Command::new("docker")
            .args(["start", container_id])
            .output()
            .map_err(|e| format!("Failed to start container: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Stop a container
    pub fn stop_container(container_id: &str) -> Result<(), String> {
        let output = Command::new("docker")
            .args(["stop", container_id])
            .output()
            .map_err(|e| format!("Failed to stop container: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Restart a container
    pub fn restart_container(container_id: &str) -> Result<(), String> {
        let output = Command::new("docker")
            .args(["restart", container_id])
            .output()
            .map_err(|e| format!("Failed to restart container: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Remove a container
    pub fn remove_container(container_id: &str, force: bool) -> Result<(), String> {
        let mut args = vec!["rm", container_id];
        if force {
            args.insert(1, "-f");
        }

        let output = Command::new("docker")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to remove container: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// List Docker images
    pub fn list_images() -> Result<Vec<ImageInfo>, String> {
        let output = Command::new("docker")
            .args(["images", "--format", "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"])
            .output()
            .map_err(|e| format!("Failed to list images: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let images: Vec<ImageInfo> = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.split('|').collect();
                ImageInfo {
                    id: parts.get(0).unwrap_or(&"").to_string(),
                    repository: parts.get(1).unwrap_or(&"").to_string(),
                    tag: parts.get(2).unwrap_or(&"").to_string(),
                    size: parts.get(3).unwrap_or(&"").to_string(),
                    created: parts.get(4).unwrap_or(&"").to_string(),
                }
            })
            .collect();

        Ok(images)
    }

    /// Pull a Docker image
    pub fn pull_image(image: &str) -> Result<String, String> {
        let output = Command::new("docker")
            .args(["pull", image])
            .output()
            .map_err(|e| format!("Failed to pull image: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Remove a Docker image
    pub fn remove_image(image_id: &str, force: bool) -> Result<(), String> {
        let mut args = vec!["rmi", image_id];
        if force {
            args.insert(1, "-f");
        }

        let output = Command::new("docker")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to remove image: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Create and start a sandbox container
    pub fn create_sandbox(config: &SandboxConfig) -> Result<String, String> {
        let mut args = vec!["run", "-d", "--name", &config.name];

        // Add port mappings
        for port in &config.ports {
            args.push("-p");
            args.push(port);
        }

        // Add volume mounts
        for volume in &config.volumes {
            args.push("-v");
            args.push(volume);
        }

        // Add environment variables
        for (key, value) in &config.env_vars {
            args.push("-e");
            let env_var = format!("{}={}", key, value);
            args.push(Box::leak(env_var.into_boxed_str()));
        }

        // Add resource limits
        if let Some(ref mem) = config.memory_limit {
            args.push("-m");
            args.push(mem);
        }

        if let Some(cpu) = config.cpu_limit {
            args.push("--cpus");
            let cpu_str = format!("{}", cpu);
            args.push(Box::leak(cpu_str.into_boxed_str()));
        }

        // Add image
        args.push(&config.image);

        let output = Command::new("docker")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to create sandbox: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Execute command in container
    pub fn exec_in_container(container_id: &str, command: &str) -> Result<String, String> {
        let output = Command::new("docker")
            .args(["exec", container_id, "sh", "-c", command])
            .output()
            .map_err(|e| format!("Failed to exec in container: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Prune unused containers
    pub fn prune_containers() -> Result<String, String> {
        let output = Command::new("docker")
            .args(["container", "prune", "-f"])
            .output()
            .map_err(|e| format!("Failed to prune containers: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Prune unused images
    pub fn prune_images() -> Result<String, String> {
        let output = Command::new("docker")
            .args(["image", "prune", "-f"])
            .output()
            .map_err(|e| format!("Failed to prune images: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Helper function to parse size strings (e.g., "100MiB", "1.5GiB")
    fn parse_size(s: &str) -> u64 {
        let s = s.trim();
        if s.is_empty() {
            return 0;
        }

        let (num_str, unit) = if s.ends_with("GiB") || s.ends_with("GB") {
            (s.trim_end_matches("GiB").trim_end_matches("GB"), 1024 * 1024 * 1024)
        } else if s.ends_with("MiB") || s.ends_with("MB") {
            (s.trim_end_matches("MiB").trim_end_matches("MB"), 1024 * 1024)
        } else if s.ends_with("KiB") || s.ends_with("KB") || s.ends_with("kB") {
            (s.trim_end_matches("KiB").trim_end_matches("KB").trim_end_matches("kB"), 1024)
        } else if s.ends_with("B") {
            (s.trim_end_matches("B"), 1)
        } else {
            (s, 1)
        };

        num_str.trim().parse::<f64>().unwrap_or(0.0) as u64 * unit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_size() {
        assert_eq!(DockerManager::parse_size("100MiB"), 100 * 1024 * 1024);
        assert_eq!(DockerManager::parse_size("1.5GiB"), (1.5 * 1024.0 * 1024.0 * 1024.0) as u64);
        assert_eq!(DockerManager::parse_size("500KB"), 500 * 1024);
    }

    #[test]
    fn test_container_status_from_str() {
        assert_eq!(ContainerStatus::from("running"), ContainerStatus::Running);
        assert_eq!(ContainerStatus::from("exited"), ContainerStatus::Exited);
        assert_eq!(ContainerStatus::from("unknown"), ContainerStatus::Stopped);
    }
}
