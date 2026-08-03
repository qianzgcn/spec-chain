import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { redactSecrets } from "@/runner/logs";
import { runChildProcess } from "@/task-runtime/child-process";

const CLI_COMMAND_TIMEOUT_MS = 60_000;
const MAX_TOOL_OUTPUT_LENGTH = 24_000;
const SESSION_PREFIX = "specchain-";

export class PlaywrightCliError extends Error {
  constructor(
    public readonly code:
      | "START_FAILED"
      | "COMMAND_FAILED"
      | "TIMEOUT"
      | "ABORTED"
      | "CROSS_ORIGIN"
      | "BROWSER_NOT_INSTALLED",
    message: string,
  ) {
    super(message);
    this.name = "PlaywrightCliError";
  }
}

export function resolveSameOriginUrl(baseUrl: string, pathOrUrl: string) {
  const base = new URL(baseUrl);
  const target = new URL(pathOrUrl, base);
  if (target.origin !== base.origin || target.username || target.password) {
    throw new PlaywrightCliError(
      "CROSS_ORIGIN",
      "页面探测只允许访问项目 Base URL 的无凭据同源地址",
    );
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new PlaywrightCliError(
      "CROSS_ORIGIN",
      "页面探测只允许访问 HTTP(S) 地址",
    );
  }
  return target.toString();
}

export function assertSameOriginNavigation(
  baseUrl: string,
  commandOutput: string,
) {
  const pageUrls = [...commandOutput.matchAll(/^- Page URL:\s*(.+?)\s*$/gm)];
  for (const match of pageUrls) {
    resolveSameOriginUrl(baseUrl, match[1]);
  }
}

function truncateOutput(content: string) {
  if (content.length <= MAX_TOOL_OUTPUT_LENGTH) return content;
  return `${content.slice(0, MAX_TOOL_OUTPUT_LENGTH)}\n\n[输出过长，已截断；请使用查找或局部快照缩小范围]`;
}

function resolveCliPath() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return require.resolve("@playwright/cli/playwright-cli.js");
}

function resolveProjectChromiumExecutablePath() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const playwright = require("playwright") as {
    chromium: { executablePath: () => string };
  };
  return playwright.chromium.executablePath();
}

export function assertPlaywrightCliBrowserInstalled(
  executablePath = resolveProjectChromiumExecutablePath(),
) {
  if (existsSync(executablePath)) return;
  throw new PlaywrightCliError(
    "BROWSER_NOT_INSTALLED",
    "项目依赖中的 Chromium 不完整，请重新执行 npm ci 后重试",
  );
}

export async function cleanupPlaywrightCliSession(input: {
  taskId: string;
  workDir: string;
}) {
  await cleanupSession({
    sessionName: `${SESSION_PREFIX}${input.taskId}`,
    workDir: input.workDir,
  });
}

async function cleanupSession(input: { sessionName: string; workDir: string }) {
  await mkdir(input.workDir, { recursive: true });
  const cliPath = resolveCliPath();
  for (const command of ["close", "delete-data"] as const) {
    await runChildProcess({
      command: process.execPath,
      args: [cliPath, `-s=${input.sessionName}`, "--raw", command],
      cwd: input.workDir,
      env: {
        ...process.env,
        CI: "1",
        NO_UPDATE_NOTIFIER: "1",
      },
      timeoutMs: 15_000,
    }).catch(() => undefined);
  }
}

export async function cleanupSpecChainPlaywrightCliSessions(workDir: string) {
  await mkdir(workDir, { recursive: true });
  const result = await runChildProcess({
    command: process.execPath,
    args: [resolveCliPath(), "--json", "list"],
    cwd: workDir,
    env: {
      ...process.env,
      CI: "1",
      NO_UPDATE_NOTIFIER: "1",
    },
    timeoutMs: 15_000,
  });
  if (result.error || result.exitCode !== 0) return;

  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    return;
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("browsers" in payload) ||
    !Array.isArray(payload.browsers)
  ) {
    return;
  }

  const sessionNames = payload.browsers.flatMap((browser) => {
    if (
      !browser ||
      typeof browser !== "object" ||
      !("name" in browser) ||
      typeof browser.name !== "string" ||
      !browser.name.startsWith(SESSION_PREFIX)
    ) {
      return [];
    }
    return [browser.name];
  });
  await Promise.all(
    sessionNames.map((sessionName) => cleanupSession({ sessionName, workDir })),
  );
}

export class PlaywrightCliSession {
  private readonly cliPath = resolveCliPath();
  private readonly configPath: string;

  constructor(
    private readonly input: {
      taskId: string;
      workDir: string;
      baseUrl: string;
      secretValues: readonly string[];
      storageStatePath?: string;
      abortSignal: AbortSignal;
    },
  ) {
    this.configPath = path.join(input.workDir, "playwright-cli.json");
  }

  get sessionName() {
    return `${SESSION_PREFIX}${this.input.taskId}`;
  }

  async initialize() {
    // 页面探测与测试执行共用项目固定版本的 Chromium，避免为 CLI 重复安装浏览器。
    const executablePath = resolveProjectChromiumExecutablePath();
    assertPlaywrightCliBrowserInstalled(executablePath);
    await mkdir(this.input.workDir, { recursive: true });
    await writeFile(
      this.configPath,
      JSON.stringify(
        {
          browser: {
            browserName: "chromium",
            isolated: true,
            launchOptions: { executablePath, headless: true },
            contextOptions: {
              viewport: { width: 1440, height: 900 },
              ...(this.input.storageStatePath
                ? { storageState: this.input.storageStatePath }
                : {}),
            },
          },
          outputMode: "stdout",
          codegen: "typescript",
          timeouts: { action: 10_000, navigation: 60_000 },
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  async open(pathOrUrl = "/") {
    const target = resolveSameOriginUrl(this.input.baseUrl, pathOrUrl);
    return this.run("open", [target, `--config=${this.configPath}`]);
  }

  snapshot(depth = 8) {
    return this.run("snapshot", [`--depth=${depth}`]);
  }

  find(text: string) {
    return this.run("find", [text]);
  }

  generateLocator(target: string) {
    return this.run("generate-locator", [target]);
  }

  click(target: string) {
    return this.run("click", [target]);
  }

  fill(target: string, value: string) {
    return this.run("fill", [target, value]);
  }

  select(target: string, value: string) {
    return this.run("select", [target, value]);
  }

  check(target: string) {
    return this.run("check", [target]);
  }

  uncheck(target: string) {
    return this.run("uncheck", [target]);
  }

  press(key: string) {
    return this.run("press", [key]);
  }

  acceptDialog(prompt?: string) {
    return this.run("dialog-accept", prompt ? [prompt] : []);
  }

  dismissDialog() {
    return this.run("dialog-dismiss", []);
  }

  goBack() {
    return this.run("go-back", []);
  }

  async close() {
    await this.run("close", [], {
      ignoreAbort: true,
      ignoreFailure: true,
      timeoutMs: 15_000,
    });
    await this.run("delete-data", [], {
      ignoreAbort: true,
      ignoreFailure: true,
      timeoutMs: 15_000,
    });
  }

  private async run(
    command: string,
    args: readonly string[],
    options: {
      ignoreAbort?: boolean;
      ignoreFailure?: boolean;
      timeoutMs?: number;
    } = {},
  ) {
    const result = await runChildProcess({
      command: process.execPath,
      args: [this.cliPath, `-s=${this.sessionName}`, "--raw", command, ...args],
      cwd: this.input.workDir,
      env: {
        ...process.env,
        CI: "1",
        NO_UPDATE_NOTIFIER: "1",
      },
      abortSignal: options.ignoreAbort ? undefined : this.input.abortSignal,
      timeoutMs: options.timeoutMs ?? CLI_COMMAND_TIMEOUT_MS,
    });

    if (result.aborted && !options.ignoreAbort) {
      throw new PlaywrightCliError("ABORTED", "页面探测已停止");
    }
    if (result.timedOut) {
      throw new PlaywrightCliError("TIMEOUT", "页面探测命令执行超时");
    }
    if ((result.error || result.exitCode !== 0) && !options.ignoreFailure) {
      const details = redactSecrets((result.stderr || result.stdout).trim(), [
        ...this.input.secretValues,
      ]);
      throw new PlaywrightCliError(
        result.error ? "START_FAILED" : "COMMAND_FAILED",
        details.slice(0, 500) || "Playwright CLI 命令执行失败",
      );
    }

    const output = redactSecrets(
      [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
      [...this.input.secretValues],
    );
    assertSameOriginNavigation(this.input.baseUrl, output);
    return truncateOutput(output);
  }
}
