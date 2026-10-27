use smartaihub_runner::{
    config::{RunnerConfig, RunnerProfile},
    connection::connect_local_runner,
    container::run_container_entrypoint,
    diagnostics::{
        confirm_update, connection_status, redacted_status, run_local_entrypoint, run_update_child,
    },
    MIN_COMPATIBLE_RUNNER_VERSION, RUNNER_CONNECT_SCHEMA_REVISION, RUNNER_CONTROL_CONTRACT_VERSION,
    RUNNER_VERSION,
};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("status");
    let config = RunnerConfig::from_env().unwrap_or_else(|error| {
        eprintln!("runner configuration error: {error}");
        std::process::exit(2);
    });
    match command {
        "__sah-runner-update-child" => {
            if let Err(error) = run_update_child(&config, &args[1..]) {
                eprintln!("runner update helper error: {error}");
                std::process::exit(3);
            }
        }
        "__sah-runner-update-confirm" => {
            if args.get(1).is_none() {
                eprintln!("runner update confirmation command id is required");
                std::process::exit(2);
            }
            if let Err(error) = confirm_update(&config, args.get(1).expect("checked above")) {
                eprintln!("runner update confirmation error: {error}");
                std::process::exit(3);
            }
        }
        #[cfg(feature = "spec208-moli-acceptance")]
        "__sah-spec208-moli-acceptance" => {
            if let Err(error) = smartaihub_runner::moli_acceptance::run_cli(&config) {
                eprintln!("runner Moli acceptance error: {error}");
                std::process::exit(3);
            }
        }
        "version" => {
            println!(
                "{{\"version\":\"{RUNNER_VERSION}\",\"contractVersion\":\"{RUNNER_CONTROL_CONTRACT_VERSION}\",\"connectSchemaRevision\":\"{RUNNER_CONNECT_SCHEMA_REVISION}\",\"minRunnerVersion\":\"{MIN_COMPATIBLE_RUNNER_VERSION}\"}}"
            )
        }
        "status" | "doctor" | "capabilities" => {
            println!("{}", redacted_status(&config, command));
        }
        "workspace" => match args.get(1).map(String::as_str) {
            Some("list") => match smartaihub_runner::workspace_registry::list(&config) {
                Ok(workspaces) => println!(
                    "{}",
                    serde_json::to_string(&workspaces).unwrap_or_else(|_| "[]".into())
                ),
                Err(error) => {
                    eprintln!("workspace list failed: {error}");
                    std::process::exit(3);
                }
            },
            Some("add") => match register_workspace_command(&config, &args[2..]) {
                Ok(workspace) => println!(
                    "{}",
                    serde_json::to_string(&workspace)
                        .unwrap_or_else(|_| "{\"status\":\"registered\"}".into())
                ),
                Err(error) => {
                    eprintln!("workspace registration failed: {error}");
                    std::process::exit(3);
                }
            },
            Some("remove") => {
                let Some(workspace_id) = args.get(2) else {
                    eprintln!("usage: smartaihub-runner workspace remove <workspace-id>");
                    std::process::exit(2);
                };
                match smartaihub_runner::workspace_registry::remove(&config, workspace_id) {
                    Ok(removed) => println!("{{\"removed\":{removed}}}"),
                    Err(error) => {
                        eprintln!("workspace removal failed: {error}");
                        std::process::exit(3);
                    }
                }
            }
            Some("root") => match args.get(2).map(String::as_str) {
                Some("list") => match smartaihub_runner::workspace_registry::list_roots(&config) {
                    Ok(roots) => println!(
                        "{}",
                        serde_json::to_string(&roots).unwrap_or_else(|_| "[]".into())
                    ),
                    Err(error) => {
                        eprintln!("workspace root list failed: {error}");
                        std::process::exit(3);
                    }
                },
                Some("add") => {
                    let Some(path) = args.get(3) else {
                        eprintln!("usage: smartaihub-runner workspace root add <folder-path>");
                        std::process::exit(2);
                    };
                    match smartaihub_runner::workspace_registry::register_root(
                        &config,
                        std::path::Path::new(path),
                    ) {
                        Ok(root) => println!(
                            "{}",
                            serde_json::to_string(&root).unwrap_or_else(|_| "{}".into())
                        ),
                        Err(error) => {
                            eprintln!("workspace root registration failed: {error}");
                            std::process::exit(3);
                        }
                    }
                }
                _ => {
                    eprintln!("usage: smartaihub-runner workspace root <list|add <folder-path>>");
                    std::process::exit(2);
                }
            },
            Some("project") => {
                match args.get(2).map(String::as_str) {
                    Some("list") => match smartaihub_runner::workspace_registry::list(&config) {
                        Ok(workspaces) => {
                            let projects: Vec<_> = workspaces.into_iter().filter(|workspace| workspace.kind == smartaihub_runner::workspace_registry::WorkspaceKind::Project).collect();
                            println!(
                                "{}",
                                serde_json::to_string(&projects).unwrap_or_else(|_| "[]".into())
                            );
                        }
                        Err(error) => {
                            eprintln!("workspace project list failed: {error}");
                            std::process::exit(3);
                        }
                    },
                    Some("create") if (6..=7).contains(&args.len()) => {
                        let root_id = &args[3];
                        let project_id = &args[4];
                        let name = &args[5];
                        let repository_id = if args.len() > 6 {
                            Some(args[6].as_str())
                        } else {
                            None
                        };
                        match smartaihub_runner::workspace_registry::create_project(
                            &config,
                            root_id,
                            project_id,
                            name,
                            repository_id,
                        ) {
                            Ok(project) => println!(
                                "{}",
                                serde_json::to_string(&project).unwrap_or_else(|_| "{}".into())
                            ),
                            Err(error) => {
                                eprintln!("workspace project creation failed: {error}");
                                std::process::exit(3);
                            }
                        }
                    }
                    Some("import") if (6..=7).contains(&args.len()) => {
                        let root_id = &args[3];
                        let path = &args[4];
                        let project_id = &args[5];
                        let repository_id = if args.len() > 6 {
                            Some(args[6].as_str())
                        } else {
                            None
                        };
                        match smartaihub_runner::workspace_registry::import_project(
                            &config,
                            root_id,
                            std::path::Path::new(path),
                            project_id,
                            repository_id,
                        ) {
                            Ok(project) => println!(
                                "{}",
                                serde_json::to_string(&project).unwrap_or_else(|_| "{}".into())
                            ),
                            Err(error) => {
                                eprintln!("workspace project import failed: {error}");
                                std::process::exit(3);
                            }
                        }
                    }
                    _ => {
                        eprintln!("usage: smartaihub-runner workspace project <create <root-id> <project-id> <name> [repository-id]|import <root-id> <folder-path> <project-id> [repository-id]>");
                        std::process::exit(2);
                    }
                }
            }
            Some("run") if args.get(2).map(String::as_str) == Some("list") => {
                match smartaihub_runner::workspace_registry::list_run_workspaces(&config) {
                    Ok(runs) => println!(
                        "{}",
                        serde_json::to_string(&runs).unwrap_or_else(|_| "[]".into())
                    ),
                    Err(error) => {
                        eprintln!("run workspace list failed: {error}");
                        std::process::exit(3);
                    }
                }
            }
            Some("recover") => {
                match smartaihub_runner::workspace_registry::recover_project_provisioning(&config) {
                    Ok(projects) => println!(
                        "{}",
                        serde_json::to_string(&projects).unwrap_or_else(|_| "[]".into())
                    ),
                    Err(error) => {
                        eprintln!("workspace recovery failed: {error}");
                        std::process::exit(3);
                    }
                }
            }
            _ => {
                eprintln!(
                    "usage: smartaihub-runner workspace <list|add <folder-path>|remove <workspace-id>|root <list|add <folder-path>>|project <list|create|import ...>|run list|recover>"
                );
                std::process::exit(2);
            }
        },
        "connect" | "reconnect" => match connect_local_runner(&config) {
            Ok(status) => println!("{status}"),
            Err(error) => {
                eprintln!("runner connection error: {error}");
                std::process::exit(3);
            }
        },
        "rescan" => {
            if let Err(error) = register_workspace_option(&config, &args[1..]) {
                eprintln!("runner workspace error: {error}");
                std::process::exit(2);
            }
            match connection_status(&config, command) {
                Ok(status) => println!("{status}"),
                Err(error) => {
                    eprintln!("runner connection error: {error}");
                    std::process::exit(3);
                }
            }
        }
        "drain" | "shutdown" => {
            println!("{{\"command\":\"{command}\",\"state\":\"draining\"}}");
        }
        "run" => {
            if let Err(error) = register_workspace_option(&config, &args[1..]) {
                eprintln!("runner workspace error: {error}");
                std::process::exit(2);
            }
            let result = match config.profile {
                RunnerProfile::SharedContainer => run_container_entrypoint(&config),
                RunnerProfile::LocalDevice => run_local_entrypoint(&config),
            };
            if let Err(error) = result {
                eprintln!("runner entrypoint error: {error}");
                std::process::exit(3);
            }
        }
        _ => {
            eprintln!("unknown command: {command}");
            std::process::exit(2);
        }
    }
}

fn register_workspace_command(
    config: &RunnerConfig,
    args: &[String],
) -> Result<smartaihub_runner::workspace_registry::RegisteredWorkspace, String> {
    let path = args
        .first()
        .filter(|value| !value.starts_with("--"))
        .ok_or_else(|| "usage: smartaihub-runner workspace add <folder-path> [--project-id <id>] [--repository-id <id>]".to_string())?;
    let mut project_id = None;
    let mut repository_id = None;
    let mut index = 1;
    while index < args.len() {
        let value = args
            .get(index + 1)
            .filter(|value| !value.starts_with("--"))
            .ok_or_else(|| "workspace identity option requires a value".to_string())?;
        match args[index].as_str() {
            "--project-id" if project_id.is_none() => project_id = Some(value.as_str()),
            "--repository-id" if repository_id.is_none() => repository_id = Some(value.as_str()),
            _ => return Err("workspace identity option is invalid or duplicated".into()),
        }
        index += 2;
    }
    let workspace =
        smartaihub_runner::workspace_registry::register(config, std::path::Path::new(path))?;
    if project_id.is_some() || repository_id.is_some() {
        smartaihub_runner::workspace_registry::bind_identity(
            config,
            &workspace.workspace_id,
            project_id,
            repository_id,
        )
    } else {
        Ok(workspace)
    }
}

fn register_workspace_option(config: &RunnerConfig, args: &[String]) -> Result<(), String> {
    let mut workspace_path = None;
    let mut index = 0;
    while index < args.len() {
        if args[index] != "--workspace" {
            return Err("usage: smartaihub-runner run [--workspace <folder-path>]".into());
        }
        if workspace_path.is_some() {
            return Err("--workspace may be specified only once".into());
        }
        let path = args
            .get(index + 1)
            .filter(|value| !value.starts_with("--"))
            .ok_or_else(|| "--workspace requires a folder path".to_string())?;
        workspace_path = Some(path);
        index += 2;
    }
    if let Some(path) = workspace_path {
        let workspace =
            smartaihub_runner::workspace_registry::register(config, std::path::Path::new(path))?;
        std::env::set_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID", workspace.workspace_id);
    }
    Ok(())
}
