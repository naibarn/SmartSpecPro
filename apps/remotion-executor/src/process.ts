import { spawn } from "node:child_process";

export function runFile(file: string, args: string[], input?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let outputLimitExceeded = false;
    const append = (current: string, chunk: string): string => {
      const remaining = 1024 * 1024 - current.length;
      if (remaining <= 0) {
        outputLimitExceeded = true;
        child.kill();
        return current;
      }
      if (chunk.length > remaining) {
        outputLimitExceeded = true;
        child.kill();
        return current + chunk.slice(0, remaining);
      }
      return current + chunk;
    };
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout = append(stdout, String(chunk)); });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = append(stderr, String(chunk)); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (outputLimitExceeded) {
        reject(new Error("process_output_too_large"));
      } else {
        resolve({ code: code ?? 1, stdout, stderr });
      }
    });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}
