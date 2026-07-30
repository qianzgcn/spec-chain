import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

import { encryptAesGcm } from "@/lib/security/aes-gcm";

async function expectTablePageFillsWorkspace(page: Page) {
  const panel = page.getByTestId("data-table-shell");
  await expect(panel).toBeVisible();

  const metrics = await panel.evaluate((panel) => {
    const main = panel.closest<HTMLElement>("main");
    const tableBody = panel?.querySelector<HTMLElement>(
      '[data-slot="table-container"]',
    );
    const pagination = panel?.querySelector<HTMLElement>(
      '[data-testid="data-table-pagination"]',
    );

    if (!main || !tableBody) return null;

    const panelRect = panel.getBoundingClientRect();
    const tableBodyRect = tableBody.getBoundingClientRect();
    const paginationRect = pagination?.getBoundingClientRect();
    const scrollingElement = document.scrollingElement;

    return {
      documentOverflow:
        (scrollingElement?.scrollHeight ?? 0) -
        (scrollingElement?.clientHeight ?? 0),
      documentOverflowX:
        (scrollingElement?.scrollWidth ?? 0) -
        (scrollingElement?.clientWidth ?? 0),
      documentOverflowY: scrollingElement
        ? getComputedStyle(scrollingElement).overflowY
        : null,
      workspaceOverflow: main.scrollHeight - main.clientHeight,
      workspaceOverflowX: main.scrollWidth - main.clientWidth,
      workspaceOverflowY: getComputedStyle(main).overflowY,
      panelHeight: panelRect.height,
      tableBodyHeight: tableBodyRect.height,
      tableBodyOverflowY: getComputedStyle(tableBody).overflowY,
      paginationBottomGap: paginationRect
        ? panelRect.bottom - paginationRect.bottom
        : null,
    };
  });

  expect(metrics).not.toBeNull();
  if (!metrics) throw new Error("未找到完整的表格页面结构");

  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
  expect(metrics.documentOverflowX).toBeLessThanOrEqual(1);
  expect(metrics.documentOverflowY).toBe("hidden");
  expect(metrics.workspaceOverflow).toBeLessThanOrEqual(1);
  expect(metrics.workspaceOverflowX).toBeLessThanOrEqual(1);
  expect(metrics.workspaceOverflowY).toBe("hidden");
  expect(metrics.panelHeight).toBeGreaterThan(300);
  expect(metrics.tableBodyHeight).toBeGreaterThan(100);
  expect(["auto", "scroll"]).toContain(metrics.tableBodyOverflowY);
  if (metrics.paginationBottomGap !== null) {
    expect(metrics.paginationBottomGap).toBeLessThanOrEqual(24);
  }
}

async function expectTestCaseActionsAligned(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const table = document.querySelector<HTMLTableElement>(
          '[data-testid="data-table"]',
        );
        const header = table?.querySelector<HTMLTableCellElement>(
          "thead th:last-child",
        );
        const row = document.querySelector<HTMLTableRowElement>(
          '[data-testid="data-table"] tbody tr',
        );
        const content = row?.cells.item((row?.cells.length ?? 1) - 1);
        const actions = content?.querySelector<HTMLElement>(
          '[data-testid="test-case-actions"]',
        );
        if (!header || !actions) return Number.POSITIVE_INFINITY;

        const headerRect = header.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        return Math.abs(headerRect.left - actionsRect.left);
      }),
    )
    .toBeLessThanOrEqual(12);

  const actions = page.getByTestId("test-case-actions").first();
  await expect(actions.getByRole("link", { name: "编辑" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "删除" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "更多操作" })).toHaveCount(
    0,
  );
}

test("从登录到需求和测试用例的核心流程", async ({ page }) => {
  const databasePath = path.resolve(process.cwd(), "data", "e2e.db");

  await page.goto("/login");

  await page.getByRole("textbox", { name: "用户名" }).fill("admin");
  await page.getByRole("textbox", { name: "密码" }).fill("wrong-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("用户名或密码错误")).toBeVisible();

  await page.getByRole("textbox", { name: "密码" }).fill("admin12345");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/projects$/);

  await page.goto("/projects");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.getByRole("textbox", { name: "项目名称" }).fill("E2E 验收项目");
  await page
    .getByRole("textbox", { name: "项目描述" })
    .fill("自动化验收使用的独立项目");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/project-settings$/);

  await page.goto("/features/new");
  await page.getByRole("textbox", { name: "FE 名称" }).fill("订单退款");
  await page
    .getByRole("textbox", { name: "一句话描述" })
    .fill("支持符合条件的订单退款");
  await page
    .getByRole("textbox", {
      name: "业务背景与目标",
    })
    .fill("统一退款入口，降低人工操作风险。");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "订单退款" })).toBeVisible();
  await expect(page.getByText("共 0 个")).toBeVisible();

  await page.getByRole("button", { name: "新建US" }).click();
  await page.getByRole("textbox", { name: "US 标题" }).fill("客服提交退款");
  await page.getByRole("textbox", { name: "As" }).fill("客服专员");
  await page.getByRole("textbox", { name: "I want" }).fill("提交订单退款申请");
  await page.getByRole("textbox", { name: "so that" }).fill("及时处理客户诉求");
  await page.getByRole("textbox", { name: "Given" }).fill("订单已支付");
  await page.getByRole("textbox", { name: "When" }).fill("客服确认退款");
  await page.getByRole("textbox", { name: "Then" }).fill("系统创建退款记录");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(
    page.getByRole("heading", { name: "客服提交退款" }),
  ).toBeVisible();

  await page.goto("/requirements");
  await expect(page.getByRole("columnheader", { name: "所属 FE" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "展开行" }).click();
  await expect(page.getByRole("link", { name: "客服提交退款" })).toBeVisible();

  await page.goto("/test-case-groups");
  await page.getByRole("button", { name: "新建分组" }).click();
  await page.getByRole("textbox", { name: "分组名称" }).fill("退款流程");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("退款流程")).toBeVisible();

  await page.goto("/test-cases/new");
  await page
    .getByRole("textbox", { name: "用例名称" })
    .fill("客服成功提交退款");
  await page
    .getByRole("textbox", { name: "测试步骤" })
    .fill("1. 输入退款原因\n2. 点击提交，退款记录创建成功");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(
    page.getByRole("heading", { name: "客服成功提交退款" }),
  ).toBeVisible();
  await expect(page.getByText("点击提交，退款记录创建成功")).toBeVisible();
  await expect(page.getByText("尚未编写自动化脚本")).toBeVisible();
  await expect(page.getByRole("heading", { name: "自动化运行" })).toHaveCount(
    0,
  );

  await page.route("**/test-cases/*/runs*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.getByRole("button", { name: "执行记录" }).click();
  await expect(page.getByText("正在加载…")).toBeVisible();
  await expect(page).toHaveURL(/\/test-cases\/.+\/runs$/);
  await expect(page.getByRole("heading", { name: "执行记录" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "自动化运行" })).toBeVisible();
  await expect(page.getByText("尚无运行记录")).toBeVisible();

  await page.goto("/test-case-groups");
  await page
    .getByRole("link", { name: "查看 退款流程 分组的 1 个测试用例" })
    .click();
  await expect(page).toHaveURL(/\/test-cases\?group=.+/);
  await expect(page.getByText("客服成功提交退款")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of [
    "/requirements",
    "/requirements/pending-review",
    "/test-cases",
    "/test-case-groups",
    "/ai-executions",
    "/ai-settings",
    "/projects",
    "/users",
  ]) {
    await page.goto(path);
    await expectTablePageFillsWorkspace(page);
    if (path === "/test-cases") {
      await expectTestCaseActionsAligned(page);
    }
  }

  await page.goto("/project-settings");
  await expect(page.getByRole("heading", { name: "基础设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存" })).toBeDisabled();
  await expect(page.getByText("当前设置已保存")).toHaveCount(0);

  await page.goto("/project-settings/testing");
  await expect(
    page.getByRole("heading", { name: "测试设置", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Base URL" })
    .fill("https://example.com");
  await page.getByRole("button", { name: "添加变量" }).click();
  const variableType = page.getByRole("combobox", { name: "类型" });
  await expect(variableType).toBeVisible();
  await variableType.click();
  await page.getByRole("option", { name: "敏感变量" }).click();
  await expect(page.getByLabel("值")).toHaveAttribute("type", "password");
  await page.getByRole("textbox", { name: "变量名" }).fill("E2E_SECRET");
  await page.getByLabel("值").fill("e2e-secret-value");
  const saveVariablesButton = page.getByRole("button", { name: "保存" });
  await saveVariablesButton.click();
  await expect(saveVariablesButton).toBeDisabled();
  await expect(page.getByText("当前设置已保存")).toHaveCount(0);

  await page.goto("/project-settings/repositories");
  await expect(
    page.getByRole("heading", { name: "代码仓库", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加仓库" }).click();
  await page
    .getByRole("textbox", { name: "Git 地址" })
    .fill("https://github.com/qianzgcn/spec-chain.git");
  await page.getByRole("button", { name: "检查连接" }).click();
  await expect(page.getByText("请先新增 GitHub PAT")).toBeVisible();

  await page.getByRole("textbox", { name: "分支" }).fill("develop");
  await expect(page.getByText("请先新增 GitHub PAT")).toHaveCount(0);
  await page.getByRole("textbox", { name: "分支" }).fill("main");
  const saveRepositoriesButton = page.getByRole("button", { name: "保存" });
  await saveRepositoriesButton.click();
  await expect(saveRepositoriesButton).toBeDisabled();
  await expect(page.getByText("当前设置已保存")).toHaveCount(0);

  const githubPat = "e2e-github-pat";
  const credentialDatabase = new Database(databasePath);
  credentialDatabase
    .prepare(
      `UPDATE "Project"
       SET "githubPatEncrypted" = ?, "githubPatAccount" = ?
       WHERE "name" = ? AND "deletedAt" IS NULL`,
    )
    .run(
      encryptAesGcm(githubPat, Buffer.alloc(32, 7)),
      "qianzgcn",
      "E2E 验收项目",
    );
  credentialDatabase.close();
  await page.reload();

  const maskedGithubPat = page.getByLabel("GitHub PAT（已脱敏）");
  await expect(maskedGithubPat).toHaveText("•••• •••• ••••");
  await expect(page.getByText("账号 qianzgcn")).toBeVisible();
  await expect(page.getByText("已配置", { exact: true })).toBeVisible();

  const database = new Database(databasePath, { readonly: true });
  const encryptedCredential = database
    .prepare(
      'SELECT "githubPatEncrypted" FROM "Project" WHERE "name" = ? AND "deletedAt" IS NULL',
    )
    .get("E2E 验收项目") as { githubPatEncrypted: string };
  database.close();

  expect(encryptedCredential.githubPatEncrypted).not.toContain(githubPat);

  await page.getByRole("button", { name: "删除", exact: true }).click();
  const deletePatDialog = page.getByRole("alertdialog");
  await expect(deletePatDialog).toBeVisible();
  await deletePatDialog
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(page.getByLabel("GitHub PAT", { exact: true })).toBeVisible();
  await expect(page.getByText("未配置", { exact: true })).toHaveCount(2);

  const clearedDatabase = new Database(databasePath, { readonly: true });
  const clearedCredential = clearedDatabase
    .prepare(
      'SELECT "githubPatEncrypted" FROM "Project" WHERE "name" = ? AND "deletedAt" IS NULL',
    )
    .pluck()
    .get("E2E 验收项目");
  clearedDatabase.close();
  expect(clearedCredential).toBeNull();

  await page.goto("/ai-settings");
  await expect(page.getByRole("heading", { name: "模型配置" })).toBeVisible();
  await page.getByRole("button", { name: "新建模型" }).click();
  await page
    .getByRole("textbox", { name: "模型名称" })
    .fill("E2E OpenAI 兼容模型");
  await page
    .getByRole("textbox", { name: "OpenAI 兼容 Base URL" })
    .fill("https://api.example.com/v1/");
  await page
    .getByRole("textbox", { name: "模型 ID" })
    .fill("e2e-structured-model");
  await page.getByLabel("API Key").fill("e2e-model-api-key");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("E2E OpenAI 兼容模型")).toBeVisible();
  await expect(page.getByText("未检查", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "生成 US 默认模型" }).click();
  await page.getByRole("option", { name: /E2E OpenAI 兼容模型/ }).click();
  await expect(page.getByText("生成 US 默认", { exact: true })).toBeVisible();

  const encryptedModelDatabase = new Database(databasePath, {
    readonly: true,
  });
  const encryptedModelKey = encryptedModelDatabase
    .prepare(
      'SELECT "apiKeyEncrypted" FROM "AiModelProfile" WHERE "name" = ? AND "deletedAt" IS NULL',
    )
    .pluck()
    .get("E2E OpenAI 兼容模型") as string;
  encryptedModelDatabase.close();
  expect(encryptedModelKey).not.toContain("e2e-model-api-key");

  await page.goto("/requirements");
  await page.getByRole("link", { name: "订单退款" }).click();
  await expect(page).toHaveURL(/\/features\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "订单退款" })).toBeVisible();
  await page.getByRole("button", { name: "新建US" }).click();
  await expect(page.getByRole("heading", { name: "新建US" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "AI辅助生成US" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "AI辅助生成US" }).click();
  await expect(
    page.getByRole("heading", { name: "AI辅助生成US" }),
  ).toBeVisible();
  await expect(page.locator("form").getByRole("textbox")).toHaveCount(1);
  await expect(page.getByText(/FE-/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "需求内容" })
    .fill("客服需要根据订单状态提交退款，并明确显示成功或失败原因。");
  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page).toHaveURL(/\/ai-executions\/[^?]+$/);
  await expect(page.getByText("生成失败")).toBeVisible();
  await expect(
    page.getByText("当前项目尚未配置 GitHub PAT", { exact: true }),
  ).toBeVisible();

  const writableDatabase = new Database(databasePath);
  const projectAndFeature = writableDatabase
    .prepare(
      `SELECT p."id" AS "projectId", f."id" AS "featureId", u."id" AS "userId"
       FROM "Project" p
       JOIN "Feature" f ON f."projectId" = p."id"
       JOIN "User" u ON u."username" = 'admin'
       WHERE p."name" = ? AND f."name" = ?`,
    )
    .get("E2E 验收项目", "订单退款") as {
    projectId: string;
    featureId: string;
    userId: string;
  };
  const now = new Date().toISOString();
  writableDatabase
    .prepare(
      `INSERT INTO "AiExecution" (
        "id", "projectId", "requestedById", "featureId", "capability",
        "status", "stage", "requirementText", "modelProfileNameSnapshot",
        "modelIdSnapshot", "skillNameSnapshot", "skillVersionSnapshot",
        "repositorySnapshot", "codeReferences", "promptTokens",
        "completionTokens", "totalTokens", "queuedAt", "startedAt",
        "finishedAt", "durationMs", "createdAt", "updatedAt"
      ) VALUES (
        ?, ?, ?, ?, 'GENERATE_USER_STORY', 'SUCCEEDED', 'COMPLETED', ?,
        'E2E OpenAI 兼容模型', 'e2e-structured-model', '生成结构化用户故事',
        '1.0.0', ?, ?, 120, 80, 200, ?, ?, ?, 1500, ?, ?
      )`,
    )
    .run(
      "e2e-ai-success",
      projectAndFeature.projectId,
      projectAndFeature.userId,
      projectAndFeature.featureId,
      "客服需要提交订单退款",
      JSON.stringify([
        {
          repositoryId: "e2e-repository",
          provider: "GITHUB",
          owner: "qianzgcn",
          repository: "spec-chain",
          branch: "main",
          commitSha: "1234567890abcdef",
        },
      ]),
      JSON.stringify([
        {
          repositoryId: "e2e-repository",
          provider: "GITHUB",
          owner: "qianzgcn",
          repository: "spec-chain",
          branch: "main",
          commitSha: "1234567890abcdef",
          path: "src/app/refunds/page.tsx",
          reason: "包含退款提交页面",
        },
      ]),
      now,
      now,
      now,
      now,
      now,
    );
  writableDatabase
    .prepare(
      `INSERT INTO "UserStoryDraft" (
        "id", "projectId", "featureId", "sourceExecutionId", "status",
        "title", "asA", "iWant", "soThat", "businessRules",
        "nonFunctionalRequirements", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "e2e-ai-draft",
      projectAndFeature.projectId,
      projectAndFeature.featureId,
      "e2e-ai-success",
      "客服提交订单退款草稿",
      "客服专员",
      "为符合条件的订单提交退款申请",
      "及时解决客户退款诉求",
      "仅已支付订单可以发起退款。",
      "",
      now,
      now,
    );
  writableDatabase
    .prepare(
      `INSERT INTO "DraftAcceptanceCriterion" (
        "id", "draftId", "position", "given", "when", "then",
        "createdAt", "updatedAt"
      ) VALUES (?, ?, 0, ?, ?, ?, ?, ?)`,
    )
    .run(
      "e2e-ai-draft-criterion",
      "e2e-ai-draft",
      "订单已支付且符合退款条件",
      "客服提交退款申请",
      "系统创建退款记录并提示提交成功",
      now,
      now,
    );
  writableDatabase
    .prepare(
      `INSERT INTO "AiExecutionLog" (
        "id", "executionId", "position", "level", "stage", "message", "createdAt"
      ) VALUES (?, ?, 0, 'INFO', 'COMPLETED', ?, ?)`,
    )
    .run(
      "e2e-ai-log",
      "e2e-ai-success",
      "结构化 US 已生成，等待用户评审。",
      now,
    );
  writableDatabase.close();

  await page.goto("/ai-executions");
  await expect(page.getByText("客服需要提交订单退款")).toBeVisible();
  await expect(page.getByRole("link", { name: "评审草稿" })).toHaveCount(0);
  const successfulExecutionRow = page
    .locator("tbody tr")
    .filter({ hasText: "客服需要提交订单退款" });
  await successfulExecutionRow.getByRole("button", { name: "查看" }).click();
  await expect(
    page.getByRole("heading", { name: "AI辅助生成US" }),
  ).toBeVisible();
  await expect(page.getByText("实际引用的代码")).toHaveCount(0);
  await expect(page.getByText("src/app/refunds/page.tsx")).toHaveCount(0);
  await expect(page.getByRole("log")).toContainText(
    "结构化 US 已生成，等待用户评审。",
  );
  await expect(page.getByRole("log")).toContainText("INFO[生成完成]");

  const executionPayload = await page.evaluate(async () => {
    const response = await fetch("/api/ai-executions/e2e-ai-success");
    return response.text();
  });
  expect(executionPayload).not.toContain("repositorySnapshot");
  expect(executionPayload).not.toContain("codeReferences");
  expect(executionPayload).not.toContain("src/app/refunds/page.tsx");

  await page.getByRole("button", { name: "查看生成结果" }).click();
  await expect(page).toHaveURL(/\/requirements\/pending-review\/e2e-ai-draft$/);
  await expect(page.getByRole("heading", { name: "评审需求" })).toBeVisible();
  await page.getByRole("textbox", { name: "US 标题" }).fill("客服提交订单退款");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("待评审需求已保存")).toBeVisible();

  await page.goto("/requirements/pending-review");
  await expect(page.getByText("客服提交订单退款")).toBeVisible();
  await page.getByRole("button", { name: "评审" }).click();
  await page.getByRole("button", { name: "确认创建US" }).click();
  await expect(
    page.getByRole("heading", { name: "客服提交订单退款" }),
  ).toBeVisible();

  await page.goto("/requirements/pending-review");
  await expect(page.getByText("客服提交订单退款")).toHaveCount(0);

  await page.goto("/ai-executions");
  await expectTablePageFillsWorkspace(page);
  await expect(page.getByRole("link", { name: "评审草稿" })).toHaveCount(0);

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const pagePath of [
      "/requirements",
      "/requirements/pending-review",
      "/test-cases",
      "/ai-executions",
    ]) {
      await page.goto(pagePath);
      await expectTablePageFillsWorkspace(page);
    }
  }
});
