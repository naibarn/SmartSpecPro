# Sprint 1.4: Job & Branch Management

**Duration:** 1.5 สัปดาห์ (7-10 วันทำงาน)  
**Priority:** High  
**Dependencies:** Sprint 1.1 (SQLite), Sprint 1.2 (Memory), Sprint 1.3 (OpenCode UI)  

---

## 🎯 Sprint Goal

สร้างระบบ Job & Branch Management ที่ทำให้ **1 Tab = 1 Job = 1 Branch** เพื่อรองรับการทำงานแบบ parallel development โดยแต่ละ job จะมี branch, memory context, และ checkpoints แยกกัน

---

## 📋 User Stories

### US-1.4.1: Job Creation
> **As a** developer  
> **I want** to create a new job with automatic branch creation  
> **So that** I can work on features in isolation

**Acceptance Criteria:**
- [ ] สร้าง job ใหม่ได้จาก UI
- [ ] Branch ถูกสร้างอัตโนมัติ
- [ ] Job มี dedicated tab
- [ ] Working memory ถูก initialize

### US-1.4.2: Parallel Jobs
> **As a** developer  
> **I want** to work on multiple jobs simultaneously  
> **So that** I can switch between tasks efficiently

**Acceptance Criteria:**
- [ ] เปิดหลาย jobs พร้อมกันได้
- [ ] แต่ละ job มี context แยกกัน
- [ ] Switch ระหว่าง jobs ได้เร็ว
- [ ] Memory ไม่ปนกัน

### US-1.4.3: Checkpoint Management
> **As a** developer  
> **I want** checkpoints to sync with git commits  
> **So that** I can track progress and rollback if needed

**Acceptance Criteria:**
- [ ] Checkpoint สร้างอัตโนมัติเมื่อ commit
- [ ] Rollback ไป checkpoint ก่อนหน้าได้
- [ ] ดู checkpoint history ได้
- [ ] Compare checkpoints ได้

### US-1.4.4: Job Completion & Merge
> **As a** developer  
> **I want** to complete a job and merge to target branch  
> **So that** my work is integrated properly

**Acceptance Criteria:**
- [ ] Mark job as complete ได้
- [ ] Merge to target branch ได้
- [ ] Resolve conflicts ได้
- [ ] Archive completed jobs

### US-1.4.5: Job Status Tracking
> **As a** developer  
> **I want** to see job status and progress  
> **So that** I know what's done and what's pending

**Acceptance Criteria:**
- [ ] ดู job status (draft, in_progress, review, completed)
- [ ] ดู task completion percentage
- [ ] ดู time spent
- [ ] ดู recent activity

---

## 🏗️ Technical Architecture

### Core Concept: 1 Tab = 1 Job = 1 Branch

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DESKTOP APP                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  TABS                                                                        ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        ││
│  │  │ 🔵 Auth API  │ │ 🟡 Dashboard │ │ 🟢 Bug #123  │ │     [+]      │        ││
│  │  │ feature/auth │ │ feature/dash │ │ fix/bug-123  │ │   New Job    │        ││
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  ACTIVE JOB: Auth API                                                        ││
│  │  Branch: feature/auth-api                                                    ││
│  │  Status: 🔵 In Progress (65%)                                                ││
│  │                                                                               ││
│  │  ┌─────────────────────────────────────────────────────────────────────────┐││
│  │  │  OpenCode CLI / LLM Chat / Terminal                                      │││
│  │  │  (All using this job's context & memory)                                 │││
│  │  └─────────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Job Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              JOB LIFECYCLE                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐      ┌─────────────┐      ┌──────────┐      ┌───────────┐
    │  DRAFT   │ ───► │ IN_PROGRESS │ ───► │  REVIEW  │ ───► │ COMPLETED │
    └──────────┘      └─────────────┘      └──────────┘      └───────────┘
         │                   │                   │                  │
         │                   │                   │                  │
         ▼                   ▼                   ▼                  ▼
    ┌──────────┐      ┌─────────────┐      ┌──────────┐      ┌───────────┐
    │ Planning │      │   Coding    │      │  Testing │      │  Merged   │
    │ Spec     │      │   Testing   │      │  Review  │      │  Archived │
    │ Tasks    │      │   Debug     │      │  Fixes   │      │           │
    └──────────┘      └─────────────┘      └──────────┘      └───────────┘
```

### Job Data Model

```typescript
interface Job {
  id: string;                    // UUID
  workspace_id: string;          // Parent workspace
  
  // Basic info
  name: string;                  // "Implement Auth API"
  description: string;
  type: JobType;                 // feature, bugfix, refactor, docs
  
  // Git integration
  branch_name: string;           // "feature/auth-api"
  base_branch: string;           // "develop"
  
  // Status
  status: JobStatus;             // draft, in_progress, review, completed, archived
  progress: number;              // 0-100
  
  // Tasks
  tasks: Task[];
  completed_tasks: number;
  total_tasks: number;
  
  // Memory context
  working_memory_ids: string[];  // Pinned memory items
  
  // Checkpoints
  checkpoints: Checkpoint[];
  current_checkpoint_id: string;
  
  // Metadata
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  time_spent_minutes: number;
  
  // Related
  spec_id: string | null;        // Link to specification
  parent_job_id: string | null;  // For sub-jobs
}

enum JobType {
  Feature = 'feature',
  Bugfix = 'bugfix',
  Refactor = 'refactor',
  Docs = 'docs',
  Chore = 'chore',
}

enum JobStatus {
  Draft = 'draft',
  InProgress = 'in_progress',
  Review = 'review',
  Completed = 'completed',
  Archived = 'archived',
  Cancelled = 'cancelled',
}

interface Task {
  id: string;
  job_id: string;
  title: string;
  description: string;
  status: TaskStatus;            // pending, in_progress, completed, blocked
  priority: number;              // 1-5
  estimated_minutes: number;
  actual_minutes: number;
  files: string[];               // Related files
  checkpoint_id: string | null;  // Completed at checkpoint
  created_at: Date;
  completed_at: Date | null;
}

interface Checkpoint {
  id: string;
  job_id: string;
  name: string;                  // "Implemented login endpoint"
  description: string;
  
  // Git
  commit_hash: string;
  commit_message: string;
  
  // State snapshot
  files_changed: string[];
  tasks_completed: string[];
  memory_snapshot: MemorySnapshot;
  
  // Metadata
  created_at: Date;
  is_auto: boolean;              // Auto-created on commit
}
```

### Branch Naming Convention

```typescript
const BRANCH_PATTERNS = {
  feature: 'feature/{job-slug}',      // feature/auth-api
  bugfix: 'fix/{issue-id}-{slug}',    // fix/123-null-pointer
  refactor: 'refactor/{slug}',        // refactor/database-layer
  docs: 'docs/{slug}',                // docs/api-reference
  chore: 'chore/{slug}',              // chore/update-deps
};

// Examples:
// Job: "Implement User Authentication API"
// Branch: feature/implement-user-authentication-api

// Job: "Fix bug #123: Null pointer in auth"
// Branch: fix/123-null-pointer-in-auth
```

### Checkpoint ↔ Commit Sync

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CHECKPOINT ↔ COMMIT SYNC                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

                    CHECKPOINT                              GIT COMMIT
                    ──────────                              ──────────
                         │                                       │
    ┌────────────────────┼───────────────────────────────────────┼────────────────┐
    │                    │                                       │                │
    │   User Action      │                                       │                │
    │   ───────────      │                                       │                │
    │                    ▼                                       │                │
    │   1. /commit   ──► Create Checkpoint ──────────────────────┼──► git commit  │
    │                    (auto-capture state)                    │                │
    │                                                            │                │
    │   2. Manual    ──► Create Checkpoint ──────────────────────┼──► git commit  │
    │      Checkpoint    (with custom name)                      │    (optional)  │
    │                                                            │                │
    │   3. git commit ◄──────────────────────────────────────────┼─── Detect      │
    │      (external)    Create Checkpoint                       │    commit      │
    │                    (auto from commit)                      │                │
    │                                                            │                │
    └────────────────────────────────────────────────────────────────────────────┘

    Checkpoint Contents:
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │  • Commit hash                                                               │
    │  • Files changed (diff)                                                      │
    │  • Tasks completed since last checkpoint                                     │
    │  • Memory snapshot (working memory state)                                    │
    │  • Timestamp                                                                 │
    └─────────────────────────────────────────────────────────────────────────────┘
```

### Tab Management

```typescript
interface TabState {
  id: string;
  job_id: string;
  job_name: string;
  branch_name: string;
  status: JobStatus;
  is_active: boolean;
  is_dirty: boolean;              // Has unsaved changes
  last_accessed: Date;
  
  // UI state
  layout: LayoutState;
  scroll_positions: Record<string, number>;
  open_files: string[];
  active_file: string | null;
}

interface TabManager {
  tabs: TabState[];
  active_tab_id: string;
  max_tabs: number;               // Default: 10
  
  // Actions
  createTab(job: Job): TabState;
  closeTab(tabId: string): void;
  switchTab(tabId: string): void;
  reorderTabs(fromIndex: number, toIndex: number): void;
  
  // Persistence
  saveTabState(): void;
  restoreTabState(): void;
}
```

---

## 📁 Implementation Tasks

### Week 1: Core Job Management

#### Day 1-2: Job Service

##### Task 1.4.1: Job Manager (Rust)
**File:** `desktop-app/src-tauri/src/job/job_manager.rs`

```rust
pub struct JobManager {
    db: Arc<DatabaseManager>,
    git_service: Arc<GitService>,
    memory_service: Arc<MemoryService>,
}

impl JobManager {
    // Create job
    pub async fn create_job(&self, input: CreateJobInput) -> Result<Job> {
        // 1. Validate input
        // 2. Generate branch name
        // 3. Create git branch
        // 4. Insert job record
        // 5. Initialize working memory
        // 6. Create initial checkpoint
        Ok(job)
    }
    
    // Get job
    pub async fn get_job(&self, job_id: &str) -> Result<Job>;
    
    // List jobs
    pub async fn list_jobs(&self, workspace_id: &str, filter: JobFilter) -> Result<Vec<Job>>;
    
    // Update job
    pub async fn update_job(&self, job_id: &str, input: UpdateJobInput) -> Result<Job>;
    
    // Delete job
    pub async fn delete_job(&self, job_id: &str, delete_branch: bool) -> Result<()>;
    
    // Change status
    pub async fn change_status(&self, job_id: &str, status: JobStatus) -> Result<Job>;
    
    // Start job (draft -> in_progress)
    pub async fn start_job(&self, job_id: &str) -> Result<Job>;
    
    // Complete job
    pub async fn complete_job(&self, job_id: &str) -> Result<Job>;
    
    // Archive job
    pub async fn archive_job(&self, job_id: &str) -> Result<Job>;
}

pub struct CreateJobInput {
    pub workspace_id: String,
    pub name: String,
    pub description: String,
    pub job_type: JobType,
    pub base_branch: String,
    pub spec_id: Option<String>,
    pub initial_tasks: Vec<CreateTaskInput>,
}
```

**Deliverables:**
- [ ] Job CRUD operations
- [ ] Status transitions
- [ ] Branch creation
- [ ] Working memory initialization

##### Task 1.4.2: Task Manager (Rust)
**File:** `desktop-app/src-tauri/src/job/task_manager.rs`

```rust
pub struct TaskManager {
    db: Arc<DatabaseManager>,
}

impl TaskManager {
    // Create task
    pub async fn create_task(&self, job_id: &str, input: CreateTaskInput) -> Result<Task>;
    
    // Get task
    pub async fn get_task(&self, task_id: &str) -> Result<Task>;
    
    // List tasks
    pub async fn list_tasks(&self, job_id: &str, filter: TaskFilter) -> Result<Vec<Task>>;
    
    // Update task
    pub async fn update_task(&self, task_id: &str, input: UpdateTaskInput) -> Result<Task>;
    
    // Delete task
    pub async fn delete_task(&self, task_id: &str) -> Result<()>;
    
    // Complete task
    pub async fn complete_task(&self, task_id: &str) -> Result<Task>;
    
    // Reorder tasks
    pub async fn reorder_tasks(&self, job_id: &str, task_ids: Vec<String>) -> Result<()>;
    
    // Bulk create from plan
    pub async fn create_from_plan(&self, job_id: &str, plan: &str) -> Result<Vec<Task>>;
}
```

**Deliverables:**
- [ ] Task CRUD operations
- [ ] Status management
- [ ] Reordering
- [ ] Bulk creation

##### Task 1.4.3: Checkpoint Manager (Rust)
**File:** `desktop-app/src-tauri/src/job/checkpoint_manager.rs`

```rust
pub struct CheckpointManager {
    db: Arc<DatabaseManager>,
    git_service: Arc<GitService>,
    memory_service: Arc<MemoryService>,
}

impl CheckpointManager {
    // Create checkpoint
    pub async fn create_checkpoint(&self, job_id: &str, input: CreateCheckpointInput) -> Result<Checkpoint> {
        // 1. Get current git state
        // 2. Capture memory snapshot
        // 3. Record completed tasks
        // 4. Create checkpoint record
        // 5. Optionally create git commit
        Ok(checkpoint)
    }
    
    // Create from commit (auto)
    pub async fn create_from_commit(&self, job_id: &str, commit_hash: &str) -> Result<Checkpoint>;
    
    // Get checkpoint
    pub async fn get_checkpoint(&self, checkpoint_id: &str) -> Result<Checkpoint>;
    
    // List checkpoints
    pub async fn list_checkpoints(&self, job_id: &str) -> Result<Vec<Checkpoint>>;
    
    // Rollback to checkpoint
    pub async fn rollback(&self, checkpoint_id: &str) -> Result<()> {
        // 1. Git reset to commit
        // 2. Restore memory snapshot
        // 3. Update task statuses
        // 4. Update job state
        Ok(())
    }
    
    // Compare checkpoints
    pub async fn compare(&self, from_id: &str, to_id: &str) -> Result<CheckpointDiff>;
    
    // Delete checkpoint
    pub async fn delete_checkpoint(&self, checkpoint_id: &str) -> Result<()>;
}

pub struct MemorySnapshot {
    pub working_memory: Vec<MemoryItem>,
    pub pinned_ids: Vec<String>,
    pub recent_knowledge_ids: Vec<String>,
}
```

**Deliverables:**
- [ ] Checkpoint creation
- [ ] Auto-create from commit
- [ ] Rollback functionality
- [ ] Memory snapshot

#### Day 3-4: Branch Integration

##### Task 1.4.4: Branch Manager (Rust)
**File:** `desktop-app/src-tauri/src/job/branch_manager.rs`

```rust
pub struct BranchManager {
    git_service: Arc<GitService>,
    job_manager: Arc<JobManager>,
}

impl BranchManager {
    // Create branch for job
    pub async fn create_job_branch(&self, job: &Job) -> Result<String> {
        let branch_name = self.generate_branch_name(job);
        self.git_service.create_branch(&branch_name, &job.base_branch).await?;
        self.git_service.switch_branch(&branch_name).await?;
        Ok(branch_name)
    }
    
    // Generate branch name
    fn generate_branch_name(&self, job: &Job) -> String {
        let slug = slugify(&job.name);
        match job.job_type {
            JobType::Feature => format!("feature/{}", slug),
            JobType::Bugfix => format!("fix/{}", slug),
            JobType::Refactor => format!("refactor/{}", slug),
            JobType::Docs => format!("docs/{}", slug),
            JobType::Chore => format!("chore/{}", slug),
        }
    }
    
    // Switch to job branch
    pub async fn switch_to_job(&self, job_id: &str) -> Result<()>;
    
    // Merge job branch
    pub async fn merge_job(&self, job_id: &str, target_branch: &str) -> Result<MergeResult>;
    
    // Delete job branch
    pub async fn delete_job_branch(&self, job_id: &str) -> Result<()>;
    
    // Get branch status
    pub async fn get_branch_status(&self, job_id: &str) -> Result<BranchStatus>;
    
    // Sync with remote
    pub async fn sync_branch(&self, job_id: &str) -> Result<SyncResult>;
}

pub struct MergeResult {
    pub success: bool,
    pub conflicts: Vec<ConflictFile>,
    pub merged_commit: Option<String>,
}

pub struct BranchStatus {
    pub ahead: u32,
    pub behind: u32,
    pub has_conflicts: bool,
    pub last_commit: String,
}
```

**Deliverables:**
- [ ] Branch creation
- [ ] Branch switching
- [ ] Merge functionality
- [ ] Conflict detection

##### Task 1.4.5: Git Watcher (Rust)
**File:** `desktop-app/src-tauri/src/job/git_watcher.rs`

```rust
pub struct GitWatcher {
    checkpoint_manager: Arc<CheckpointManager>,
    job_manager: Arc<JobManager>,
}

impl GitWatcher {
    // Start watching
    pub fn start(&self, workspace_path: &Path) -> Result<()>;
    
    // Stop watching
    pub fn stop(&self) -> Result<()>;
    
    // Handle commit event
    async fn on_commit(&self, commit: &Commit) -> Result<()> {
        // 1. Find job for current branch
        // 2. Create checkpoint from commit
        // 3. Update job progress
        // 4. Notify UI
        Ok(())
    }
    
    // Handle branch switch
    async fn on_branch_switch(&self, branch: &str) -> Result<()>;
    
    // Handle file change
    async fn on_file_change(&self, path: &Path) -> Result<()>;
}
```

**Deliverables:**
- [ ] Git event watching
- [ ] Auto-checkpoint on commit
- [ ] Branch switch detection

#### Day 5: TypeScript Services

##### Task 1.4.6: Job Service (TypeScript)
**File:** `desktop-app/src/services/jobService.ts`

```typescript
import { invoke } from '@tauri-apps/api/tauri';

export interface JobService {
  // Jobs
  createJob(input: CreateJobInput): Promise<Job>;
  getJob(jobId: string): Promise<Job>;
  listJobs(workspaceId: string, filter?: JobFilter): Promise<Job[]>;
  updateJob(jobId: string, input: UpdateJobInput): Promise<Job>;
  deleteJob(jobId: string, deleteBranch?: boolean): Promise<void>;
  startJob(jobId: string): Promise<Job>;
  completeJob(jobId: string): Promise<Job>;
  archiveJob(jobId: string): Promise<Job>;
  
  // Tasks
  createTask(jobId: string, input: CreateTaskInput): Promise<Task>;
  listTasks(jobId: string, filter?: TaskFilter): Promise<Task[]>;
  updateTask(taskId: string, input: UpdateTaskInput): Promise<Task>;
  completeTask(taskId: string): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
  
  // Checkpoints
  createCheckpoint(jobId: string, input: CreateCheckpointInput): Promise<Checkpoint>;
  listCheckpoints(jobId: string): Promise<Checkpoint[]>;
  rollbackToCheckpoint(checkpointId: string): Promise<void>;
  compareCheckpoints(fromId: string, toId: string): Promise<CheckpointDiff>;
  
  // Branch
  mergeJob(jobId: string, targetBranch: string): Promise<MergeResult>;
  getBranchStatus(jobId: string): Promise<BranchStatus>;
  syncBranch(jobId: string): Promise<SyncResult>;
}

export const jobService: JobService = {
  createJob: (input) => invoke('create_job', { input }),
  getJob: (jobId) => invoke('get_job', { jobId }),
  // ... etc
};
```

**Deliverables:**
- [ ] Job service wrapper
- [ ] Task service wrapper
- [ ] Checkpoint service wrapper
- [ ] Branch service wrapper

##### Task 1.4.7: Tab Manager (TypeScript)
**File:** `desktop-app/src/services/tabManager.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TabStore {
  tabs: TabState[];
  activeTabId: string | null;
  
  // Actions
  createTab: (job: Job) => TabState;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  updateTabState: (tabId: string, state: Partial<TabState>) => void;
  
  // Getters
  getActiveTab: () => TabState | null;
  getTabByJobId: (jobId: string) => TabState | null;
}

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      
      createTab: (job) => {
        const tab: TabState = {
          id: generateId(),
          job_id: job.id,
          job_name: job.name,
          branch_name: job.branch_name,
          status: job.status,
          is_active: true,
          is_dirty: false,
          last_accessed: new Date(),
          layout: defaultLayout,
          scroll_positions: {},
          open_files: [],
          active_file: null,
        };
        
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
        }));
        
        return tab;
      },
      
      // ... other actions
    }),
    {
      name: 'tab-storage',
    }
  )
);
```

**Deliverables:**
- [ ] Tab state management
- [ ] Persistence
- [ ] Tab switching logic

---

### Week 2: UI Components

#### Day 6-7: Job UI

##### Task 1.4.8: Job Creation Dialog
**File:** `desktop-app/src/components/job/JobCreationDialog.tsx`

```typescript
interface JobCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (job: Job) => void;
  workspaceId: string;
  specId?: string;  // Pre-fill from spec
}

// Dialog flow:
// 1. Basic info (name, description, type)
// 2. Branch settings (base branch, custom name)
// 3. Initial tasks (optional, from spec)
// 4. Review & create
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Create New Job                                              [×]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Job Name *                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Implement User Authentication API                                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Description                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Add JWT-based authentication with login, logout, and refresh    ││
│  │ token endpoints.                                                 ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Type                                                                │
│  ○ Feature  ○ Bugfix  ○ Refactor  ○ Docs  ○ Chore                   │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  Branch Settings                                                     │
│                                                                      │
│  Base Branch                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ develop                                                     [▼] ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Branch Name (auto-generated)                                        │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ feature/implement-user-authentication-api                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│  □ Customize branch name                                             │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  Initial Tasks (optional)                                            │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ □ Design API endpoints                                           ││
│  │ □ Implement login endpoint                                       ││
│  │ □ Implement logout endpoint                                      ││
│  │ □ Add refresh token support                                      ││
│  │ □ Write unit tests                                               ││
│  │ [+ Add task]                                                     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                    [Cancel]  [Create & Open Job]    │
└─────────────────────────────────────────────────────────────────────┘
```

**Deliverables:**
- [ ] Multi-step dialog
- [ ] Form validation
- [ ] Branch name generation
- [ ] Task pre-fill from spec

##### Task 1.4.9: Job List Panel
**File:** `desktop-app/src/components/job/JobListPanel.tsx`

```typescript
interface JobListPanelProps {
  workspaceId: string;
  onJobSelect: (job: Job) => void;
  onJobCreate: () => void;
}

// Features:
// - Filter by status
// - Search by name
// - Sort by date, name, progress
// - Quick actions (start, complete, archive)
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Jobs                                           [+ New Job]         │
├─────────────────────────────────────────────────────────────────────┤
│  🔍 Search jobs...                                                   │
│                                                                      │
│  Filter: [All ▼]  Sort: [Recent ▼]                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔵 IN PROGRESS                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🔵 Auth API Implementation                              65% ████ ││
│  │    feature/auth-api • 3/5 tasks • 2h 30m                        ││
│  │    Last: Implemented login endpoint                              ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🔵 Dashboard Redesign                                   40% ██   ││
│  │    feature/dashboard • 2/5 tasks • 1h 15m                       ││
│  │    Last: Created layout components                               ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  🟡 REVIEW                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 🟡 Fix Bug #123                                        100% █████││
│  │    fix/123-null-pointer • 2/2 tasks • 45m                       ││
│  │    Waiting for review                                            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  📝 DRAFT                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 📝 API Documentation                                     0%      ││
│  │    docs/api-reference • 0/3 tasks                               ││
│  │    Not started                                                   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Deliverables:**
- [ ] Job list with grouping
- [ ] Search and filter
- [ ] Progress indicators
- [ ] Quick actions

##### Task 1.4.10: Job Detail Panel
**File:** `desktop-app/src/components/job/JobDetailPanel.tsx`

```typescript
interface JobDetailPanelProps {
  job: Job;
  onUpdate: (job: Job) => void;
  onStatusChange: (status: JobStatus) => void;
}

// Tabs:
// - Overview (status, progress, time)
// - Tasks (task list with actions)
// - Checkpoints (checkpoint history)
// - Activity (recent actions)
```

**Deliverables:**
- [ ] Overview tab
- [ ] Tasks tab
- [ ] Checkpoints tab
- [ ] Activity tab

#### Day 8: Tab UI

##### Task 1.4.11: Tab Bar Component
**File:** `desktop-app/src/components/tabs/TabBar.tsx`

```typescript
interface TabBarProps {
  tabs: TabState[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onNewTab: () => void;
}

// Features:
// - Drag & drop reorder
// - Close button
// - Status indicator
// - Dirty indicator
// - Overflow menu for many tabs
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌─────┐          │
│ │ 🔵 Auth API    × │ │ 🟡 Dashboard   × │ │ 🟢 Bug #123    × │ │ [+] │          │
│ │ ●               │ │                  │ │                  │ │     │          │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘ └─────┘          │
│  ▲ Active tab        ▲ Dirty indicator                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Deliverables:**
- [ ] Tab rendering
- [ ] Drag & drop
- [ ] Close handling
- [ ] Status indicators

##### Task 1.4.12: Tab Context Menu
**File:** `desktop-app/src/components/tabs/TabContextMenu.tsx`

```typescript
interface TabContextMenuProps {
  tab: TabState;
  onAction: (action: TabAction) => void;
}

// Actions:
// - Close
// - Close others
// - Close all
// - Close to the right
// - Duplicate
// - Move to new window
// - Copy branch name
```

**Deliverables:**
- [ ] Context menu
- [ ] All actions

#### Day 9: Checkpoint UI

##### Task 1.4.13: Checkpoint Timeline
**File:** `desktop-app/src/components/checkpoint/CheckpointTimeline.tsx`

```typescript
interface CheckpointTimelineProps {
  checkpoints: Checkpoint[];
  currentCheckpointId: string;
  onCheckpointSelect: (checkpoint: Checkpoint) => void;
  onRollback: (checkpointId: string) => void;
  onCompare: (fromId: string, toId: string) => void;
}
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Checkpoints                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ● Current                                                           │
│  │                                                                   │
│  ├─● Implemented refresh token (2 hours ago)                        │
│  │   abc123 • 3 files changed • +150 -20                            │
│  │   Tasks: Add refresh token support ✓                             │
│  │   [View] [Compare] [Rollback]                                    │
│  │                                                                   │
│  ├─● Implemented login endpoint (5 hours ago)                       │
│  │   def456 • 5 files changed • +320 -45                            │
│  │   Tasks: Implement login endpoint ✓                              │
│  │   [View] [Compare] [Rollback]                                    │
│  │                                                                   │
│  ├─● Initial setup (1 day ago)                                      │
│  │   ghi789 • 2 files changed • +50 -0                              │
│  │   Tasks: Design API endpoints ✓                                  │
│  │   [View] [Compare] [Rollback]                                    │
│  │                                                                   │
│  └─○ Job created (1 day ago)                                        │
│      Branch created from develop                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Deliverables:**
- [ ] Timeline visualization
- [ ] Checkpoint details
- [ ] Action buttons

##### Task 1.4.14: Checkpoint Diff View
**File:** `desktop-app/src/components/checkpoint/CheckpointDiffView.tsx`

```typescript
interface CheckpointDiffViewProps {
  from: Checkpoint;
  to: Checkpoint;
  diff: CheckpointDiff;
}

// Features:
// - File list with changes
// - Diff view per file
// - Memory changes
// - Task changes
```

**Deliverables:**
- [ ] Diff visualization
- [ ] File changes
- [ ] Memory changes

##### Task 1.4.15: Rollback Confirmation Dialog
**File:** `desktop-app/src/components/checkpoint/RollbackDialog.tsx`

```typescript
interface RollbackDialogProps {
  checkpoint: Checkpoint;
  currentCheckpoint: Checkpoint;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shows:
// - What will be lost
// - Files that will change
// - Tasks that will be uncompleted
// - Memory that will be restored
```

**Deliverables:**
- [ ] Warning display
- [ ] Change summary
- [ ] Confirmation

#### Day 10: Integration & Testing

##### Task 1.4.16: Job-Tab Integration
**File:** `desktop-app/src/hooks/useJobTab.ts`

```typescript
export function useJobTab(jobId: string) {
  const { tabs, createTab, switchTab, updateTabState } = useTabStore();
  const { getJob, updateJob } = useJobService();
  
  // Auto-switch branch when tab changes
  // Sync job status with tab
  // Handle dirty state
  // Auto-save on tab switch
  
  return {
    tab,
    job,
    isActive,
    isDirty,
    switchToJob,
    saveAndSwitch,
  };
}
```

**Deliverables:**
- [ ] Tab-job synchronization
- [ ] Branch switching
- [ ] State management

##### Task 1.4.17: Unit Tests
**Files:** Various test files

**Deliverables:**
- [ ] Job manager tests
- [ ] Task manager tests
- [ ] Checkpoint manager tests
- [ ] Branch manager tests
- [ ] Tab manager tests

##### Task 1.4.18: Integration Tests
**Files:** Various test files

**Deliverables:**
- [ ] Job creation flow
- [ ] Checkpoint creation flow
- [ ] Rollback flow
- [ ] Merge flow
- [ ] Tab switching flow

---

## 🎨 UI/UX Guidelines

### Status Colors

```css
:root {
  --status-draft: #858585;      /* Gray */
  --status-in-progress: #007acc; /* Blue */
  --status-review: #dcdcaa;      /* Yellow */
  --status-completed: #4ec9b0;   /* Green */
  --status-archived: #6e6e6e;    /* Dark gray */
  --status-cancelled: #f14c4c;   /* Red */
}
```

### Tab Indicators

```css
.tab {
  /* Active tab */
  &.active {
    border-bottom: 2px solid var(--accent);
  }
  
  /* Dirty indicator */
  &.dirty::after {
    content: '●';
    color: white;
    margin-left: 4px;
  }
  
  /* Status indicator */
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
}
```

---

## ⚡ Performance Requirements

| Metric | Target |
|--------|--------|
| Tab switch | < 200ms |
| Job creation | < 500ms |
| Checkpoint creation | < 1s |
| Rollback | < 2s |
| Branch switch | < 1s |
| Job list load | < 200ms |

---

## ✅ Definition of Done

- [ ] 1 Tab = 1 Job = 1 Branch ทำงานได้
- [ ] สร้าง job → สร้าง branch อัตโนมัติ
- [ ] Switch tab → switch branch อัตโนมัติ
- [ ] Checkpoint สร้างอัตโนมัติเมื่อ commit
- [ ] Rollback ไป checkpoint ก่อนหน้าได้
- [ ] Merge job branch ได้
- [ ] Job status tracking ทำงานได้
- [ ] Task management ทำงานได้
- [ ] Tab persistence ทำงานได้
- [ ] Unit tests coverage > 80%
- [ ] Integration tests pass

---

## 🚀 Next Sprint

**Sprint 1.5: Local CI Runner**
- Run tests locally
- Build verification
- Coverage report
- Quality gates

---

## 📝 Notes

### Why 1 Tab = 1 Job = 1 Branch?

1. **Context isolation** - แต่ละ job มี context แยกกัน
2. **Easy switching** - Switch ระหว่าง jobs ได้เร็ว
3. **Git alignment** - สอดคล้องกับ Git workflow
4. **Progress tracking** - ติดตาม progress แต่ละ job ได้

### Checkpoint Best Practices

1. **Auto-checkpoint on commit** - ไม่ต้อง manual
2. **Meaningful names** - ใช้ commit message
3. **Include memory state** - เก็บ context ด้วย
4. **Limit history** - เก็บ 50 checkpoints ล่าสุด

### Tab Management Tips

1. **Max 10 tabs** - ป้องกัน memory leak
2. **LRU eviction** - ปิด tab ที่ไม่ได้ใช้นานสุด
3. **Persist state** - เก็บ state เมื่อปิด app
4. **Restore on startup** - เปิด tabs เดิมเมื่อเปิด app
