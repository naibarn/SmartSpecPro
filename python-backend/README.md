# SmartSpec Pro - Python Backend

**Phase 0: Technical Foundation**

## Overview

Python backend for SmartSpec Pro, providing:
- LLM Proxy system (multi-provider support)
- LangGraph orchestration (state management, checkpoints, parallel execution)
- Workflow execution engine
- Autopilot system

## Architecture

```
python-backend/
├── app/
│   ├── api/              # FastAPI routes
│   ├── core/             # Core configuration
│   ├── models/           # Database models
│   ├── services/         # Business logic
│   ├── llm_proxy/        # LLM Proxy system
│   ├── orchestrator/     # LangGraph orchestrator
│   ├── workflow_engine/  # Workflow execution
│   └── utils/            # Utilities
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── config/
│   ├── providers/        # LLM provider configs
│   └── workflows/        # Workflow definitions
└── scripts/              # Utility scripts
```

## Setup

### 1. Create Virtual Environment

```bash
cd /home/ubuntu/SmartSpec/python-backend
python3.11 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 4. Initialize Database

```bash
alembic upgrade head
```

### 5. Run Development Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/smartspec

# Redis
REDIS_URL=redis://localhost:6379/0

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk_...

# Security
SECRET_KEY=...
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# App
DEBUG=true
LOG_LEVEL=INFO
```

## API Endpoints

### Health Check
```
GET /health
```

### LLM Proxy
```
POST /api/v1/llm/invoke
POST /api/v1/llm/providers
GET /api/v1/llm/providers
```

### Orchestrator
```
POST /api/v1/orchestrator/execute
GET /api/v1/orchestrator/status/{execution_id}
POST /api/v1/orchestrator/resume/{checkpoint_id}
```

### Workflows
```
GET /api/v1/workflows
POST /api/v1/workflows/execute
GET /api/v1/workflows/{workflow_id}/report
```

### Autopilot
```
POST /api/v1/autopilot/start
GET /api/v1/autopilot/status/{session_id}
POST /api/v1/autopilot/stop/{session_id}
```

## Development

### Run Tests

```bash
pytest
```

### Run with Coverage

```bash
pytest --cov=app --cov-report=html
```

### Format Code

```bash
black app tests
isort app tests
```

### Lint

```bash
flake8 app tests
mypy app
```

## Phase 0 Implementation Status

### 0.1 Python Backend Setup ✅
- [x] Project structure
- [x] Dependencies
- [x] Configuration
- [ ] Database models
- [ ] Basic API endpoints

### 0.2 LLM Proxy System 🚧
- [ ] LLMProxy class
- [ ] Provider integrations
- [ ] Selection logic
- [ ] Cost tracking

### 0.3 LangGraph Integration 📋
- [ ] State management
- [ ] Checkpoint system
- [ ] Parallel execution
- [ ] Validation framework

### 0.4 Security & Error Handling 📋
- [ ] Input sanitization
- [ ] API key management
- [ ] Error recovery
- [ ] Logging

## License

MIT
