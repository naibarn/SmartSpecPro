# Docker Sandbox Module - Desktop App

## Overview

Docker Sandbox module เป็นฟีเจอร์ใหม่ใน SmartSpec Desktop App สำหรับจัดการ Docker containers บน local PC/Mac เพื่อใช้เป็น sandbox environment สำหรับทดสอบระบบ

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (React)                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  DockerSandbox.tsx                       ││
│  │  - Container List & Management                          ││
│  │  - Image Management                                     ││
│  │  - Sandbox Creation                                     ││
│  │  - Real-time Stats & Logs                               ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  dockerService.ts                        ││
│  │  - TypeScript interface to Tauri commands               ││
│  │  - Type definitions                                     ││
│  │  - Utility functions                                    ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Tauri IPC
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Tauri Backend (Rust)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  docker_manager.rs                       ││
│  │  - Docker CLI integration                               ││
│  │  - Container operations                                 ││
│  │  - Image operations                                     ││
│  │  - Stats & Logs retrieval                               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Docker CLI / Socket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Docker Daemon                             │
│  - Containers                                                │
│  - Images                                                    │
│  - Networks                                                  │
│  - Volumes                                                   │
└─────────────────────────────────────────────────────────────┘
```

## Files Created

### Rust Backend

| File | Description |
|------|-------------|
| `src-tauri/src/docker_manager.rs` | Docker management module with CLI integration |
| `src-tauri/src/lib.rs` | Updated with Docker commands |

### Frontend

| File | Description |
|------|-------------|
| `src/services/dockerService.ts` | TypeScript service for Docker operations |
| `src/pages/DockerSandbox.tsx` | Main Docker management page |
| `src/App.tsx` | Updated with Docker route |
| `src/components/Sidebar.tsx` | Updated with Docker menu item |

## Features

### Container Management

- **List Containers**: View all containers (running and stopped)
- **Start/Stop/Restart**: Control container lifecycle
- **Remove**: Delete containers (with force option)
- **View Logs**: Real-time container logs
- **Stats**: CPU, Memory, Network usage (auto-refresh)

### Image Management

- **List Images**: View all local Docker images
- **Pull Images**: Download images from registry
- **Remove Images**: Delete unused images
- **Prune**: Clean up unused images

### Sandbox Creation

- **Pre-configured Images**: Ubuntu, Node.js, Python, Go, Rust
- **Port Mapping**: Configure host:container port mappings
- **Volume Mounts**: Mount local directories
- **Resource Limits**: Set memory and CPU limits

## Tauri Commands

```rust
// Docker system info
docker_check() -> DockerInfo

// Container operations
docker_list_containers(all: bool) -> Vec<ContainerInfo>
docker_get_container_stats(container_id: String) -> ContainerStats
docker_get_container_logs(container_id: String, tail: u32) -> ContainerLogs
docker_start_container(container_id: String) -> ()
docker_stop_container(container_id: String) -> ()
docker_restart_container(container_id: String) -> ()
docker_remove_container(container_id: String, force: bool) -> ()

// Image operations
docker_list_images() -> Vec<ImageInfo>
docker_pull_image(image: String) -> String
docker_remove_image(image_id: String, force: bool) -> ()

// Sandbox operations
docker_create_sandbox(config: SandboxConfig) -> String
docker_exec_command(container_id: String, command: String) -> String

// Cleanup
docker_prune_containers() -> String
docker_prune_images() -> String
```

## TypeScript Types

```typescript
interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  created: string;
  ports: string[];
  uptime: string;
}

interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
}

interface SandboxConfig {
  name: string;
  image: string;
  ports: string[];
  volumes: string[];
  env_vars: Record<string, string>;
  memory_limit?: string;
  cpu_limit?: number;
}
```

## Usage

### Access Docker Sandbox

1. Open SmartSpec Desktop App
2. Click "🐳 Docker Sandbox" in the sidebar
3. The page will show Docker status and available containers

### Create a Sandbox

1. Go to "➕ Create Sandbox" tab
2. Enter container name
3. Select base image (Ubuntu, Node.js, Python, etc.)
4. Configure port mappings (optional)
5. Configure volume mounts (optional)
6. Set resource limits
7. Click "🚀 Create Sandbox"

### Manage Containers

- **Start**: Click ▶ Start button on stopped containers
- **Stop**: Click ⏹ Stop button on running containers
- **Restart**: Click 🔄 Restart button
- **Logs**: Click 📋 Logs to view container output
- **Remove**: Click 🗑 Remove to delete container

## Requirements

- Docker Desktop installed and running
- Docker CLI available in PATH
- Sufficient disk space for images
- Network access for pulling images

## Differences from docker-status (Server)

| Feature | docker-status (Server) | Docker Sandbox (Desktop) |
|---------|------------------------|--------------------------|
| Purpose | Monitor hosting containers | Manage local sandbox |
| Connection | Docker Socket / CLI | Docker CLI via Tauri |
| UI Framework | React + tRPC | React + Tauri IPC |
| Auth | OAuth required | Desktop app auth |
| Notifications | Webhook/Email | Local only |
| Target | Production monitoring | Development testing |

## Future Enhancements

1. **Docker Compose Support**: Manage multi-container setups
2. **Template Library**: Pre-configured sandbox templates
3. **Shell Access**: Interactive terminal in containers
4. **Network Management**: Create and manage Docker networks
5. **Volume Browser**: Browse and manage container volumes
6. **Resource Monitoring**: Historical charts and alerts
