use smartaihub_runner::{
    config::{RunnerConfig, RunnerProfile},
    container::run_container_entrypoint,
    diagnostics::{
        confirm_update, connection_status, redacted_status, run_local_entrypoint, run_update_child,
    },
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
            println!("{{\"version\":\"{RUNNER_VERSION}\",\"contractVersion\":\"sah-runner-v1\"}}")
        }
        "status" | "doctor" | "capabilities" => {
            println!("{}", redacted_status(&config, command));
        }
        "connect" | "reconnect" | "rescan" => match connection_status(&config, command) {
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
