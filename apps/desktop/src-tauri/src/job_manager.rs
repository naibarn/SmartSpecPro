// Job Manager - Job and Branch Management System
//
// Provides:
// - Job lifecycle management (create, start, pause, complete)
// - Task breakdown and tracking
// - Git branch integration
// - Progress monitoring

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub description: String,
    pub status: JobStatus,
    pub priority: JobPriority,
    pub branch_name: Option<String>,
    pub parent_job_id: Option<String>,
    pub tasks: Vec<Task>,
    pub tags: Vec<String>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub progress_percent: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum JobStatus {
    Draft,
    Ready,
    InProgress,
    Paused,
    Blocked,
    Review,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum JobPriority {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub job_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub task_type: TaskType,
    pub order: i32,
    pub estimated_minutes: Option<i32>,
    pub actual_minutes: Option<i32>,
    pub file_path: Option<String>,
    pub line_start: Option<i32>,
    pub line_end: Option<i32>,
    pub dependencies: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskType {
    Spec,
    Design,
    Implement,
    Test,
    Review,
    Document,
    Deploy,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub name: String,
    pub job_id: Option<String>,
    pub is_current: bool,
    pub is_remote: bool,
    pub ahead: i32,
    pub behind: i32,
    pub last_commit: Option<CommitInfo>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStats {
    pub total_jobs: i32,
    pub by_status: HashMap<String, i32>,
    pub by_priority: HashMap<String, i32>,
    pub total_tasks: i32,
    pub completed_tasks: i32,
    pub total_estimated_hours: f64,
    pub total_actual_hours: f64,
}

// ============================================
// Request Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateJobRequest {
    pub title: String,
    pub description: String,
    pub priority: Option<JobPriority>,
    pub parent_job_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub estimated_hours: Option<f64>,
    pub create_branch: bool,
    pub branch_prefix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateJobRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<JobStatus>,
    pub priority: Option<JobPriority>,
    pub tags: Option<Vec<String>>,
    pub estimated_hours: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub task_type: TaskType,
    pub estimated_minutes: Option<i32>,
    pub file_path: Option<String>,
    pub line_start: Option<i32>,
    pub line_end: Option<i32>,
    pub dependencies: Option<Vec<String>>,
}

// ============================================
// Job Manager
// ============================================

pub struct JobManager {
    jobs: Arc<Mutex<HashMap<String, Job>>>,
    workspace_path: Arc<Mutex<Option<String>>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
            workspace_path: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn set_workspace(&self, path: &str) {
        *self.workspace_path.lock().await = Some(path.to_string());
    }

    // ============================================
    // Job Operations
    // ============================================

    pub async fn create_job(&self, workspace_id: &str, request: CreateJobRequest) -> Result<Job, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();

        // Generate branch name if requested
        let branch_name = if request.create_branch {
            let prefix = request.branch_prefix.unwrap_or_else(|| "feature".to_string());
            let slug = Self::slugify(&request.title);
            Some(format!("{}/{}-{}", prefix, slug, &id[..8]))
        } else {
            None
        };

        let job = Job {
            id: id.clone(),
            workspace_id: workspace_id.to_string(),
            title: request.title,
            description: request.description,
            status: JobStatus::Draft,
            priority: request.priority.unwrap_or(JobPriority::Medium),
            branch_name,
            parent_job_id: request.parent_job_id,
            tasks: Vec::new(),
            tags: request.tags.unwrap_or_default(),
            estimated_hours: request.estimated_hours,
            actual_hours: None,
            progress_percent: 0,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
            metadata: HashMap::new(),
        };

        self.jobs.lock().await.insert(id, job.clone());
        Ok(job)
    }

    pub async fn get_job(&self, job_id: &str) -> Option<Job> {
        self.jobs.lock().await.get(job_id).cloned()
    }

    pub async fn update_job(&self, job_id: &str, request: UpdateJobRequest) -> Result<Job, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        if let Some(title) = request.title {
            job.title = title;
        }
        if let Some(description) = request.description {
            job.description = description;
        }
        if let Some(status) = request.status {
            job.status = status;
        }
        if let Some(priority) = request.priority {
            job.priority = priority;
        }
        if let Some(tags) = request.tags {
            job.tags = tags;
        }
        if let Some(estimated_hours) = request.estimated_hours {
            job.estimated_hours = Some(estimated_hours);
        }

        job.updated_at = Utc::now();
        Ok(job.clone())
    }

    pub async fn delete_job(&self, job_id: &str) -> Result<(), String> {
        self.jobs.lock().await.remove(job_id).ok_or("Job not found")?;
        Ok(())
    }

    pub async fn list_jobs(&self, workspace_id: &str, status: Option<JobStatus>) -> Vec<Job> {
        let jobs = self.jobs.lock().await;
        jobs.values()
            .filter(|j| j.workspace_id == workspace_id)
            .filter(|j| status.as_ref().map_or(true, |s| &j.status == s))
            .cloned()
            .collect()
    }

    // ============================================
    // Job Status Transitions
    // ============================================

    pub async fn start_job(&self, job_id: &str) -> Result<Job, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        if job.status != JobStatus::Ready && job.status != JobStatus::Paused {
            return Err("Job cannot be started from current status".to_string());
        }

        job.status = JobStatus::InProgress;
        job.started_at = Some(Utc::now());
        job.updated_at = Utc::now();

        Ok(job.clone())
    }

    pub async fn pause_job(&self, job_id: &str) -> Result<Job, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        if job.status != JobStatus::InProgress {
            return Err("Only in-progress jobs can be paused".to_string());
        }

        job.status = JobStatus::Paused;
        job.updated_at = Utc::now();

        Ok(job.clone())
    }

    pub async fn complete_job(&self, job_id: &str) -> Result<Job, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        job.status = JobStatus::Completed;
        job.completed_at = Some(Utc::now());
        job.progress_percent = 100;
        job.updated_at = Utc::now();

        // Calculate actual hours
        if let Some(started) = job.started_at {
            let duration = Utc::now() - started;
            job.actual_hours = Some(duration.num_minutes() as f64 / 60.0);
        }

        Ok(job.clone())
    }

    pub async fn cancel_job(&self, job_id: &str) -> Result<Job, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        job.status = JobStatus::Cancelled;
        job.updated_at = Utc::now();

        Ok(job.clone())
    }

    // ============================================
    // Task Operations
    // ============================================

    pub async fn add_task(&self, job_id: &str, request: CreateTaskRequest) -> Result<Task, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        let task_id = uuid::Uuid::new_v4().to_string();
        let order = job.tasks.len() as i32;

        let task = Task {
            id: task_id,
            job_id: job_id.to_string(),
            title: request.title,
            description: request.description,
            status: TaskStatus::Pending,
            task_type: request.task_type,
            order,
            estimated_minutes: request.estimated_minutes,
            actual_minutes: None,
            file_path: request.file_path,
            line_start: request.line_start,
            line_end: request.line_end,
            dependencies: request.dependencies.unwrap_or_default(),
            created_at: Utc::now(),
            completed_at: None,
        };

        job.tasks.push(task.clone());
        job.updated_at = Utc::now();
        Self::update_job_progress(job);

        Ok(task)
    }

    pub async fn update_task_status(&self, job_id: &str, task_id: &str, status: TaskStatus) -> Result<Task, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        let task = job.tasks.iter_mut()
            .find(|t| t.id == task_id)
            .ok_or("Task not found")?;

        task.status = status.clone();
        if status == TaskStatus::Completed {
            task.completed_at = Some(Utc::now());
        }

        let task_clone = task.clone();
        job.updated_at = Utc::now();
        Self::update_job_progress(job);

        Ok(task_clone)
    }

    pub async fn reorder_tasks(&self, job_id: &str, task_ids: Vec<String>) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        for (i, task_id) in task_ids.iter().enumerate() {
            if let Some(task) = job.tasks.iter_mut().find(|t| &t.id == task_id) {
                task.order = i as i32;
            }
        }

        job.tasks.sort_by_key(|t| t.order);
        job.updated_at = Utc::now();

        Ok(())
    }

    pub async fn delete_task(&self, job_id: &str, task_id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        let pos = job.tasks.iter().position(|t| t.id == task_id)
            .ok_or("Task not found")?;
        
        job.tasks.remove(pos);
        job.updated_at = Utc::now();
        Self::update_job_progress(job);

        Ok(())
    }

    fn update_job_progress(job: &mut Job) {
        if job.tasks.is_empty() {
            job.progress_percent = 0;
            return;
        }

        let completed = job.tasks.iter()
            .filter(|t| t.status == TaskStatus::Completed)
            .count();

        job.progress_percent = ((completed as f64 / job.tasks.len() as f64) * 100.0) as i32;
    }

    // ============================================
    // Branch Operations
    // ============================================

    pub async fn get_branches(&self) -> Result<Vec<Branch>, String> {
        let workspace = self.workspace_path.lock().await;
        let _path = workspace.as_ref().ok_or("No workspace set")?;

        // TODO: Implement actual git operations
        // For now, return mock data
        Ok(vec![
            Branch {
                name: "main".to_string(),
                job_id: None,
                is_current: true,
                is_remote: true,
                ahead: 0,
                behind: 0,
                last_commit: Some(CommitInfo {
                    hash: "abc123def456".to_string(),
                    short_hash: "abc123d".to_string(),
                    message: "Initial commit".to_string(),
                    author: "Developer".to_string(),
                    date: Utc::now(),
                }),
                created_at: Some(Utc::now()),
            },
        ])
    }

    pub async fn create_branch(&self, job_id: &str, branch_name: &str) -> Result<Branch, String> {
        let mut jobs = self.jobs.lock().await;
        let job = jobs.get_mut(job_id).ok_or("Job not found")?;

        // TODO: Implement actual git branch creation
        job.branch_name = Some(branch_name.to_string());
        job.updated_at = Utc::now();

        Ok(Branch {
            name: branch_name.to_string(),
            job_id: Some(job_id.to_string()),
            is_current: false,
            is_remote: false,
            ahead: 0,
            behind: 0,
            last_commit: None,
            created_at: Some(Utc::now()),
        })
    }

    pub async fn checkout_branch(&self, branch_name: &str) -> Result<(), String> {
        // TODO: Implement actual git checkout
        Ok(())
    }

    pub async fn merge_branch(&self, source: &str, target: &str) -> Result<(), String> {
        // TODO: Implement actual git merge
        Ok(())
    }

    pub async fn delete_branch(&self, branch_name: &str) -> Result<(), String> {
        // TODO: Implement actual git branch deletion
        Ok(())
    }

    // ============================================
    // Statistics
    // ============================================

    pub async fn get_stats(&self, workspace_id: &str) -> JobStats {
        let jobs = self.jobs.lock().await;
        let workspace_jobs: Vec<&Job> = jobs.values()
            .filter(|j| j.workspace_id == workspace_id)
            .collect();

        let mut by_status: HashMap<String, i32> = HashMap::new();
        let mut by_priority: HashMap<String, i32> = HashMap::new();
        let mut total_tasks = 0;
        let mut completed_tasks = 0;
        let mut total_estimated_hours = 0.0;
        let mut total_actual_hours = 0.0;

        for job in &workspace_jobs {
            let status_key = format!("{:?}", job.status);
            *by_status.entry(status_key).or_insert(0) += 1;

            let priority_key = format!("{:?}", job.priority);
            *by_priority.entry(priority_key).or_insert(0) += 1;

            total_tasks += job.tasks.len() as i32;
            completed_tasks += job.tasks.iter()
                .filter(|t| t.status == TaskStatus::Completed)
                .count() as i32;

            if let Some(est) = job.estimated_hours {
                total_estimated_hours += est;
            }
            if let Some(act) = job.actual_hours {
                total_actual_hours += act;
            }
        }

        JobStats {
            total_jobs: workspace_jobs.len() as i32,
            by_status,
            by_priority,
            total_tasks,
            completed_tasks,
            total_estimated_hours,
            total_actual_hours,
        }
    }

    // ============================================
    // Utilities
    // ============================================

    fn slugify(text: &str) -> String {
        text.to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-")
            .chars()
            .take(30)
            .collect()
    }
}
