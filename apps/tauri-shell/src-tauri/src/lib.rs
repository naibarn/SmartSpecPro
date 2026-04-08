mod docker_commands;
mod git_commands;
mod file_commands;
mod local_skill_runtime;
mod terminal_pty;
mod video_editor;

use std::sync::{Arc, Mutex};

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
