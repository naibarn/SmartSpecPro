# SmartSpec Pro - Docker Guide

คู่มือการใช้งาน Docker สำหรับโปรเจกต์ SmartSpecPro

## สารบัญ

1. [ภาพรวม](#ภาพรวม)
2. [โครงสร้าง Dockerfile](#โครงสร้าง-dockerfile)
3. [การใช้งาน](#การใช้งาน)
4. [Environment Variables](#environment-variables)
5. [การ Build และ Deploy](#การ-build-และ-deploy)
6. [Troubleshooting](#troubleshooting)

---

## ภาพรวม

โปรเจกต์ SmartSpecPro ประกอบด้วย services ดังนี้:

| Service | Port | Description |
|---------|------|-------------|
| **python-backend** | 8000 | FastAPI backend with LangGraph |
| **smartspec-web** | 3000 | Main web application (Vite + React + tRPC) |
| **docker-status** | 3001 | Docker container monitoring |
| **control-plane** | 7070 | Control plane service |
| **api-generator** | - | API code generation (on-demand) |
| **mysql** | 3306 | MySQL database |
| **postgres** | 5432 | PostgreSQL database |
| **redis** | 6379 | Redis cache |
| **chromadb** | 8001 | Vector store for RAG |

---

## โครงสร้าง Dockerfile

### SmartSpecWeb (`SmartSpecWeb/Dockerfile`)

Multi-stage build สำหรับ Node.js application:
- **Stage 1 (deps)**: ติดตั้ง dependencies
- **Stage 2 (builder)**: Build application
- **Stage 3 (runner)**: Production image

```dockerfile
# Build
docker build -t smartspec-web ./SmartSpecWeb

# Run
docker run -p 3000:3000 smartspec-web
```

### docker-status (`docker-status/Dockerfile`)

เหมือน SmartSpecWeb แต่เพิ่ม Docker CLI และ mount Docker socket:

```dockerfile
# Build
docker build -t docker-status ./docker-status

# Run (ต้อง mount Docker socket)
docker run -p 3001:3001 -v /var/run/docker.sock:/var/run/docker.sock docker-status
```

### python-backend (`python-backend/Dockerfile`)

Multi-stage build สำหรับ Python FastAPI:
- **Stage 1 (builder)**: ติดตั้ง dependencies
- **Stage 2 (runtime)**: Production image

```dockerfile
# Build
docker build -t python-backend ./python-backend

# Run
docker run -p 8000:8000 python-backend
```

### api-generator (`api-generator/Dockerfile`)

สำหรับ generate API code:

```dockerfile
# Build
docker build -t api-generator ./api-generator

# Run
docker run -v $(pwd)/output:/app/output api-generator
```

---

## การใช้งาน

### Quick Start (Infrastructure Only)

```bash
# Start infrastructure services only
docker-compose up -d

# Check status
docker-compose ps
```

### Full Stack

```bash
# Start all services
docker-compose -f docker-compose.full.yml up -d

# View logs
docker-compose -f docker-compose.full.yml logs -f

# Stop all services
docker-compose -f docker-compose.full.yml down
```

### Development Mode

```bash
# Start infrastructure + development environment
docker-compose -f docker-compose.yml up -d
docker-compose -f docker/Dockerfile.dev up -d
```

### Run API Generator (On-demand)

```bash
# Using profile
docker-compose -f docker-compose.full.yml --profile tools up api-generator
```

---

## Environment Variables

สร้างไฟล์ `.env` จาก `.env.example`:

```bash
cp .env.example .env
```

### ตัวแปรสำคัญ

| Variable | Description | Default |
|----------|-------------|---------|
| `MYSQL_PASSWORD` | MySQL password | smartspec123 |
| `POSTGRES_PASSWORD` | PostgreSQL password | smartspec123 |
| `SESSION_SECRET` | Session encryption key | (change in production) |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |

---

## การ Build และ Deploy

### Build Individual Services

```bash
# Build specific service
docker-compose -f docker-compose.full.yml build smartspec-web

# Build all services
docker-compose -f docker-compose.full.yml build
```

### Build with No Cache

```bash
docker-compose -f docker-compose.full.yml build --no-cache
```

### Push to Registry

```bash
# Tag images
docker tag smartspec-web:latest your-registry/smartspec-web:latest

# Push
docker push your-registry/smartspec-web:latest
```

### Production Deployment

```bash
# Pull latest images
docker-compose -f docker-compose.full.yml pull

# Deploy with zero downtime
docker-compose -f docker-compose.full.yml up -d --no-deps --build smartspec-web
```

---

## Troubleshooting

### ปัญหาที่พบบ่อย

#### 1. Database Connection Failed

```bash
# Check if database is ready
docker-compose logs mysql
docker-compose logs postgres

# Restart database
docker-compose restart mysql postgres
```

#### 2. Docker Socket Permission Denied (docker-status)

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Or run with sudo
sudo docker-compose up docker-status
```

#### 3. Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
```

#### 4. Out of Memory

```bash
# Check container memory usage
docker stats

# Increase memory limit in docker-compose.yml
services:
  smartspec-web:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Health Check

```bash
# Check all services health
docker-compose -f docker-compose.full.yml ps

# Check specific service logs
docker-compose -f docker-compose.full.yml logs smartspec-web

# Execute command in container
docker-compose -f docker-compose.full.yml exec smartspec-web sh
```

### Clean Up

```bash
# Remove stopped containers
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# Remove all unused images
docker image prune -a

# Full cleanup
docker system prune -a --volumes
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        SmartSpec Pro                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ SmartSpec   │  │   Docker    │  │  Control    │             │
│  │    Web      │  │   Status    │  │   Plane     │             │
│  │  :3000      │  │   :3001     │  │   :7070     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                    ┌─────┴─────┐                                │
│                    │  Python   │                                │
│                    │  Backend  │                                │
│                    │   :8000   │                                │
│                    └─────┬─────┘                                │
│                          │                                      │
│    ┌─────────────────────┼─────────────────────┐               │
│    │                     │                     │               │
│  ┌─┴───┐  ┌─────┐  ┌────┴────┐  ┌─────────┐  │               │
│  │MySQL│  │Redis│  │PostgreSQL│  │ChromaDB │  │               │
│  │:3306│  │:6379│  │  :5432   │  │  :8001  │  │               │
│  └─────┘  └─────┘  └─────────┘  └─────────┘  │               │
│                                               │               │
│              Infrastructure Layer             │               │
└───────────────────────────────────────────────┴───────────────┘
```

---

## License

MIT License - SmartSpec Team
