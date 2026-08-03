import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type { VariableKind } from "@/generated/prisma/enums";
import {
  LOGIN_METHOD_IMPORT,
  LOGIN_METHOD_TEMPLATE,
  LOGIN_MODULE_IMPORT,
} from "@/lib/automation/login-contract";
import { redactSecrets } from "@/runner/logs";
import { buildPlaywrightConfig } from "@/runner/playwright-config";
import { runChildProcess } from "@/task-runtime/child-process";

const LOGIN_METHOD_COMPILE_TIMEOUT_MS = 60_000;
const LOGIN_SETUP_TIMEOUT_MS = 60_000;

export { LOGIN_METHOD_TEMPLATE, LOGIN_MODULE_IMPORT };

export type LoginProfileData = {
  id: string;
  name: string;
  deletedAt: Date | null;
  usernameVariable: {
    id: string;
    name: string;
    kind: VariableKind;
    deletedAt: Date | null;
  };
  passwordVariable: {
    id: string;
    name: string;
    kind: VariableKind;
    deletedAt: Date | null;
  };
};

export type ResolvedAutomationAuthentication = {
  profileId: string;
  profileName: string;
  loginMethodSource: string;
  usernameVariableName: string;
  passwordVariableName: string;
  username: string;
  password: string;
};

export class AutomationAuthenticationError extends Error {
  constructor(
    public readonly code:
      | "LOGIN_CONFIG_MISSING"
      | "LOGIN_METHOD_INVALID"
      | "LOGIN_VARIABLE_INVALID"
      | "LOGIN_METHOD_COMPILE_FAILED"
      | "LOGIN_FAILED"
      | "LOGIN_STATE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AutomationAuthenticationError";
  }
}

const PROHIBITED_LOGIN_METHOD_PATTERNS: ReadonlyArray<
  readonly [RegExp, string]
> = [
  [/\b(?:require|import)\s*\(/, "动态加载模块"],
  [/\bprocess\b/, "读取进程环境"],
  [/\beval\s*\(/, "eval"],
  [/\bnew\s+Function\b/, "Function 构造器"],
  [
    /\bpage\.(?:evaluate|evaluateHandle|addInitScript|addScriptTag)\s*\(/,
    "页面动态执行",
  ],
  [/\b(?:page|context)\.route\s*\(/, "网络拦截"],
  [/\bcontext\.(?:addCookies|clearCookies)\s*\(/, "Cookie 操作"],
  [/\bhttps?:\/\//i, "跨域或绝对地址"],
];

export function validateLoginMethodSource(source: string) {
  const normalized = source.trim();
  if (!normalized) {
    throw new AutomationAuthenticationError(
      "LOGIN_CONFIG_MISSING",
      "请先配置项目登录方法",
    );
  }

  const imports = normalized.match(/^\s*import\b.*$/gm) ?? [];
  if (imports.length !== 1 || imports[0]?.trim() !== LOGIN_METHOD_IMPORT) {
    throw new AutomationAuthenticationError(
      "LOGIN_METHOD_INVALID",
      `登录方法只能使用固定导入：${LOGIN_METHOD_IMPORT}`,
    );
  }
  if (
    !/export\s+type\s+LoginCredentials\s*=\s*\{[\s\S]*?username\s*:\s*string\s*;[\s\S]*?password\s*:\s*string\s*;[\s\S]*?\}\s*;/m.test(
      normalized,
    )
  ) {
    throw new AutomationAuthenticationError(
      "LOGIN_METHOD_INVALID",
      "登录方法必须声明固定的 LoginCredentials 类型",
    );
  }
  if (
    !/export\s+async\s+function\s+login\s*\(\s*page\s*:\s*Page\s*,\s*credentials\s*:\s*LoginCredentials\s*,?\s*\)\s*:\s*Promise<void>\s*\{/m.test(
      normalized,
    )
  ) {
    throw new AutomationAuthenticationError(
      "LOGIN_METHOD_INVALID",
      "登录方法必须实现固定的 login(page, credentials) 接口",
    );
  }

  const prohibited = PROHIBITED_LOGIN_METHOD_PATTERNS.find(([pattern]) =>
    pattern.test(normalized),
  );
  if (prohibited) {
    throw new AutomationAuthenticationError(
      "LOGIN_METHOD_INVALID",
      `登录方法不能使用${prohibited[1]}`,
    );
  }
  return normalized;
}

export function resolveAutomationAuthentication(input: {
  loginMethodSource: string | null;
  loginProfile: LoginProfileData | null;
  variables: readonly { id: string; value: string }[];
}): ResolvedAutomationAuthentication | null {
  if (!input.loginProfile) return null;

  const profile = input.loginProfile;
  if (
    profile.deletedAt ||
    profile.usernameVariable.deletedAt ||
    profile.passwordVariable.deletedAt
  ) {
    throw new AutomationAuthenticationError(
      "LOGIN_CONFIG_MISSING",
      "测试用例选择的登录身份不存在或已失效",
    );
  }
  if (profile.passwordVariable.kind !== "SECRET") {
    throw new AutomationAuthenticationError(
      "LOGIN_VARIABLE_INVALID",
      "登录身份的密码必须使用敏感变量",
    );
  }

  const values = new Map(
    input.variables.map((variable) => [variable.id, variable.value]),
  );
  const username = values.get(profile.usernameVariable.id);
  const password = values.get(profile.passwordVariable.id);
  if (username === undefined || password === undefined) {
    throw new AutomationAuthenticationError(
      "LOGIN_VARIABLE_INVALID",
      "登录身份引用的项目变量不存在或无法读取",
    );
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    loginMethodSource: validateLoginMethodSource(input.loginMethodSource ?? ""),
    usernameVariableName: profile.usernameVariable.name,
    passwordVariableName: profile.passwordVariable.name,
    username,
    password,
  };
}

export async function writeLoginMethodModule(
  workDir: string,
  loginMethodSource: string,
) {
  const moduleDir = path.join(workDir, "specchain");
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    path.join(moduleDir, "login.ts"),
    validateLoginMethodSource(loginMethodSource),
    "utf8",
  );
}

function resolvePlaywrightTestCli() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return require.resolve("@playwright/test/cli");
}

async function runLoginCompileCheck(workDir: string, source: string) {
  const script = `import { test } from "@playwright/test";
import { login } from "./specchain/login";

test("登录方法编译检查", async ({ page }) => {
  if (false) {
    await login(page, { username: "username", password: "password" });
  }
});
`;
  await Promise.all([
    writeLoginMethodModule(workDir, source),
    writeFile(path.join(workDir, "login.compile.spec.ts"), script, "utf8"),
    writeFile(
      path.join(workDir, "playwright.config.ts"),
      buildPlaywrightConfig("http://127.0.0.1"),
      "utf8",
    ),
  ]);

  return runChildProcess({
    command: process.execPath,
    args: [
      resolvePlaywrightTestCli(),
      "test",
      "login.compile.spec.ts",
      "--list",
      "--config=playwright.config.ts",
      "--project=chromium",
    ],
    cwd: workDir,
    env: { ...process.env, PLAYWRIGHT_HTML_OPEN: "never" },
    timeoutMs: LOGIN_METHOD_COMPILE_TIMEOUT_MS,
  });
}

export async function validateLoginMethodCompilation(source: string) {
  const normalized = validateLoginMethodSource(source);
  const temporaryRoot = path.join(process.cwd(), "data", "login-checks");
  await mkdir(temporaryRoot, { recursive: true });
  const workDir = await mkdtemp(
    path.join(temporaryRoot, "specchain-login-check-"),
  );
  try {
    const result = await runLoginCompileCheck(workDir, normalized);
    if (result.error || result.exitCode !== 0 || result.timedOut) {
      const details = (result.stderr || result.stdout).trim().slice(0, 1_000);
      throw new AutomationAuthenticationError(
        "LOGIN_METHOD_COMPILE_FAILED",
        `登录方法未通过 Playwright 编译检查${details ? `：${details}` : ""}`,
      );
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function prepareAuthenticationState(input: {
  workDir: string;
  baseUrl: string;
  authentication: ResolvedAutomationAuthentication;
  environment: NodeJS.ProcessEnv;
  abortSignal: AbortSignal;
}) {
  await mkdir(input.workDir, { recursive: true });
  const statePath = path.join(input.workDir, "auth-state.json");
  const setupSource = `import { test } from "@playwright/test";
import { login } from "./specchain/login";

test("准备登录环境", async ({ page }) => {
  const username = process.env[${JSON.stringify(input.authentication.usernameVariableName)}];
  const password = process.env[${JSON.stringify(input.authentication.passwordVariableName)}];
  if (!username || !password) {
    throw new Error("登录身份引用的项目变量为空");
  }
  await login(page, { username, password });
  await page.context().storageState({ path: ${JSON.stringify(statePath)} });
});
`;

  await Promise.all([
    writeLoginMethodModule(
      input.workDir,
      input.authentication.loginMethodSource,
    ),
    writeFile(path.join(input.workDir, "auth.setup.spec.ts"), setupSource),
    writeFile(
      path.join(input.workDir, "playwright.config.ts"),
      buildPlaywrightConfig(input.baseUrl),
    ),
  ]);

  const result = await runChildProcess({
    command: process.execPath,
    args: [
      resolvePlaywrightTestCli(),
      "test",
      "auth.setup.spec.ts",
      "--config=playwright.config.ts",
      "--project=chromium",
    ],
    cwd: input.workDir,
    env: input.environment,
    abortSignal: input.abortSignal,
    timeoutMs: LOGIN_SETUP_TIMEOUT_MS,
  });

  if (result.aborted) {
    throw new AutomationAuthenticationError(
      "LOGIN_FAILED",
      "准备登录环境已停止",
    );
  }
  if (result.error || result.exitCode !== 0 || result.timedOut) {
    const details = redactSecrets((result.stderr || result.stdout).trim(), [
      input.authentication.username,
      input.authentication.password,
    ]).slice(0, 1_000);
    throw new AutomationAuthenticationError(
      "LOGIN_FAILED",
      `项目登录方法执行失败${details ? `：${details}` : ""}`,
    );
  }

  try {
    await access(statePath);
  } catch {
    throw new AutomationAuthenticationError(
      "LOGIN_STATE_FAILED",
      "登录方法执行完成，但未能创建页面探测所需的临时认证状态",
    );
  }
  return statePath;
}
