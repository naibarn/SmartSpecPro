use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::process::Command;

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
            "running" => Self::Running,
            "restarting" => Self::Restarting,
            "paused" => Self::Paused,
            "exited" => Self::Exited,
            "dead" => Self::Dead,
            "created" => Self::Created,
            _ => Self::Stopped,
        }
    }
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerLogs {
    pub logs: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    pub name: String,
    pub image: String,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default)]
    pub volumes: Vec<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    pub memory_limit: Option<String>,
    pub cpu_limit: Option<f64>,
}

/// Validate that an input string is safe for use as a Docker argument.
fn validate_docker_id(s: &str) -> Result<(), String> {
    if s.is_empty() {
        return Err("ID cannot be empty".into());
    }
    if s.len() > 256 {
        return Err("ID too long".into());
    }
    if s.contains(|c: char| c == ';' || c == '&' || c == '|' || c == '$' || c == '`' || c == '\n' || c == '\r') {
        return Err("ID contains invalid characters".into());
    }
    Ok(())
}

fn validate_image_name(s: &str) -> Result<(), String> {
    if s.is_empty() {
        return Err("Image name cannot be empty".into());
    }
    if s.len() > 512 {
        return Err("Image name too long".into());
    }
    if s.contains(|c: char| c == ';' || c == '&' || c == '|' || c == '$' || c == '`' || c == '\n' || c == '\r') {
        return Err("Image name contains invalid characters".into());
    }
    Ok(())
}

async fn run_docker(args: &[&str]) -> Result<String, String> {
    let output = Command::new("docker")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute docker: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if stderr.is_empty() { "Docker command failed".into() } else { stderr })
    }
}

fn parse_size(s: &str) -> u64 {
    let s = s.trim();
    if s.is_empty() {
        return 0;
    }
    let (num_str, unit) = if s.ends_with("GiB") || s.ends_with("GB") {
        (s.trim_end_matches("GiB").trim_end_matches("GB"), 1024u64 * 1024 * 1024)
    } else if s.ends_with("MiB") || s.ends_with("MB") {
        (s.trim_end_matches("MiB").trim_end_matches("MB"), 1024u64 * 1024)
    } else if s.ends_with("KiB") || s.ends_with("KB") || s.ends_with("kB") {
        (s.trim_end_matches("KiB").trim_end_matches("KB").trim_end_matches("kB"), 1024u64)
    } else if s.ends_with('B') {
        (s.trim_end_matches('B'), 1u64)
    } else {
        (s, 1u64)
    };
    num_str.trim().parse::<f64>().unwrap_or(0.0) as u64 * unit
}

#[tauri::command]
pub async fn docker_check() -> Result<DockerInfo, String> {
    let version_output = Command::new("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output()
        .await;

    match version_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let info_output = Command::new("docker")
                .args(["info", "--format",
                    "{{.Containers}}|{{.ContainersRunning}}|{{.ContainersPaused}}|{{.ContainersStopped}}|{{.Images}}|{{.DockerRootDir}}|{{.OSType}}|{{.Architecture}}"])
                .output()
                .await
                .map_err(|e| e.to_string())?;

            if info_output.status.success() {
                let info_str = String::from_utf8_lossy(&info_output.stdout);
                let parts: Vec<&str> = info_str.trim().split('|').collect();
                Ok(DockerInfo {
                    version,
                    containers_total: parts.first().and_then(|s| s.parse().ok()).unwrap_or(0),
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
                    version, available: true, error: Some("Could not get Docker info".into()),
                    containers_total: 0, containers_running: 0, containers_paused: 0,
                    containers_stopped: 0, images: 0, docker_root_dir: String::new(),
                    os_type: String::new(), architecture: String::new(),
                })
            }
        }
        Ok(output) => {
            let error = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(DockerInfo {
                version: String::new(), available: false,
                error: Some(format!("Docker not running: {}", error)),
                containers_total: 0, containers_running: 0, containers_paused: 0,
                containers_stopped: 0, images: 0, docker_root_dir: String::new(),
                os_type: String::new(), architecture: String::new(),
            })
        }
        Err(e) => Ok(DockerInfo {
            version: String::new(), available: false,
            error: Some(format!("Docker not installed: {}", e)),
            containers_total: 0, containers_running: 0, containers_paused: 0,
            containers_stopped: 0, images: 0, docker_root_dir: String::new(),
            os_type: String::new(), architecture: String::new(),
        }),
    }
}

#[tauri::command]
pub async fn docker_list_containers() -> Result<Vec<ContainerInfo>, String> {
    let stdout = run_docker(&["ps", "-a", "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.CreatedAt}}|{{.Ports}}"]).await?;
    let containers = stdout.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let p: Vec<&str> = line.split('|').collect();
            ContainerInfo {
                id: p.first().unwrap_or(&"").to_string(),
                name: p.get(1).unwrap_or(&"").to_string(),
                image: p.get(2).unwrap_or(&"").to_string(),
                uptime: p.get(3).unwrap_or(&"").to_string(),
                status: ContainerStatus::from(*p.get(4).unwrap_or(&"")),
                state: p.get(4).unwrap_or(&"").to_string(),
                created: p.get(5).unwrap_or(&"").to_string(),
                ports: p.get(6).map(|s| s.split(',').map(|x| x.trim().to_string()).collect()).unwrap_or_default(),
            }
        })
        .collect();
    Ok(containers)
}

#[tauri::command]
pub async fn docker_start_container(id: String) -> Result<(), String> {
    validate_docker_id(&id)?;
    run_docker(&["start", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn docker_stop_container(id: String) -> Result<(), String> {
    validate_docker_id(&id)?;
    run_docker(&["stop", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn docker_restart_container(id: String) -> Result<(), String> {
    validate_docker_id(&id)?;
    run_docker(&["restart", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn docker_remove_container(id: String, force: bool) -> Result<(), String> {
    validate_docker_id(&id)?;
    if force {
        run_docker(&["rm", "-f", &id]).await?;
    } else {
        run_docker(&["rm", &id]).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn docker_container_logs(id: String, tail: Option<u32>) -> Result<ContainerLogs, String> {
    validate_docker_id(&id)?;
    let tail_str = tail.unwrap_or(100).to_string();
    let output = Command::new("docker")
        .args(["logs", &id, "--tail", &tail_str, "--timestamps"])
        .output()
        .await
        .map_err(|e| format!("Failed to get logs: {}", e))?;

    let logs = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    Ok(ContainerLogs { logs })
}

#[tauri::command]
pub async fn docker_exec_command(id: String, cmd: String) -> Result<String, String> {
    validate_docker_id(&id)?;
    if cmd.is_empty() {
        return Err("Command cannot be empty".into());
    }
    let output = Command::new("docker")
        .args(["exec", &id, "sh", "-c", &cmd])
        .output()
        .await
        .map_err(|e| format!("Failed to exec: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn docker_list_images() -> Result<Vec<ImageInfo>, String> {
    let stdout = run_docker(&["images", "--format", "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"]).await?;
    let images = stdout.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let p: Vec<&str> = line.split('|').collect();
            ImageInfo {
                id: p.first().unwrap_or(&"").to_string(),
                repository: p.get(1).unwrap_or(&"").to_string(),
                tag: p.get(2).unwrap_or(&"").to_string(),
                size: p.get(3).unwrap_or(&"").to_string(),
                created: p.get(4).unwrap_or(&"").to_string(),
            }
        })
        .collect();
    Ok(images)
}

#[tauri::command]
pub async fn docker_pull_image(name: String) -> Result<String, String> {
    validate_image_name(&name)?;
    run_docker(&["pull", &name]).await
}

#[tauri::command]
pub async fn docker_remove_image(id: String, force: bool) -> Result<(), String> {
    validate_docker_id(&id)?;
    if force {
        run_docker(&["rmi", "-f", &id]).await?;
    } else {
        run_docker(&["rmi", &id]).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn docker_create_sandbox(config: SandboxConfig) -> Result<String, String> {
    validate_image_name(&config.image)?;
    validate_docker_id(&config.name)?;

    let mut cmd = Command::new("docker");
    cmd.arg("run").arg("-d").arg("--name").arg(&config.name);

    for port in &config.ports {
        cmd.arg("-p").arg(port);
    }
    for volume in &config.volumes {
        cmd.arg("-v").arg(volume);
    }
    for (key, value) in &config.env_vars {
        cmd.arg("-e").arg(format!("{}={}", key, value));
    }
    if let Some(ref mem) = config.memory_limit {
        cmd.arg("-m").arg(mem);
    }
    if let Some(cpu) = config.cpu_limit {
        cmd.arg("--cpus").arg(cpu.to_string());
    }
    cmd.arg(&config.image);

    let output = cmd.output().await.map_err(|e| format!("Failed to create sandbox: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn docker_prune() -> Result<String, String> {
    run_docker(&["system", "prune", "-f"]).await
}

#[tauri::command]
pub async fn docker_container_stats(id: String) -> Result<ContainerStats, String> {
    validate_docker_id(&id)?;
    let stdout = run_docker(&["stats", &id, "--no-stream", "--format",
        "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}"]).await?;
    let parts: Vec<&str> = stdout.trim().split('|').collect();

    let cpu_percent = parts.first()
        .and_then(|s| s.trim_end_matches('%').parse::<f64>().ok())
        .unwrap_or(0.0);
    let mem_parts: Vec<&str> = parts.get(1).unwrap_or(&"").split('/').collect();
    let memory_usage = parse_size(mem_parts.first().unwrap_or(&"").trim());
    let memory_limit = parse_size(mem_parts.get(1).unwrap_or(&"").trim());
    let memory_percent = parts.get(2)
        .and_then(|s| s.trim_end_matches('%').parse::<f64>().ok())
        .unwrap_or(0.0);
    let net_parts: Vec<&str> = parts.get(3).unwrap_or(&"").split('/').collect();
    let network_rx = parse_size(net_parts.first().unwrap_or(&"").trim());
    let network_tx = parse_size(net_parts.get(1).unwrap_or(&"").trim());
    let block_parts: Vec<&str> = parts.get(4).unwrap_or(&"").split('/').collect();
    let block_read = parse_size(block_parts.first().unwrap_or(&"").trim());
    let block_write = parse_size(block_parts.get(1).unwrap_or(&"").trim());

    Ok(ContainerStats {
        cpu_percent, memory_usage, memory_limit, memory_percent,
        network_rx, network_tx, block_read, block_write,
    })
}

#[tauri::command]
pub async fn docker_system_info() -> Result<DockerInfo, String> {
    docker_check().await
}
