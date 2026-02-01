use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowArgs {
    pub spec_id: String,
    pub category: String,
    pub mode: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OutputMessage {
    Started {
        workflow_id: String,
        workflow_name: String,
        timestamp: String,
    },
    Log {
        workflow_id: String,
        level: String,
        message: String,
        timestamp: String,
    },
    Progress {
        workflow_id: String,
        step: String,
        progress: f64,
        message: String,
        timestamp: String,
    },
    Output {
        workflow_id: String,
        content: String,
        timestamp: String,
    },
    Error {
        workflow_id: String,
        code: String,
        message: String,
        timestamp: String,
    },
    Completed {
        workflow_id: String,
        result: serde_json::Value,
        timestamp: String,
    },
    Failed {
        workflow_id: String,
        error: String,
        timestamp: String,
    },
    WorkflowsList {
        workflows: Vec<serde_json::Value>,
        count: usize,
        timestamp: String,
    },
}

pub struct ProcessHandle {
    pub workflow_id: String,
    pub child: Option<Child>,
    pub output_rx: mpsc::Receiver<OutputMessage>,
}

pub struct PythonBridge {
    python_path: PathBuf,
    bridge_script: PathBuf,
    processes: Arc<Mutex<HashMap<String, ProcessHandle>>>,
}

impl PythonBridge {
    fn find_bridge_script() -> Result<PathBuf> {
        // Try multiple locations for the bridge script
        let possible_paths = vec![
            // Bundled resource path (production)
            std::env::current_exe()?
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Cannot get exe parent"))?
                .join("python")
                .join("bridge.py"),
            // Development path
            PathBuf::from("src-tauri/python/bridge.py"),
            // Alternative bundled path (Windows)
            std::env::current_exe()?
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Cannot get exe parent"))?
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Cannot get exe grandparent"))?
                .join("python")
                .join("bridge.py"),
        ];

        for path in possible_paths {
            if path.exists() {
                return Ok(path);
            }
        }

        anyhow::bail!("Bridge script not found in any expected location")
    }

    pub fn new() -> Result<Self> {
        // Find Python executable
        let python_path = which::which("python3")
            .or_else(|_| which::which("python"))
            .context("Python not found in PATH")?;

        // Find bridge script in bundled resources
        let bridge_script = Self::find_bridge_script()?;
        if !bridge_script.exists() {
            anyhow::bail!("Bridge script not found: {:?}", bridge_script);
        }

        Ok(Self {
            python_path,
            bridge_script,
            processes: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn with_path(bridge_script: PathBuf) -> Result<Self> {
        // Find Python executable
        let python_path = which::which("python3")
            .or_else(|_| which::which("python"))
            .context("Python not found in PATH")?;

        // Verify bridge script exists
        if !bridge_script.exists() {
            anyhow::bail!("Bridge script not found: {:?}", bridge_script);
        }

        Ok(Self {
            python_path,
            bridge_script,
            processes: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn spawn_workflow(
        &self,
        workflow_id: String,
        workflow_name: String,
        args: WorkflowArgs,
    ) -> Result<()> {
        // Build command
        let mut cmd = Command::new(&self.python_path);
        cmd.arg(&self.bridge_script)
            .arg("run-workflow")
            .arg("--workflow-id")
            .arg(&workflow_id)
            .arg("--workflow-name")
            .arg(&workflow_name)
            .arg("--spec-id")
            .arg(&args.spec_id)
            .arg("--category")
            .arg(&args.category)
            .arg("--mode")
            .arg(&args.mode)
            .arg("--platform")
            .arg(&args.platform)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn process
        let mut child = cmd.spawn().context("Failed to spawn Python process")?;

        // Create channel for output
        let (tx, rx) = mpsc::channel(100);

        // Spawn task to read stdout
        if let Some(stdout) = child.stdout.take() {
            let tx_clone = tx.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    if let Ok(msg) = serde_json::from_str::<OutputMessage>(&line) {
                        let _ = tx_clone.send(msg).await;
                    }
                }
            });
        }

        // Spawn task to read stderr
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    if let Ok(msg) = serde_json::from_str::<OutputMessage>(&line) {
                        let _ = tx.send(msg).await;
                    } else {
                        // Log raw stderr
                        eprintln!("stderr: {}", line);
                    }
                }
            });
        }

        // Store process handle
        let handle = ProcessHandle {
            workflow_id: workflow_id.clone(),
            child: Some(child),
            output_rx: rx,
        };

        self.processes.lock().unwrap().insert(workflow_id, handle);

        Ok(())
    }

    pub fn get_output(&self, workflow_id: &str) -> Result<Option<OutputMessage>> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(handle) = processes.get_mut(workflow_id) {
            match handle.output_rx.try_recv() {
                Ok(msg) => Ok(Some(msg)),
                Err(mpsc::error::TryRecvError::Empty) => Ok(None),
                Err(mpsc::error::TryRecvError::Disconnected) => {
                    anyhow::bail!("Process output channel disconnected")
                }
            }
        } else {
            anyhow::bail!("Workflow not found: {}", workflow_id)
        }
    }

    pub fn stop_workflow(&self, workflow_id: &str) -> Result<()> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(mut handle) = processes.remove(workflow_id) {
            if let Some(mut child) = handle.child.take() {
                let _ = child.start_kill();
            }
            Ok(())
        } else {
            anyhow::bail!("Workflow not found: {}", workflow_id)
        }
    }

    pub fn get_status(&self, workflow_id: &str) -> Result<String> {
        let processes = self.processes.lock().unwrap();

        if let Some(handle) = processes.get(workflow_id) {
            if handle.child.is_some() {
                Ok("Running".to_string())
            } else {
                Ok("Stopped".to_string())
            }
        } else {
            Ok("Not found".to_string())
        }
    }

    pub async fn list_workflows(&self) -> Result<Vec<serde_json::Value>> {
        // Build command
        let mut cmd = Command::new(&self.python_path);
        cmd.arg(&self.bridge_script)
            .arg("list-workflows")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn process
        let output = cmd
            .output()
            .await
            .context("Failed to execute list-workflows")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("list-workflows failed: {}", stderr);
        }

        // Parse output
        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: serde_json::Value =
            serde_json::from_str(&stdout).context("Failed to parse workflows list")?;

        if let Some(workflows) = result.get("workflows").and_then(|w| w.as_array()) {
            Ok(workflows.clone())
        } else {
            Ok(vec![])
        }
    }

    pub async fn validate_spec(&self, spec_path: String) -> Result<serde_json::Value> {
        // Build command
        let mut cmd = Command::new(&self.python_path);
        cmd.arg(&self.bridge_script)
            .arg("validate-spec")
            .arg("--spec-path")
            .arg(&spec_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn process
        let output = cmd
            .output()
            .await
            .context("Failed to execute validate-spec")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("validate-spec failed: {}", stderr);
        }

        // Parse output
        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: serde_json::Value =
            serde_json::from_str(&stdout).context("Failed to parse validation result")?;

        Ok(result)
    }
}
