use smartaihub_runner::{
    config::{RunnerConfig, RunnerProfile},
    container::run_container_entrypoint,
    diagnostics::{connection_status, redacted_status, run_local_entrypoint},
};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("status");
    let config = RunnerConfig::from_env().unwrap_or_else(|error| {
        eprintln!("runner configuration error: {error}");
        std::process::exit(2);
    });
    match command {
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
