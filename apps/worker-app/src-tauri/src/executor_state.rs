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

/// One in-flight job, tracked per LANE.
///
/// Field incident 2026-07-30: `ExecutorState` had a single current-job slot,
/// but the worker loop runs two independent lanes concurrently — the render
/// lane (`render_active`: hyperframes / remotion_render_video) and the Hermes
/// media lane (`hermes_active`). Both called `set_executor_job` /
/// `set_executor_complete` on that one slot, so a short Hermes image job
/// starting mid-render OVERWROTE the render's label and, on finishing,
/// `clear_current_job()`-ed the slot outright. The app then displayed
/// "No active job" while the server dashboard showed the same worker at
/// `render_frames 60%`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveJobSummary {
    pub job_id: String,
    pub job_label: String,
    pub job_type: String,
    /// Server-authoritative creation time, when supplied by the claim
    /// response. Keep this separate from local start/claim time so the UI
    /// matches the web job list.
    pub created_at: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub progress_percent: u8,
    pub message: String,
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
    /// Every job this worker currently has in flight, across all lanes. The
    /// `current_*` fields above remain as the "primary" job for older UI
    /// paths; this is the authoritative list.
    pub active_jobs: Vec<ActiveJobSummary>,
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
            active_jobs: Vec::new(),
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
        self.start_job_with_created_at(job_id, label, job_type, project_id, project_name, None);
    }

    pub fn start_job_with_created_at(
        &mut self,
        job_id: String,
        label: String,
        job_type: String,
        project_id: Option<String>,
        project_name: Option<String>,
        created_at: Option<String>,
    ) {
        self.active_jobs.retain(|entry| entry.job_id != job_id);
        self.active_jobs.push(ActiveJobSummary {
            job_id: job_id.clone(),
            job_label: label.clone(),
            job_type: job_type.clone(),
            created_at,
            project_id: project_id.clone(),
            project_name: project_name.clone(),
            progress_percent: 0,
            message: "Job started.".into(),
        });
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

    /// Removes ONE finished job. If it was the primary, another still-running
    /// job is promoted into the `current_*` slot so the UI never blanks while
    /// the worker is still busy — the exact regression this method exists to
    /// prevent.
    pub fn finish_job(&mut self, job_id: &str) {
        self.active_jobs.retain(|entry| entry.job_id != job_id);
        if self.current_job_id.as_deref() != Some(job_id) {
            return;
        }
        match self.active_jobs.first().cloned() {
            Some(next) => self.promote_primary(next),
            None => self.clear_current_job(),
        }
    }

    fn promote_primary(&mut self, next: ActiveJobSummary) {
        self.current_job_id = Some(next.job_id);
        self.current_job_label = Some(next.job_label);
        self.current_job_type = Some(next.job_type);
        self.current_project_id = next.project_id;
        self.current_project_name = next.project_name;
        self.progress_percent = next.progress_percent;
        self.last_message = next.message;
        self.manual_command = None;
        self.preview_command = None;
        self.log_tail = None;
    }

    /// Re-derives the primary slot from `active_jobs` WITHOUT deleting anything
    /// that is still in flight. Only genuinely-empty state clears the slot.
    pub fn refresh_primary_slot(&mut self) {
        if let Some(job_id) = self.current_job_id.clone() {
            if self.active_jobs.iter().any(|entry| entry.job_id == job_id) {
                return;
            }
        }
        match self.active_jobs.first().cloned() {
            Some(next) => self.promote_primary(next),
            None => self.clear_current_job(),
        }
    }

    /// Applies a worker-LOOP lifecycle transition (polling / paused / idle).
    ///
    /// Field incident 2026-08-01: these transitions used to call
    /// `clear_current_job()` unconditionally. Since job execution is SPAWNED
    /// rather than awaited inline (worker_loop "FIX E"), the loop keeps ticking
    /// every 10s *while a render runs*, and a Hermes-capable worker still has a
    /// free hermes slot — so the tick fell through to its normal
    /// "Checking Smart AI Hub worker queue." polling transition and wiped the
    /// in-flight render out of the panel within one tick. The app showed
    /// "No active job / 0 in flight" for the whole 5-minute render while the
    /// server dashboard showed the same worker at `render_frames`.
    ///
    /// The loop's own status must never contradict what is actually in flight.
    pub fn apply_loop_status(&mut self, status: ExecutorStatus, message: String) {
        self.refresh_primary_slot();
        if self.active_jobs.is_empty() {
            self.status = status;
            self.progress_percent = 0;
            self.last_message = message;
        } else {
            // A job is in flight — keep its label, progress and message.
            self.status = ExecutorStatus::Running;
        }
    }

    /// Records progress against a specific job so a concurrent lane's updates
    /// can never be misread as this one's.
    pub fn update_job_progress(&mut self, job_id: &str, progress_percent: u8, message: &str) {
        if let Some(entry) = self
            .active_jobs
            .iter_mut()
            .find(|entry| entry.job_id == job_id)
        {
            entry.progress_percent = progress_percent.min(100);
            entry.message = message.to_string();
        }
    }

    pub fn clear_current_job(&mut self) {
        if let Some(job_id) = self.current_job_id.clone() {
            self.active_jobs.retain(|entry| entry.job_id != job_id);
        }
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

    /// Field incident 2026-07-30: the app displayed "No active job" while the
    /// server dashboard showed the same worker at `render_frames 60%`. The
    /// render lane and the Hermes media lane run CONCURRENTLY but shared a
    /// single current-job slot, so a short Hermes job finishing mid-render
    /// cleared the render out of the UI.
    #[test]
    fn a_finishing_hermes_job_does_not_clear_an_in_flight_render() {
        let mut state = ExecutorState::default();
        state.start_job(
            "render-1".into(),
            "Remotion render".into(),
            "remotion_render_video".into(),
            None,
            None,
        );
        state.update_job_progress("render-1", 60, "render_frames");
        state.start_job(
            "hermes-1".into(),
            "Grok image".into(),
            "hermes_media_image".into(),
            None,
            None,
        );
        assert_eq!(state.active_jobs.len(), 2);

        state.finish_job("hermes-1");

        // The render must still be listed AND promoted back to the primary
        // slot with its own progress, not blanked.
        assert_eq!(state.active_jobs.len(), 1);
        assert_eq!(state.active_jobs[0].job_id, "render-1");
        assert_eq!(state.active_jobs[0].progress_percent, 60);
        assert_eq!(state.current_job_id.as_deref(), Some("render-1"));
        assert_eq!(state.progress_percent, 60);
    }

    /// Field incident 2026-08-01, worker job
    /// `da73b8ef-9d4e-436f-b6fa-530d3381c438`: a LONE `remotion_render_video`
    /// job (no concurrent Hermes job at all) ran 06:43→06:48 and completed
    /// normally, but the app showed "No active job / 0 in flight / Active
    /// render None" the whole time. Job execution is spawned, so the loop kept
    /// ticking every 10s and its polling transition deleted the running render.
    #[test]
    fn a_polling_tick_does_not_erase_a_lone_in_flight_render() {
        let mut state = ExecutorState::default();
        state.start_job(
            "render-1".into(),
            "Remotion render".into(),
            "remotion_render_video".into(),
            None,
            None,
        );
        // Mirrors `worker_loop::update_executor_progress`, which writes the
        // per-job entry AND the legacy top-level fields for the primary job.
        state.update_job_progress("render-1", 60, "render_frames");
        state.update_progress(60, "render_frames".into());

        // Three ticks' worth of the exact transitions `worker_loop_tick` makes
        // while the spawned render is still executing.
        state.apply_loop_status(
            ExecutorStatus::Polling,
            "Checking Smart AI Hub worker queue.".into(),
        );
        state.apply_loop_status(
            ExecutorStatus::Polling,
            "No queued jobs. Heartbeat is active.".into(),
        );
        state.apply_loop_status(
            ExecutorStatus::Polling,
            "A job is already running in every available slot. Heartbeat is active.".into(),
        );

        assert_eq!(state.active_jobs.len(), 1);
        assert_eq!(state.current_job_id.as_deref(), Some("render-1"));
        assert_eq!(state.progress_percent, 60);
        assert_eq!(state.status, ExecutorStatus::Running);
        assert_eq!(state.last_message, "render_frames");

        // And later stages must still land on the entry — before the fix the
        // job was gone from `active_jobs`, so `update_job_progress` silently
        // no-op'd for the rest of the render.
        state.update_job_progress("render-1", 95, "upload_artifacts");
        assert_eq!(state.active_jobs[0].progress_percent, 95);
    }

    #[test]
    fn pausing_or_stopping_the_loop_keeps_a_still_running_job_visible() {
        let mut state = ExecutorState::default();
        state.start_job("render-1".into(), "R".into(), "render".into(), None, None);
        state.update_job_progress("render-1", 40, "render_frames");

        state.apply_loop_status(ExecutorStatus::Paused, "Worker paused.".into());
        assert_eq!(state.active_jobs.len(), 1);
        assert_eq!(state.status, ExecutorStatus::Running);

        state.apply_loop_status(ExecutorStatus::Idle, "Worker loop stopped.".into());
        assert_eq!(state.active_jobs.len(), 1);
        assert_eq!(state.current_job_id.as_deref(), Some("render-1"));
    }

    #[test]
    fn loop_status_applies_normally_once_nothing_is_in_flight() {
        let mut state = ExecutorState::default();
        state.start_job("render-1".into(), "R".into(), "render".into(), None, None);
        state.update_job_progress("render-1", 60, "render_frames");
        state.finish_job("render-1");

        state.apply_loop_status(
            ExecutorStatus::Polling,
            "No queued jobs. Heartbeat is active.".into(),
        );

        assert!(state.active_jobs.is_empty());
        assert!(state.current_job_id.is_none());
        assert_eq!(state.status, ExecutorStatus::Polling);
        assert_eq!(state.progress_percent, 0);
        assert_eq!(state.last_message, "No queued jobs. Heartbeat is active.");
    }

    /// A stale primary left over from a job that already left `active_jobs`
    /// must not survive a loop transition.
    #[test]
    fn refresh_primary_slot_drops_a_primary_that_is_no_longer_in_flight() {
        let mut state = ExecutorState::default();
        state.start_job("a".into(), "A".into(), "render".into(), None, None);
        state.start_job("b".into(), "B".into(), "hermes".into(), None, None);
        // Force the inconsistent shape: "b" is primary but no longer in flight.
        state.active_jobs.retain(|entry| entry.job_id != "b");

        state.refresh_primary_slot();

        assert_eq!(state.current_job_id.as_deref(), Some("a"));
        assert_eq!(state.active_jobs.len(), 1);
    }

    #[test]
    fn finishing_the_last_job_clears_the_current_slot() {
        let mut state = ExecutorState::default();
        state.start_job(
            "only-1".into(),
            "Render".into(),
            "render".into(),
            None,
            None,
        );
        state.finish_job("only-1");
        assert!(state.active_jobs.is_empty());
        assert!(state.current_job_id.is_none());
    }

    #[test]
    fn finishing_a_non_primary_job_leaves_the_primary_untouched() {
        let mut state = ExecutorState::default();
        state.start_job("a".into(), "A".into(), "render".into(), None, None);
        state.start_job("b".into(), "B".into(), "hermes".into(), None, None);
        // "b" is primary (started last); finishing "a" must not disturb it.
        state.finish_job("a");
        assert_eq!(state.current_job_id.as_deref(), Some("b"));
        assert_eq!(state.active_jobs.len(), 1);
        assert_eq!(state.active_jobs[0].job_id, "b");
    }

    #[test]
    fn per_job_progress_is_isolated_between_lanes() {
        let mut state = ExecutorState::default();
        state.start_job("render-1".into(), "R".into(), "render".into(), None, None);
        state.start_job("hermes-1".into(), "H".into(), "hermes".into(), None, None);
        state.update_job_progress("render-1", 60, "render_frames");
        state.update_job_progress("hermes-1", 10, "submitting");
        let render = state
            .active_jobs
            .iter()
            .find(|entry| entry.job_id == "render-1")
            .expect("render entry");
        assert_eq!(render.progress_percent, 60);
        assert_eq!(render.message, "render_frames");
    }

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
        state.start_job_with_created_at(
            "job-1".into(),
            "Render".into(),
            "hyperframes_final_composite".into(),
            Some("project-9".into()),
            Some("Launch video".into()),
            Some("2026-08-27T07:00:00.000Z".into()),
        );

        assert_eq!(state.queue_depth, 3);
        assert_eq!(state.current_project_id.as_deref(), Some("project-9"));
        assert_eq!(state.current_project_name.as_deref(), Some("Launch video"));
        assert_eq!(
            state.active_jobs[0].created_at.as_deref(),
            Some("2026-08-27T07:00:00.000Z")
        );
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
        assert_eq!(
            hermes.update_required_reason.as_deref(),
            Some("below minimum")
        );
    }
}
