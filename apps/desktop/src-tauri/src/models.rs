use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Workflow model
/// Represents a workflow definition with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub version: String,
    pub config: Option<serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Workflow {
    /// Create a new workflow
    pub fn new(name: String, description: Option<String>, config: Option<serde_json::Value>) -> Self {
        let now = Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            version: "1.0.0".to_string(),
            config,
            created_at: now,
            updated_at: now,
        }
    }

    /// Update workflow
    pub fn update(&mut self, name: Option<String>, description: Option<String>, config: Option<serde_json::Value>) {
        if let Some(n) = name {
            self.name = n;
        }
        if let Some(d) = description {
            self.description = Some(d);
        }
        if let Some(c) = config {
            self.config = Some(c);
        }
        self.updated_at = Utc::now().timestamp();
    }
}

/// Workflow creation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkflowRequest {
    pub name: String,
    pub description: Option<String>,
    pub config: Option<serde_json::Value>,
}

/// Workflow update request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateWorkflowRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub config: Option<serde_json::Value>,
}

/// Execution status enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    Running,
    Completed,
    Failed,
    Stopped,
}

impl ExecutionStatus {
    pub fn as_str(&self) -> &str {
        match self {
            ExecutionStatus::Running => "running",
            ExecutionStatus::Completed => "completed",
            ExecutionStatus::Failed => "failed",
            ExecutionStatus::Stopped => "stopped",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "running" => Some(ExecutionStatus::Running),
            "completed" => Some(ExecutionStatus::Completed),
            "failed" => Some(ExecutionStatus::Failed),
            "stopped" => Some(ExecutionStatus::Stopped),
            _ => None,
        }
    }
}

/// Execution model
/// Represents a workflow execution instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Execution {
    pub id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub status: ExecutionStatus,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

impl Execution {
    /// Create a new execution
    pub fn new(workflow_id: String, workflow_name: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            workflow_id,
            workflow_name,
            status: ExecutionStatus::Running,
            output: None,
            error: None,
            started_at: Utc::now().timestamp(),
            completed_at: None,
        }
    }

    /// Mark execution as completed
    pub fn complete(&mut self, output: Option<serde_json::Value>) {
        self.status = ExecutionStatus::Completed;
        self.output = output;
        self.completed_at = Some(Utc::now().timestamp());
    }

    /// Mark execution as failed
    pub fn fail(&mut self, error: String) {
        self.status = ExecutionStatus::Failed;
        self.error = Some(error);
        self.completed_at = Some(Utc::now().timestamp());
    }

    /// Mark execution as stopped
    pub fn stop(&mut self) {
        self.status = ExecutionStatus::Stopped;
        self.completed_at = Some(Utc::now().timestamp());
    }

    /// Get duration in seconds
    pub fn duration(&self) -> Option<i64> {
        self.completed_at.map(|end| end - self.started_at)
    }
}

/// Config value type enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConfigValueType {
    String,
    Number,
    Boolean,
    Json,
}

impl ConfigValueType {
    pub fn as_str(&self) -> &str {
        match self {
            ConfigValueType::String => "string",
            ConfigValueType::Number => "number",
            ConfigValueType::Boolean => "boolean",
            ConfigValueType::Json => "json",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "string" => Some(ConfigValueType::String),
            "number" => Some(ConfigValueType::Number),
            "boolean" => Some(ConfigValueType::Boolean),
            "json" => Some(ConfigValueType::Json),
            _ => None,
        }
    }
}

/// Config model
/// Represents a workflow configuration key-value pair
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub id: String,
    pub workflow_id: String,
    pub key: String,
    pub value: String,
    pub value_type: ConfigValueType,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Config {
    /// Create a new config
    pub fn new(
        workflow_id: String,
        key: String,
        value: String,
        value_type: ConfigValueType,
        description: Option<String>,
    ) -> Self {
        let now = Utc::now().timestamp();
        Self {
            id: Uuid::new_v4().to_string(),
            workflow_id,
            key,
            value,
            value_type,
            description,
            created_at: now,
            updated_at: now,
        }
    }

    /// Update config value
    pub fn update(&mut self, value: String) {
        self.value = value;
        self.updated_at = Utc::now().timestamp();
    }
}

/// Execution filter for queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionFilter {
    pub workflow_id: Option<String>,
    pub status: Option<ExecutionStatus>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl Default for ExecutionFilter {
    fn default() -> Self {
        Self {
            workflow_id: None,
            status: None,
            limit: Some(50),
            offset: Some(0),
        }
    }
}

/// Workflow filter for queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowFilter {
    pub name: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl Default for WorkflowFilter {
    fn default() -> Self {
        Self {
            name: None,
            limit: Some(50),
            offset: Some(0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_creation() {
        let workflow = Workflow::new(
            "test-workflow".to_string(),
            Some("Test description".to_string()),
            None,
        );

        assert_eq!(workflow.name, "test-workflow");
        assert_eq!(workflow.version, "1.0.0");
        assert!(workflow.description.is_some());
        assert!(workflow.config.is_none());
    }

    #[test]
    fn test_workflow_update() {
        let mut workflow = Workflow::new(
            "test-workflow".to_string(),
            None,
            None,
        );

        let old_updated_at = workflow.updated_at;
        
        workflow.update(
            Some("updated-workflow".to_string()),
            Some("Updated description".to_string()),
            None,
        );

        assert_eq!(workflow.name, "updated-workflow");
        assert!(workflow.description.is_some());
        assert!(workflow.updated_at > old_updated_at);
    }

    #[test]
    fn test_execution_lifecycle() {
        let mut execution = Execution::new(
            "workflow-id".to_string(),
            "test-workflow".to_string(),
        );

        assert_eq!(execution.status, ExecutionStatus::Running);
        assert!(execution.completed_at.is_none());

        execution.complete(None);
        assert_eq!(execution.status, ExecutionStatus::Completed);
        assert!(execution.completed_at.is_some());
        assert!(execution.duration().is_some());
    }

    #[test]
    fn test_execution_status_conversion() {
        assert_eq!(ExecutionStatus::Running.as_str(), "running");
        assert_eq!(ExecutionStatus::from_str("running"), Some(ExecutionStatus::Running));
        assert_eq!(ExecutionStatus::from_str("invalid"), None);
    }

    #[test]
    fn test_config_creation() {
        let config = Config::new(
            "workflow-id".to_string(),
            "api_key".to_string(),
            "secret123".to_string(),
            ConfigValueType::String,
            Some("API key for service".to_string()),
        );

        assert_eq!(config.key, "api_key");
        assert_eq!(config.value, "secret123");
        assert_eq!(config.value_type, ConfigValueType::String);
    }
}
