use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutorStatus {
    Idle,
    Polling,
    Running,
    Paused,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LastJobSummary {
    pub job_id: String,
    pub job_label: String,
    pub project_name: Option<String>,
    pub status: String,
    pub message: String,
    pub log_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutorState {
    pub accepting_jobs: bool,
    pub current_job_id: Option<String>,
    pub current_job_label: Option<String>,
    pub current_job_type: Option<String>,
    pub current_project_id: Option<String>,
    pub current_project_name: Option<String>,
    pub queue_depth: u32,
    pub progress_percent: u8,
    pub status: ExecutorStatus,
    pub last_message: String,
    pub manual_command: Option<String>,
    pub preview_command: Option<String>,
    pub log_tail: Option<String>,
    pub last_completed_job: Option<LastJobSummary>,
}

impl Default for ExecutorState {
    fn default() -> Self {
        Self {
            accepting_jobs: false,
            current_job_id: None,
            current_job_label: None,
            current_job_type: None,
            current_project_id: None,
            current_project_name: None,
            queue_depth: 0,
            progress_percent: 0,
            status: ExecutorStatus::Idle,
            last_message: "Idle. Connect and pass readiness checks to accept jobs.".into(),
            manual_command: None,
            preview_command: None,
            log_tail: None,
            last_completed_job: None,
        }
    }
}

impl ExecutorState {
    pub fn start_job(
        &mut self,
        job_id: String,
        label: String,
        job_type: String,
        project_id: Option<String>,
        project_name: Option<String>,
    ) {
        self.current_job_id = Some(job_id);
        self.current_job_label = Some(label);
        self.current_job_type = Some(job_type);
        self.current_project_id = project_id;
        self.current_project_name = project_name;
        self.progress_percent = 0;
        self.status = ExecutorStatus::Running;
        self.last_message = "Job started.".into();
        self.manual_command = None;
        self.preview_command = None;
        self.log_tail = None;
    }

    pub fn clear_current_job(&mut self) {
        self.current_job_id = None;
        self.current_job_label = None;
        self.current_job_type = None;
        self.current_project_id = None;
        self.current_project_name = None;
        self.manual_command = None;
        self.preview_command = None;
        self.log_tail = None;
    }

    pub fn set_queue_depth(&mut self, queue_depth: u32) {
        self.queue_depth = queue_depth;
    }

    pub fn update_progress(&mut self, progress_percent: u8, message: String) {
        self.progress_percent = progress_percent.min(100);
        self.last_message = message;
    }

    pub fn update_sidecar_progress(
        &mut self,
        progress_percent: u8,
        manual_command: Option<String>,
        preview_command: Option<String>,
        log_tail: Option<String>,
    ) {
        self.progress_percent = progress_percent.min(100);
        if let Some(message) = log_tail
            .as_deref()
            .and_then(|tail| tail.lines().rev().find(|line| !line.trim().is_empty()))
            .map(str::trim)
            .filter(|line| !line.is_empty())
        {
            self.last_message = message.to_string();
        } else {
            self.last_message = "Waiting for HyperFrames render output...".into();
        }
        self.manual_command = manual_command;
        self.preview_command = preview_command;
        self.log_tail = log_tail;
    }

    pub fn update_last_completed_job(&mut self, summary: LastJobSummary) {
        self.last_completed_job = Some(summary);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_is_capped_at_one_hundred() {
        let mut state = ExecutorState::default();
        state.start_job("job-1".into(), "Render".into(), "render".into(), None, None);
        state.update_progress(140, "Rendering".into());

        assert_eq!(state.progress_percent, 100);
        assert_eq!(state.status, ExecutorStatus::Running);
    }

    #[test]
    fn current_job_metadata_is_serialized_in_state() {
        let mut state = ExecutorState::default();
        state.set_queue_depth(3);
        state.start_job(
            "job-1".into(),
            "Render".into(),
            "hyperframes_final_composite".into(),
            Some("project-9".into()),
            Some("Launch video".into()),
        );

        assert_eq!(state.queue_depth, 3);
        assert_eq!(state.current_project_id.as_deref(), Some("project-9"));
        assert_eq!(state.current_project_name.as_deref(), Some("Launch video"));
    }
}
