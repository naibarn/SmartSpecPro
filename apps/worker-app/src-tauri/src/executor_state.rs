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
pub struct ExecutorState {
    pub accepting_jobs: bool,
    pub current_job_id: Option<String>,
    pub current_job_label: Option<String>,
    pub progress_percent: u8,
    pub status: ExecutorStatus,
    pub last_message: String,
}

impl Default for ExecutorState {
    fn default() -> Self {
        Self {
            accepting_jobs: false,
            current_job_id: None,
            current_job_label: None,
            progress_percent: 0,
            status: ExecutorStatus::Idle,
            last_message: "Idle. Connect and pass readiness checks to accept jobs.".into(),
        }
    }
}

impl ExecutorState {
    pub fn start_job(&mut self, job_id: String, label: String) {
        self.current_job_id = Some(job_id);
        self.current_job_label = Some(label);
        self.progress_percent = 0;
        self.status = ExecutorStatus::Running;
        self.last_message = "Job started.".into();
    }

    pub fn update_progress(&mut self, progress_percent: u8, message: String) {
        self.progress_percent = progress_percent.min(100);
        self.last_message = message;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_is_capped_at_one_hundred() {
        let mut state = ExecutorState::default();
        state.start_job("job-1".into(), "Render".into());
        state.update_progress(140, "Rendering".into());

        assert_eq!(state.progress_percent, 100);
        assert_eq!(state.status, ExecutorStatus::Running);
    }
}
