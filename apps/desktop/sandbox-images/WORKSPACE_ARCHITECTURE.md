# Sandbox Workspace Architecture

## Overview

ระบบ Sandbox Workspace ออกแบบมาเพื่อรองรับการพัฒนาแบบ parallel โดยใช้ Docker containers เป็น isolated environments และ Git branches สำหรับ version control

## Key Requirements

1. **Data Persistence**: ไฟล์ project ต้องไม่หายเมื่อ container ถูกลบ/recreate
2. **Parallel Development**: รองรับการทำงานหลาย tasks/branches พร้อมกัน
3. **Git Integration**: ผูกกับ GitHub แยก branch แล้ว merge เมื่อเสร็จ
4. **Build/Test/Debug**: ใช้ Docker สำหรับ run, build, และ debug

---

## Architecture Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Desktop App (Tauri)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    Workspace Manager UI                              ││
│  │  - Create/Delete Workspaces                                         ││
│  │  - Branch Management                                                ││
│  │  - Container Control                                                ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Workspace Manager Service                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │  Workspace   │  │    Git       │  │   Docker     │                   │
│  │  Registry    │  │  Workflow    │  │  Orchestrator│                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│  Workspace A  │           │  Workspace B  │           │  Workspace C  │
│  (feature-x)  │           │  (bugfix-y)   │           │  (feature-z)  │
├───────────────┤           ├───────────────┤           ├───────────────┤
│ Container A   │           │ Container B   │           │ Container C   │
│ (Node.js)     │           │ (Python)      │           │ (Fullstack)   │
└───────┬───────┘           └───────┬───────┘           └───────┬───────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Persistent Storage Layer                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    ~/SmartSpec/workspaces/                          ││
│  │  ├── project-name/                                                  ││
│  │  │   ├── .git/                    # Git repository                  ││
│  │  │   ├── .workspace/              # Workspace metadata              ││
│  │  │   │   ├── config.json          # Workspace configuration         ││
│  │  │   │   ├── branches.json        # Branch-container mapping        ││
│  │  │   │   └── history.json         # Activity history                ││
│  │  │   └── src/                     # Project source code             ││
│  │  └── another-project/                                               ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Storage Strategy

### 1. Volume Mounting (Recommended)

```yaml
# docker-compose.workspace.yml
services:
  workspace-feature-x:
    image: smartspec/sandbox-nodejs:latest
    volumes:
      # Project files - PERSISTENT
      - ~/SmartSpec/workspaces/my-project:/workspace/project:rw
      
      # Package caches - PERSISTENT (shared across containers)
      - smartspec-npm-cache:/home/sandbox/.npm
      - smartspec-pnpm-cache:/home/sandbox/.local/share/pnpm
      
      # Build artifacts - EPHEMERAL (container-specific)
      - workspace-feature-x-build:/workspace/project/dist
      - workspace-feature-x-node-modules:/workspace/project/node_modules
```

### 2. Directory Structure

```
~/SmartSpec/
├── workspaces/                    # All project workspaces
│   ├── project-alpha/
│   │   ├── .git/                  # Git repository
│   │   ├── .workspace/            # Workspace metadata
│   │   │   ├── config.json
│   │   │   └── containers.json
│   │   └── [project files]
│   └── project-beta/
│
├── cache/                         # Shared package caches
│   ├── npm/
│   ├── pnpm/
│   ├── pip/
│   ├── go/
│   └── cargo/
│
└── config/                        # Global configuration
    ├── workspaces.json            # Workspace registry
    └── settings.json              # User settings
```

---

## Git Branch Workflow

### Branch-Container Mapping

แต่ละ branch สามารถมี container เป็นของตัวเอง:

```json
// .workspace/branches.json
{
  "project": "my-awesome-app",
  "repository": "https://github.com/user/my-awesome-app",
  "branches": {
    "main": {
      "container": null,
      "protected": true,
      "description": "Production branch"
    },
    "develop": {
      "container": "workspace-develop-abc123",
      "image": "smartspec/sandbox-nodejs:latest",
      "ports": ["3000:3000"],
      "status": "running"
    },
    "feature/user-auth": {
      "container": "workspace-feature-auth-def456",
      "image": "smartspec/sandbox-fullstack:latest",
      "ports": ["3001:3000", "8001:8000"],
      "status": "stopped",
      "parent": "develop"
    },
    "feature/api-v2": {
      "container": "workspace-feature-api-ghi789",
      "image": "smartspec/sandbox-python:latest",
      "ports": ["8002:8000"],
      "status": "running",
      "parent": "develop"
    }
  }
}
```

### Workflow Commands

```bash
# Create new feature branch with container
smartspec workspace create-branch feature/new-feature --from develop --image nodejs

# Switch to branch (auto-switches container)
smartspec workspace checkout feature/new-feature

# Run tests in container
smartspec workspace test

# Build project
smartspec workspace build

# Merge branch (stops container, merges, optionally deletes)
smartspec workspace merge feature/new-feature --into develop --delete-branch
```

---

## Container Lifecycle

### States

```
┌──────────┐     create      ┌──────────┐
│  None    │ ───────────────▶│ Created  │
└──────────┘                 └────┬─────┘
                                  │ start
                                  ▼
┌──────────┐     stop        ┌──────────┐
│ Stopped  │ ◀───────────────│ Running  │
└────┬─────┘                 └────┬─────┘
     │ start                      │ restart
     └────────────────────────────┘
     
     │ remove
     ▼
┌──────────┐
│ Removed  │  (data preserved in volume)
└──────────┘
```

### Container Naming Convention

```
smartspec-{project}-{branch}-{short-hash}

Examples:
- smartspec-myapp-develop-a1b2c3
- smartspec-myapp-feature-auth-d4e5f6
- smartspec-myapp-bugfix-login-g7h8i9
```

---

## Parallel Development Flow

### Scenario: Working on Multiple Features

```
                    main
                      │
                      ▼
                   develop
                      │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    feature/A    feature/B    bugfix/C
         │           │           │
    Container A  Container B  Container C
    (Port 3000)  (Port 3001)  (Port 3002)
         │           │           │
         └───────────┼───────────┘
                     ▼
              Merge to develop
                     │
                     ▼
               Deploy/Test
```

### Port Management

```json
// Automatic port allocation
{
  "port_ranges": {
    "web": [3000, 3099],
    "api": [8000, 8099],
    "debug": [9000, 9099]
  },
  "allocated": {
    "3000": "smartspec-myapp-develop",
    "3001": "smartspec-myapp-feature-auth",
    "8000": "smartspec-myapp-develop",
    "8001": "smartspec-myapp-feature-api"
  }
}
```

---

## Implementation Components

### 1. Workspace Manager (Rust/Tauri)

```rust
// src-tauri/src/workspace_manager.rs

pub struct WorkspaceManager {
    workspaces_dir: PathBuf,
    cache_dir: PathBuf,
    docker: DockerManager,
    git: GitManager,
}

impl WorkspaceManager {
    // Workspace operations
    pub fn create_workspace(&self, name: &str, repo_url: &str) -> Result<Workspace>;
    pub fn delete_workspace(&self, name: &str) -> Result<()>;
    pub fn list_workspaces(&self) -> Result<Vec<Workspace>>;
    
    // Branch operations
    pub fn create_branch(&self, workspace: &str, branch: &str, from: &str) -> Result<()>;
    pub fn checkout_branch(&self, workspace: &str, branch: &str) -> Result<()>;
    pub fn merge_branch(&self, workspace: &str, source: &str, target: &str) -> Result<()>;
    
    // Container operations
    pub fn start_container(&self, workspace: &str, branch: &str) -> Result<String>;
    pub fn stop_container(&self, workspace: &str, branch: &str) -> Result<()>;
    pub fn exec_in_container(&self, container_id: &str, cmd: &str) -> Result<String>;
}
```

### 2. Git Workflow Manager

```rust
// src-tauri/src/git_workflow.rs

pub struct GitWorkflow {
    repo_path: PathBuf,
}

impl GitWorkflow {
    pub fn init_repo(&self, remote_url: &str) -> Result<()>;
    pub fn create_feature_branch(&self, name: &str, from: &str) -> Result<()>;
    pub fn checkout(&self, branch: &str) -> Result<()>;
    pub fn commit(&self, message: &str) -> Result<String>;
    pub fn push(&self, branch: &str) -> Result<()>;
    pub fn pull(&self, branch: &str) -> Result<()>;
    pub fn merge(&self, source: &str, target: &str) -> Result<MergeResult>;
    pub fn get_status(&self) -> Result<GitStatus>;
    pub fn get_branches(&self) -> Result<Vec<BranchInfo>>;
}
```

### 3. Docker Orchestrator

```rust
// src-tauri/src/docker_orchestrator.rs

pub struct DockerOrchestrator {
    docker: DockerManager,
    port_allocator: PortAllocator,
}

impl DockerOrchestrator {
    pub fn create_workspace_container(&self, config: ContainerConfig) -> Result<String>;
    pub fn start_container(&self, id: &str) -> Result<()>;
    pub fn stop_container(&self, id: &str) -> Result<()>;
    pub fn remove_container(&self, id: &str, keep_volumes: bool) -> Result<()>;
    pub fn exec(&self, id: &str, cmd: &str) -> Result<ExecResult>;
    pub fn get_logs(&self, id: &str, tail: u32) -> Result<String>;
    pub fn allocate_ports(&self, count: u32) -> Result<Vec<u16>>;
}
```

---

## UI Components

### Workspace Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📁 Workspaces                                            [+ New Project] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 🚀 my-awesome-app                                    [⚙️] [🗑️]     │ │
│  │ github.com/user/my-awesome-app                                     │ │
│  │                                                                    │ │
│  │ Branches:                                                          │ │
│  │ ┌──────────────────────────────────────────────────────────────┐  │ │
│  │ │ 🟢 develop          Container: Running    Port: 3000  [Stop] │  │ │
│  │ │ 🟢 feature/auth     Container: Running    Port: 3001  [Stop] │  │ │
│  │ │ 🔴 feature/api      Container: Stopped    Port: -     [Start]│  │ │
│  │ │ 🔒 main             Protected                         [View] │  │ │
│  │ └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  │ [+ New Branch]  [🔀 Merge]  [📊 Status]  [🖥️ Terminal]            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Branch Detail View

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🌿 feature/user-auth                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Status: 🟢 Running                                                      │
│  Container: smartspec-myapp-feature-auth-d4e5f6                         │
│  Image: smartspec/sandbox-fullstack:latest                              │
│  Ports: 3001:3000, 8001:8000                                            │
│  Created: 2 hours ago                                                    │
│  Parent Branch: develop                                                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Recent Commits:                                                      ││
│  │ • abc1234 - Add login form validation (10 min ago)                  ││
│  │ • def5678 - Create auth service (1 hour ago)                        ││
│  │ • ghi9012 - Initial auth setup (2 hours ago)                        ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  [▶️ Run]  [🔨 Build]  [🧪 Test]  [🐛 Debug]  [🖥️ Terminal]  [🔀 Merge] │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Files

### workspace.config.json

```json
{
  "version": "1.0",
  "workspace": {
    "name": "my-awesome-app",
    "path": "~/SmartSpec/workspaces/my-awesome-app",
    "repository": "https://github.com/user/my-awesome-app",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "defaults": {
    "image": "smartspec/sandbox-nodejs:latest",
    "memory_limit": "2g",
    "cpu_limit": 2,
    "auto_start": true
  },
  "scripts": {
    "install": "pnpm install",
    "dev": "pnpm dev",
    "build": "pnpm build",
    "test": "pnpm test",
    "lint": "pnpm lint"
  },
  "port_mapping": {
    "web": 3000,
    "api": 8000,
    "debug": 9229
  }
}
```

---

## Benefits

1. **Data Safety**: Project files stored outside containers, never lost
2. **Isolation**: Each branch has its own container, no conflicts
3. **Flexibility**: Easy to switch between tasks/branches
4. **Reproducibility**: Same environment for all team members
5. **Resource Efficiency**: Share caches, stop unused containers
6. **Git Integration**: Seamless branch-based workflow

---

## Next Steps

1. Implement WorkspaceManager in Rust (Tauri backend)
2. Create UI components for workspace management
3. Add Git workflow integration
4. Update Docker Sandbox page to support workspaces
5. Create documentation and tutorials
