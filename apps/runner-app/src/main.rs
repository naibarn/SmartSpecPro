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
            Some("add") => {
                let Some(path) = args.get(2) else {
                    eprintln!("usage: smartaihub-runner workspace add <folder-path>");
                    std::process::exit(2);
                };
                match smartaihub_runner::workspace_registry::register(
                    &config,
                    std::path::Path::new(path),
                ) {
                    Ok(workspace) => println!(
                        "{}",
                        serde_json::to_string(&workspace)
                            .unwrap_or_else(|_| "{\"status\":\"registered\"}".into())
                    ),
                    Err(error) => {
                        eprintln!("workspace registration failed: {error}");
                        std::process::exit(3);
                    }
                }
            }
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
            _ => {
                eprintln!(
                    "usage: smartaihub-runner workspace <list|add <folder-path>|remove <workspace-id>>"
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
        "rescan" => match connection_status(&config, command) {
            Ok(status) => println!("{status}"),
            Err(error) => {
                eprintln!("runner connection error: {error}");
                std::process::exit(3);
            }
        },
        "drain" | "shutdown" => {
            println!("{{\"command\":\"{command}\",\"state\":\"draining\"}}");
        }
        "run" => {
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
