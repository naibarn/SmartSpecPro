use smartspec_shell_lib::desktop_worker_runtime::{
    prepare_video_assembly_execution, VideoAssemblyAspectRatio, VideoAssemblyClipSpec,
    VideoAssemblyEditPlan, VideoAssemblyInputRef, VideoAssemblyInputSourceKind,
    VideoAssemblyJobSpec, VideoAssemblyOutputAssetTarget, VideoAssemblyOutputTargets,
    VideoAssemblyPlanRequest, VideoAssemblyPrefetchedInput, VideoAssemblyRenderProfile,
    VideoAssemblySubtitleMode, VideoAssemblySubtitlePlan, VideoAssemblyTrim,
    VideoAssemblyWorkspacePolicy,
};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-desktop-worker-runtime-{name}-{suffix}"));
    path
}

fn build_request(source_video: &PathBuf, workspace_dir: &PathBuf) -> VideoAssemblyPlanRequest {
    VideoAssemblyPlanRequest {
        job_id: "job-1".into(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        prefetched_inputs: vec![],
        job: VideoAssemblyJobSpec {
            input_refs: vec![VideoAssemblyInputRef {
                source_kind: VideoAssemblyInputSourceKind::AuthorizedLocalPath,
                ref_id: Some("clip-1".into()),
                path: Some(source_video.to_string_lossy().to_string()),
            }],
            edit_plan: VideoAssemblyEditPlan {
                clips: vec![VideoAssemblyClipSpec {
                    source_ref: "clip-1".into(),
                    trim: VideoAssemblyTrim {
                        start_ms: 0,
                        end_ms: 5_000,
                    },
                }],
                apply_watermark: false,
            },
            subtitle_plan: VideoAssemblySubtitlePlan {
                source_priority: "user_provided".into(),
                mode: VideoAssemblySubtitleMode::None,
                transcript_ref: None,
                subtitle_ref: None,
            },
            render_profile: VideoAssemblyRenderProfile {
                aspect_ratios: vec![
                    VideoAssemblyAspectRatio::Ratio16x9,
                    VideoAssemblyAspectRatio::Ratio9x16,
                ],
                codec_preset: "h264".into(),
                quality_preset: "standard".into(),
                gpu_required: false,
            },
            workspace_policy: VideoAssemblyWorkspacePolicy {
                mode: "workspace_scoped".into(),
                allowed_source_roots: vec![source_video.parent().unwrap().to_string_lossy().to_string()],
            },
            output_targets: VideoAssemblyOutputTargets {
                rendered_assets: vec![
                    VideoAssemblyOutputAssetTarget {
                        label: "landscape".into(),
                        aspect_ratio: VideoAssemblyAspectRatio::Ratio16x9,
                        publish_to_library: true,
                    },
                    VideoAssemblyOutputAssetTarget {
                        label: "portrait".into(),
                        aspect_ratio: VideoAssemblyAspectRatio::Ratio9x16,
                        publish_to_library: true,
                    },
                ],
                subtitles_optional: false,
                thumbnails_optional: true,
            },
        },
    }
}

#[test]
fn prepares_video_assembly_workspace_and_render_tasks_from_authorized_local_paths() {
    let root_dir = temp_dir("source-root");
    let workspace_dir = temp_dir("workspace");
    fs::create_dir_all(&root_dir).unwrap();
    fs::create_dir_all(&workspace_dir).unwrap();
    let source_video = root_dir.join("clip.mp4");
    fs::write(&source_video, b"fake-video-bytes").unwrap();

    let plan = prepare_video_assembly_execution(build_request(&source_video, &workspace_dir)).unwrap();

    assert_eq!(plan.render_tasks.len(), 2);
    assert_eq!(plan.thumbnail_tasks.len(), 2);
    assert_eq!(plan.progress_stages.first().map(String::as_str), Some("resolve_inputs"));
    assert!(PathBuf::from(&plan.staged_inputs[0].staged_path).exists());
    assert!(plan.render_tasks[0].project_json.contains("\"codec\":\"libx264\""));
  }

#[test]
fn prepares_library_asset_inputs_from_prefetched_files() {
    let root_dir = temp_dir("library-prefetch");
    let workspace_dir = temp_dir("workspace-library");
    fs::create_dir_all(&root_dir).unwrap();
    fs::create_dir_all(&workspace_dir).unwrap();
    let prefetched_video = root_dir.join("library-clip.mp4");
    fs::write(&prefetched_video, b"fake-library-video").unwrap();

    let request = VideoAssemblyPlanRequest {
        job_id: "job-library".into(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        prefetched_inputs: vec![VideoAssemblyPrefetchedInput {
            ref_id: "library-asset-1".into(),
            absolute_path: prefetched_video.to_string_lossy().to_string(),
        }],
        job: VideoAssemblyJobSpec {
            input_refs: vec![VideoAssemblyInputRef {
                source_kind: VideoAssemblyInputSourceKind::LibraryAsset,
                ref_id: Some("library-asset-1".into()),
                path: None,
            }],
            edit_plan: VideoAssemblyEditPlan {
                clips: vec![VideoAssemblyClipSpec {
                    source_ref: "library-asset-1".into(),
                    trim: VideoAssemblyTrim {
                        start_ms: 0,
                        end_ms: 2_000,
                    },
                }],
                apply_watermark: false,
            },
            subtitle_plan: VideoAssemblySubtitlePlan {
                source_priority: "user_provided".into(),
                mode: VideoAssemblySubtitleMode::SoftMux,
                transcript_ref: None,
                subtitle_ref: None,
            },
            render_profile: VideoAssemblyRenderProfile {
                aspect_ratios: vec![VideoAssemblyAspectRatio::Ratio16x9],
                codec_preset: "h264".into(),
                quality_preset: "draft".into(),
                gpu_required: true,
            },
            workspace_policy: VideoAssemblyWorkspacePolicy {
                mode: "workspace_scoped".into(),
                allowed_source_roots: vec![root_dir.to_string_lossy().to_string()],
            },
            output_targets: VideoAssemblyOutputTargets {
                rendered_assets: vec![VideoAssemblyOutputAssetTarget {
                    label: "landscape".into(),
                    aspect_ratio: VideoAssemblyAspectRatio::Ratio16x9,
                    publish_to_library: true,
                }],
                subtitles_optional: true,
                thumbnails_optional: false,
            },
        },
    };

    let plan = prepare_video_assembly_execution(request).unwrap();

    assert_eq!(plan.staged_inputs.len(), 1);
    assert_eq!(plan.render_tasks.len(), 1);
    assert!(plan.render_tasks[0].project_json.contains("\"codec\":\"h264_nvenc\""));
    assert_eq!(plan.subtitle_task.as_ref().map(|task| task.mode.clone()), Some(VideoAssemblySubtitleMode::SoftMux));
}

#[test]
fn rejects_authorized_local_paths_that_escape_allowed_roots() {
    let allowed_root = temp_dir("allowed-root");
    let denied_root = temp_dir("denied-root");
    let workspace_dir = temp_dir("workspace-denied");
    fs::create_dir_all(&allowed_root).unwrap();
    fs::create_dir_all(&denied_root).unwrap();
    fs::create_dir_all(&workspace_dir).unwrap();
    let source_video = denied_root.join("clip.mp4");
    fs::write(&source_video, b"fake-video-bytes").unwrap();

    let mut request = build_request(&source_video, &workspace_dir);
    request.job.workspace_policy.allowed_source_roots = vec![allowed_root.to_string_lossy().to_string()];

    let error = prepare_video_assembly_execution(request).unwrap_err();

    assert!(error.contains("outside the approved workspace roots"));
}
