# Docker Environment Support Report

## Overview

เพิ่มการรองรับ Docker environment สำหรับ SmartSpec Pro เพื่อจำลองสภาพแวดล้อม Ubuntu/Linux ที่เหมือนกับ production

## สิ่งที่สร้างใหม่

### 1. Docker Configuration Files

| File | Description |
|------|-------------|
| `docker/Dockerfile.dev` | Development container image (Ubuntu 22.04 + Node.js + Python) |
| `docker/docker-compose.dev.yml` | Full development stack (PostgreSQL, Redis, ChromaDB, Ollama) |

### 2. Docker Scripts

| Script | Description |
|--------|-------------|
| `docker/scripts/docker-dev.sh` | Environment management (setup, up, down, shell, etc.) |
| `docker/scripts/dockersh` | Command wrapper for Kilo CLI integration |

### 3. Backend Integration

| File | Changes |
|------|---------|
| `app/services/docker_executor.py` | New Docker execution module |
| `app/services/kilo_session_manager.py` | Added Docker execution support |

## Architecture

### Approach A: Kilo on Host, Commands in Docker (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│ Host Machine                                                 │
│  ┌─────────────────────┐                                    │
│  │ VS Code + Kilo Code │                                    │
│  │ Extension           │                                    │
│  └──────────┬──────────┘                                    │
│             │ dockersh wrapper                              │
│             ▼                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Docker Container (smartspec-dev)                     │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │ Ubuntu 22.04                                 │    │   │
│  │  │ - Node.js 20, Python 3.11                    │    │   │
│  │  │ - Git, npm, pnpm, pip                        │    │   │
│  │  │ - Project mounted at /workspace              │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Approach B: Everything in Docker

สำหรับ CI/CD หรือ production-like testing ทุกอย่างรันใน container

## Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| smartspec-dev | - | Main development container |
| postgres | 5432 | Database |
| redis | 6379 | Cache |
| chromadb | 8000 | Vector DB |
| ollama | 11434 | Local LLM (optional) |

## DockerExecutor Module

### Features

- **Auto-detection**: ตรวจจับว่ารันใน container หรือไม่
- **Path translation**: แปลง host path ↔ container path
- **Dual execution**: รันได้ทั้งบน host และใน container
- **Timeout handling**: จัดการ timeout อัตโนมัติ

### Usage

```python
from app.services.docker_executor import DockerExecutor, DockerConfig

config = DockerConfig(
    container_name="smartspec-dev",
    user="devuser",
    workdir="/workspace",
)

executor = DockerExecutor(config)

# Execute command
exit_code, stdout, stderr = await executor.execute(
    command=["npm", "test"],
    cwd="/path/to/project",
    timeout=300,
)
```

## KiloSessionManager Docker Integration

### Configuration

```python
from app.services.kilo_session_manager import KiloConfig, KiloSessionManager

config = KiloConfig(
    use_docker=True,
    docker_container="smartspec-dev",
    docker_user="devuser",
    docker_workdir="/workspace",
)

manager = KiloSessionManager(config)
```

### Execution Flow

1. สร้าง session ด้วย workspace path
2. ถ้า `use_docker=True` จะใช้ DockerExecutor
3. DockerExecutor แปลง path และรัน command ใน container
4. ผลลัพธ์ถูกส่งกลับมายัง host

## Quick Start

```bash
# 1. Setup (first time)
./docker/scripts/docker-dev.sh setup

# 2. Start environment
./docker/scripts/docker-dev.sh up

# 3. Enter container
./docker/scripts/docker-dev.sh shell

# 4. Run tests
cd /workspace/python-backend
python -m pytest tests/

# 5. Stop when done
./docker/scripts/docker-dev.sh down
```

## Files Created

```
SmartSpec/
├── docker/
│   ├── Dockerfile.dev           (450 lines)
│   ├── docker-compose.dev.yml   (200 lines)
│   ├── README.md                (documentation)
│   └── scripts/
│       ├── docker-dev.sh        (300 lines)
│       └── dockersh             (100 lines)
└── python-backend/
    └── app/services/
        └── docker_executor.py   (500 lines)
```

## Benefits

1. **Consistent Environment**: ทุกคนใช้ environment เดียวกัน
2. **Production Parity**: เหมือน production มากที่สุด
3. **Isolated Dependencies**: ไม่กระทบ host system
4. **Easy Onboarding**: setup ง่าย ใช้ได้ทันที
5. **CI/CD Ready**: ใช้ image เดียวกันใน CI/CD

## Next Steps

1. ทดสอบกับ Kilo Code CLI จริง
2. เพิ่ม GPU support สำหรับ Ollama
3. สร้าง production Dockerfile
4. เพิ่ม health checks และ monitoring
