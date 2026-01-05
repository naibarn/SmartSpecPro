# SmartSpec Pro

**Modern Desktop UI for Kilo Code CLI**

A beautiful, feature-rich desktop application built with Tauri, React, and Rust that provides a modern interface for the Kilo Code CLI workflow automation tool.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)
![React](https://img.shields.io/badge/React-18-blue)
![Rust](https://img.shields.io/badge/Rust-1.70+-orange)

---

## ✨ Features

### Core Features ✅
- **Workflow Runner** - Execute Kilo Code workflows with a modern UI
- **Real-time Output** - Stream workflow output in real-time
- **Workflow Management** - Create, edit, and delete workflows
- **Execution History** - Track all workflow executions
- **Natural Language Input** - Describe tasks in plain English
- **SQLite Database** - Persistent storage for workflows and executions

### UI Features ✅
- **Tab Navigation** - Switch between Runner, Manager, and History
- **Search & Filter** - Find workflows and executions quickly
- **Modal Dialogs** - Clean, intuitive dialogs for all actions
- **Status Badges** - Color-coded status indicators
- **Loading States** - Clear feedback during operations
- **Error Handling** - Graceful error messages

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22+ (with pnpm)
- **Rust** 1.70+
- **Python** 3.11+ (for Kilo Code CLI)
- **Kilo Code CLI** installed and configured

### Installation

```bash
# Clone repository
git clone <repository-url>
cd smartspecpro

# Install dependencies
pnpm install

# Increase file descriptor limit (macOS/Linux)
ulimit -n 4096

# Run in development mode
pnpm tauri dev
```

### Build for Production

```bash
# Build application
pnpm tauri build

# Output will be in src-tauri/target/release/bundle/
```

---

## 📚 Documentation

- [Quick Start Guide](./QUICKSTART.md) - Get started in 5 minutes
- [Phase 1 Complete](./PHASE1_COMPLETE.md) - Core integration
- [Phase 2 Complete](./PHASE2_COMPLETE.md) - Workflow management
- [Phase 3 Plan](./PHASE3_PLAN.md) - Natural language features

---

## 🎯 Usage

### Workflow Runner

1. Select a workflow from the sidebar
2. Fill in the required parameters
3. Click "Run Workflow"
4. Watch real-time output
5. Stop anytime with "Stop" button

### Natural Language Input

1. Type your request in plain English:
   - "Generate a spec for user authentication"
   - "Validate the API spec in specs/api.yaml"
2. Click "Translate" to see the command
3. Review the translated command
4. Click "Execute" to run

### Workflow Manager

1. Click "Workflow Manager" tab
2. Search for workflows or click "+ New Workflow"
3. Fill in name, description, and JSON config
4. Save to create or update
5. Edit or delete existing workflows

### Execution History

1. Click "Execution History" tab
2. Filter by status (all, running, completed, failed, stopped)
3. Click any execution to view details
4. Use "Cleanup" to delete old executions

---

## 🏗️ Architecture

```
React Frontend (TypeScript + Tailwind CSS)
    ↓ Tauri IPC
Tauri Commands (18 commands)
    ↓
Repository Layer (Rust)
    ↓ rusqlite
SQLite Database (4 tables)
```

### Components
- **WorkflowRunner** - Execute workflows with real-time output
- **WorkflowManager** - CRUD operations for workflows
- **ExecutionHistory** - Track and manage executions
- **NaturalLanguageInput** - Natural language to command translation
- **OutputViewer** - Real-time output streaming

### Hooks
- **useWorkflows** - List and manage workflows
- **useWorkflowExecution** - Execute and monitor workflows
- **useWorkflowDatabase** - Workflow CRUD operations
- **useExecutionDatabase** - Execution management

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| **Total Files** | 41 |
| **Components** | 5 |
| **Hooks** | 4 |
| **Tauri Commands** | 18 |
| **Database Tables** | 4 |
| **Bundle Size** | 232 KB (69 KB gzipped) |
| **Build Time** | < 2s (frontend) |

---

## 🛠️ Development

### Project Structure

```
smartspecpro/
├── src/                      # Frontend (React + TypeScript)
│   ├── components/           # UI components (5)
│   ├── hooks/                # React hooks (4)
│   ├── services/             # Services (OpenAI)
│   ├── types/                # TypeScript types
│   └── App.tsx               # Main app
├── src-tauri/                # Backend (Rust + Tauri)
│   ├── python/               # Python bridge
│   ├── src/                  # Rust source
│   ├── schema.sql            # Database schema
│   └── Cargo.toml            # Dependencies
└── docs/                     # Documentation
```

### Tech Stack

**Frontend:** React 18, TypeScript, Tailwind CSS, Vite  
**Backend:** Rust, Tauri 2, rusqlite, tokio  
**Database:** SQLite (4 tables)

### Commands

```bash
# Development
pnpm tauri dev              # Run in dev mode
pnpm build                  # Build frontend
pnpm tauri build            # Build application

# Testing
cd src-tauri && cargo test  # Run Rust tests
```

---

## 🐛 Known Issues

1. **No Config Editor UI** - Config management via workflow JSON only
2. **No Pagination** - Lists show all results (with limits)
3. **No Real-time Updates** - Need manual refresh
4. **Database Path** - Hardcoded to `./smartspecpro.db`

---

## 🚀 Future Enhancements

- LLM Proxy Server integration
- Multi-tab execution
- Execution queue
- Workflow templates
- Auto-update
- Export functionality

---

## 📝 License

MIT License

---

**Built with ❤️ using Tauri, React, and Rust**
