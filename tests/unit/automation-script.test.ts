import { describe, expect, it } from "vitest";

import { AUTOMATION_AGENT_TOOL_NAMES } from "@/automation/agent-tools";
import {
  AutomationAuthenticationError,
  resolveAutomationAuthentication,
  validateLoginMethodCompilation,
  validateLoginMethodSource,
} from "@/automation/authentication";
import {
  createAutomationInputFingerprint,
  type AutomationVariableMetadata,
} from "@/automation/fingerprint";
import {
  assertPlaywrightCliBrowserInstalled,
  assertSameOriginNavigation,
  PlaywrightCliError,
  resolveSameOriginUrl,
} from "@/automation/playwright-cli-session";
import { buildAutomationScriptPrompt } from "@/automation/prompts";
import { getAutomationScriptStatus } from "@/automation/script-status";
import {
  AutomationScriptValidationError,
  requiresIsolatedTestData,
  validateAutomationScriptStatic,
} from "@/automation/script-validator";
import {
  createVariableRuntimeBundle,
  VARIABLES_MODULE_IMPORT,
} from "@/automation/variable-runtime";
import {
  TestCaseScriptSource,
  VariableFieldKind,
  VariableKind,
} from "@/generated/prisma/enums";
import {
  LOGIN_METHOD_TEMPLATE,
  LOGIN_MODULE_IMPORT,
} from "@/lib/automation/login-contract";

const validScript = `import { test, expect } from "@playwright/test";

test("登录失败", async ({ page }) => {
  await page.goto(process.env.BASE_URL!);
  await page.getByLabel("用户名").fill("invalid-user");
  await expect(page.getByRole("alert")).toBeVisible();
});`;

const scalarVariable: AutomationVariableMetadata = {
  name: "E2E_LOCALE",
  kind: VariableKind.STRING,
  encrypted: false,
  description: "界面语言",
  fields: [],
};

const accountVariable: AutomationVariableMetadata = {
  name: "ADMIN",
  kind: VariableKind.OBJECT,
  encrypted: false,
  description: "管理员账号",
  fields: [
    {
      name: "username",
      kind: VariableFieldKind.STRING,
      encrypted: false,
      description: "用户名",
    },
    {
      name: "password",
      kind: VariableFieldKind.STRING,
      encrypted: true,
      description: "密码",
    },
  ],
};

describe("自动化输入指纹", () => {
  it("包含用例与项目元数据，但不受变量值影响", () => {
    const common = {
      testCase: {
        name: "登录失败",
        preconditions: "当前未登录",
        steps: "1. 使用错误密码登录\n2. 验证系统拒绝登录",
      },
      baseUrl: "https://specchain.example.com",
      automationInstructions: "使用管理员账号",
      variables: [scalarVariable],
    };
    const first = createAutomationInputFingerprint(common);
    const second = createAutomationInputFingerprint(common);

    expect(first).toBe(second);
  });

  it("引用变量的结构改变后指纹失效，未引用变量不影响指纹", () => {
    const common = {
      testCase: {
        name: "查看项目",
        preconditions: "使用 ${ADMIN} 登录",
        steps: "1. 打开项目列表",
      },
      baseUrl: "https://specchain.example.com",
      automationInstructions: null,
    };
    const first = createAutomationInputFingerprint({
      ...common,
      variables: [accountVariable, scalarVariable],
    });
    const second = createAutomationInputFingerprint({
      ...common,
      variables: [
        {
          ...accountVariable,
          fields: accountVariable.fields.map((field) =>
            field.name === "username"
              ? { ...field, description: "管理员登录名" }
              : field,
          ),
        },
      ],
    });

    expect(first).not.toBe(second);
  });
});

describe("任务内变量助手", () => {
  it("只把变量路径写入模块，真实值只留在任务环境", () => {
    const runtime = createVariableRuntimeBundle({
      metadata: [accountVariable, scalarVariable],
      values: {
        "ADMIN.username": "admin",
        "ADMIN.password": "never-write-this-secret",
        E2E_LOCALE: "zh-CN",
      },
    });

    expect(runtime.source).toContain("ADMIN.username");
    expect(runtime.source).toContain("getCredentials");
    expect(runtime.source).not.toContain("never-write-this-secret");
    expect(Object.values(runtime.environment)).toContain(
      "never-write-this-secret",
    );
  });
});

describe("自动化脚本状态", () => {
  it("区分未生成、AI 生成、手工脚本和需更新", () => {
    expect(
      getAutomationScriptStatus({
        script: null,
        source: null,
        aiFingerprint: null,
        currentFingerprint: "current",
      }),
    ).toBe("NOT_GENERATED");
    expect(
      getAutomationScriptStatus({
        script: validScript,
        source: TestCaseScriptSource.AI,
        aiFingerprint: "current",
        currentFingerprint: "current",
      }),
    ).toBe("AI_GENERATED");
    expect(
      getAutomationScriptStatus({
        script: validScript,
        source: TestCaseScriptSource.MANUAL,
        aiFingerprint: null,
        currentFingerprint: "current",
      }),
    ).toBe("MANUAL");
    expect(
      getAutomationScriptStatus({
        script: validScript,
        source: TestCaseScriptSource.AI,
        aiFingerprint: "old",
        currentFingerprint: "current",
      }),
    ).toBe("STALE");
  });
});

describe("页面探测边界", () => {
  it("只解析 Base URL 的同源 HTTP(S) 地址", () => {
    expect(resolveSameOriginUrl("https://example.com/app", "/login")).toBe(
      "https://example.com/login",
    );
    expect(() =>
      resolveSameOriginUrl("https://example.com", "https://evil.example/login"),
    ).toThrowError(PlaywrightCliError);
    expect(() =>
      resolveSameOriginUrl("https://example.com", "http://example.com/login"),
    ).toThrowError(PlaywrightCliError);
    expect(() =>
      resolveSameOriginUrl(
        "https://example.com",
        "https://user:password@example.com/login",
      ),
    ).toThrowError(PlaywrightCliError);
  });

  it("交互命令导致跨域导航时立即拒绝", () => {
    expect(() =>
      assertSameOriginNavigation(
        "https://example.com",
        "- Page URL: https://example.com/dashboard",
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOriginNavigation(
        "https://example.com",
        "- Page URL: https://accounts.example.net/login",
      ),
    ).toThrowError(PlaywrightCliError);
  });

  it("页面探测浏览器缺失时提示修复项目依赖", () => {
    expect(() =>
      assertPlaywrightCliBrowserInstalled(
        "Z:\\specchain-browser-not-installed\\chrome.exe",
      ),
    ).toThrowError("重新执行 npm ci");
  });

  it("只向模型开放约定的页面探测和终止工具", () => {
    expect(AUTOMATION_AGENT_TOOL_NAMES).toEqual([
      "openPage",
      "snapshotPage",
      "findOnPage",
      "generateLocator",
      "clickElement",
      "fillField",
      "selectOption",
      "checkElement",
      "uncheckElement",
      "pressKey",
      "handleDialog",
      "goBack",
      "submitScript",
      "reportFailure",
    ]);
    expect(AUTOMATION_AGENT_TOOL_NAMES).not.toContain("shell");
    expect(AUTOMATION_AGENT_TOOL_NAMES).not.toContain("evaluate");
    expect(AUTOMATION_AGENT_TOOL_NAMES).not.toContain("screenshot");
  });
});

describe("自动化提示词", () => {
  it("只包含变量元数据，不包含变量值", () => {
    const variables = [
      {
        ...scalarVariable,
        value: "never-send-this-value",
      },
    ] satisfies (AutomationVariableMetadata & { value: string })[];
    const prompt = buildAutomationScriptPrompt({
      baseUrl: "https://example.com",
      automationInstructions: "从登录页开始",
      authentication: null,
      variables,
      testCase: {
        code: "TC-001",
        name: "管理员登录失败",
        preconditions: "当前未登录",
        steps: "1. 使用错误密码登录\n2. 验证系统拒绝登录",
      },
    });

    expect(prompt).toContain("E2E_LOCALE（字符串变量）");
    expect(prompt).not.toContain("never-send-this-value");
  });

  it("账号用例只向模型提供公共登录契约和变量名", () => {
    const prompt = buildAutomationScriptPrompt({
      baseUrl: "https://example.com",
      automationInstructions: null,
      authentication: {
        variableName: "ADMIN",
      },
      variables: [accountVariable],
      testCase: {
        code: "TC-002",
        name: "查看项目列表",
        preconditions: "管理员账号可用",
        steps: "1. 打开项目列表",
      },
    });

    expect(prompt).toContain(LOGIN_MODULE_IMPORT);
    expect(prompt).toContain('getCredentials("ADMIN")');
    expect(prompt).toContain("不得探测、复制或重新实现登录页面操作");
  });

  it("向脚本模型提供受限的代码上下文，并要求以页面探测为准", () => {
    const prompt = buildAutomationScriptPrompt({
      baseUrl: "https://example.com",
      automationInstructions: null,
      authentication: null,
      variables: [],
      codeEvidence: [
        {
          repository: "team/spec-chain",
          path: "src/projects/page.tsx",
          commitSha: "commit-1",
          selectionReason: "核实项目列表入口",
          content: "export function ProjectList() {}",
        },
      ],
      testCase: {
        code: "TC-003",
        name: "查看项目列表",
        preconditions: null,
        steps: "1. 打开项目列表",
      },
    });

    expect(prompt).toContain("src/projects/page.tsx");
    expect(prompt).toContain("ProjectList");
    expect(prompt).toContain("最终必须以真实页面探测结果为准");
  });
});

describe("项目登录方法", () => {
  it("接受固定登录接口", () => {
    expect(validateLoginMethodSource(LOGIN_METHOD_TEMPLATE)).toBe(
      LOGIN_METHOD_TEMPLATE.trim(),
    );
  });

  it("通过 Playwright 编译与测试发现检查", async () => {
    await expect(
      validateLoginMethodCompilation(LOGIN_METHOD_TEMPLATE),
    ).resolves.toBeUndefined();
  }, 70_000);

  it("只在服务端解析账号变量值", () => {
    expect(
      resolveAutomationAuthentication({
        loginMethodSource: LOGIN_METHOD_TEMPLATE,
        credentialVariableName: "ADMIN",
        variableValues: {
          "ADMIN.username": "admin",
          "ADMIN.password": "secret",
        },
      }),
    ).toMatchObject({
      variableName: "ADMIN",
      username: "admin",
      password: "secret",
    });
  });

  it.each([
    [
      LOGIN_METHOD_TEMPLATE.replace(
        'import { expect, type Page } from "@playwright/test";',
        'import fs from "node:fs";',
      ),
      "固定导入",
    ],
    [
      LOGIN_METHOD_TEMPLATE.replace(
        'await page.goto("/login");',
        "const password = process.env.PASSWORD;",
      ),
      "读取进程环境",
    ],
    [
      LOGIN_METHOD_TEMPLATE.replace(
        'await page.goto("/login");',
        'await page.goto("https://accounts.example.com");',
      ),
      "跨域或绝对地址",
    ],
  ])("拒绝超出固定边界的登录方法", (source, message) => {
    expect(() => validateLoginMethodSource(source)).toThrowError(message);
    expect(() => validateLoginMethodSource(source)).toThrowError(
      AutomationAuthenticationError,
    );
  });
});

describe("自动化脚本静态校验", () => {
  it("接受单文件、单测试和明确环境变量引用", () => {
    expect(
      validateAutomationScriptStatic({
        script: validScript,
        variables: [],
        authentication: null,
        requiresCleanup: false,
      }),
    ).toBe(validScript);
  });

  it.each([
    [`${validScript}\nimport path from "node:path";`, "只能导入"],
    [validScript.replace("page.goto", "page.evaluate"), "页面动态执行"],
    [
      validScript.replace(
        "await page.goto",
        'await page.route("**/*", () => {});\n  await page.goto',
      ),
      "网络拦截",
    ],
    [
      validScript.replace(
        'fill("invalid-user")',
        "fill(process.env.UNKNOWN_SECRET!)",
      ),
      "必须通过平台变量助手",
    ],
    [
      validScript.replace(
        'test("登录失败", async ({ page }) => {',
        'test("登录失败", async ({ page }) => {\n  const { PATH } = process.env;',
      ),
      "只能直接读取 process.env.BASE_URL",
    ],
  ])("拒绝不安全或不可复现的脚本", (script, message) => {
    expect(() =>
      validateAutomationScriptStatic({
        script,
        variables: [],
        authentication: null,
        requiresCleanup: false,
      }),
    ).toThrowError(message);
  });

  it("写操作脚本必须使用 try/finally 清理临时数据", () => {
    expect(
      requiresIsolatedTestData({
        name: "新增项目",
        preconditions: null,
        steps: "创建项目后验证并删除",
      }),
    ).toBe(true);
    expect(() =>
      validateAutomationScriptStatic({
        script: validScript,
        variables: [],
        authentication: null,
        requiresCleanup: true,
      }),
    ).toThrowError(AutomationScriptValidationError);
  });

  it("账号用例必须使用公共登录方法和绑定变量", () => {
    const script = `import { test, expect } from "@playwright/test";
${LOGIN_MODULE_IMPORT}
${VARIABLES_MODULE_IMPORT}

test("查看项目", async ({ page }) => {
  await login(page, getCredentials("ADMIN"));
  await expect(page).toHaveURL(/projects/);
});`;

    expect(
      validateAutomationScriptStatic({
        script,
        variables: [accountVariable],
        authentication: {
          variableName: "ADMIN",
        },
        requiresCleanup: false,
      }),
    ).toBe(script);
    expect(() =>
      validateAutomationScriptStatic({
        script: validScript,
        variables: [accountVariable],
        authentication: {
          variableName: "ADMIN",
        },
        requiresCleanup: false,
      }),
    ).toThrowError("登录方法");
  });
});
