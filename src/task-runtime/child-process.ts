import { spawn, type ChildProcess } from "node:child_process";

export type ChildProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  error: Error | null;
};

export async function terminateProcessTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    if (child.exitCode !== null || !child.pid) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, 2_000).unref();
}

export async function runChildProcess(input: {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}): Promise<ChildProcessResult> {
  const child = spawn(input.command, [...input.args], {
    cwd: input.cwd,
    env: input.env,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let aborted = false;

  child.stdout?.on("data", (chunk: Buffer) => {
    const content = chunk.toString("utf8");
    stdout += content;
    input.onStdout?.(content);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const content = chunk.toString("utf8");
    stderr += content;
    input.onStderr?.(content);
  });

  const abort = () => {
    aborted = true;
    void terminateProcessTree(child);
  };
  if (input.abortSignal?.aborted) {
    abort();
  } else {
    input.abortSignal?.addEventListener("abort", abort, { once: true });
  }

  const timeout =
    input.timeoutMs === undefined
      ? null
      : setTimeout(() => {
          timedOut = true;
          void terminateProcessTree(child);
        }, input.timeoutMs);

  const result = await new Promise<{
    exitCode: number | null;
    error: Error | null;
  }>((resolve) => {
    let settled = false;
    const settle = (value: {
      exitCode: number | null;
      error: Error | null;
    }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error) => settle({ exitCode: null, error }));
    child.once("close", (exitCode) => settle({ exitCode, error: null }));
  });

  if (timeout) clearTimeout(timeout);
  input.abortSignal?.removeEventListener("abort", abort);

  return {
    exitCode: result.exitCode,
    stdout,
    stderr,
    timedOut,
    aborted,
    error: result.error,
  };
}
