# Sprint 2.3: Progress Dashboard

**Duration:** 1.5 สัปดาห์ (7-10 วันทำงาน)  
**Priority:** High  
**Dependencies:** Sprint 2.2 (Visual Spec Builder)  

---

## 🎯 Sprint Goal

สร้าง Progress Dashboard ที่ช่วยให้ผู้ใช้สามารถ:
1. ติดตาม progress ของโปรเจคแบบ real-time
2. ดู task board แบบ Kanban
3. ดู timeline และ milestones
4. ดู charts และ reports

---

## 📋 User Stories

### US-2.3.1: Task Board (Kanban)
> **As a** project manager  
> **I want** to see tasks in a Kanban board  
> **So that** I can track progress at a glance

**Acceptance Criteria:**
- [ ] Columns: Backlog, In Progress, Review, Done
- [ ] Drag-and-drop tasks between columns
- [ ] Task cards with title, assignee, priority
- [ ] Filter by assignee, priority, tag
- [ ] Quick actions (edit, delete, move)

### US-2.3.2: Timeline View
> **As a** user  
> **I want** to see a timeline of tasks and milestones  
> **So that** I can understand the project schedule

**Acceptance Criteria:**
- [ ] Gantt-style timeline
- [ ] Task dependencies shown
- [ ] Milestones markers
- [ ] Zoom in/out (day, week, month)
- [ ] Today indicator

### US-2.3.3: Progress Charts
> **As a** stakeholder  
> **I want** to see progress charts  
> **So that** I can understand project health

**Acceptance Criteria:**
- [ ] Burndown chart
- [ ] Velocity chart
- [ ] Task completion pie chart
- [ ] Time tracking chart
- [ ] Export as image/PDF

### US-2.3.4: Status Reports
> **As a** project manager  
> **I want** to generate status reports  
> **So that** I can share progress with stakeholders

**Acceptance Criteria:**
- [ ] Weekly summary report
- [ ] Completed tasks list
- [ ] Blockers and risks
- [ ] Next week plan
- [ ] Export as PDF/Markdown

### US-2.3.5: Real-time Updates
> **As a** user  
> **I want** to see real-time updates  
> **So that** I always have the latest information

**Acceptance Criteria:**
- [ ] Live task status updates
- [ ] Activity feed
- [ ] Notifications for changes
- [ ] Auto-refresh

---

## 🏗️ Technical Architecture

### Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PROGRESS DASHBOARD                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  HEADER                                                                      │
    │  ┌──────────────────────────────────────────────────────────────────────────┐│
    │  │  Project: My SaaS App    │  Sprint: Week 3    │  Progress: 67%          ││
    │  └──────────────────────────────────────────────────────────────────────────┘│
    └──────────────────────────────────────────────────────────────────────────────┘
    
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  STATS CARDS                                                                 │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
    │  │ Total    │  │ Done     │  │ In       │  │ Blocked  │  │ Hours    │       │
    │  │ Tasks    │  │          │  │ Progress │  │          │  │ Logged   │       │
    │  │   24     │  │   16     │  │    5     │  │    1     │  │   42h    │       │
    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
    └──────────────────────────────────────────────────────────────────────────────┘
    
    ┌────────────────────────────────────┐  ┌───────────────────────────────────────┐
    │  TASK BOARD                        │  │  CHARTS                               │
    │  ┌────────┐ ┌────────┐ ┌────────┐ │  │  ┌─────────────────────────────────┐ │
    │  │Backlog │ │In Prog │ │ Done   │ │  │  │         Burndown Chart          │ │
    │  │        │ │        │ │        │ │  │  │    ╲                            │ │
    │  │ ┌────┐ │ │ ┌────┐ │ │ ┌────┐ │ │  │  │     ╲    Ideal                 │ │
    │  │ │Task│ │ │ │Task│ │ │ │Task│ │ │  │  │      ╲   ----                  │ │
    │  │ └────┘ │ │ └────┘ │ │ └────┘ │ │  │  │       ╲  Actual                │ │
    │  │ ┌────┐ │ │ ┌────┐ │ │ ┌────┐ │ │  │  │        ╲ ────                  │ │
    │  │ │Task│ │ │ │Task│ │ │ │Task│ │ │  │  │         ╲                      │ │
    │  │ └────┘ │ │ └────┘ │ │ └────┘ │ │  │  └─────────────────────────────────┘ │
    │  └────────┘ └────────┘ └────────┘ │  │                                       │
    └────────────────────────────────────┘  │  ┌─────────────────────────────────┐ │
                                            │  │      Task Distribution          │ │
    ┌────────────────────────────────────┐  │  │                                 │ │
    │  TIMELINE                          │  │  │     ┌───┐                       │ │
    │  ┌──────────────────────────────┐ │  │  │     │   │ Done: 67%             │ │
    │  │ Week 1  │ Week 2  │ Week 3   │ │  │  │     │   │ In Progress: 21%     │ │
    │  │ ████████│█████████│████░░░░░ │ │  │  │     │   │ Backlog: 12%         │ │
    │  │         │         │  ▲Today  │ │  │  │     └───┘                       │ │
    │  └──────────────────────────────┘ │  │  └─────────────────────────────────┘ │
    └────────────────────────────────────┘  └───────────────────────────────────────┘
    
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  ACTIVITY FEED                                                               │
    │  ┌──────────────────────────────────────────────────────────────────────────┐│
    │  │ 🟢 Task "Setup auth" completed                              2 min ago   ││
    │  │ 🔵 Task "Create API" moved to In Progress                   5 min ago   ││
    │  │ 🟡 Comment added on "Design review"                        10 min ago   ││
    │  │ 🔴 Task "Payment integration" blocked                      15 min ago   ││
    │  └──────────────────────────────────────────────────────────────────────────┘│
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Data Models

```typescript
// Task model
interface Task {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  tags: string[];
  estimatedHours?: number;
  loggedHours: number;
  dueDate?: Date;
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Sprint model
interface Sprint {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  goals: string[];
  tasks: string[];
}

// Activity model
interface Activity {
  id: string;
  type: 'task_created' | 'task_updated' | 'task_completed' | 'comment_added' | 'status_changed';
  taskId: string;
  userId: string;
  data: Record<string, any>;
  timestamp: Date;
}

// Report model
interface Report {
  id: string;
  type: 'weekly' | 'sprint' | 'milestone';
  period: { start: Date; end: Date };
  summary: {
    totalTasks: number;
    completedTasks: number;
    hoursLogged: number;
    velocity: number;
  };
  highlights: string[];
  blockers: string[];
  nextSteps: string[];
  generatedAt: Date;
}
```

---

## 📁 Implementation Tasks

### Week 1: Core Dashboard

#### Task 2.3.1: Progress Service (Rust)
**File:** `desktop-app/src-tauri/src/progress_tracker.rs`

```rust
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStats {
    pub total: usize,
    pub backlog: usize,
    pub in_progress: usize,
    pub review: usize,
    pub done: usize,
    pub blocked: usize,
    pub total_hours_estimated: f64,
    pub total_hours_logged: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurndownPoint {
    pub date: DateTime<Utc>,
    pub remaining: usize,
    pub ideal: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VelocityPoint {
    pub sprint: String,
    pub completed: usize,
    pub committed: usize,
}

pub struct ProgressTracker {
    db: WorkspaceDatabase,
}

impl ProgressTracker {
    pub fn new(db: WorkspaceDatabase) -> Self {
        Self { db }
    }
    
    pub fn get_task_stats(&self) -> Result<TaskStats, Error> {
        let tasks = self.db.get_all_tasks()?;
        
        let mut stats = TaskStats {
            total: tasks.len(),
            backlog: 0,
            in_progress: 0,
            review: 0,
            done: 0,
            blocked: 0,
            total_hours_estimated: 0.0,
            total_hours_logged: 0.0,
        };
        
        for task in &tasks {
            match task.status.as_str() {
                "backlog" => stats.backlog += 1,
                "in_progress" => stats.in_progress += 1,
                "review" => stats.review += 1,
                "done" => stats.done += 1,
                _ => {}
            }
            
            if task.blocked {
                stats.blocked += 1;
            }
            
            stats.total_hours_estimated += task.estimated_hours.unwrap_or(0.0);
            stats.total_hours_logged += task.logged_hours;
        }
        
        Ok(stats)
    }
    
    pub fn get_burndown_data(&self, sprint_id: &str) -> Result<Vec<BurndownPoint>, Error> {
        let sprint = self.db.get_sprint(sprint_id)?;
        let tasks = self.db.get_tasks_by_sprint(sprint_id)?;
        
        let total_tasks = tasks.len();
        let sprint_days = (sprint.end_date - sprint.start_date).num_days() as usize;
        
        let mut points = Vec::new();
        let mut current_date = sprint.start_date;
        
        for day in 0..=sprint_days {
            let completed_by_date = tasks.iter()
                .filter(|t| t.completed_at.map_or(false, |d| d <= current_date))
                .count();
            
            let remaining = total_tasks - completed_by_date;
            let ideal = total_tasks - (total_tasks * day / sprint_days);
            
            points.push(BurndownPoint {
                date: current_date,
                remaining,
                ideal,
            });
            
            current_date = current_date + Duration::days(1);
        }
        
        Ok(points)
    }
    
    pub fn get_velocity_data(&self, sprint_count: usize) -> Result<Vec<VelocityPoint>, Error> {
        let sprints = self.db.get_recent_sprints(sprint_count)?;
        
        let mut points = Vec::new();
        
        for sprint in sprints {
            let tasks = self.db.get_tasks_by_sprint(&sprint.id)?;
            let completed = tasks.iter().filter(|t| t.status == "done").count();
            
            points.push(VelocityPoint {
                sprint: sprint.name,
                completed,
                committed: tasks.len(),
            });
        }
        
        Ok(points)
    }
    
    pub fn generate_report(&self, report_type: &str, period_start: DateTime<Utc>, period_end: DateTime<Utc>) -> Result<Report, Error> {
        let tasks = self.db.get_tasks_in_period(period_start, period_end)?;
        let activities = self.db.get_activities_in_period(period_start, period_end)?;
        
        let completed_tasks: Vec<_> = tasks.iter()
            .filter(|t| t.status == "done" && t.completed_at.map_or(false, |d| d >= period_start))
            .collect();
        
        let blocked_tasks: Vec<_> = tasks.iter()
            .filter(|t| t.blocked)
            .collect();
        
        let hours_logged: f64 = activities.iter()
            .filter_map(|a| a.data.get("hours_logged").and_then(|v| v.as_f64()))
            .sum();
        
        // Calculate velocity (tasks completed per day)
        let days = (period_end - period_start).num_days() as f64;
        let velocity = completed_tasks.len() as f64 / days;
        
        let report = Report {
            id: uuid::Uuid::new_v4().to_string(),
            report_type: report_type.to_string(),
            period: Period { start: period_start, end: period_end },
            summary: ReportSummary {
                total_tasks: tasks.len(),
                completed_tasks: completed_tasks.len(),
                hours_logged,
                velocity,
            },
            highlights: completed_tasks.iter()
                .take(5)
                .map(|t| format!("✅ {}", t.title))
                .collect(),
            blockers: blocked_tasks.iter()
                .map(|t| format!("🚫 {}: {}", t.title, t.blocked_reason.as_deref().unwrap_or("No reason")))
                .collect(),
            next_steps: self.generate_next_steps(&tasks)?,
            generated_at: Utc::now(),
        };
        
        Ok(report)
    }
    
    fn generate_next_steps(&self, tasks: &[Task]) -> Result<Vec<String>, Error> {
        let in_progress: Vec<_> = tasks.iter()
            .filter(|t| t.status == "in_progress")
            .take(3)
            .collect();
        
        let high_priority: Vec<_> = tasks.iter()
            .filter(|t| t.status == "backlog" && t.priority == "high")
            .take(3)
            .collect();
        
        let mut steps = Vec::new();
        
        for task in in_progress {
            steps.push(format!("Continue: {}", task.title));
        }
        
        for task in high_priority {
            steps.push(format!("Start: {}", task.title));
        }
        
        Ok(steps)
    }
}
```

**Deliverables:**
- [ ] Task statistics
- [ ] Burndown calculation
- [ ] Velocity calculation
- [ ] Report generation

#### Task 2.3.2: Tauri Commands
**File:** `desktop-app/src-tauri/src/progress_tracker/commands.rs`

```rust
#[tauri::command]
pub async fn get_task_stats(
    tracker: State<'_, ProgressTracker>,
) -> Result<TaskStats, String> {
    tracker.get_task_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_burndown_data(
    sprint_id: String,
    tracker: State<'_, ProgressTracker>,
) -> Result<Vec<BurndownPoint>, String> {
    tracker.get_burndown_data(&sprint_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_velocity_data(
    sprint_count: usize,
    tracker: State<'_, ProgressTracker>,
) -> Result<Vec<VelocityPoint>, String> {
    tracker.get_velocity_data(sprint_count).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_report(
    report_type: String,
    period_start: String,
    period_end: String,
    tracker: State<'_, ProgressTracker>,
) -> Result<Report, String> {
    let start = DateTime::parse_from_rfc3339(&period_start)
        .map_err(|e| e.to_string())?
        .with_timezone(&Utc);
    let end = DateTime::parse_from_rfc3339(&period_end)
        .map_err(|e| e.to_string())?
        .with_timezone(&Utc);
    
    tracker.generate_report(&report_type, start, end).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task_status(
    task_id: String,
    status: String,
    tracker: State<'_, ProgressTracker>,
) -> Result<Task, String> {
    tracker.update_task_status(&task_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_activities(
    limit: usize,
    tracker: State<'_, ProgressTracker>,
) -> Result<Vec<Activity>, String> {
    tracker.get_recent_activities(limit).map_err(|e| e.to_string())
}
```

**Deliverables:**
- [ ] Stats command
- [ ] Burndown command
- [ ] Velocity command
- [ ] Report command
- [ ] Activity command

#### Task 2.3.3: Progress Service (TypeScript)
**File:** `desktop-app/src/services/progressService.ts`

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export interface TaskStats {
  total: number;
  backlog: number;
  inProgress: number;
  review: number;
  done: number;
  blocked: number;
  totalHoursEstimated: number;
  totalHoursLogged: number;
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface VelocityPoint {
  sprint: string;
  completed: number;
  committed: number;
}

export interface Report {
  id: string;
  type: string;
  period: { start: string; end: string };
  summary: {
    totalTasks: number;
    completedTasks: number;
    hoursLogged: number;
    velocity: number;
  };
  highlights: string[];
  blockers: string[];
  nextSteps: string[];
  generatedAt: string;
}

export interface Activity {
  id: string;
  type: string;
  taskId: string;
  userId: string;
  data: Record<string, any>;
  timestamp: string;
}

class ProgressService {
  private listeners: Map<string, () => void> = new Map();
  
  async getTaskStats(): Promise<TaskStats> {
    return invoke('get_task_stats');
  }
  
  async getBurndownData(sprintId: string): Promise<BurndownPoint[]> {
    return invoke('get_burndown_data', { sprintId });
  }
  
  async getVelocityData(sprintCount: number = 5): Promise<VelocityPoint[]> {
    return invoke('get_velocity_data', { sprintCount });
  }
  
  async generateReport(
    type: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Report> {
    return invoke('generate_report', {
      reportType: type,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  }
  
  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    return invoke('update_task_status', { taskId, status });
  }
  
  async getActivities(limit: number = 20): Promise<Activity[]> {
    return invoke('get_activities', { limit });
  }
  
  // Real-time updates
  async subscribeToUpdates(callback: (event: any) => void): Promise<() => void> {
    const unlisten = await listen('progress:update', (event) => {
      callback(event.payload);
    });
    return unlisten;
  }
}

export const progressService = new ProgressService();
```

**Deliverables:**
- [ ] TypeScript service
- [ ] Type definitions
- [ ] Real-time subscription

#### Task 2.3.4: Dashboard Page
**File:** `desktop-app/src/pages/ProgressDashboard/ProgressDashboard.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { StatsCards } from './StatsCards';
import { TaskBoard } from './TaskBoard';
import { Timeline } from './Timeline';
import { Charts } from './Charts';
import { ActivityFeed } from './ActivityFeed';
import { progressService, TaskStats, Activity } from '@/services/progressService';

export function ProgressDashboard() {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'board' | 'timeline' | 'charts'>('board');
  
  useEffect(() => {
    loadData();
    
    // Subscribe to real-time updates
    const unsubscribe = progressService.subscribeToUpdates((event) => {
      if (event.type === 'task_updated') {
        loadData();
      } else if (event.type === 'activity') {
        setActivities(prev => [event.data, ...prev.slice(0, 19)]);
      }
    });
    
    return () => {
      unsubscribe.then(fn => fn());
    };
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, activitiesData] = await Promise.all([
        progressService.getTaskStats(),
        progressService.getActivities(20),
      ]);
      setStats(statsData);
      setActivities(activitiesData);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return <LoadingSkeleton />;
  }
  
  return (
    <div className="progress-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-info">
          <h2>Project Progress</h2>
          <span className="progress-badge">
            {stats && Math.round((stats.done / stats.total) * 100)}% Complete
          </span>
        </div>
        
        <div className="view-toggle">
          <button
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
          >
            📋 Board
          </button>
          <button
            className={view === 'timeline' ? 'active' : ''}
            onClick={() => setView('timeline')}
          >
            📅 Timeline
          </button>
          <button
            className={view === 'charts' ? 'active' : ''}
            onClick={() => setView('charts')}
          >
            📊 Charts
          </button>
        </div>
      </div>
      
      {/* Stats Cards */}
      {stats && <StatsCards stats={stats} />}
      
      {/* Main Content */}
      <div className="dashboard-content">
        <div className="main-view">
          {view === 'board' && <TaskBoard onTaskUpdate={loadData} />}
          {view === 'timeline' && <Timeline />}
          {view === 'charts' && <Charts />}
        </div>
        
        <div className="sidebar">
          <ActivityFeed activities={activities} />
        </div>
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Dashboard layout
- [ ] View switching
- [ ] Real-time updates

#### Task 2.3.5: Task Board Component
**File:** `desktop-app/src/pages/ProgressDashboard/TaskBoard.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { progressService } from '@/services/progressService';
import { workspaceService, Task } from '@/services/workspaceService';

const COLUMNS = [
  { id: 'backlog', title: 'Backlog', color: '#6b7280' },
  { id: 'in_progress', title: 'In Progress', color: '#3b82f6' },
  { id: 'review', title: 'Review', color: '#f59e0b' },
  { id: 'done', title: 'Done', color: '#10b981' },
];

interface TaskBoardProps {
  onTaskUpdate: () => void;
}

export function TaskBoard({ onTaskUpdate }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState({ priority: 'all', assignee: 'all' });
  
  useEffect(() => {
    loadTasks();
  }, []);
  
  const loadTasks = async () => {
    const data = await workspaceService.getAllTasks();
    setTasks(data);
  };
  
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    
    // Optimistic update
    setTasks(tasks.map(task => 
      task.id === draggableId ? { ...task, status: newStatus } : task
    ));
    
    // Update in backend
    try {
      await progressService.updateTaskStatus(draggableId, newStatus);
      onTaskUpdate();
    } catch (error) {
      // Revert on error
      loadTasks();
    }
  };
  
  const getTasksByStatus = (status: string) => {
    return tasks
      .filter(task => task.status === status)
      .filter(task => filter.priority === 'all' || task.priority === filter.priority)
      .filter(task => filter.assignee === 'all' || task.assignee === filter.assignee);
  };
  
  return (
    <div className="task-board">
      {/* Filters */}
      <div className="board-filters">
        <select
          value={filter.priority}
          onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      
      {/* Columns */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="board-columns">
          {COLUMNS.map((column) => (
            <div key={column.id} className="board-column">
              <div className="column-header" style={{ borderColor: column.color }}>
                <span className="column-title">{column.title}</span>
                <span className="column-count">
                  {getTasksByStatus(column.id).length}
                </span>
              </div>
              
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`column-content ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                  >
                    {getTasksByStatus(column.id).map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`task-card ${snapshot.isDragging ? 'dragging' : ''}`}
                          >
                            <TaskCard task={task} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const priorityColors = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280',
  };
  
  return (
    <div className="task-card-content">
      <div className="task-header">
        <span
          className="priority-indicator"
          style={{ backgroundColor: priorityColors[task.priority] }}
        />
        <span className="task-title">{task.title}</span>
      </div>
      
      {task.description && (
        <p className="task-description">{task.description.slice(0, 100)}...</p>
      )}
      
      <div className="task-footer">
        {task.tags.map((tag) => (
          <span key={tag} className="task-tag">{tag}</span>
        ))}
        
        {task.estimatedHours && (
          <span className="task-hours">
            ⏱️ {task.loggedHours}/{task.estimatedHours}h
          </span>
        )}
        
        {task.blocked && (
          <span className="blocked-indicator">🚫 Blocked</span>
        )}
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Kanban columns
- [ ] Drag-and-drop
- [ ] Task cards
- [ ] Filters

#### Task 2.3.6: Charts Component
**File:** `desktop-app/src/pages/ProgressDashboard/Charts.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { progressService, BurndownPoint, VelocityPoint, TaskStats } from '@/services/progressService';

export function Charts() {
  const [burndownData, setBurndownData] = useState<BurndownPoint[]>([]);
  const [velocityData, setVelocityData] = useState<VelocityPoint[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  
  useEffect(() => {
    loadChartData();
  }, []);
  
  const loadChartData = async () => {
    const [burndown, velocity, statsData] = await Promise.all([
      progressService.getBurndownData('current'),
      progressService.getVelocityData(5),
      progressService.getTaskStats(),
    ]);
    setBurndownData(burndown);
    setVelocityData(velocity);
    setStats(statsData);
  };
  
  const pieData = stats ? [
    { name: 'Done', value: stats.done, color: '#10b981' },
    { name: 'In Progress', value: stats.inProgress, color: '#3b82f6' },
    { name: 'Review', value: stats.review, color: '#f59e0b' },
    { name: 'Backlog', value: stats.backlog, color: '#6b7280' },
  ] : [];
  
  return (
    <div className="charts-container">
      {/* Burndown Chart */}
      <div className="chart-card">
        <h3>Burndown Chart</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={burndownData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="ideal"
              stroke="#9ca3af"
              strokeDasharray="5 5"
              name="Ideal"
            />
            <Line
              type="monotone"
              dataKey="remaining"
              stroke="#3b82f6"
              strokeWidth={2}
              name="Actual"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Velocity Chart */}
      <div className="chart-card">
        <h3>Velocity Chart</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={velocityData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="sprint" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="committed" fill="#9ca3af" name="Committed" />
            <Bar dataKey="completed" fill="#10b981" name="Completed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Task Distribution */}
      <div className="chart-card">
        <h3>Task Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={5}
              dataKey="value"
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      {/* Hours Chart */}
      {stats && (
        <div className="chart-card">
          <h3>Hours Tracking</h3>
          <div className="hours-stats">
            <div className="hours-stat">
              <span className="stat-label">Estimated</span>
              <span className="stat-value">{stats.totalHoursEstimated}h</span>
            </div>
            <div className="hours-stat">
              <span className="stat-label">Logged</span>
              <span className="stat-value">{stats.totalHoursLogged}h</span>
            </div>
            <div className="hours-stat">
              <span className="stat-label">Remaining</span>
              <span className="stat-value">
                {Math.max(0, stats.totalHoursEstimated - stats.totalHoursLogged)}h
              </span>
            </div>
          </div>
          <div className="hours-progress">
            <div
              className="hours-bar"
              style={{
                width: `${Math.min(100, (stats.totalHoursLogged / stats.totalHoursEstimated) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Deliverables:**
- [ ] Burndown chart
- [ ] Velocity chart
- [ ] Pie chart
- [ ] Hours tracking

---

### Week 1.5: Timeline & Reports

#### Task 2.3.7-2.3.10: Additional Tasks

- **2.3.7:** Timeline Component (Gantt-style)
- **2.3.8:** Report Generator
- **2.3.9:** Activity Feed
- **2.3.10:** Export Functions

---

## 📊 Definition of Done

- [ ] Task board ทำงานได้
- [ ] Drag-and-drop ทำงานได้
- [ ] Charts แสดงผลถูกต้อง
- [ ] Timeline แสดงผลถูกต้อง
- [ ] Real-time updates ทำงานได้
- [ ] Report generation ทำงานได้
- [ ] Export ทำงานได้
- [ ] Unit tests coverage > 80%

---

## 🚀 Next Sprint

**Sprint 2.4: Collaboration Features**
- Comments & discussions
- Review workflow
- Notifications
- Activity feed
