# Phase 2: Config & Workflow Management

**Duration:** 3 weeks  
**Status:** 📋 Planning  
**Start Date:** TBD

---

## 🎯 Objectives

Build a comprehensive workflow and configuration management system with:

1. Visual configuration editor
2. Workflow CRUD operations
3. SQLite database integration
4. Validation and error handling

---

## 📋 Tasks

### Week 1: Database & Models

#### Task 2.1: SQLite Integration
- [ ] Add SQLite dependencies (rusqlite, sqlx)
- [ ] Create database schema
- [ ] Implement migrations
- [ ] Add database connection pool
- [ ] Create database service layer

**Schema:**
```sql
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT,
    config TEXT,  -- JSON
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT,
    status TEXT,
    output TEXT,  -- JSON
    started_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE configs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT,
    key TEXT,
    value TEXT,
    type TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);
```

#### Task 2.2: Data Models
- [ ] Define Rust structs for database models
- [ ] Implement CRUD operations
- [ ] Add query builders
- [ ] Create repository pattern
- [ ] Add unit tests

**Models:**
- `Workflow` - workflow metadata
- `Execution` - execution history
- `Config` - configuration key-value pairs

---

### Week 2: Backend API

#### Task 2.3: Workflow Management API
- [ ] Create workflow endpoints
- [ ] Implement CRUD operations
- [ ] Add validation logic
- [ ] Handle errors gracefully
- [ ] Add Tauri commands

**Commands:**
```rust
// Workflow CRUD
create_workflow(name, description, config)
update_workflow(id, name, description, config)
delete_workflow(id)
get_workflow(id)
list_workflows(filter, sort)

// Config management
get_config(workflow_id)
update_config(workflow_id, config)
validate_config(workflow_id, config)

// Execution history
get_executions(workflow_id, limit)
get_execution(id)
delete_execution(id)
```

#### Task 2.4: Validation System
- [ ] Define validation rules
- [ ] Implement validators
- [ ] Add custom error messages
- [ ] Create validation middleware
- [ ] Add tests

**Validation Rules:**
- Required fields
- Type checking
- Format validation
- Range validation
- Custom rules

---

### Week 3: Frontend UI

#### Task 2.5: Workflow Manager UI
- [ ] Create WorkflowManager component
- [ ] Add workflow list with actions
- [ ] Implement create/edit dialog
- [ ] Add delete confirmation
- [ ] Handle loading/error states

**Features:**
- List all workflows
- Search and filter
- Sort by name/date
- Create new workflow
- Edit existing workflow
- Delete workflow
- Duplicate workflow

#### Task 2.6: Config Editor UI
- [ ] Create ConfigEditor component
- [ ] Add form fields for each config type
- [ ] Implement validation UI
- [ ] Add save/cancel buttons
- [ ] Show validation errors

**Config Types:**
- Text input
- Number input
- Boolean checkbox
- Select dropdown
- JSON editor
- File picker

#### Task 2.7: Execution History UI
- [ ] Create ExecutionHistory component
- [ ] List past executions
- [ ] Show execution details
- [ ] Add filters (status, date)
- [ ] Implement pagination

**Features:**
- List executions
- Filter by status
- Filter by date range
- View execution details
- Delete old executions
- Export execution data

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│                                                          │
│  New Components:                                         │
│  • WorkflowManager (CRUD UI)                            │
│  • ConfigEditor (Form UI)                               │
│  • ExecutionHistory (History UI)                        │
│                                                          │
│  New Hooks:                                              │
│  • useWorkflowManager (CRUD operations)                 │
│  • useConfigEditor (Config management)                  │
│  • useExecutionHistory (History queries)                │
└──────────────────┬──────────────────────────────────────┘
                   │ Tauri IPC
                   ↓
┌─────────────────────────────────────────────────────────┐
│                   Rust Backend                           │
│                                                          │
│  New Modules:                                            │
│  • database.rs (SQLite connection)                       │
│  • models.rs (Data models)                              │
│  • repository.rs (CRUD operations)                       │
│  • validation.rs (Validation logic)                      │
│                                                          │
│  New Commands:                                           │
│  • Workflow CRUD (5 commands)                           │
│  • Config management (3 commands)                       │
│  • Execution history (3 commands)                       │
└──────────────────┬──────────────────────────────────────┘
                   │ rusqlite/sqlx
                   ↓
┌─────────────────────────────────────────────────────────┐
│                  SQLite Database                         │
│                                                          │
│  Tables:                                                 │
│  • workflows                                             │
│  • executions                                            │
│  • configs                                               │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Dependencies

### Rust
```toml
[dependencies]
rusqlite = { version = "0.32", features = ["bundled"] }
# OR
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio"] }
chrono = "0.4"
uuid = { version = "1.0", features = ["v4"] }
validator = "0.18"
```

### TypeScript
```json
{
  "dependencies": {
    "react-hook-form": "^7.53.2",
    "zod": "^3.24.1",
    "@hookform/resolvers": "^3.9.1",
    "date-fns": "^4.1.0"
  }
}
```

---

## 🧪 Testing

### Unit Tests
- [ ] Database operations
- [ ] Validation logic
- [ ] CRUD operations
- [ ] Error handling

### Integration Tests
- [ ] End-to-end workflows
- [ ] Database migrations
- [ ] API endpoints
- [ ] UI components

### Manual Tests
- [ ] Create workflow
- [ ] Edit workflow
- [ ] Delete workflow
- [ ] Config validation
- [ ] Execution history

---

## 📊 Success Criteria

### Functional
- ✅ Create/edit/delete workflows
- ✅ Save to database
- ✅ Load from database
- ✅ Validate configurations
- ✅ View execution history

### Non-Functional
- ✅ Database performance < 50ms
- ✅ UI responsive
- ✅ Type-safe
- ✅ Error handling
- ✅ Data persistence

---

## 🚀 Deliverables

1. **Database Layer**
   - SQLite integration
   - Schema and migrations
   - Repository pattern

2. **Backend API**
   - 11 new Tauri commands
   - Validation system
   - Error handling

3. **Frontend UI**
   - 3 new components
   - 3 new hooks
   - Form validation

4. **Documentation**
   - API documentation
   - Database schema
   - User guide

---

## 📈 Metrics

| Metric | Target |
|--------|--------|
| **Duration** | 3 weeks |
| **New Files** | 15+ |
| **Lines of Code** | 2,000+ |
| **Components** | 3 |
| **Hooks** | 3 |
| **Commands** | 11 |
| **Database Tables** | 3 |

---

## 🔗 Related Documents

- [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) - Phase 1 completion
- [PHASE1_SUMMARY.md](./PHASE1_SUMMARY.md) - Phase 1 summary
- [PYTHON_BRIDGE_SPECIFICATION.md](./PYTHON_BRIDGE_SPECIFICATION.md) - Bridge spec

---

**Status:** 📋 Ready to start

**Next:** Begin Task 2.1 - SQLite Integration
