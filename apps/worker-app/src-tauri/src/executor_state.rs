use serde::{Deserialize, Serialize};

/// Feature 135 §11 — device-code panel state while a `hermes_connection_authorize`
/// control job is active. Never contains anything beyond what the
/// `hermes_device_code` worker-job event itself carries (spec §16 — never
/// logged, never in diagnostics).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HermesActiveAuth {
    pub verification_url: String,
    pub user_code: String,
    pub expires_at: Option<String>,
}

/// Feature 135 §11 — polled by the React status card in `src/main.tsx`.
/// Kept intentionally dumb (no derived UI logic) — the Rust side computes
/// doctor/version/update-required state, the UI only renders it.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HermesExecutorSummary {
    pub doctor_status: String,
    pub hermes_version: Option<String>,
    /// Set from the heartbeat response's warning field (server-side
    /// `hermes_worker_min_version` enforcement) — renders as an
    /// "update required" banner.
    pub update_required: bool,
    pub update_required_reason: Option<String>,
    pub active_auth: Option<HermesActiveAuth>,
}

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
    /// Feature 135 §11 — `None` until `worker_app_hermes_doctor`/
    /// `worker_app_install_hermes_runtime` runs at least once.
    pub hermes: Option<HermesExecutorSummary>,
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
            hermes: None,
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

    pub fn set_hermes_summary(&mut self, summary: HermesExecutorSummary) {
        self.hermes = Some(summary);
    }

    /// Upserts the doctor-derived fields only, preserving whatever
    /// `updateRequired`/`updateRequiredReason` the heartbeat loop already
    /// set (`set_hermes_update_required`) so a doctor re-run never clobbers
    /// the server's min-version warning, and vice versa.
    pub fn set_hermes_doctor(&mut self, doctor_status: String, hermes_version: Option<String>) {
        let mut summary = self.hermes.clone().unwrap_or_default();
        summary.doctor_status = doctor_status;
        summary.hermes_version = hermes_version;
        self.hermes = Some(summary);
    }

    /// Upserts the heartbeat-response-derived "update required" warning
    /// (server-side `hermes_worker_min_version` enforcement), preserving
    /// whatever doctor state is already present.
    pub fn set_hermes_update_required(&mut self, update_required: bool, reason: Option<String>) {
        let mut summary = self.hermes.clone().unwrap_or_default();
        summary.update_required = update_required;
        summary.update_required_reason = reason;
        self.hermes = Some(summary);
    }

    pub fn set_hermes_active_auth(&mut self, active_auth: Option<HermesActiveAuth>) {
        let mut summary = self.hermes.clone().unwrap_or_default();
        summary.active_auth = active_auth;
        self.hermes = Some(summary);
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

    #[test]
    fn hermes_doctor_and_update_required_updates_do_not_clobber_each_other() {
        let mut state = ExecutorState::default();
        state.set_hermes_update_required(true, Some("below minimum".into()));
        state.set_hermes_doctor("ready".into(), Some("0.18.2".into()));

        let hermes = state.hermes.expect("hermes summary should be set");
        assert_eq!(hermes.doctor_status, "ready");
        assert_eq!(hermes.hermes_version.as_deref(), Some("0.18.2"));
        // The doctor update must not have cleared the previously-set warning.
        assert!(hermes.update_required);
        assert_eq!(hermes.update_required_reason.as_deref(), Some("below minimum"));
    }
}
