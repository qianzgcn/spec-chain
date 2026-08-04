import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import {
  LOGIN_MODULE_IMPORT,
  writeLoginMethodModule,
} from "@/automation/authentication";
import {
  VARIABLES_MODULE_IMPORT,
  writeVariableModule,
} from "@/automation/variable-runtime";
import {
  validateScriptVariableReferences,
  VariableReferenceError,
  type ProjectVariableMetadata,
} from "@/lib/project-variables/references";
import { buildPlaywrightConfig } from "@/runner/playwright-config";
import { runChildProcess } from "@/task-runtime/child-process";

const COMPILE_TIMEOUT_MS = 60_000;
const REQUIRED_IMPORT = 'import { test, expect } from "@playwright/test";';
const WRITE_OPERATION_PATTERN =
  /新增|创建|添加|编辑|修改|删除|移除|归档|启用|停用|绑定|解绑|状态变更|更改状态/;

export class AutomationScriptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationScriptValidationError";
  }
}

export function requiresIsolatedTestData(testCase: {
  name: string;
  preconditions: string | null;
  steps: string;
}) {
  return WRITE_OPERATION_PATTERN.test(
    `${testCase.name}\n${testCase.preconditions ?? ""}\n${testCase.steps}`,
  );
}

function assertScriptStructure(
  script: string,
  authentication: { variableName: string } | null,
) {
  const firstLine = script.split(/\r?\n/, 1)[0]?.trim();
  if (firstLine !== REQUIRED_IMPORT) {
    throw new AutomationScriptValidationError(
      `脚本第一行必须是 ${REQUIRED_IMPORT}`,
    );
  }

  const imports = script.match(/^\s*import\b.*$/gm)?.map((line) => line.trim());
  const usesVariableHelpers = /\b(?:getVariable|getCredentials)\s*\(/.test(
    script,
  );
  const expectedImports = [
    REQUIRED_IMPORT,
    ...(authentication ? [LOGIN_MODULE_IMPORT] : []),
    ...(usesVariableHelpers ? [VARIABLES_MODULE_IMPORT] : []),
  ];
  if (
    !imports ||
    imports.length !== expectedImports.length ||
    imports.some((line, index) => line !== expectedImports[index]) ||
    /\b(?:require|export)\s*(?:\(|\{|\*)/.test(script)
  ) {
    throw new AutomationScriptValidationError(
      authentication
        ? "账号用例只能按固定顺序导入 Playwright、平台登录方法和变量助手"
        : "脚本只能导入 Playwright 和按需使用的平台变量助手",
    );
  }

  const testCount = (script.match(/(?:^|\s)test\s*\(/gm) ?? []).length;
  if (testCount !== 1) {
    throw new AutomationScriptValidationError(
      "每个自动化脚本必须且只能包含一个 test",
    );
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertAuthenticationUsage(
  script: string,
  authentication: { variableName: string } | null,
) {
  if (!authentication) {
    if (
      script.includes(LOGIN_MODULE_IMPORT) ||
      /\bawait\s+login\s*\(/.test(script)
    ) {
      throw new AutomationScriptValidationError(
        "未引用账号对象的用例不能调用项目登录方法",
      );
    }
    return;
  }

  const calls = [...script.matchAll(/\bawait\s+login\s*\(/g)];
  if (calls.length !== 1) {
    throw new AutomationScriptValidationError(
      "账号用例必须且只能调用一次项目登录方法",
    );
  }
  const loginPattern = new RegExp(
    `\\bawait\\s+login\\s*\\(\\s*page\\s*,\\s*getCredentials\\(\\s*["']${escapeRegExp(authentication.variableName)}["']\\s*\\)\\s*\\)\\s*;`,
  );
  if (!loginPattern.test(script)) {
    throw new AutomationScriptValidationError(
      `项目登录方法必须通过 getCredentials(${JSON.stringify(authentication.variableName)}) 读取账号对象`,
    );
  }
}

const PROHIBITED_SCRIPT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bimport\s*\(/, "动态导入"],
  [/\btest\.(?:skip|only|fixme|describe|before|after)\b/, "测试修饰器或钩子"],
  [/\beval\s*\(/, "eval"],
  [/\bnew\s+Function\b/, "Function 构造器"],
  [
    /\bpage\.(?:evaluate|evaluateHandle|addInitScript|addScriptTag)\s*\(/,
    "页面动态执行",
  ],
  [/\b(?:page|context)\.route\s*\(/, "网络拦截"],
  [/\bcontext\.(?:addCookies|clearCookies)\s*\(/, "Cookie 操作"],
  [/\bprocess\.(?!env\b)/, "process 系统能力"],
  [/\btest\.setTimeout\s*\(/, "覆盖平台超时"],
  [/\bwaitForTimeout\s*\(/, "固定休眠"],
  [/\bnetworkidle\b/, "networkidle 等待"],
];

function assertSafeScriptOperations(script: string) {
  const prohibited = PROHIBITED_SCRIPT_PATTERNS.find(([pattern]) =>
    pattern.test(script),
  );
  if (prohibited) {
    throw new AutomationScriptValidationError(`脚本不能使用${prohibited[1]}`);
  }
}

function assertConfiguredVariables(input: {
  script: string;
  variables: readonly ProjectVariableMetadata[];
}) {
  const scriptWithoutBaseUrl = input.script.replace(
    /\bprocess\s*\.\s*env\s*\.\s*BASE_URL\b/g,
    "",
  );
  if (/\bprocess\s*(?:\?\.|\.)\s*env\b/.test(scriptWithoutBaseUrl)) {
    throw new AutomationScriptValidationError(
      "脚本只能直接读取 process.env.BASE_URL，项目变量必须通过平台变量助手引用",
    );
  }
  try {
    validateScriptVariableReferences(input);
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      throw new AutomationScriptValidationError(error.message);
    }
    throw error;
  }
}

export function validateAutomationScriptStatic(input: {
  script: string;
  variables: readonly ProjectVariableMetadata[];
  authentication: { variableName: string } | null;
  requiresCleanup: boolean;
}) {
  const script = input.script.trim();
  assertScriptStructure(script, input.authentication);
  assertSafeScriptOperations(script);
  assertConfiguredVariables({ script, variables: input.variables });
  assertAuthenticationUsage(script, input.authentication);

  if (
    input.requiresCleanup &&
    (!/\btry\s*\{/.test(script) || !/\bfinally\s*\{/.test(script))
  ) {
    throw new AutomationScriptValidationError(
      "该用例包含数据写入，脚本必须使用 try/finally 清理本次运行创建的临时数据",
    );
  }

  return script;
}

export async function validateAutomationScriptCompilation(input: {
  script: string;
  baseUrl: string;
  workDir: string;
  abortSignal: AbortSignal;
  loginMethodSource?: string;
  variableModuleSource?: string;
}) {
  await mkdir(input.workDir, { recursive: true });
  const specPath = path.join(input.workDir, "generated.spec.ts");
  const configPath = path.join(input.workDir, "playwright.config.ts");
  await Promise.all([
    writeFile(specPath, input.script, "utf8"),
    writeFile(configPath, buildPlaywrightConfig(input.baseUrl), "utf8"),
    ...(input.loginMethodSource
      ? [writeLoginMethodModule(input.workDir, input.loginMethodSource)]
      : []),
    ...(input.variableModuleSource &&
    input.script.includes(VARIABLES_MODULE_IMPORT)
      ? [writeVariableModule(input.workDir, input.variableModuleSource)]
      : []),
  ]);

  const require = createRequire(path.join(process.cwd(), "package.json"));
  const playwrightCli = require.resolve("@playwright/test/cli");
  const result = await runChildProcess({
    command: process.execPath,
    args: [
      playwrightCli,
      "test",
      "generated.spec.ts",
      "--list",
      "--config=playwright.config.ts",
      "--project=chromium",
    ],
    cwd: input.workDir,
    env: {
      ...process.env,
      PLAYWRIGHT_HTML_OPEN: "never",
    },
    abortSignal: input.abortSignal,
    timeoutMs: COMPILE_TIMEOUT_MS,
  });

  if (result.aborted) {
    throw new AutomationScriptValidationError("脚本校验已停止");
  }
  if (result.timedOut) {
    throw new AutomationScriptValidationError(
      "Playwright 编译与测试发现检查超时",
    );
  }
  if (result.error || result.exitCode !== 0) {
    const details = (result.stderr || result.stdout).trim().slice(0, 1_000);
    throw new AutomationScriptValidationError(
      `脚本未通过 Playwright 编译与测试发现检查${details ? `：${details}` : ""}`,
    );
  }
  if (!/Total:\s*1 test in 1 file/i.test(result.stdout)) {
    throw new AutomationScriptValidationError(
      "Playwright 未发现且仅发现一个测试",
    );
  }
}
