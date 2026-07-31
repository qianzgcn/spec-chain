import { describe, expect, it } from "vitest";

import { AUTOMATION_AGENT_TOOL_NAMES } from "@/automation/agent-tools";
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
import { TestCaseScriptSource, VariableKind } from "@/generated/prisma/enums";

const validScript = `import { test, expect } from "@playwright/test";

test("登录失败", async ({ page }) => {
  await page.goto(process.env.BASE_URL!);
  await page.getByLabel("用户名").fill(process.env.ADMIN_USERNAME!);
  await expect(page.getByRole("alert")).toBeVisible();
});`;

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
    };
    const firstVariables = [
      {
        name: "ADMIN_PASSWORD",
        kind: VariableKind.SECRET,
        description: "管理员密码",
        value: "first-secret",
      },
    ] satisfies (AutomationVariableMetadata & { value: string })[];
    const secondVariables = [
      {
        name: "ADMIN_PASSWORD",
        kind: VariableKind.SECRET,
        description: "管理员密码",
        value: "second-secret",
      },
    ] satisfies (AutomationVariableMetadata & { value: string })[];
    const first = createAutomationInputFingerprint({
      ...common,
      variables: firstVariables,
    });
    const second = createAutomationInputFingerprint({
      ...common,
      variables: secondVariables,
    });

    expect(first).toBe(second);
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
        name: "ADMIN_PASSWORD",
        kind: VariableKind.SECRET,
        description: "管理员密码",
        value: "never-send-this-value",
      },
    ] satisfies (AutomationVariableMetadata & { value: string })[];
    const prompt = buildAutomationScriptPrompt({
      baseUrl: "https://example.com",
      automationInstructions: "从登录页开始",
      variables,
      testCase: {
        code: "TC-001",
        name: "管理员登录失败",
        preconditions: "当前未登录",
        steps: "1. 使用错误密码登录\n2. 验证系统拒绝登录",
      },
    });

    expect(prompt).toContain("ADMIN_PASSWORD（敏感）");
    expect(prompt).not.toContain("never-send-this-value");
  });
});

describe("自动化脚本静态校验", () => {
  it("接受单文件、单测试和明确环境变量引用", () => {
    expect(
      validateAutomationScriptStatic({
        script: validScript,
        allowedVariableNames: ["ADMIN_USERNAME"],
        requiresCleanup: false,
      }),
    ).toBe(validScript);
  });

  it.each([
    [`${validScript}\nimport path from "node:path";`, "不能加载或导出其他模块"],
    [validScript.replace("page.goto", "page.evaluate"), "页面动态执行"],
    [
      validScript.replace(
        "await page.goto",
        'await page.route("**/*", () => {});\n  await page.goto',
      ),
      "网络拦截",
    ],
    [
      validScript.replace("ADMIN_USERNAME", "UNKNOWN_SECRET"),
      "未配置的项目变量",
    ],
  ])("拒绝不安全或不可复现的脚本", (script, message) => {
    expect(() =>
      validateAutomationScriptStatic({
        script,
        allowedVariableNames: ["ADMIN_USERNAME"],
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
        allowedVariableNames: ["ADMIN_USERNAME"],
        requiresCleanup: true,
      }),
    ).toThrowError(AutomationScriptValidationError);
  });
});
