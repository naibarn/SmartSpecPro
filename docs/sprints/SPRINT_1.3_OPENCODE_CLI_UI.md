# Sprint 1.3: OpenCode CLI UI

**Duration:** 1.5 สัปดาห์ (7-10 วันทำงาน)  
**Priority:** High  
**Dependencies:** Sprint 1.1 (SQLite), Sprint 1.2 (Memory & Skills)  

---

## 🎯 Sprint Goal

สร้าง OpenCode CLI UI ที่มีความเร็วและสะดวกเหมือนใช้ OpenCode จริง โดยรองรับ commands หลัก (/spec, /plan, /tasks, /implement, /debug) และทำงานร่วมกับ Memory System ที่สร้างใน Sprint 1.2

---

## 📋 User Stories

### US-1.3.1: Fast Command Execution
> **As a** developer  
> **I want** to execute OpenCode commands quickly  
> **So that** I can work efficiently without waiting

**Acceptance Criteria:**
- [ ] Command input response < 100ms
- [ ] Streaming output เห็นทันที
- [ ] Keyboard shortcuts ทำงานได้
- [ ] Command history (↑↓) ทำงานได้

### US-1.3.2: Inline Code Editing
> **As a** developer  
> **I want** to see and edit code inline  
> **So that** I can review changes before applying

**Acceptance Criteria:**
- [ ] Syntax highlighting
- [ ] Inline diff view (before/after)
- [ ] Accept/Reject changes
- [ ] Edit suggested code before applying

### US-1.3.3: Split Pane View
> **As a** developer  
> **I want** to see code and chat side by side  
> **So that** I can reference while implementing

**Acceptance Criteria:**
- [ ] Resizable split pane
- [ ] Code editor on left, chat on right
- [ ] Sync scroll option
- [ ] Toggle between layouts

### US-1.3.4: File Explorer Integration
> **As a** developer  
> **I want** to browse and select files easily  
> **So that** I can provide context to commands

**Acceptance Criteria:**
- [ ] File tree view
- [ ] Quick file search (Ctrl+P)
- [ ] File preview
- [ ] Multi-select for context

### US-1.3.5: Terminal Integration
> **As a** developer  
> **I want** to run commands in Docker sandbox  
> **So that** I can test my code immediately

**Acceptance Criteria:**
- [ ] Embedded terminal
- [ ] Run in Docker container
- [ ] Output capture
- [ ] Error detection

---

## 🏗️ Technical Architecture

### OpenCode UI Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SmartSpecPro - OpenCode                                    [─] [□] [×]         │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────┬───────────────────────────────────────────────────────────────────┤
│ │           │  ┌─────────────────────────────────────────────────────────────┐  │
│ │  FILES    │  │  src/auth/jwt.ts                                    [×]    │  │
│ │           │  ├─────────────────────────────────────────────────────────────┤  │
│ │ ▼ src/    │  │  1  import { sign, verify } from 'jsonwebtoken';           │  │
│ │   ▼ auth/ │  │  2                                                          │  │
│ │     jwt.ts│  │  3  export interface JWTPayload {                           │  │
│ │     ...   │  │  4    userId: string;                                       │  │
│ │   ▼ api/  │  │  5    role: string;                                         │  │
│ │     ...   │  │  6    exp: number;                                          │  │
│ │           │  │  7  }                                                        │  │
│ │           │  │  8                                                          │  │
│ │           │  │  9  export function createToken(payload: JWTPayload) {      │  │
│ │           │  │ 10    return sign(payload, process.env.JWT_SECRET!);        │  │
│ │           │  │ 11  }                                                        │  │
│ │           │  │                                                              │  │
│ │           │  └─────────────────────────────────────────────────────────────┘  │
│ │           │                                                                    │
│ │           │  ┌─────────────────────────────────────────────────────────────┐  │
│ │           │  │  OPENCODE CLI                                               │  │
│ │           │  ├─────────────────────────────────────────────────────────────┤  │
│ │           │  │  > /implement add refresh token support                     │  │
│ │           │  │                                                              │  │
│ │           │  │  ⚡ Analyzing codebase...                                    │  │
│ │           │  │  📁 Reading src/auth/jwt.ts                                 │  │
│ │           │  │  📁 Reading src/auth/middleware.ts                          │  │
│ │           │  │                                                              │  │
│ │           │  │  ✨ Suggested changes:                                       │  │
│ │           │  │  ┌─────────────────────────────────────────────────────────┐│  │
│ │           │  │  │ src/auth/jwt.ts                                         ││  │
│ │           │  │  │ @@ -9,6 +9,20 @@                                        ││  │
│ │           │  │  │ + export function createRefreshToken(userId: string) {  ││  │
│ │           │  │  │ +   return sign({ userId, type: 'refresh' },            ││  │
│ │           │  │  │ +     process.env.REFRESH_SECRET!, { expiresIn: '7d' });││  │
│ │           │  │  │ + }                                                      ││  │
│ │           │  │  └─────────────────────────────────────────────────────────┘│  │
│ │           │  │                                                              │  │
│ │           │  │  [✓ Accept] [✗ Reject] [✎ Edit] [💬 Discuss]                │  │
│ │           │  │                                                              │  │
│ │           │  │  ────────────────────────────────────────────────────────── │  │
│ │           │  │  > _                                                        │  │
│ │           │  └─────────────────────────────────────────────────────────────┘  │
│ └───────────┴───────────────────────────────────────────────────────────────────┤
│  [/spec] [/plan] [/tasks] [/implement] [/debug] │ Model: Claude 3.5 │ ⚡ Ready  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Alternative: Horizontal Split

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SmartSpecPro - OpenCode                                    [─] [□] [×]         │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────┬───────────────────────────────────────────────────────────────────┤
│ │           │  ┌──────────────────────────────┬──────────────────────────────┐  │
│ │  FILES    │  │  src/auth/jwt.ts        [×]  │  OPENCODE CLI                │  │
│ │           │  ├──────────────────────────────┼──────────────────────────────┤  │
│ │ ▼ src/    │  │  1  import { sign } from ... │  > /implement refresh token  │  │
│ │   ▼ auth/ │  │  2                           │                              │  │
│ │     jwt.ts│  │  3  export interface JWT...  │  ⚡ Analyzing...              │  │
│ │     ...   │  │  4    userId: string;        │                              │  │
│ │           │  │  5    role: string;          │  ✨ Changes:                  │  │
│ │           │  │  6  }                        │  ┌────────────────────────┐  │  │
│ │           │  │  7                           │  │ + createRefreshToken() │  │  │
│ │           │  │  8  export function create.. │  │ + verifyRefreshToken() │  │  │
│ │           │  │  9    return sign(payload... │  └────────────────────────┘  │  │
│ │           │  │ 10  }                        │                              │  │
│ │           │  │                              │  [✓] [✗] [✎] [💬]            │  │
│ │           │  │                              │  ─────────────────────────── │  │
│ │           │  │                              │  > _                         │  │
│ │           │  └──────────────────────────────┴──────────────────────────────┘  │
│ └───────────┴───────────────────────────────────────────────────────────────────┤
│  [/spec] [/plan] [/tasks] [/implement] [/debug] │ Model: Claude 3.5 │ ⚡ Ready  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Command Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              COMMAND EXECUTION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────────┘

User Input: "/implement add refresh token support"
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  1. PARSE COMMAND                                                                │
│     • Command: /implement                                                        │
│     • Args: "add refresh token support"                                          │
│     • Context files: [selected files in tree]                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  2. RETRIEVE CONTEXT (from Memory Service)                                       │
│     • Related knowledge: "JWT auth pattern", "Security constraints"              │
│     • Recent decisions: "Use RS256 algorithm"                                    │
│     • Working memory: Pinned items for current job                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  3. READ FILES                                                                   │
│     • Analyze project structure                                                  │
│     • Read relevant files                                                        │
│     • Identify dependencies                                                      │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  4. EXECUTE LLM (Streaming)                                                      │
│     • System prompt + context + user request                                     │
│     • Stream response to UI                                                      │
│     • Parse structured output (code blocks, explanations)                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  5. PRESENT CHANGES                                                              │
│     • Show diff view                                                             │
│     • Highlight additions/deletions                                              │
│     • Action buttons: Accept, Reject, Edit, Discuss                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  6. APPLY CHANGES (on Accept)                                                    │
│     • Write files                                                                │
│     • Create git commit (optional)                                               │
│     • Update memory (what was done)                                              │
│     • Run tests (optional)                                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### OpenCode Commands

```typescript
const OPENCODE_COMMANDS = {
  // Specification
  '/spec': {
    description: 'Generate or refine specification',
    usage: '/spec <description>',
    examples: [
      '/spec user authentication with OAuth2',
      '/spec API endpoint for user profile',
    ],
    requiredContext: ['project_structure', 'existing_specs'],
    output: 'markdown_spec',
  },
  
  // Planning
  '/plan': {
    description: 'Create implementation plan',
    usage: '/plan <feature or spec>',
    examples: [
      '/plan implement user auth from spec',
      '/plan refactor database layer',
    ],
    requiredContext: ['specs', 'codebase_overview'],
    output: 'task_breakdown',
  },
  
  // Tasks
  '/tasks': {
    description: 'List or manage tasks',
    usage: '/tasks [list|add|done|status]',
    examples: [
      '/tasks list',
      '/tasks add implement login endpoint',
      '/tasks done 3',
    ],
    requiredContext: ['current_job', 'task_list'],
    output: 'task_list',
  },
  
  // Implementation
  '/implement': {
    description: 'Implement feature or fix',
    usage: '/implement <description>',
    examples: [
      '/implement add refresh token support',
      '/implement fix null pointer in auth',
    ],
    requiredContext: ['related_code', 'patterns', 'constraints'],
    output: 'code_changes',
  },
  
  // Debugging
  '/debug': {
    description: 'Debug error or issue',
    usage: '/debug <error or description>',
    examples: [
      '/debug TypeError: Cannot read property...',
      '/debug why is API returning 500',
    ],
    requiredContext: ['error_logs', 'related_code', 'recent_changes'],
    output: 'analysis_and_fix',
  },
  
  // Code Review
  '/review': {
    description: 'Review code changes',
    usage: '/review [file or diff]',
    examples: [
      '/review src/auth/jwt.ts',
      '/review --staged',
    ],
    requiredContext: ['code_diff', 'coding_standards'],
    output: 'review_comments',
  },
  
  // Test
  '/test': {
    description: 'Generate or run tests',
    usage: '/test <generate|run> [file]',
    examples: [
      '/test generate src/auth/jwt.ts',
      '/test run',
    ],
    requiredContext: ['test_patterns', 'related_code'],
    output: 'test_code_or_results',
  },
  
  // Explain
  '/explain': {
    description: 'Explain code or concept',
    usage: '/explain <code or concept>',
    examples: [
      '/explain this function',
      '/explain how auth flow works',
    ],
    requiredContext: ['selected_code', 'project_docs'],
    output: 'explanation',
  },
  
  // Commit
  '/commit': {
    description: 'Generate commit message and commit',
    usage: '/commit [--push]',
    examples: [
      '/commit',
      '/commit --push',
    ],
    requiredContext: ['staged_changes'],
    output: 'commit_message',
  },
};
```

### Keyboard Shortcuts

```typescript
const KEYBOARD_SHORTCUTS = {
  // Command execution
  'Enter': 'Execute command',
  'Shift+Enter': 'New line in input',
  'Ctrl+Enter': 'Execute and keep input',
  'Escape': 'Cancel current operation',
  
  // Navigation
  'Ctrl+P': 'Quick file open',
  'Ctrl+Shift+P': 'Command palette',
  'Ctrl+B': 'Toggle file explorer',
  'Ctrl+J': 'Toggle terminal',
  'Ctrl+`': 'Focus terminal',
  
  // History
  'ArrowUp': 'Previous command',
  'ArrowDown': 'Next command',
  'Ctrl+R': 'Search command history',
  
  // Code actions
  'Ctrl+S': 'Save file',
  'Ctrl+Z': 'Undo',
  'Ctrl+Shift+Z': 'Redo',
  'Ctrl+/': 'Toggle comment',
  
  // OpenCode specific
  'Ctrl+Shift+A': 'Accept all changes',
  'Ctrl+Shift+R': 'Reject all changes',
  'Ctrl+Shift+E': 'Edit suggested code',
  'Ctrl+Shift+D': 'Open diff view',
  
  // Layout
  'Ctrl+\\': 'Toggle split view',
  'Ctrl+1': 'Focus editor',
  'Ctrl+2': 'Focus CLI',
  'Ctrl+3': 'Focus terminal',
};
```

---

## 📁 Implementation Tasks

### Week 1: Core UI Components

#### Day 1-2: OpenCode Page Layout

##### Task 1.3.1: OpenCode Page Structure
**File:** `desktop-app/src/pages/OpenCode.tsx`

```typescript
interface OpenCodePageProps {
  workspaceId: string;
}

interface OpenCodeState {
  layout: 'vertical' | 'horizontal';
  showFileExplorer: boolean;
  showTerminal: boolean;
  activeFile: string | null;
  selectedFiles: string[];
  commandHistory: string[];
  isExecuting: boolean;
  pendingChanges: CodeChange[];
}

// Layout structure
const OpenCodePage: React.FC<OpenCodePageProps> = ({ workspaceId }) => {
  return (
    <div className="opencode-container">
      {/* File Explorer (collapsible) */}
      <FileExplorer 
        visible={showFileExplorer}
        onFileSelect={handleFileSelect}
        selectedFiles={selectedFiles}
      />
      
      {/* Main Content Area */}
      <SplitPane layout={layout}>
        {/* Code Editor */}
        <CodeEditor 
          file={activeFile}
          changes={pendingChanges}
          onAccept={handleAcceptChange}
          onReject={handleRejectChange}
        />
        
        {/* OpenCode CLI */}
        <OpenCodeCLI 
          onCommand={handleCommand}
          isExecuting={isExecuting}
          history={commandHistory}
        />
      </SplitPane>
      
      {/* Terminal (collapsible) */}
      <Terminal 
        visible={showTerminal}
        containerId={containerId}
      />
      
      {/* Status Bar */}
      <StatusBar 
        model={selectedModel}
        status={executionStatus}
      />
    </div>
  );
};
```

**Deliverables:**
- [ ] Page layout with resizable panels
- [ ] State management
- [ ] Keyboard shortcut handlers
- [ ] Layout toggle (vertical/horizontal)

##### Task 1.3.2: File Explorer Component
**File:** `desktop-app/src/components/opencode/FileExplorer.tsx`

```typescript
interface FileExplorerProps {
  visible: boolean;
  rootPath: string;
  selectedFiles: string[];
  onFileSelect: (path: string) => void;
  onFileOpen: (path: string) => void;
  onMultiSelect: (paths: string[]) => void;
}

// Features:
// - Tree view with expand/collapse
// - File icons by type
// - Quick search (Ctrl+P)
// - Multi-select for context
// - Right-click menu
// - Drag & drop to CLI
```

**Deliverables:**
- [ ] Tree view component
- [ ] File type icons
- [ ] Quick search modal
- [ ] Multi-select support
- [ ] Context menu

##### Task 1.3.3: Code Editor Component
**File:** `desktop-app/src/components/opencode/CodeEditor.tsx`

```typescript
interface CodeEditorProps {
  file: FileContent | null;
  changes: CodeChange[];
  readOnly?: boolean;
  onSave: (content: string) => void;
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  onEditChange: (changeId: string, newContent: string) => void;
}

// Features:
// - Monaco Editor integration
// - Syntax highlighting
// - Inline diff decorations
// - Accept/Reject buttons per change
// - Line numbers
// - Minimap
```

**Deliverables:**
- [ ] Monaco Editor integration
- [ ] Diff decorations
- [ ] Change action buttons
- [ ] File tabs
- [ ] Auto-save

#### Day 3-4: OpenCode CLI Component

##### Task 1.3.4: CLI Input Component
**File:** `desktop-app/src/components/opencode/CLIInput.tsx`

```typescript
interface CLIInputProps {
  onSubmit: (command: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  history: string[];
}

// Features:
// - Command autocomplete
// - History navigation (↑↓)
// - Multi-line support (Shift+Enter)
// - Syntax highlighting for commands
// - File path autocomplete
// - @ mentions for files
```

**Deliverables:**
- [ ] Input with autocomplete
- [ ] Command history
- [ ] Multi-line support
- [ ] @ file mentions
- [ ] Command syntax highlighting

##### Task 1.3.5: CLI Output Component
**File:** `desktop-app/src/components/opencode/CLIOutput.tsx`

```typescript
interface CLIOutputProps {
  messages: CLIMessage[];
  isStreaming: boolean;
  onActionClick: (action: CLIAction) => void;
}

interface CLIMessage {
  type: 'user' | 'system' | 'assistant' | 'code' | 'diff' | 'error';
  content: string;
  timestamp: Date;
  actions?: CLIAction[];
}

// Features:
// - Streaming text display
// - Code blocks with syntax highlighting
// - Diff view (inline or side-by-side)
// - Action buttons
// - Copy to clipboard
// - Collapsible sections
```

**Deliverables:**
- [ ] Message rendering by type
- [ ] Streaming support
- [ ] Code block highlighting
- [ ] Diff rendering
- [ ] Action buttons

##### Task 1.3.6: Diff View Component
**File:** `desktop-app/src/components/opencode/DiffView.tsx`

```typescript
interface DiffViewProps {
  original: string;
  modified: string;
  language: string;
  mode: 'inline' | 'split';
  onAccept: () => void;
  onReject: () => void;
  onEdit: (content: string) => void;
}

// Features:
// - Inline diff (unified)
// - Split diff (side-by-side)
// - Line-by-line accept/reject
// - Edit mode
// - Syntax highlighting
```

**Deliverables:**
- [ ] Inline diff view
- [ ] Split diff view
- [ ] Line actions
- [ ] Edit mode
- [ ] Toggle between modes

#### Day 5: Command Execution

##### Task 1.3.7: Command Parser
**File:** `desktop-app/src/services/commandParser.ts`

```typescript
interface ParsedCommand {
  command: string;
  args: string;
  flags: Record<string, string | boolean>;
  mentionedFiles: string[];
  rawInput: string;
}

export function parseCommand(input: string): ParsedCommand;
export function validateCommand(command: string): ValidationResult;
export function getCommandHelp(command: string): CommandHelp;
export function getSuggestions(partial: string): Suggestion[];
```

**Deliverables:**
- [ ] Command parsing logic
- [ ] Flag extraction
- [ ] File mention extraction
- [ ] Validation
- [ ] Autocomplete suggestions

##### Task 1.3.8: Command Executor (Rust)
**File:** `desktop-app/src-tauri/src/opencode/executor.rs`

```rust
pub struct CommandExecutor {
    memory_service: Arc<MemoryService>,
    skills_manager: Arc<SkillsManager>,
    file_service: Arc<FileService>,
    llm_client: Arc<LLMClient>,
}

impl CommandExecutor {
    // Execute command
    pub async fn execute(&self, command: ParsedCommand, context: ExecutionContext) -> Result<CommandResult>;
    
    // Stream execution
    pub async fn execute_streaming(&self, command: ParsedCommand, context: ExecutionContext, tx: Sender<StreamEvent>) -> Result<()>;
    
    // Cancel execution
    pub fn cancel(&self, execution_id: &str) -> Result<()>;
    
    // Get execution status
    pub fn get_status(&self, execution_id: &str) -> ExecutionStatus;
}

pub enum StreamEvent {
    Started { execution_id: String },
    Progress { message: String },
    FileRead { path: String },
    Thinking { content: String },
    CodeChange { change: CodeChange },
    Completed { result: CommandResult },
    Error { error: String },
}
```

**Deliverables:**
- [ ] Command executor implementation
- [ ] Streaming support
- [ ] Cancellation
- [ ] Progress events

---

### Week 2: Integration & Polish

#### Day 6: File Operations

##### Task 1.3.9: File Service
**File:** `desktop-app/src-tauri/src/opencode/file_service.rs`

```rust
pub struct FileService {
    workspace_path: PathBuf,
    git_service: Arc<GitService>,
}

impl FileService {
    // Read file
    pub async fn read_file(&self, path: &str) -> Result<FileContent>;
    
    // Write file
    pub async fn write_file(&self, path: &str, content: &str) -> Result<()>;
    
    // Apply changes
    pub async fn apply_changes(&self, changes: Vec<CodeChange>) -> Result<ApplyResult>;
    
    // Revert changes
    pub async fn revert_changes(&self, change_ids: Vec<String>) -> Result<()>;
    
    // Get file tree
    pub async fn get_file_tree(&self, path: &str) -> Result<FileTree>;
    
    // Search files
    pub async fn search_files(&self, query: &str) -> Result<Vec<FileMatch>>;
    
    // Get file info
    pub async fn get_file_info(&self, path: &str) -> Result<FileInfo>;
}

pub struct CodeChange {
    pub id: String,
    pub file_path: String,
    pub original: String,
    pub modified: String,
    pub start_line: u32,
    pub end_line: u32,
    pub description: String,
    pub status: ChangeStatus,
}

pub enum ChangeStatus {
    Pending,
    Accepted,
    Rejected,
    Modified,
}
```

**Deliverables:**
- [ ] File read/write operations
- [ ] Change application
- [ ] Revert support
- [ ] File tree
- [ ] Search

##### Task 1.3.10: Git Integration
**File:** `desktop-app/src-tauri/src/opencode/git_service.rs`

```rust
pub struct GitService {
    repo_path: PathBuf,
}

impl GitService {
    // Get status
    pub async fn get_status(&self) -> Result<GitStatus>;
    
    // Stage files
    pub async fn stage(&self, paths: Vec<String>) -> Result<()>;
    
    // Commit
    pub async fn commit(&self, message: &str) -> Result<String>;
    
    // Get diff
    pub async fn get_diff(&self, path: Option<&str>) -> Result<String>;
    
    // Create branch
    pub async fn create_branch(&self, name: &str) -> Result<()>;
    
    // Switch branch
    pub async fn switch_branch(&self, name: &str) -> Result<()>;
    
    // Get current branch
    pub async fn current_branch(&self) -> Result<String>;
}
```

**Deliverables:**
- [ ] Git status
- [ ] Stage/unstage
- [ ] Commit
- [ ] Diff
- [ ] Branch operations

#### Day 7: Terminal Integration

##### Task 1.3.11: Terminal Component
**File:** `desktop-app/src/components/opencode/Terminal.tsx`

```typescript
interface TerminalProps {
  visible: boolean;
  containerId: string;
  onOutput: (output: string) => void;
  onError: (error: string) => void;
}

// Features:
// - xterm.js integration
// - Docker container connection
// - Command history
// - Copy/paste support
// - Resize handling
// - Multiple tabs
```

**Deliverables:**
- [ ] xterm.js integration
- [ ] Docker connection
- [ ] Resize handling
- [ ] Tab support

##### Task 1.3.12: Docker Terminal Bridge (Rust)
**File:** `desktop-app/src-tauri/src/opencode/terminal_bridge.rs`

```rust
pub struct TerminalBridge {
    docker_manager: Arc<DockerManager>,
    active_sessions: HashMap<String, TerminalSession>,
}

impl TerminalBridge {
    // Create terminal session
    pub async fn create_session(&self, container_id: &str) -> Result<String>;
    
    // Send input
    pub async fn send_input(&self, session_id: &str, input: &str) -> Result<()>;
    
    // Resize terminal
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()>;
    
    // Close session
    pub async fn close_session(&self, session_id: &str) -> Result<()>;
    
    // Stream output
    pub fn stream_output(&self, session_id: &str) -> impl Stream<Item = TerminalOutput>;
}
```

**Deliverables:**
- [ ] Terminal session management
- [ ] Input/output streaming
- [ ] Resize support
- [ ] Session cleanup

#### Day 8-9: Polish & Integration

##### Task 1.3.13: Keyboard Shortcuts Manager
**File:** `desktop-app/src/services/shortcutsManager.ts`

```typescript
interface ShortcutsManager {
  register(shortcut: string, action: () => void): void;
  unregister(shortcut: string): void;
  getAll(): ShortcutMapping[];
  isPressed(shortcut: string): boolean;
}

// Global shortcuts registration
// Conflict detection
// Custom shortcuts support
```

**Deliverables:**
- [ ] Shortcut registration
- [ ] Conflict detection
- [ ] Custom shortcuts
- [ ] Help overlay (Ctrl+?)

##### Task 1.3.14: Command Palette
**File:** `desktop-app/src/components/opencode/CommandPalette.tsx`

```typescript
interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (command: string) => void;
}

// Features:
// - Fuzzy search
// - Recent commands
// - All available commands
// - Keyboard navigation
// - Shortcut hints
```

**Deliverables:**
- [ ] Palette UI
- [ ] Fuzzy search
- [ ] Recent commands
- [ ] Keyboard navigation

##### Task 1.3.15: Status Bar
**File:** `desktop-app/src/components/opencode/StatusBar.tsx`

```typescript
interface StatusBarProps {
  model: string;
  status: ExecutionStatus;
  branch: string;
  file: string | null;
  position: { line: number; column: number } | null;
}

// Items:
// - Current model
// - Execution status
// - Git branch
// - File info
// - Cursor position
// - Encoding
// - Line ending
```

**Deliverables:**
- [ ] Status items
- [ ] Click actions
- [ ] Model selector
- [ ] Branch indicator

#### Day 10: Testing & Documentation

##### Task 1.3.16: Unit Tests
**Files:** Various test files

**Deliverables:**
- [ ] Command parser tests
- [ ] File service tests
- [ ] Git service tests
- [ ] Component tests

##### Task 1.3.17: Integration Tests
**Files:** Various test files

**Deliverables:**
- [ ] Command execution tests
- [ ] File operation tests
- [ ] Terminal tests
- [ ] End-to-end flow tests

##### Task 1.3.18: Documentation
**File:** `desktop-app/docs/OPENCODE_GUIDE.md`

**Deliverables:**
- [ ] User guide
- [ ] Command reference
- [ ] Keyboard shortcuts
- [ ] Troubleshooting

---

## 🎨 UI/UX Guidelines

### Color Scheme (Dark Theme)

```css
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d2d;
  --text-primary: #cccccc;
  --text-secondary: #858585;
  --accent: #007acc;
  --success: #4ec9b0;
  --warning: #dcdcaa;
  --error: #f14c4c;
  --diff-add: #2ea04326;
  --diff-remove: #f8514926;
}
```

### Typography

```css
.code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.ui {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 13px;
}
```

### Animations

```css
/* Fast transitions for responsiveness */
.transition-fast {
  transition: all 100ms ease-out;
}

/* Streaming text cursor */
@keyframes blink {
  50% { opacity: 0; }
}
.cursor {
  animation: blink 1s step-end infinite;
}
```

---

## ⚡ Performance Requirements

| Metric | Target |
|--------|--------|
| Command input response | < 100ms |
| File tree load | < 200ms |
| File open | < 100ms |
| Syntax highlighting | < 50ms |
| Diff rendering | < 100ms |
| LLM streaming start | < 500ms |
| Memory usage | < 500MB |

---

## ✅ Definition of Done

- [ ] OpenCode UI ทำงานได้เหมือน OpenCode จริง
- [ ] Commands ทำงานได้ทุกตัว (/spec, /plan, /tasks, /implement, /debug)
- [ ] Inline diff view ทำงานได้
- [ ] Accept/Reject/Edit changes ทำงานได้
- [ ] File explorer ทำงานได้
- [ ] Terminal integration ทำงานได้
- [ ] Keyboard shortcuts ทำงานได้ทุกตัว
- [ ] Command response < 100ms
- [ ] Streaming output ทำงานได้
- [ ] ใช้ Memory Service ร่วมกับ LLM Chat
- [ ] Unit tests coverage > 80%
- [ ] Integration tests pass

---

## 🚀 Next Sprint

**Sprint 1.4: Job & Branch Management**
- 1 Tab = 1 Job = 1 Branch
- Job creation wizard
- Branch auto-creation
- Checkpoint ↔ Commit sync
- Job status tracking

---

## 📝 Notes

### Why OpenCode-like UI?

1. **Familiarity** - Developers คุ้นเคยกับ OpenCode
2. **Efficiency** - Keyboard-first workflow
3. **Context** - เห็น code และ chat พร้อมกัน
4. **Speed** - ไม่ต้องสลับหน้าต่าง

### Key Differences from Original OpenCode

1. **Integrated Memory** - ใช้ Memory Service ร่วมกับ Chat
2. **Docker Sandbox** - Run ใน container
3. **Workspace Scope** - ทำงานใน workspace เดียว
4. **Skills Integration** - ใช้ Skills จาก Sprint 1.2

### Performance Tips

1. **Virtual scrolling** สำหรับ file tree และ output
2. **Lazy loading** สำหรับ file content
3. **Debounce** สำหรับ search และ autocomplete
4. **Web Workers** สำหรับ syntax highlighting
5. **Incremental diff** สำหรับ large files
