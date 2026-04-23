pub mod audit_sink;
pub mod agency_swarm_runtime;
pub mod connector_runtime;
pub mod desktop_runtime_capabilities;
pub mod desktop_worker_comfy;
pub mod desktop_auth_credentials;
pub mod desktop_worker_control_plane;
pub mod desktop_worker_credentials;
pub mod desktop_worker_executor;
pub mod desktop_worker_folder_ingest;
pub mod desktop_worker_runtime;
pub mod device_identity;
pub mod device_attestation;
pub mod device_enrollment;
mod docker_commands;
mod git_commands;
mod file_commands;
pub mod local_file_index;
pub mod local_file_service;
mod local_skill_runtime;
pub mod package_materializer;
pub mod package_sync;
pub mod pi_runtime;
pub mod policy_bridge;
pub mod secret_store;
pub mod updater_bridge;
pub mod workspace_manager;
mod terminal_pty;
mod video_editor;

use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(terminal_pty::PtyState::default())
        .manage(Arc::new(Mutex::new(local_skill_runtime::LocalLlmProcessRegistry::default())))
        .manage(Arc::new(Mutex::new(video_editor::render::RenderEngine::default())))
        .manage(Arc::new(Mutex::new(video_editor::job_dispatcher::JobStore::default())))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Docker
            docker_commands::docker_check,
            docker_commands::docker_list_containers,
            docker_commands::docker_start_container,
            docker_commands::docker_stop_container,
            docker_commands::docker_restart_container,
            docker_commands::docker_remove_container,
            docker_commands::docker_container_logs,
            docker_commands::docker_exec_command,
            docker_commands::docker_list_images,
            docker_commands::docker_pull_image,
            docker_commands::docker_remove_image,
            docker_commands::docker_create_sandbox,
            docker_commands::docker_prune,
            docker_commands::docker_container_stats,
            docker_commands::docker_system_info,
            // Git
            git_commands::git_init,
            git_commands::git_status,
            git_commands::git_create_branch,
            git_commands::git_checkout,
            git_commands::git_commit_all,
            git_commands::git_push,
            git_commands::git_list_branches,
            git_commands::git_has_changes,
            // File system
            file_commands::fs_list_files,
            file_commands::fs_read_file,
            file_commands::fs_write_file,
            file_commands::fs_delete_file,
            file_commands::fs_get_file_tree,
            file_commands::fs_search_files,
            local_file_service::desktop_host_search_files,
            local_file_service::desktop_host_get_metadata,
            local_file_service::desktop_host_get_preview,
            local_file_service::desktop_host_get_snippets,
            local_file_service::desktop_host_stage_into_workspace,
            local_file_service::desktop_host_list_related_files,
            local_file_service::desktop_host_remove_root,
            local_file_service::desktop_host_describe_local_file_parser_capabilities,
            agency_swarm_runtime::desktop_host_prepare_agency_swarm_runtime,
            connector_runtime::desktop_host_authorize_connector_action,
            desktop_runtime_capabilities::desktop_host_build_runtime_capabilities,
            desktop_runtime_capabilities::desktop_host_build_worker_doctor_summary,
            desktop_worker_control_plane::desktop_host_build_desktop_device_registration_payload,
            desktop_worker_control_plane::desktop_host_build_desktop_device_heartbeat_payload,
            desktop_worker_control_plane::desktop_host_build_desktop_worker_registration_payload,
            desktop_worker_control_plane::desktop_host_build_desktop_worker_heartbeat_payload,
            desktop_worker_control_plane::desktop_host_build_worker_job_progress_event,
            desktop_worker_control_plane::desktop_host_build_worker_job_failure_event,
            desktop_worker_control_plane::desktop_host_register_device_with_control_plane,
            desktop_worker_control_plane::desktop_host_bootstrap_projected_worker_with_control_plane,
            desktop_worker_control_plane::desktop_host_register_worker_with_control_plane,
            desktop_worker_control_plane::desktop_host_send_device_heartbeat,
            desktop_worker_control_plane::desktop_host_send_worker_heartbeat,
            desktop_worker_control_plane::desktop_host_get_worker_policy_snapshot,
            desktop_worker_control_plane::desktop_host_claim_worker_job,
            desktop_worker_control_plane::desktop_host_claim_and_prepare_worker_job,
            desktop_worker_control_plane::desktop_host_report_worker_job_event,
            desktop_worker_control_plane::desktop_host_push_worker_diagnostics,
            desktop_worker_control_plane::desktop_host_init_worker_artifact_upload,
            desktop_worker_control_plane::desktop_host_complete_worker_artifact,
            desktop_worker_control_plane::desktop_host_upload_worker_artifact_file,
            desktop_worker_credentials::desktop_host_store_desktop_credential,
            desktop_worker_credentials::desktop_host_read_desktop_credential_metadata,
            desktop_worker_credentials::desktop_host_read_desktop_credential_value,
            desktop_worker_credentials::desktop_host_delete_desktop_credential,
            desktop_worker_credentials::desktop_host_clear_worker_session_credentials,
            desktop_worker_credentials::desktop_host_clear_device_runtime_credentials,
            desktop_auth_credentials::get_auth_token,
            desktop_auth_credentials::set_auth_token,
            desktop_auth_credentials::get_auth_refresh_token,
            desktop_auth_credentials::set_auth_refresh_token,
            desktop_auth_credentials::get_user_data,
            desktop_auth_credentials::set_user_data,
            desktop_auth_credentials::clear_all_credentials,
            desktop_auth_credentials::is_authenticated,
            desktop_worker_executor::desktop_host_run_single_worker_cycle,
            desktop_worker_executor::desktop_host_run_worker_loop,
            desktop_worker_folder_ingest::desktop_host_prepare_local_folder_ingest,
            desktop_worker_runtime::desktop_host_prepare_video_assembly,
            device_identity::desktop_host_initialize_device_identity,
            device_identity::desktop_host_read_device_identity,
            device_identity::desktop_host_rotate_device_identity,
            device_attestation::desktop_host_describe_device_attestation_support,
            device_enrollment::desktop_host_build_asymmetric_enrollment_proof,
            device_enrollment::desktop_host_build_enrollment_proof,
            device_enrollment::desktop_host_generate_device_signing_keypair,
            package_materializer::desktop_host_materialize_package,
            package_sync::desktop_host_prepare_package_sync,
            pi_runtime::desktop_host_prepare_pi_runtime_session,
            policy_bridge::desktop_host_validate_policy_bridge,
            secret_store::desktop_host_store_secret,
            secret_store::desktop_host_delete_secret,
            secret_store::desktop_host_read_secret_metadata,
            updater_bridge::desktop_host_verify_update_bundle,
            workspace_manager::desktop_host_build_workspace_profile,
            // Local Skill Runtime
            local_skill_runtime::local_skill_get_runtime_status,
            local_skill_runtime::local_skill_execute,
            local_skill_runtime::local_http_backend_chat_completion,
            local_skill_runtime::local_llm_prepare_model,
            local_skill_runtime::local_llm_verify_model,
            local_skill_runtime::local_llm_update_model,
            local_skill_runtime::local_llm_repair_model,
            local_skill_runtime::local_llm_remove_model,
            local_skill_runtime::local_llm_generate,
            local_skill_runtime::local_llm_analyze_image,
            local_skill_runtime::local_llm_transcribe_audio,
            local_skill_runtime::local_llm_generate_stream,
            local_skill_runtime::local_llm_cancel_stream,
            local_skill_runtime::local_tts_get_status,
            local_skill_runtime::local_tts_speak_text,
            local_skill_runtime::local_tts_stop_speaking,
            // Terminal PTY
            terminal_pty::pty_spawn,
            terminal_pty::pty_write,
            terminal_pty::pty_resize,
            terminal_pty::pty_kill,
            // Video Editor - FFmpeg
            video_editor::ffmpeg_probe_file,
            video_editor::ffmpeg_generate_thumbnail,
            video_editor::ffmpeg_detect_encoders,
            video_editor::ffmpeg_version,
            video_editor::ffmpeg_extract_waveform,
            // Video Editor - Workspace
            video_editor::get_video_editor_workspace_path,
            video_editor::get_video_editor_projects_path,
            video_editor::file_exists,
            video_editor::save_blob_to_file,
            video_editor::get_file_size,
            video_editor::delete_file,
            video_editor::list_workspace_files,
            video_editor::cleanup_workspace,
            // Video Editor - Render
            video_editor::render::start_render,
            video_editor::render::get_render_status,
            video_editor::render::cancel_render,
            video_editor::render::list_render_jobs,
            // Video Editor - Job Dispatcher
            video_editor::job_dispatcher::submit_media_job,
            video_editor::job_dispatcher::get_media_job_status,
            video_editor::job_dispatcher::cancel_media_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
