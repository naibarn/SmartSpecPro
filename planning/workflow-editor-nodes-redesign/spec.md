# Workflow Editor Node System Redesign

## Problem Statement

The current workflow editor (WorkflowEditor.tsx) has nodes that are non-functional templates. They look like workflow nodes but cannot actually execute real work. The system needs a complete redesign to make nodes production-ready and fully functional, comparable to industry-standard workflow builders like n8n.

## Current Issues

### 1. Template Management
- Example workflows are **hardcoded** as a static array in WorkflowEditor.tsx (lines 114-260)
- No database storage for templates
- No lazy loading, search, filter, or pagination
- Adding new templates requires code changes + redeployment
- Templates shown in sidebar take up space with no collapsibility

### 2. Missing Compile Button
- The code references `compileMutation = trpc.workflow.compile.useMutation()` but there is no visible "Compile to Manifest" button in the UI
- Only "Save" and "Run" buttons exist in the header

### 3. Non-functional Node Types

**LLM Call Node:**
- No real input configuration (no prompt template with variable binding)
- No model selection from available LLM providers in the system
- No temperature, max tokens, or other parameter controls
- No way to reference outputs from previous nodes
- No input/output schema definition

**Approval Gate Node:**
- Only has `approvers: ['admin']` and `timeout: 30` as config
- No connection to the actual user/role system in the database
- No way to select real users or roles as approvers
- No integration with the ApprovalDBService backend

**Conditional Node:**
- Has a simple text field for "Condition Expression"
- No reference to available variables from previous node outputs
- No expression builder or helper
- User cannot know what variables are available
- No validation of expressions

**Loop Node:**
- Only configures "Max Iterations" count
- No loop variable definition
- No break/continue condition
- No way to define what data to iterate over
- No exit condition logic

**Generate Image Node:**
- Basic image model and prompt fields
- No connection to actual media generation services
- No image size, quality, or style options

### 4. No Data Flow Between Nodes
- Nodes don't define typed inputs and outputs
- No way to reference previous node results in subsequent nodes
- No variable system or data mapping between nodes

## Requirements

### Research Phase
1. **Research n8n node architecture** - Understand how n8n defines nodes with:
   - Typed inputs and outputs
   - Credential management
   - Data flow between nodes
   - Node execution logic
   - Error handling per node

2. **Research other workflow builders** (optional):
   - Langflow (LLM-specific workflow builder)
   - Flowise (LLM chain builder)
   - Temporal (workflow orchestration)

### Design Goals
1. Each node type must have **real, configurable parameters** connected to actual backend services
2. Nodes must define **typed inputs and outputs** so data can flow between them
3. **Variable references** - nodes should be able to reference outputs from previous nodes
4. **Template management** should be database-backed with search/filter/pagination
5. The **Compile** step should validate the workflow and produce a manifest the Python backend can execute
6. **Node configuration panels** should show real options based on the system's actual capabilities (available models, users, roles, etc.)

### Integration Points
- **LLM Node** → connects to existing multi-provider LLM system (python-backend/app/services/)
- **Approval Node** → connects to ApprovalDBService and user/role system
- **Conditional Node** → needs expression engine with access to workflow state
- **Loop Node** → needs iteration logic with data collection support
- **Generate Image Node** → connects to existing media generation services (Celery workers)

## Target Files
- `apps/web/client/src/pages/WorkflowEditor.tsx` - Main editor component
- `apps/web/client/src/pages/Workflows.tsx` - Workflow listing page
- `apps/web/server/routers/` - tRPC routers for workflow operations
- `python-backend/app/api/` - FastAPI endpoints
- `python-backend/app/orchestrator/` - Workflow execution engine
- `python-backend/app/services/` - Backend services

## Constraints
- Must work with existing ReactFlow v11 setup
- Must integrate with existing authentication and multi-tenancy
- No breaking changes to existing database schema (additive only)
- Python backend uses FastAPI + SQLAlchemy async
- Frontend uses React 19 + tRPC + TanStack Query
