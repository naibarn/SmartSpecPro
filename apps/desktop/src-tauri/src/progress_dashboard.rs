// Progress Dashboard - Project Progress Tracking
//
// Provides:
// - Kanban board state management
// - Timeline tracking
// - Progress metrics and charts
// - Reports generation

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: ProjectStatus,
    pub start_date: Option<i64>,
    pub target_date: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub settings: ProjectSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Planning,
    Active,
    OnHold,
    Completed,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub board_columns: Vec<BoardColumn>,
    pub labels: Vec<Label>,
    pub default_assignee: Option<String>,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            board_columns: vec![
                BoardColumn { id: "backlog".to_string(), name: "Backlog".to_string(), color: "#6b7280".to_string(), limit: None },
                BoardColumn { id: "todo".to_string(), name: "To Do".to_string(), color: "#3b82f6".to_string(), limit: Some(10) },
                BoardColumn { id: "in_progress".to_string(), name: "In Progress".to_string(), color: "#f59e0b".to_string(), limit: Some(5) },
                BoardColumn { id: "review".to_string(), name: "Review".to_string(), color: "#8b5cf6".to_string(), limit: Some(3) },
                BoardColumn { id: "done".to_string(), name: "Done".to_string(), color: "#22c55e".to_string(), limit: None },
            ],
            labels: vec![
                Label { id: "bug".to_string(), name: "Bug".to_string(), color: "#ef4444".to_string() },
                Label { id: "feature".to_string(), name: "Feature".to_string(), color: "#3b82f6".to_string() },
                Label { id: "enhancement".to_string(), name: "Enhancement".to_string(), color: "#8b5cf6".to_string() },
                Label { id: "documentation".to_string(), name: "Documentation".to_string(), color: "#6b7280".to_string() },
            ],
            default_assignee: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardColumn {
    pub id: String,
    pub name: String,
    pub color: String,
    pub limit: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Label {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub column_id: String,
    pub position: i32,
    pub priority: TaskPriority,
    pub labels: Vec<String>,
    pub assignee: Option<String>,
    pub due_date: Option<i64>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub subtasks: Vec<Subtask>,
    pub attachments: Vec<Attachment>,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Urgent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEntry {
    pub id: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub event_type: TimelineEventType,
    pub description: String,
    pub user: Option<String>,
    pub timestamp: i64,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimelineEventType {
    TaskCreated,
    TaskUpdated,
    TaskMoved,
    TaskCompleted,
    TaskDeleted,
    CommentAdded,
    AttachmentAdded,
    MilestoneReached,
    ProjectStatusChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub target_date: i64,
    pub completed: bool,
    pub completed_at: Option<i64>,
    pub task_ids: Vec<String>,
}

// ============================================
// Progress Metrics
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetrics {
    pub total_tasks: i32,
    pub completed_tasks: i32,
    pub in_progress_tasks: i32,
    pub overdue_tasks: i32,
    pub completion_percentage: f64,
    pub tasks_by_column: HashMap<String, i32>,
    pub tasks_by_priority: HashMap<String, i32>,
    pub tasks_by_label: HashMap<String, i32>,
    pub velocity: VelocityMetrics,
    pub burndown: Vec<BurndownPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VelocityMetrics {
    pub current_week: i32,
    pub last_week: i32,
    pub average: f64,
    pub trend: f64, // positive = improving, negative = declining
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurndownPoint {
    pub date: i64,
    pub remaining: i32,
    pub completed: i32,
    pub ideal: f64,
}

// ============================================
// Progress Dashboard
// ============================================

pub struct ProgressDashboard {
    pub projects: HashMap<String, Project>,
    pub tasks: HashMap<String, Task>,
    pub timeline: Vec<TimelineEntry>,
    pub milestones: HashMap<String, Milestone>,
}

impl ProgressDashboard {
    pub fn new() -> Self {
        Self {
            projects: HashMap::new(),
            tasks: HashMap::new(),
            timeline: Vec::new(),
            milestones: HashMap::new(),
        }
    }

    // ============================================
    // Project Operations
    // ============================================

    pub fn create_project(&mut self, name: &str, description: Option<&str>) -> Project {
        let now = chrono::Utc::now().timestamp();
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            description: description.map(|s| s.to_string()),
            status: ProjectStatus::Planning,
            start_date: None,
            target_date: None,
            created_at: now,
            updated_at: now,
            settings: ProjectSettings::default(),
        };
        
        self.projects.insert(project.id.clone(), project.clone());
        project
    }

    pub fn get_project(&self, project_id: &str) -> Option<&Project> {
        self.projects.get(project_id)
    }

    pub fn list_projects(&self) -> Vec<&Project> {
        self.projects.values().collect()
    }

    pub fn update_project(&mut self, project_id: &str, updates: ProjectUpdate) -> Result<Project, String> {
        let project = self.projects.get_mut(project_id)
            .ok_or_else(|| format!("Project not found: {}", project_id))?;

        if let Some(name) = updates.name {
            project.name = name;
        }
        if let Some(description) = updates.description {
            project.description = description;
        }
        if let Some(status) = updates.status {
            project.status = status;
        }
        if let Some(start_date) = updates.start_date {
            project.start_date = start_date;
        }
        if let Some(target_date) = updates.target_date {
            project.target_date = target_date;
        }
        project.updated_at = chrono::Utc::now().timestamp();

        Ok(project.clone())
    }

    // ============================================
    // Task Operations
    // ============================================

    pub fn create_task(&mut self, project_id: &str, title: &str, column_id: &str) -> Result<Task, String> {
        if !self.projects.contains_key(project_id) {
            return Err(format!("Project not found: {}", project_id));
        }

        let now = chrono::Utc::now().timestamp();
        let position = self.tasks.values()
            .filter(|t| t.project_id == project_id && t.column_id == column_id)
            .count() as i32;

        let task = Task {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            title: title.to_string(),
            description: None,
            column_id: column_id.to_string(),
            position,
            priority: TaskPriority::Medium,
            labels: Vec::new(),
            assignee: None,
            due_date: None,
            estimated_hours: None,
            actual_hours: None,
            subtasks: Vec::new(),
            attachments: Vec::new(),
            created_at: now,
            updated_at: now,
            completed_at: None,
        };

        self.tasks.insert(task.id.clone(), task.clone());
        
        // Add timeline entry
        self.add_timeline_entry(project_id, Some(&task.id), TimelineEventType::TaskCreated, 
            format!("Task '{}' created", title));

        Ok(task)
    }

    pub fn get_task(&self, task_id: &str) -> Option<&Task> {
        self.tasks.get(task_id)
    }

    pub fn get_project_tasks(&self, project_id: &str) -> Vec<&Task> {
        self.tasks.values()
            .filter(|t| t.project_id == project_id)
            .collect()
    }

    pub fn get_column_tasks(&self, project_id: &str, column_id: &str) -> Vec<&Task> {
        let mut tasks: Vec<_> = self.tasks.values()
            .filter(|t| t.project_id == project_id && t.column_id == column_id)
            .collect();
        tasks.sort_by_key(|t| t.position);
        tasks
    }

    pub fn update_task(&mut self, task_id: &str, updates: TaskUpdate) -> Result<Task, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?;

        if let Some(title) = updates.title {
            task.title = title;
        }
        if let Some(description) = updates.description {
            task.description = description;
        }
        if let Some(priority) = updates.priority {
            task.priority = priority;
        }
        if let Some(labels) = updates.labels {
            task.labels = labels;
        }
        if let Some(assignee) = updates.assignee {
            task.assignee = assignee;
        }
        if let Some(due_date) = updates.due_date {
            task.due_date = due_date;
        }
        if let Some(estimated_hours) = updates.estimated_hours {
            task.estimated_hours = estimated_hours;
        }
        if let Some(actual_hours) = updates.actual_hours {
            task.actual_hours = actual_hours;
        }
        task.updated_at = chrono::Utc::now().timestamp();

        let project_id = task.project_id.clone();
        self.add_timeline_entry(&project_id, Some(task_id), TimelineEventType::TaskUpdated,
            format!("Task '{}' updated", task.title));

        Ok(task.clone())
    }

    pub fn move_task(&mut self, task_id: &str, column_id: &str, position: i32) -> Result<Task, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?;

        let old_column = task.column_id.clone();
        task.column_id = column_id.to_string();
        task.position = position;
        task.updated_at = chrono::Utc::now().timestamp();

        // Mark as completed if moved to done column
        if column_id == "done" && task.completed_at.is_none() {
            task.completed_at = Some(chrono::Utc::now().timestamp());
            let project_id = task.project_id.clone();
            self.add_timeline_entry(&project_id, Some(task_id), TimelineEventType::TaskCompleted,
                format!("Task '{}' completed", task.title));
        } else if column_id != "done" {
            task.completed_at = None;
        }

        let project_id = task.project_id.clone();
        let title = task.title.clone();
        
        if old_column != column_id {
            self.add_timeline_entry(&project_id, Some(task_id), TimelineEventType::TaskMoved,
                format!("Task '{}' moved from {} to {}", title, old_column, column_id));
        }

        Ok(task.clone())
    }

    pub fn delete_task(&mut self, task_id: &str) -> Result<(), String> {
        let task = self.tasks.remove(task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?;

        self.add_timeline_entry(&task.project_id, Some(task_id), TimelineEventType::TaskDeleted,
            format!("Task '{}' deleted", task.title));

        Ok(())
    }

    // ============================================
    // Subtask Operations
    // ============================================

    pub fn add_subtask(&mut self, task_id: &str, title: &str) -> Result<Subtask, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?;

        let subtask = Subtask {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            completed: false,
        };

        task.subtasks.push(subtask.clone());
        task.updated_at = chrono::Utc::now().timestamp();

        Ok(subtask)
    }

    pub fn toggle_subtask(&mut self, task_id: &str, subtask_id: &str) -> Result<bool, String> {
        let task = self.tasks.get_mut(task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?;

        let subtask = task.subtasks.iter_mut()
            .find(|s| s.id == subtask_id)
            .ok_or_else(|| format!("Subtask not found: {}", subtask_id))?;

        subtask.completed = !subtask.completed;
        task.updated_at = chrono::Utc::now().timestamp();

        Ok(subtask.completed)
    }

    // ============================================
    // Timeline Operations
    // ============================================

    fn add_timeline_entry(
        &mut self,
        project_id: &str,
        task_id: Option<&str>,
        event_type: TimelineEventType,
        description: String,
    ) {
        let entry = TimelineEntry {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            task_id: task_id.map(|s| s.to_string()),
            event_type,
            description,
            user: None,
            timestamp: chrono::Utc::now().timestamp(),
            metadata: HashMap::new(),
        };
        self.timeline.push(entry);
    }

    pub fn get_project_timeline(&self, project_id: &str, limit: usize) -> Vec<&TimelineEntry> {
        let mut entries: Vec<_> = self.timeline.iter()
            .filter(|e| e.project_id == project_id)
            .collect();
        entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        entries.into_iter().take(limit).collect()
    }

    // ============================================
    // Metrics Operations
    // ============================================

    pub fn get_project_metrics(&self, project_id: &str) -> ProjectMetrics {
        let tasks: Vec<_> = self.tasks.values()
            .filter(|t| t.project_id == project_id)
            .collect();

        let total_tasks = tasks.len() as i32;
        let completed_tasks = tasks.iter().filter(|t| t.completed_at.is_some()).count() as i32;
        let in_progress_tasks = tasks.iter().filter(|t| t.column_id == "in_progress").count() as i32;
        
        let now = chrono::Utc::now().timestamp();
        let overdue_tasks = tasks.iter()
            .filter(|t| t.due_date.map(|d| d < now).unwrap_or(false) && t.completed_at.is_none())
            .count() as i32;

        let completion_percentage = if total_tasks > 0 {
            (completed_tasks as f64 / total_tasks as f64) * 100.0
        } else {
            0.0
        };

        // Tasks by column
        let mut tasks_by_column: HashMap<String, i32> = HashMap::new();
        for task in &tasks {
            *tasks_by_column.entry(task.column_id.clone()).or_insert(0) += 1;
        }

        // Tasks by priority
        let mut tasks_by_priority: HashMap<String, i32> = HashMap::new();
        for task in &tasks {
            let priority = format!("{:?}", task.priority).to_lowercase();
            *tasks_by_priority.entry(priority).or_insert(0) += 1;
        }

        // Tasks by label
        let mut tasks_by_label: HashMap<String, i32> = HashMap::new();
        for task in &tasks {
            for label in &task.labels {
                *tasks_by_label.entry(label.clone()).or_insert(0) += 1;
            }
        }

        // Velocity (simplified)
        let velocity = VelocityMetrics {
            current_week: completed_tasks / 4,
            last_week: completed_tasks / 4,
            average: completed_tasks as f64 / 4.0,
            trend: 0.0,
        };

        // Burndown (simplified)
        let burndown = vec![
            BurndownPoint { date: now - 7 * 86400, remaining: total_tasks, completed: 0, ideal: total_tasks as f64 },
            BurndownPoint { date: now, remaining: total_tasks - completed_tasks, completed: completed_tasks, ideal: 0.0 },
        ];

        ProjectMetrics {
            total_tasks,
            completed_tasks,
            in_progress_tasks,
            overdue_tasks,
            completion_percentage,
            tasks_by_column,
            tasks_by_priority,
            tasks_by_label,
            velocity,
            burndown,
        }
    }
}

// ============================================
// Update Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectUpdate {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub status: Option<ProjectStatus>,
    pub start_date: Option<Option<i64>>,
    pub target_date: Option<Option<i64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskUpdate {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub priority: Option<TaskPriority>,
    pub labels: Option<Vec<String>>,
    pub assignee: Option<Option<String>>,
    pub due_date: Option<Option<i64>>,
    pub estimated_hours: Option<Option<f64>>,
    pub actual_hours: Option<Option<f64>>,
}
