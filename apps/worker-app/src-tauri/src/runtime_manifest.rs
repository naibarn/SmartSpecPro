use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePackManifest {
    pub runtime_id: String,
    pub version: String,
    pub hyperframes_version: String,
    pub browser_version: String,
    pub ffmpeg_version: String,
    pub ffprobe_version: String,
    pub thai_font_family: String,
    pub sidecar_path: String,
    pub sidecar_sha256: String,
    pub checksum_file: String,
    pub signature_file: String,
    pub license_notices: Vec<String>,
    pub supported_contract_versions: Vec<String>,
    pub runtime_profile_hash: String,
    pub allowed: bool,
    pub deny_reason: Option<String>,
    pub rollback_to_version: Option<String>,
    #[serde(default)]
    pub archive_url: Option<String>,
    #[serde(default)]
    pub archive_sha256: Option<String>,
    #[serde(default)]
    pub archive_size_bytes: Option<u64>,
    #[serde(default)]
    pub runtime_platform: Option<String>,
    #[serde(default)]
    pub sidecar_script_path: Option<String>,
    #[serde(default)]
    pub remotion_platform_contract_version: Option<String>,
    #[serde(default)]
    pub remotion_sidecar_script_path: Option<String>,
    #[serde(default)]
    pub transcription: Option<RuntimeTranscriptionManifest>,
}

/// The transcription runtime is deliberately part of the signed runtime-pack
/// contract. HyperFrames' `transcribe` command discovers whisper.cpp through
/// the process environment and otherwise downloads/builds it on first use;
/// that is not deterministic or suitable for a managed Worker.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTranscriptionManifest {
    pub engine: String,
    pub version: String,
    pub binary_path: String,
    pub binary_sha256: String,
    pub model: String,
    pub model_path: String,
    pub model_sha256: String,
    pub model_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorCheck {
    pub id: String,
    pub status: String,
    pub message: String,
    #[serde(default)]
    pub details_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorSummary {
    pub status: String,
    pub checks: Vec<DoctorCheck>,
    #[serde(default)]
    pub recommended_actions: Vec<String>,
    #[serde(default)]
    pub official_hyperframes_runtime: Option<bool>,
    #[serde(default)]
    pub runtime_kind: Option<String>,
}

pub fn doctor_from_default_paths(resource_dir: &Path) -> DoctorSummary {
    let manifest_path = resource_dir.join("runtime-pack").join("manifest.json");
    let sidecar_root = resource_dir.join("sidecars");
    doctor_from_manifest_path(&manifest_path, &sidecar_root)
}

pub fn runtime_pack_paths(resource_dir: &Path, app_data_dir: &Path) -> (PathBuf, PathBuf) {
    let installed_manifest_path = app_data_dir.join("runtime-pack").join("manifest.json");

    let mut bundled_resource_dir = resource_dir.to_path_buf();
    if !bundled_resource_dir
        .join("runtime-pack")
        .join("manifest.json")
        .is_file()
    {
        if bundled_resource_dir
            .join("_up_")
            .join("runtime-pack")
            .join("manifest.json")
            .is_file()
        {
            bundled_resource_dir = bundled_resource_dir.join("_up_");
        }
    }

    let bundled_manifest_path = bundled_resource_dir
        .join("runtime-pack")
        .join("manifest.json");

    let installed_version = read_runtime_pack_manifest(&installed_manifest_path)
        .ok()
        .map(|m| m.version);
    let bundled_version = read_runtime_pack_manifest(&bundled_manifest_path)
        .ok()
        .map(|m| m.version);

    if let (Some(ref iv), Some(ref bv)) = (installed_version, bundled_version) {
        if bv >= iv {
            return (bundled_manifest_path, bundled_resource_dir.join("sidecars"));
        }
    }

    if installed_manifest_path.is_file() {
        return (installed_manifest_path, app_data_dir.join("sidecars"));
    }
    (bundled_manifest_path, bundled_resource_dir.join("sidecars"))
}

pub fn doctor_from_installed_or_default_paths(
    resource_dir: &Path,
    app_data_dir: &Path,
) -> DoctorSummary {
    let (manifest_path, sidecar_root) = runtime_pack_paths(resource_dir, app_data_dir);
    doctor_from_manifest_path(&manifest_path, &sidecar_root)
}

pub fn doctor_from_manifest_path(manifest_path: &Path, sidecar_root: &Path) -> DoctorSummary {
    let manifest = match read_runtime_pack_manifest(manifest_path) {
        Ok(manifest) => manifest,
        Err(error) => {
            return DoctorSummary {
                status: "blocked".into(),
                checks: vec![DoctorCheck {
                    id: "runtime_manifest".into(),
                    status: "error".into(),
                    message: format!("Runtime manifest is unavailable: {error}"),
                    details_json: json!({ "path": manifest_path.to_string_lossy() }),
                }],
                recommended_actions: vec!["Install official HyperFrames runtime pack".into()],
                official_hyperframes_runtime: None,
                runtime_kind: None,
            };
        }
    };

    doctor_from_manifest(&manifest, sidecar_root)
}

pub fn read_runtime_pack_manifest(manifest_path: &Path) -> Result<RuntimePackManifest, String> {
    fs::read_to_string(manifest_path)
        .map_err(|error| error.to_string())
        .and_then(|contents| {
            serde_json::from_str::<RuntimePackManifest>(&contents)
                .map_err(|error| error.to_string())
        })
}

pub fn sidecar_path_from_manifest(manifest: &RuntimePackManifest, sidecar_root: &Path) -> PathBuf {
    safe_join(sidecar_root, &manifest.sidecar_path)
}

pub fn doctor_from_manifest(manifest: &RuntimePackManifest, sidecar_root: &Path) -> DoctorSummary {
    let mut checks = Vec::new();
    let mut recommended_actions = Vec::new();
    let sidecar_path = safe_join(sidecar_root, &manifest.sidecar_path);
    let runtime_root = runtime_pack_root_for_sidecars(sidecar_root);
    let runtime_pack_dir = runtime_root.clone();
    let checksum_path = safe_join(&runtime_root, &manifest.checksum_file);
    let signature_path = safe_join(&runtime_root, &manifest.signature_file);
    let sidecar_exists = sidecar_path.exists();
    let runtime_bundled = ![
        manifest.version.as_str(),
        manifest.hyperframes_version.as_str(),
        manifest.browser_version.as_str(),
        manifest.ffmpeg_version.as_str(),
        manifest.ffprobe_version.as_str(),
    ]
    .iter()
    .any(|value| *value == "0.0.0-placeholder" || *value == "not-bundled");

    checks.push(DoctorCheck {
        id: "runtime_manifest".into(),
        status: if manifest.allowed { "ok" } else { "error" }.into(),
        message: if manifest.allowed {
            format!("Runtime pack {} is allowed.", manifest.version)
        } else {
            manifest
                .deny_reason
                .clone()
                .unwrap_or_else(|| "Runtime pack is denied by policy.".into())
        },
        details_json: json!({
            "runtimeId": manifest.runtime_id,
            "version": manifest.version,
            "runtimeProfileHash": manifest.runtime_profile_hash,
            "rollbackToVersion": manifest.rollback_to_version,
            "remotionPlatformContractVersion": manifest.remotion_platform_contract_version,
        }),
    });
    if !manifest.allowed {
        recommended_actions.push("Install an allowed runtime version".into());
    }

    let host_platform_ok = if cfg!(target_os = "macos") {
        cfg!(target_arch = "aarch64") && is_macos_runtime(&manifest)
    } else if cfg!(target_os = "windows") {
        !is_macos_runtime(&manifest)
    } else {
        true
    };
    checks.push(DoctorCheck {
        id: "runtime_host_platform".into(),
        status: if host_platform_ok { "ok" } else { "error" }.into(),
        message: if host_platform_ok {
            "Runtime platform matches this Worker App host.".into()
        } else if cfg!(target_os = "macos") {
            "This macOS Worker App requires the native Apple Silicon HyperFrames runtime; WSL2 and Windows runtime packs are blocked.".into()
        } else {
            "This runtime pack does not match the Worker App host platform.".into()
        },
        details_json: json!({
            "hostOs": std::env::consts::OS,
            "hostArch": std::env::consts::ARCH,
            "runtimeId": manifest.runtime_id,
            "runtimePlatform": runtime_platform(&manifest),
        }),
    });
    if !host_platform_ok {
        recommended_actions.push(if cfg!(target_os = "macos") {
            "Install hyperframes-macos-arm64. Do not use the Windows or WSL2 runtime on macOS."
                .into()
        } else {
            "Install the runtime pack built for this Worker App host.".into()
        });
    }

    checks.push(DoctorCheck {
        id: "runtime_bundle".into(),
        status: if runtime_bundled { "ok" } else { "error" }.into(),
        message: if runtime_bundled {
            "Official HyperFrames runtime bundle is present.".into()
        } else {
            "This Worker App build does not bundle the official HyperFrames runtime yet.".into()
        },
        details_json: json!({
            "hyperframesVersion": manifest.hyperframes_version,
            "browserVersion": manifest.browser_version,
            "ffmpegVersion": manifest.ffmpeg_version,
            "ffprobeVersion": manifest.ffprobe_version,
        }),
    });
    if !runtime_bundled {
        recommended_actions.push(
            "Install a signed Smart AI Hub Worker runtime build that includes HyperFrames, browser, FFmpeg, ffprobe, and Thai fonts.".into(),
        );
    }

    let is_wsl2_runtime = is_wsl2_runtime(manifest);
    let is_macos = is_macos_runtime(&manifest);
    if is_macos {
        let remotion_sidecar = manifest
            .remotion_sidecar_script_path
            .as_deref()
            .map(|path| safe_join(&runtime_pack_dir, path));
        let remotion_sidecar_ok = remotion_sidecar.as_ref().is_some_and(|path| path.is_file());
        checks.push(DoctorCheck {
            id: "remotion_sidecar".into(),
            status: if remotion_sidecar_ok { "ok" } else { "error" }.into(),
            message: if remotion_sidecar_ok {
                "Native macOS Remotion sidecar is present.".into()
            } else {
                "Native macOS Remotion sidecar is missing from the runtime pack.".into()
            },
            details_json: json!({
                "path": remotion_sidecar.map(|path| path.to_string_lossy().to_string()),
                "manifestPath": &manifest.remotion_sidecar_script_path,
            }),
        });
        if !remotion_sidecar_ok {
            recommended_actions.push(
                "Install a complete hyperframes-macos-arm64 runtime pack with remotion-sidecar/render.mjs and its dependency tree.".into(),
            );
        }
    }
    let node_binary = if is_wsl2_runtime || is_macos {
        runtime_pack_dir.join("node").join("bin").join("node")
    } else {
        runtime_pack_dir.join("node").join("node.exe")
    };
    let hyperframes_cli = runtime_pack_dir
        .join("hyperframes")
        .join("node_modules")
        .join("hyperframes")
        .join("dist")
        .join("cli.js");
    let sidecar_script = manifest
        .sidecar_script_path
        .as_deref()
        .map(|path| safe_join(&runtime_pack_dir, path))
        .unwrap_or_else(|| {
            runtime_pack_dir
                .join("hyperframes-sidecar")
                .join("render.mjs")
        });
    let official_renderer_files =
        node_binary.is_file() && hyperframes_cli.is_file() && sidecar_script.is_file();
    checks.push(DoctorCheck {
        id: "official_hyperframes_renderer".into(),
        status: if official_renderer_files { "ok" } else { "error" }.into(),
        message: if official_renderer_files {
            "Bundled Node launcher, official HyperFrames CLI, and sidecar render script are present.".into()
        } else {
            "Official HyperFrames renderer files are missing from the runtime pack.".into()
        },
        details_json: json!({
            "node": node_binary.to_string_lossy(),
            "hyperframesCli": hyperframes_cli.to_string_lossy(),
            "sidecarScript": sidecar_script.to_string_lossy(),
            "runtimePlatform": runtime_platform(manifest),
        }),
    });
    if !official_renderer_files {
        recommended_actions.push("Install the runtime pack that bundles Node, HyperFrames CLI, and the sidecar render script.".into());
    }

    let sharp_runtime_ok = if is_wsl2_runtime {
        let hyperframes_root = runtime_pack_dir.join("hyperframes");
        let sharp_package = hyperframes_root
            .join("node_modules")
            .join("sharp")
            .join("package.json");
        let sharp_linux_package = hyperframes_root
            .join("node_modules")
            .join("@img")
            .join("sharp-linux-x64")
            .join("package.json");
        let sharp_linux_binding = hyperframes_root
            .join("node_modules")
            .join("@img")
            .join("sharp-linux-x64")
            .join("lib");
        let sharp_libvips_package = hyperframes_root
            .join("node_modules")
            .join("@img")
            .join("sharp-libvips-linux-x64")
            .join("package.json");
        let sharp_libvips_binary = hyperframes_root
            .join("node_modules")
            .join("@img")
            .join("sharp-libvips-linux-x64")
            .join("lib");
        let ok = sharp_package.is_file()
            && sharp_linux_package.is_file()
            && find_runtime_file_by_name(&sharp_linux_binding, |name| {
                name.starts_with("sharp-linux-x64") && name.ends_with(".node")
            })
            && sharp_libvips_package.is_file()
            && find_runtime_file_by_name(&sharp_libvips_binary, |name| {
                name.starts_with("libvips-cpp.so.")
            });
        checks.push(DoctorCheck {
            id: "hyperframes_native_dependencies".into(),
            status: if ok { "ok" } else { "error" }.into(),
            message: if ok {
                "WSL2 Linux x64 native dependencies for HyperFrames are present.".into()
            } else {
                "WSL2 runtime is missing Linux x64 native dependencies required by HyperFrames."
                    .into()
            },
            details_json: json!({
                "sharpPackage": sharp_package.to_string_lossy(),
                "sharpLinuxPackage": sharp_linux_package.to_string_lossy(),
                "sharpLinuxBindingDir": sharp_linux_binding.to_string_lossy(),
                "sharpLibvipsPackage": sharp_libvips_package.to_string_lossy(),
                "sharpLibvipsBinaryDir": sharp_libvips_binary.to_string_lossy(),
            }),
        });
        ok
    } else if is_macos {
        let hyperframes_root = runtime_pack_dir.join("hyperframes");
        let sharp_package = hyperframes_root.join("node_modules/sharp/package.json");
        let sharp_mac_package =
            hyperframes_root.join("node_modules/@img/sharp-darwin-arm64/package.json");
        let sharp_mac_binding = hyperframes_root.join("node_modules/@img/sharp-darwin-arm64/lib");
        let sharp_libvips_package =
            hyperframes_root.join("node_modules/@img/sharp-libvips-darwin-arm64/package.json");
        let sharp_libvips_binary =
            hyperframes_root.join("node_modules/@img/sharp-libvips-darwin-arm64/lib");
        let ok = sharp_package.is_file()
            && sharp_mac_package.is_file()
            && find_runtime_file_by_name(&sharp_mac_binding, |name| {
                name.starts_with("sharp-darwin-arm64") && name.ends_with(".node")
            })
            && sharp_libvips_package.is_file()
            && find_runtime_file_by_name(&sharp_libvips_binary, |name| {
                name.starts_with("libvips-cpp.")
                    && (name.ends_with(".dylib") || name.contains(".dylib."))
            });
        checks.push(DoctorCheck {
            id: "hyperframes_native_dependencies".into(),
            status: if ok { "ok" } else { "error" }.into(),
            message: if ok {
                "macOS arm64 native dependencies for HyperFrames are present.".into()
            } else {
                "macOS runtime is missing arm64 sharp/libvips native dependencies required by HyperFrames.".into()
            },
            details_json: json!({
                "sharpPackage": sharp_package.to_string_lossy(),
                "sharpMacPackage": sharp_mac_package.to_string_lossy(),
                "sharpMacBindingDir": sharp_mac_binding.to_string_lossy(),
                "sharpLibvipsPackage": sharp_libvips_package.to_string_lossy(),
                "sharpLibvipsBinaryDir": sharp_libvips_binary.to_string_lossy(),
            }),
        });
        ok
    } else {
        checks.push(DoctorCheck {
            id: "hyperframes_native_dependencies".into(),
            status: "ok".into(),
            message: "Windows fallback runtime does not require WSL2 Linux x64 sharp bindings."
                .into(),
            details_json: json!({
                "runtimePlatform": runtime_platform(manifest),
            }),
        });
        true
    };
    if !sharp_runtime_ok {
        recommended_actions.push(if is_macos {
            "Install the hyperframes-macos-arm64 runtime pack that includes @img/sharp-darwin-arm64 and @img/sharp-libvips-darwin-arm64.".into()
        } else if is_wsl2_runtime {
            "Install the WSL2 HyperFrames runtime pack that includes @img/sharp-linux-x64 and @img/sharp-libvips-linux-x64.".into()
        } else {
            "Install the Windows HyperFrames runtime pack for the selected Worker App host.".into()
        });
    }

    let browser_names: &[&str] = if is_wsl2_runtime {
        &["chrome", "headless_shell", "chrome-headless-shell"]
    } else if is_macos {
        &[
            "chrome",
            "headless_shell",
            "chrome-headless-shell",
            "Google Chrome for Testing",
        ]
    } else {
        &["chrome.exe", "headless_shell.exe"]
    };
    let browser_ok = find_runtime_file(&runtime_pack_dir.join("browser"), browser_names);
    checks.push(DoctorCheck {
        id: "browser_runtime".into(),
        status: if browser_ok { "ok" } else { "error" }.into(),
        message: if browser_ok {
            if is_wsl2_runtime {
                "WSL2 Linux Chrome browser runtime is present.".into()
            } else if is_macos {
                "macOS Apple Silicon Chrome browser runtime is present.".into()
            } else {
                "Windows Chrome browser runtime is present.".into()
            }
        } else {
            if is_wsl2_runtime {
                "WSL2 Linux Chrome browser runtime is missing.".into()
            } else if is_macos {
                "macOS Apple Silicon Chrome browser runtime is missing.".into()
            } else {
                "Windows Chrome browser runtime is missing.".into()
            }
        },
        details_json: json!({ "browserDir": runtime_pack_dir.join("browser").to_string_lossy() }),
    });
    if !browser_ok {
        recommended_actions.push(if is_wsl2_runtime {
            "Install the WSL2 HyperFrames runtime pack with a Linux Chrome browser runtime.".into()
        } else if is_macos {
            "Install the hyperframes-macos-arm64 runtime pack with native Chrome for Testing."
                .into()
        } else {
            "Install the Windows Chrome for Testing runtime pack.".into()
        });
    }

    let ffmpeg_path = runtime_pack_dir
        .join("bin")
        .join(if is_wsl2_runtime || is_macos {
            "ffmpeg"
        } else {
            "ffmpeg.exe"
        });
    let ffprobe_path = runtime_pack_dir
        .join("bin")
        .join(if is_wsl2_runtime || is_macos {
            "ffprobe"
        } else {
            "ffprobe.exe"
        });
    let media_tools_ok = ffmpeg_path.is_file() && ffprobe_path.is_file();
    checks.push(DoctorCheck {
        id: "media_tools".into(),
        status: if media_tools_ok { "ok" } else { "error" }.into(),
        message: if media_tools_ok {
            "FFmpeg and ffprobe binaries are present for the selected runtime platform.".into()
        } else {
            "FFmpeg or ffprobe is missing for the selected runtime platform.".into()
        },
        details_json: json!({
            "ffmpeg": ffmpeg_path.to_string_lossy(),
            "ffprobe": ffprobe_path.to_string_lossy(),
            "runtimePlatform": runtime_platform(manifest),
        }),
    });
    if !media_tools_ok {
        recommended_actions.push(
            "Install a runtime pack with FFmpeg and ffprobe for the selected runtime platform."
                .into(),
        );
    }

    let transcription = manifest.transcription.as_ref();
    let transcription_binary = transcription
        .map(|item| safe_join(&runtime_pack_dir, &item.binary_path));
    let transcription_model = transcription
        .map(|item| safe_join(&runtime_pack_dir, &item.model_path));
    let transcription_contract_ok = transcription.is_some_and(|item| {
        item.engine == "whisper.cpp"
            && !item.version.trim().is_empty()
            && !item.binary_sha256.trim().is_empty()
            && !item.model.trim().is_empty()
            && !item.model_sha256.trim().is_empty()
            && !item.model_url.trim().is_empty()
    });
    let transcription_files_ok = transcription_contract_ok
        && transcription_binary.as_ref().is_some_and(|path| path.is_file())
        && transcription_model.as_ref().is_some_and(|path| {
            path.is_file() && fs::metadata(path).map(|metadata| metadata.len() > 100_000_000).unwrap_or(false)
        });
    checks.push(DoctorCheck {
        id: "transcription_runtime".into(),
        status: if transcription_files_ok { "ok" } else { "error" }.into(),
        message: if transcription_files_ok {
            "Bundled whisper.cpp binary and multilingual transcription model are present.".into()
        } else {
            "Bundled transcription runtime is missing or its manifest contract is incomplete.".into()
        },
        details_json: json!({
            "engine": transcription.map(|item| item.engine.as_str()),
            "version": transcription.map(|item| item.version.as_str()),
            "binary": transcription_binary.as_ref().map(|path| path.to_string_lossy().to_string()),
            "binarySha256": transcription.map(|item| item.binary_sha256.as_str()),
            "model": transcription.map(|item| item.model.as_str()),
            "modelPath": transcription_model.as_ref().map(|path| path.to_string_lossy().to_string()),
            "modelSha256": transcription.map(|item| item.model_sha256.as_str()),
            "modelUrl": transcription.map(|item| item.model_url.as_str()),
        }),
    });
    if !transcription_files_ok {
        recommended_actions.push(
            "Install a complete signed runtime pack with whisper.cpp and ggml-large-v3.bin for HyperFrames transcription.".into(),
        );
    }

    checks.push(DoctorCheck {
        id: "hyperframes_sidecar".into(),
        status: if sidecar_exists { "ok" } else { "error" }.into(),
        message: if sidecar_exists {
            "HyperFrames sidecar is present.".into()
        } else {
            "HyperFrames sidecar is missing.".into()
        },
        details_json: json!({ "path": sidecar_path.to_string_lossy() }),
    });
    if !sidecar_exists {
        recommended_actions.push("Install official HyperFrames runtime pack".into());
    }

    let sidecar_has_mock_signature = sidecar_exists
        && file_contains_any(
            &sidecar_path,
            &[
                b"mock video content",
                b"mock-hyperframes",
                b"placeholder sidecar",
                b"testsrc2=",
                b"testsrc=size=",
                b"lavfi",
                b"local_smoke_snapshot",
                b"diagnostic_ffmpeg_smoke",
            ],
        );
    checks.push(DoctorCheck {
        id: "runtime_sidecar_policy".into(),
        status: if sidecar_has_mock_signature {
            "error"
        } else {
            "ok"
        }
        .into(),
        message: if sidecar_has_mock_signature {
            "Runtime sidecar is a mock or diagnostic smoke renderer and cannot produce real HyperFrames final output."
                .into()
        } else {
            "Runtime sidecar is not a known mock or diagnostic smoke renderer.".into()
        },
        details_json: json!({
            "runtimeId": manifest.runtime_id,
            "version": manifest.version,
        }),
    });
    if sidecar_has_mock_signature {
        recommended_actions.push("Install a signed official HyperFrames runtime pack; mock or diagnostic smoke sidecars cannot render final output.".into());
    }

    let hash_ok = sidecar_exists
        && file_sha256(&sidecar_path)
            .map(|digest| digest == manifest.sidecar_sha256)
            .unwrap_or(false);
    checks.push(DoctorCheck {
        id: "runtime_hash".into(),
        status: if hash_ok { "ok" } else { "error" }.into(),
        message: if hash_ok {
            "Runtime sidecar hash matches manifest.".into()
        } else {
            "Runtime sidecar hash does not match manifest.".into()
        },
        details_json: json!({
            "expectedSha256": manifest.sidecar_sha256,
            "checksumFile": manifest.checksum_file,
            "signatureFile": manifest.signature_file,
        }),
    });
    if !hash_ok {
        recommended_actions.push("Verify or reinstall render runtime".into());
    }

    let checksum_exists = checksum_path.is_file();
    let signature_exists = signature_path.is_file();
    let signature_is_placeholder = signature_exists
        && file_contains_any(
            &signature_path,
            &[b"placeholder-signature-required-before-release"],
        );
    checks.push(DoctorCheck {
        id: "runtime_signature_bundle".into(),
        status: if checksum_exists && signature_exists && !signature_is_placeholder {
            "ok"
        } else {
            "error"
        }
        .into(),
        message: if checksum_exists && signature_exists && !signature_is_placeholder {
            "Runtime checksum and signature files are present.".into()
        } else {
            "Runtime checksum/signature is missing or the signature is a placeholder.".into()
        },
        details_json: json!({
            "checksumFile": checksum_path.to_string_lossy(),
            "signatureFile": signature_path.to_string_lossy(),
            "cryptographicVerification": if signature_is_placeholder { "blocked_placeholder" } else { "pending_official_public_key" },
        }),
    });
    if !(checksum_exists && signature_exists && !signature_is_placeholder) {
        recommended_actions.push(
            "Install the signed official runtime pack with checksum and signature files".into(),
        );
    }

    let thai_font_ok = !manifest.thai_font_family.trim().is_empty();
    checks.push(DoctorCheck {
        id: "thai_font".into(),
        status: if thai_font_ok { "ok" } else { "error" }.into(),
        message: if thai_font_ok {
            format!("Thai font configured: {}", manifest.thai_font_family)
        } else {
            "Thai font is not configured.".into()
        },
        details_json: json!({ "fontFamily": manifest.thai_font_family }),
    });
    if !thai_font_ok {
        recommended_actions.push("Install the render runtime Thai font pack".into());
    }

    checks.push(DoctorCheck {
        id: "tool_versions".into(),
        status: if manifest.license_notices.is_empty() {
            "error"
        } else {
            "ok"
        }
        .into(),
        message: if manifest.license_notices.is_empty() {
            "Runtime license notices are missing.".into()
        } else {
            "Runtime tool versions and license notices are declared.".into()
        },
        details_json: json!({
            "hyperframes": manifest.hyperframes_version,
            "browser": manifest.browser_version,
            "ffmpeg": manifest.ffmpeg_version,
            "ffprobe": manifest.ffprobe_version,
            "contracts": manifest.supported_contract_versions,
            "licenseNotices": manifest.license_notices,
        }),
    });
    if manifest.license_notices.is_empty() {
        recommended_actions.push("Install a license-complete official runtime pack".into());
    }

    let has_error = checks.iter().any(|check| check.status == "error");
    let has_warn = checks.iter().any(|check| check.status == "warn");
    DoctorSummary {
        status: if has_error {
            "blocked"
        } else if has_warn {
            "degraded"
        } else {
            "ready"
        }
        .into(),
        checks,
        recommended_actions,
        official_hyperframes_runtime: Some(true),
        runtime_kind: Some("official_hyperframes".into()),
    }
}

pub fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn file_contains_any(path: &Path, needles: &[&[u8]]) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    needles.iter().any(|needle| {
        !needle.is_empty() && bytes.windows(needle.len()).any(|window| window == *needle)
    })
}

fn find_runtime_file(root: &Path, names: &[&str]) -> bool {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if find_runtime_file(&path, names) {
                return true;
            }
        } else if path.is_file() {
            if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                if names
                    .iter()
                    .any(|candidate| name.eq_ignore_ascii_case(candidate))
                {
                    return true;
                }
            }
        }
    }
    false
}

fn find_runtime_file_by_name(root: &Path, predicate: impl Fn(&str) -> bool + Copy) -> bool {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if find_runtime_file_by_name(&path, predicate) {
                return true;
            }
        } else if path.is_file() {
            if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                if predicate(name) {
                    return true;
                }
            }
        }
    }
    false
}

fn runtime_platform(manifest: &RuntimePackManifest) -> &str {
    manifest
        .runtime_platform
        .as_deref()
        .unwrap_or(manifest.runtime_id.as_str())
}

fn is_wsl2_runtime(manifest: &RuntimePackManifest) -> bool {
    let platform = runtime_platform(manifest).to_ascii_lowercase();
    platform.contains("wsl2") || platform.contains("linux")
}

fn is_macos_runtime(manifest: &RuntimePackManifest) -> bool {
    let platform = runtime_platform(manifest).to_ascii_lowercase();
    platform.contains("macos")
        || platform.contains("darwin")
        || manifest.runtime_id == "hyperframes-macos-arm64"
}

fn safe_join(root: &Path, relative: &str) -> PathBuf {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute() {
        return relative_path.to_path_buf();
    }
    root.join(relative_path)
}

pub fn runtime_pack_root_for_sidecars(sidecar_root: &Path) -> PathBuf {
    if sidecar_root
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "sidecars")
    {
        if let Some(parent) = sidecar_root.parent() {
            return parent.join("runtime-pack");
        }
    }
    sidecar_root.to_path_buf()
}
