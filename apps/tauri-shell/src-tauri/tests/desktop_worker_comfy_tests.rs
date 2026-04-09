use serde_json::{json, Value};
use smartspec_shell_lib::desktop_worker_comfy::{
    execute_comfy_image_generation, execute_comfy_workflow_run, ComfyImageGenerationJobSpec,
    ComfyWorkflowRunJobSpec,
};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

struct MockRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

struct MockResponse {
    status: u16,
    body: Vec<u8>,
    content_type: String,
}

struct ExpectedRequest {
    method: &'static str,
    path: &'static str,
    handler: Box<dyn Fn(MockRequest) -> MockResponse + Send + 'static>,
}

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-desktop-worker-comfy-{name}-{suffix}"));
    path
}

fn status_text(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "OK",
    }
}

fn read_http_request(stream: &mut TcpStream) -> MockRequest {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut request_line = String::new();
    reader.read_line(&mut request_line).unwrap();
    let mut parts = request_line.trim().split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();

    let mut headers = HashMap::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let body_len = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut body = vec![0_u8; body_len];
    if body_len > 0 {
        reader.read_exact(&mut body).unwrap();
    }

    MockRequest {
        method,
        path,
        headers,
        body,
    }
}

fn write_http_response(stream: &mut TcpStream, response: MockResponse) {
    let headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status,
        status_text(response.status),
        response.content_type,
        response.body.len()
    );
    stream.write_all(headers.as_bytes()).unwrap();
    stream.write_all(&response.body).unwrap();
    stream.flush().unwrap();
}

fn spawn_mock_server(expectations: Vec<ExpectedRequest>) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        for expected in expectations {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_http_request(&mut stream);
            assert_eq!(request.method, expected.method);
            assert_eq!(request.path, expected.path);
            let response = (expected.handler)(request);
            write_http_response(&mut stream, response);
        }
    });
    (format!("http://{}", address), handle)
}

#[test]
fn executes_comfy_image_generation_against_loopback_service() {
    let workspace_dir = temp_dir("image-generation");
    fs::create_dir_all(&workspace_dir).unwrap();

    let image_bytes = vec![137, 80, 78, 71, 13, 10, 26, 10];
    let (base_url, handle) = spawn_mock_server(vec![
        ExpectedRequest {
            method: "POST",
            path: "/prompt",
            handler: Box::new(|request| {
                assert_eq!(
                    request.headers.get("content-type").map(String::as_str),
                    Some("application/json")
                );
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                assert!(body["prompt"].is_object());
                MockResponse {
                    status: 200,
                    body: serde_json::to_vec(&json!({ "prompt_id": "prompt-1" })).unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
        ExpectedRequest {
            method: "GET",
            path: "/history/prompt-1",
            handler: Box::new(|request| {
                assert_eq!(
                    request.headers.get("accept").map(String::as_str),
                    Some("application/json")
                );
                MockResponse {
                    status: 200,
                    body: serde_json::to_vec(&json!({
                        "prompt-1": {
                            "outputs": {
                                "9": {
                                    "images": [{
                                        "filename": "rendered.png",
                                        "subfolder": "",
                                        "type": "output"
                                    }]
                                }
                            }
                        }
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
        ExpectedRequest {
            method: "GET",
            path: "/view?filename=rendered.png&subfolder=&type=output",
            handler: Box::new(move |_| MockResponse {
                status: 200,
                body: image_bytes.clone(),
                content_type: "image/png".into(),
            }),
        },
    ]);

    let job_spec: ComfyImageGenerationJobSpec = serde_json::from_value(json!({
        "service": {
            "baseUrl": base_url,
            "submitPath": "/prompt",
            "historyPathTemplate": "/history/{promptId}",
            "viewPath": "/view",
            "pollIntervalMs": 10,
            "timeoutSeconds": 10,
            "localOnly": true
        },
        "workflowJson": {
            "9": {
                "class_type": "SaveImage"
            }
        },
        "generationSpec": {
            "promptSummary": "cinematic portrait",
            "width": 1024,
            "height": 1024,
            "batchSize": 1,
            "steps": 24,
            "cfgScale": 7.5,
            "samplerName": "euler",
            "gpuRequired": true
        },
        "outputTargets": {
            "publishImagesToLibrary": true,
            "publishManifestToLibrary": true,
            "triggerIndexing": true,
            "maxImages": 4
        }
    }))
    .unwrap();

    let result = execute_comfy_image_generation(
        "job-comfy-image-1",
        &workspace_dir.to_string_lossy(),
        &job_spec,
    )
    .unwrap();

    handle.join().unwrap();
    assert_eq!(result.prompt_id, "prompt-1");
    assert_eq!(result.downloaded_outputs.len(), 1);
    assert_eq!(result.downloaded_outputs[0].output_kind, "images");
    assert!(result.downloaded_outputs[0].absolute_path.ends_with("rendered.png"));
    assert!(PathBuf::from(&result.manifest_path).exists());

    let manifest: Value =
        serde_json::from_slice(&fs::read(&result.manifest_path).unwrap()).unwrap();
    assert_eq!(manifest["metadata"]["jobType"], "comfy_image_generation");
    assert_eq!(manifest["outputCount"], 1);
}

#[test]
fn rejects_non_loopback_comfy_service_when_local_only() {
    let workspace_dir = temp_dir("non-loopback");
    fs::create_dir_all(&workspace_dir).unwrap();

    let job_spec: ComfyImageGenerationJobSpec = serde_json::from_value(json!({
        "service": {
            "baseUrl": "https://comfy.example.test",
            "localOnly": true
        },
        "workflowJson": {
            "9": {
                "class_type": "SaveImage"
            }
        },
        "generationSpec": {
            "promptSummary": "portrait"
        },
        "outputTargets": {
            "publishImagesToLibrary": true,
            "publishManifestToLibrary": true,
            "triggerIndexing": true,
            "maxImages": 1
        }
    }))
    .unwrap();

    let error = execute_comfy_image_generation(
        "job-comfy-image-2",
        &workspace_dir.to_string_lossy(),
        &job_spec,
    )
    .unwrap_err();

    assert_eq!(error.failure_code, "adapter_contract_violation");
    assert!(error.message.contains("loopback"));
}

#[test]
fn executes_comfy_workflow_run_with_inline_text_output() {
    let workspace_dir = temp_dir("workflow-run");
    fs::create_dir_all(&workspace_dir).unwrap();

    let (base_url, handle) = spawn_mock_server(vec![
        ExpectedRequest {
            method: "POST",
            path: "/prompt",
            handler: Box::new(|_| MockResponse {
                status: 200,
                body: serde_json::to_vec(&json!({ "prompt_id": "prompt-2" })).unwrap(),
                content_type: "application/json".into(),
            }),
        },
        ExpectedRequest {
            method: "GET",
            path: "/history/prompt-2",
            handler: Box::new(|_| MockResponse {
                status: 200,
                body: serde_json::to_vec(&json!({
                    "outputs": {
                        "17": {
                            "text": [{
                                "text": "workflow completed successfully"
                            }]
                        }
                    }
                }))
                .unwrap(),
                content_type: "application/json".into(),
            }),
        },
    ]);

    let job_spec: ComfyWorkflowRunJobSpec = serde_json::from_value(json!({
        "service": {
            "baseUrl": base_url,
            "submitPath": "/prompt",
            "historyPathTemplate": "/history/{promptId}",
            "viewPath": "/view",
            "pollIntervalMs": 10,
            "timeoutSeconds": 10,
            "localOnly": true
        },
        "workflowJson": {
            "17": {
                "class_type": "TextOutput"
            }
        },
        "workflowLabel": "Narrative Workflow",
        "executionPolicy": {
            "expectedOutputTypes": ["text"],
            "gpuRequired": false,
            "failOnMissingOutputs": true
        },
        "outputTargets": {
            "publishOutputFilesToLibrary": true,
            "publishManifestToLibrary": true,
            "triggerIndexing": true,
            "maxOutputFiles": 4
        }
    }))
    .unwrap();

    let result = execute_comfy_workflow_run(
        "job-comfy-workflow-1",
        &workspace_dir.to_string_lossy(),
        &job_spec,
    )
    .unwrap();

    handle.join().unwrap();
    assert_eq!(result.prompt_id, "prompt-2");
    assert_eq!(result.downloaded_outputs.len(), 1);
    assert_eq!(result.downloaded_outputs[0].content_type, "text/plain");
    assert!(result.downloaded_outputs[0].absolute_path.ends_with(".txt"));
    assert_eq!(
        fs::read_to_string(&result.downloaded_outputs[0].absolute_path).unwrap(),
        "workflow completed successfully"
    );

    let manifest: Value =
        serde_json::from_slice(&fs::read(&result.manifest_path).unwrap()).unwrap();
    assert_eq!(manifest["metadata"]["jobType"], "comfy_workflow_run");
    assert_eq!(manifest["metadata"]["workflowLabel"], "Narrative Workflow");
}
