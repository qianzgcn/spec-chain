import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { prepareAuthenticationState } from "@/automation/authentication";
import { PlaywrightCliSession } from "@/automation/playwright-cli-session";
import { createVariableRuntimeBundle } from "@/automation/variable-runtime";
import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";
import { LOGIN_METHOD_TEMPLATE } from "@/lib/automation/login-contract";
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
  await expect(page.getByRole("columnheader", { name: "步骤" })).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "最后编辑时间" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "最新运行时间" }),
  ).toBeVisible();

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

  await expect
    .poll(async () =>
      page
        .getByTestId("test-case-actions")
        .first()
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(0);

  const actions = page.getByTestId("test-case-actions").first();
  await expect(actions.getByRole("button", { name: /^运行 / })).toBeVisible();
  await expect(actions.getByRole("link", { name: "编辑" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "删除" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "更多操作" })).toHaveCount(
    0,
  );
}

async function dismissNotifications(page: Page) {
  const closeButtons = page.getByRole("button", { name: "关闭通知" });
  if ((await closeButtons.count()) === 0) return;

  await page.mouse.move(0, 0);
  await expect(closeButtons).toHaveCount(0);
}

async function expectAiWorkerIdleAfterTask(
  databasePath: string,
  executionId: string,
) {
  await expect
    .poll(
      () => {
        const database = new Database(databasePath, { readonly: true });
        try {
          const execution = database
            .prepare(`SELECT "status" FROM "AiExecution" WHERE "id" = ?`)
            .get(executionId) as { status: string } | undefined;
          const leaseCount = (
            database
              .prepare(`SELECT COUNT(*) AS "count" FROM "TaskSchedulerLease"`)
              .get() as { count: number }
          ).count;

          return {
            status: execution?.status ?? null,
            leaseCount,
          };
        } finally {
          database.close();
        }
      },
      { timeout: 30_000 },
    )
    .toEqual({ status: "FAILED", leaseCount: 0 });
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
  await page.waitForURL(
    (url) => url.pathname !== "/login" && url.pathname !== "/",
  );

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

  await dismissNotifications(page);
  await page.getByRole("link", { name: "新建US" }).click();
  await expect(page).toHaveURL(/\/features\/[^/]+\/user-stories\/new$/);
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
  await expect(page.getByText("未生成", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI生成脚本" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "自动化运行" })).toHaveCount(
    0,
  );

  await page.route("**/test-cases/*/runs*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await dismissNotifications(page);
  await page.goto("/test-cases");
  await page
    .locator("tbody tr")
    .filter({ hasText: "客服成功提交退款" })
    .getByRole("link", { name: "执行记录" })
    .click();
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
    "/test-cases/pending-review",
    "/test-case-groups",
    "/execution-tasks",
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
  await page
    .getByRole("textbox", { name: "自动化约束" })
    .fill("新建测试数据的名称统一使用 E2E_ 前缀。");
  await page.getByRole("button", { name: "新建变量" }).click();
  await page.getByRole("textbox", { name: "变量名" }).fill("E2E_SECRET");
  await page.getByRole("switch", { name: "加密变量" }).click();
  await expect(page.getByLabel("值")).toHaveAttribute("type", "password");
  await page.getByLabel("值").fill("e2e-secret-value");
  await page.getByRole("button", { name: "确定" }).click();
  const saveVariablesButton = page.getByRole("button", { name: "保存" });
  await saveVariablesButton.click();
  await expect(saveVariablesButton).toBeDisabled();
  await expect(page.getByText("当前设置已保存")).toHaveCount(0);

  const savedVariableRow = page.getByTestId("project-variable-row").first();
  await expect(savedVariableRow).toContainText("E2E_SECRET");
  await expect(
    savedVariableRow.getByRole("textbox", { name: "变量名" }),
  ).toHaveCount(0);
  await expect(
    savedVariableRow.getByRole("button", { name: "编辑" }),
  ).toHaveCount(1);

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
  await page.getByRole("combobox", { name: "生成测试用例默认模型" }).click();
  await page.getByRole("option", { name: /E2E OpenAI 兼容模型/ }).click();
  await expect(
    page.getByText("生成测试用例默认", { exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "生成自动化脚本默认模型" }).click();
  await page.getByRole("option", { name: /E2E OpenAI 兼容模型/ }).click();
  await expect(
    page.getByText("生成自动化脚本默认", { exact: true }),
  ).toBeVisible();

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
  await page.getByRole("link", { name: "新建US" }).click();
  await expect(page.getByRole("heading", { name: "新建US" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI辅助生成US" })).toBeVisible();
  await page.getByRole("link", { name: "AI辅助生成US" }).click();
  await expect(
    page.getByRole("heading", { name: "AI辅助生成US" }),
  ).toBeVisible();
  await expect(page.locator("form").getByRole("textbox")).toHaveCount(1);
  await expect(page.getByText(/FE-/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "需求内容" })
    .fill("客服需要根据订单状态提交退款，并明确显示成功或失败原因。");
  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page).toHaveURL(/\/execution-tasks\/[^?]+$/);
  const failedTaskUrl = page.url();
  const failedTaskId = failedTaskUrl.split("/").at(-1);
  expect(failedTaskId).toBeTruthy();
  await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
  await expect(page.getByText("任务失败", { exact: true })).toBeVisible();
  await expect(page.getByText("AI辅助生成US", { exact: true })).toBeVisible();
  await expect(page.getByText(failedTaskId!, { exact: true })).toBeVisible();
  await expect(
    page.getByText("当前项目尚未配置 GitHub PAT", { exact: true }),
  ).toBeVisible();
  await dismissNotifications(page);
  await page.getByRole("button", { name: "重新运行" }).click();
  await expect(
    page.getByText("任务已重新进入队列", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(failedTaskUrl);
  await expect(page.getByRole("log")).toContainText("任务已重新进入队列");
  await expect(page.getByRole("log")).not.toContainText(
    "任务已进入队列，等待 AI 执行器处理。",
  );
  await expect(page.getByText("任务失败", { exact: true })).toBeVisible();

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

  await page.goto("/execution-tasks");
  await expect(page.getByRole("heading", { name: "执行任务" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "执行时间" }),
  ).toBeVisible();
  await expect(page.getByText("客服需要提交订单退款")).toBeVisible();
  await expect(
    page.getByText("e2e-ai-success", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "AI辅助生成US" }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("客服需要根据订单状态提交退款，并明确显示成功或失败原因。", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: "评审草稿" })).toHaveCount(0);
  const successfulExecutionRow = page
    .locator("tbody tr")
    .filter({ hasText: "客服需要提交订单退款" });
  await successfulExecutionRow.getByRole("link", { name: "查看" }).click();
  await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
  await expect(page.getByText("实际引用的代码")).toHaveCount(0);
  await expect(page.getByText("src/app/refunds/page.tsx")).toHaveCount(0);
  await expect(page.getByRole("log")).toContainText(
    "结构化 US 已生成，等待用户评审。",
  );
  await expect(page.getByRole("log")).toContainText("INFO[已完成]");

  const executionPayload = await page.evaluate(async () => {
    const response = await fetch("/api/execution-tasks/e2e-ai-success");
    return response.text();
  });
  expect(executionPayload).not.toContain("repositorySnapshot");
  expect(executionPayload).not.toContain("codeReferences");
  expect(executionPayload).not.toContain("src/app/refunds/page.tsx");

  await page.getByRole("link", { name: "查看生成结果" }).click();
  await expect(page).toHaveURL(/\/requirements\/pending-review\/e2e-ai-draft$/);
  await expect(page.getByRole("heading", { name: "评审需求" })).toBeVisible();
  await page.getByRole("textbox", { name: "US 标题" }).fill("客服提交订单退款");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("待评审需求已保存")).toBeVisible();

  await page.goto("/requirements/pending-review");
  await expect(page.getByText("客服提交订单退款")).toBeVisible();
  await page
    .getByTestId("data-table")
    .getByRole("link", { name: "评审", exact: true })
    .click();
  await page.getByRole("button", { name: "确认创建US" }).click();
  await expect(
    page.getByRole("heading", { name: "客服提交订单退款" }),
  ).toBeVisible();

  await page.goto("/requirements/pending-review");
  await expect(page.getByText("客服提交订单退款")).toHaveCount(0);

  await page.goto("/execution-tasks");
  await expectTablePageFillsWorkspace(page);
  await expect(page.getByRole("link", { name: "评审草稿" })).toHaveCount(0);

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const pagePath of [
      "/requirements",
      "/requirements/pending-review",
      "/test-cases",
      "/test-cases/pending-review",
      "/execution-tasks",
    ]) {
      await page.goto(pagePath);
      await expectTablePageFillsWorkspace(page);
    }
  }
});

test("项目对象变量和公共登录方法可在探测、用例及评审中复用", async ({
  page,
}) => {
  const databasePath = path.resolve(process.cwd(), "data", "e2e.db");
  const baseUrl = "http://127.0.0.1:3100";

  await page.goto("/login");
  await page.getByRole("textbox", { name: "用户名" }).fill("admin");
  await page.getByRole("textbox", { name: "密码" }).fill("admin12345");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(
    (url) => url.pathname !== "/login" && url.pathname !== "/",
  );

  await page.goto("/projects");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page
    .getByRole("textbox", { name: "项目名称" })
    .fill("E2E 登录复用项目");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/project-settings$/);

  await page.goto("/project-settings/testing");
  await page.getByRole("textbox", { name: "Base URL" }).fill(baseUrl);
  await page.getByRole("button", { name: "新建变量" }).click();
  await page.getByLabel("变量名").fill("ADMIN");
  await page.getByRole("combobox", { name: "变量类型" }).click();
  await page.getByRole("option", { name: "对象" }).click();
  await page.getByRole("button", { name: "添加字段" }).click();
  const objectFields = page.getByTestId("project-variable-object-field");
  await objectFields.nth(0).getByLabel("字段名").fill("username");
  await objectFields.nth(0).getByLabel("字段值").fill("admin");
  await objectFields.nth(0).getByLabel("字段描述").fill("管理员用户名");
  await objectFields.nth(1).getByLabel("字段名").fill("password");
  await objectFields
    .nth(1)
    .getByRole("switch", { name: /加密字段/ })
    .click();
  await objectFields.nth(1).getByLabel("字段值").fill("admin12345");
  await objectFields.nth(1).getByLabel("字段描述").fill("管理员密码");
  await page.getByRole("button", { name: "确定" }).click();
  await page.getByRole("button", { name: "新建变量" }).click();
  await page.getByLabel("变量名").fill("E2E_LOCALE");
  await page.getByLabel("值").fill("zh-CN");
  await page.getByLabel("描述").fill("测试语言");
  await page.getByRole("button", { name: "确定" }).click();
  await page.getByRole("button", { name: "载入示例" }).click();
  await expect(
    page.getByRole("textbox", { name: "登录方法源码" }),
  ).toContainText("export async function login");
  const saveAuthenticationButton = page.getByRole("button", {
    name: "保存",
  });
  await saveAuthenticationButton.click();
  await expect(page.getByText("测试设置已保存")).toBeVisible();
  await expect(saveAuthenticationButton).toBeDisabled();

  const authenticationWorkDir = await mkdtemp(
    path.join(process.cwd(), "data", "e2e-authentication-"),
  );
  const abortController = new AbortController();
  let authenticatedSession: PlaywrightCliSession | null = null;
  try {
    const variableRuntime = createVariableRuntimeBundle({
      metadata: [
        {
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
        },
      ],
      values: {
        "ADMIN.username": "admin",
        "ADMIN.password": "admin12345",
      },
    });
    const storageStatePath = await prepareAuthenticationState({
      workDir: path.join(authenticationWorkDir, "setup"),
      baseUrl,
      authentication: {
        variableName: "ADMIN",
        loginMethodSource: LOGIN_METHOD_TEMPLATE,
        username: "admin",
        password: "admin12345",
      },
      variableModuleSource: variableRuntime.source,
      environment: {
        ...process.env,
        ...variableRuntime.environment,
      },
      abortSignal: abortController.signal,
    });
    const storageState = await readFile(storageStatePath, "utf8");
    expect(storageState).not.toContain("admin12345");

    authenticatedSession = new PlaywrightCliSession({
      taskId: "e2e-authentication-reuse",
      workDir: path.join(authenticationWorkDir, "probe"),
      baseUrl,
      secretValues: ["admin", "admin12345"],
      storageStatePath,
      abortSignal: abortController.signal,
    });
    await authenticatedSession.initialize();
    const openResult = await authenticatedSession.open("/requirements");
    expect(openResult).toContain("/requirements");
    expect(openResult).not.toContain("/login");
  } finally {
    await authenticatedSession?.close();
    await rm(authenticationWorkDir, { recursive: true, force: true });
  }
  await expect(access(authenticationWorkDir)).rejects.toThrow();

  await page.goto("/test-case-groups");
  await page.getByRole("button", { name: "新建分组" }).click();
  await page.getByRole("textbox", { name: "分组名称" }).fill("登录后业务");
  await page.getByRole("button", { name: "保存" }).click();

  await page.goto("/test-cases/new");
  await page
    .getByRole("textbox", { name: "用例名称" })
    .fill("管理员查看需求列表");
  await page
    .getByRole("textbox", { name: "前置条件（可选）" })
    .fill("1. 使用 ${ADMIN} 登录 SpecChain。");
  await page
    .getByRole("textbox", { name: "测试步骤" })
    .fill(
      "1. 打开需求列表。\n2. 验证页面展示当前项目的需求。\n3. 验证界面语言符合 ${E2E_LOCALE}。",
    );
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("使用 ${ADMIN} 登录 SpecChain")).toBeVisible();

  const testCaseId = new URL(page.url()).pathname.split("/").at(-1);
  expect(testCaseId).toBeTruthy();
  await page.goto(`/test-cases/${testCaseId}/edit`);
  await expect(page.getByRole("button", { name: "保存" })).toBeDisabled();

  const database = new Database(databasePath);
  const context = database
    .prepare(
      `SELECT p."id" AS "projectId", u."id" AS "userId",
              g."id" AS "groupId"
       FROM "Project" p
       JOIN "User" u ON u."username" = 'admin'
       JOIN "TestCaseGroup" g ON g."projectId" = p."id"
       WHERE p."name" = ? AND g."name" = ?`,
    )
    .get("E2E 登录复用项目", "登录后业务") as {
    projectId: string;
    userId: string;
    groupId: string;
  };
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO "AiExecution" (
        "id", "projectId", "requestedById", "capability", "status", "stage",
        "requirementText", "queuedAt", "startedAt", "finishedAt",
        "durationMs", "createdAt", "updatedAt"
      ) VALUES (
        ?, ?, ?, 'GENERATE_TEST_CASES', 'SUCCEEDED', 'COMPLETED',
        ?, ?, ?, ?, 1000, ?, ?
      )`,
    )
    .run(
      "e2e-authentication-draft-task",
      context.projectId,
      context.userId,
      "登录后查看项目需求",
      now,
      now,
      now,
      now,
      now,
    );
  database
    .prepare(
      `INSERT INTO "TestCaseDraftBatch" (
        "id", "projectId", "sourceExecutionId", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "e2e-authentication-draft-batch",
      context.projectId,
      "e2e-authentication-draft-task",
      now,
      now,
    );
  database
    .prepare(
      `INSERT INTO "TestCaseDraft" (
        "id", "batchId", "position", "name", "priority", "preconditions",
        "steps", "status", "createdAt", "updatedAt"
      ) VALUES (?, ?, 0, ?, 'P1', ?, ?, 'PENDING', ?, ?)`,
    )
    .run(
      "e2e-authentication-draft",
      "e2e-authentication-draft-batch",
      "管理员查看项目设置",
      "1. 使用 ${ADMIN} 登录 SpecChain。",
      "1. 打开项目设置。\n2. 验证页面展示当前项目配置。",
      now,
      now,
    );
  database.close();

  await page.goto("/test-cases/pending-review");
  const draftRow = page
    .locator("tbody tr")
    .filter({ hasText: "管理员查看项目设置" });
  await draftRow
    .getByRole("combobox", { name: "设置“管理员查看项目设置”的分组" })
    .click();
  await page.getByRole("option", { name: "登录后业务" }).click();
  await draftRow.getByRole("button", { name: "评审通过" }).click();
  await expect(page.getByText("管理员查看项目设置")).toHaveCount(0);

  const verificationDatabase = new Database(databasePath, { readonly: true });
  const confirmed = verificationDatabase
    .prepare(
      `SELECT "groupId", "preconditions", "steps"
       FROM "TestCase"
       WHERE "name" = ? AND "projectId" = ? AND "deletedAt" IS NULL`,
    )
    .get("管理员查看项目设置", context.projectId) as {
    groupId: string;
    preconditions: string;
    steps: string;
  };
  verificationDatabase.close();
  expect(confirmed.groupId).toBe(context.groupId);
  expect(confirmed.preconditions).toContain("${ADMIN}");
  expect(confirmed.steps).toContain("打开项目设置");
});

test("AI 生成的测试用例支持逐条评审并关联唯一 US", async ({ page }) => {
  const databasePath = path.resolve(process.cwd(), "data", "e2e.db");

  await page.goto("/login");
  await page.getByRole("textbox", { name: "用户名" }).fill("admin");
  await page.getByRole("textbox", { name: "密码" }).fill("admin12345");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(
    (url) => url.pathname !== "/login" && url.pathname !== "/",
  );

  await page.goto("/projects");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page
    .getByRole("textbox", { name: "项目名称" })
    .fill("E2E AI 用例评审项目");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/project-settings$/);

  const database = new Database(databasePath);
  const context = database
    .prepare(
      `SELECT p."id" AS "projectId", u."id" AS "userId"
       FROM "Project" p
       JOIN "User" u ON u."username" = 'admin'
       WHERE p."name" = ?`,
    )
    .get("E2E AI 用例评审项目") as {
    projectId: string;
    userId: string;
  };
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO "UserStory" (
        "id", "projectId", "code", "title", "asA", "iWant", "soThat",
        "status", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DESIGN', ?, ?)`,
    )
    .run(
      "e2e-test-case-source-story",
      context.projectId,
      "US-20260730190000000",
      "管理员登录校验",
      "管理员",
      "使用用户名和密码登录",
      "安全访问平台",
      now,
      now,
    );
  database
    .prepare(
      `INSERT INTO "TestCaseGroup" (
        "id", "projectId", "name", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run("e2e-ai-test-case-group", context.projectId, "登录与会话", now, now);
  database
    .prepare(
      `INSERT INTO "AiExecution" (
        "id", "projectId", "requestedById", "sourceUserStoryId",
        "capability", "status", "stage", "requirementText",
        "modelProfileNameSnapshot", "modelIdSnapshot", "skillNameSnapshot",
        "skillVersionSnapshot", "queuedAt", "startedAt", "finishedAt",
        "durationMs", "createdAt", "updatedAt"
      ) VALUES (
        ?, ?, ?, ?, 'GENERATE_TEST_CASES', 'SUCCEEDED', 'COMPLETED', ?,
        'E2E OpenAI 兼容模型', 'e2e-structured-model',
        '生成自然语言测试用例', '1.0.0', ?, ?, ?, 1200, ?, ?
      )`,
    )
    .run(
      "e2e-ai-test-case-success",
      context.projectId,
      context.userId,
      "e2e-test-case-source-story",
      "来源：已有 US\n\nUS 标题：管理员登录校验",
      now,
      now,
      now,
      now,
      now,
    );
  database
    .prepare(
      `INSERT INTO "TestCaseDraftBatch" (
        "id", "projectId", "sourceExecutionId", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "e2e-test-case-draft-batch",
      context.projectId,
      "e2e-ai-test-case-success",
      now,
      now,
    );
  const insertDraft = database.prepare(
    `INSERT INTO "TestCaseDraft" (
      "id", "batchId", "groupId", "position", "name", "priority", "preconditions",
      "steps", "status", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
  );
  insertDraft.run(
    "e2e-test-case-draft-failed-login",
    "e2e-test-case-draft-batch",
    "e2e-ai-test-case-group",
    0,
    "管理员使用错误密码登录失败",
    "P1",
    "1. 系统中存在可登录的管理员账号 A。\n2. 当前用户未登录。",
    "1. 访问登录入口。\n2. 使用账号 A 和错误密码提交登录。\n3. 验证系统拒绝登录，用户仍处于未登录状态。",
    now,
    now,
  );
  insertDraft.run(
    "e2e-test-case-draft-success-login",
    "e2e-test-case-draft-batch",
    null,
    1,
    "管理员使用正确密码登录成功",
    "P0",
    "1. 系统中存在可登录的管理员账号 A。\n2. 当前用户未登录。",
    "1. 访问登录入口。\n2. 使用账号 A 和正确密码提交登录。\n3. 验证用户进入已登录状态。",
    now,
    now,
  );
  database
    .prepare(
      `INSERT INTO "AiExecutionLog" (
        "id", "executionId", "position", "level", "stage", "message", "createdAt"
      ) VALUES (?, ?, 0, 'INFO', 'COMPLETED', ?, ?)`,
    )
    .run(
      "e2e-ai-test-case-log",
      "e2e-ai-test-case-success",
      "任务处理完成，已保存 2 条待评审测试用例。",
      now,
    );
  database.close();

  await page.goto("/test-cases/ai-generate");
  await expect(
    page.getByRole("heading", { name: "AI辅助生成测试用例" }),
  ).toBeVisible();
  await expect(page.getByText("选择已有US", { exact: true })).toBeVisible();
  await page.getByText("输入需求内容", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "需求内容" })).toBeVisible();
  await page.getByText("选择已有US", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "选择 US" })).toBeVisible();

  await page.goto("/execution-tasks");
  const executionRow = page
    .locator("tbody tr")
    .filter({ hasText: "e2e-ai-test-case-success" });
  await expect(executionRow).toContainText("AI辅助生成测试用例");
  await executionRow.getByRole("link", { name: "查看" }).click();
  await expect(page.getByRole("log")).toContainText(
    "已保存 2 条待评审测试用例",
  );
  await page.getByRole("link", { name: "查看生成结果" }).click();
  await expect(page).toHaveURL(
    /\/test-cases\/pending-review\?batch=e2e-test-case-draft-batch$/,
  );

  let firstDraftRow = page
    .locator("tbody tr")
    .filter({ hasText: "管理员使用错误密码登录失败" });
  await expect(
    firstDraftRow.getByRole("combobox", {
      name: "设置“管理员使用错误密码登录失败”的分组",
    }),
  ).toContainText("登录与会话");
  await firstDraftRow
    .getByRole("link", { name: "管理员使用错误密码登录失败" })
    .click();
  await expect(page).toHaveURL(
    /\/test-cases\/pending-review\/e2e-test-case-draft-failed-login$/,
  );
  await expect(
    page.getByRole("heading", { name: "管理员使用错误密码登录失败" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /US-20260730190000000/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回列表" }).click();

  firstDraftRow = page
    .locator("tbody tr")
    .filter({ hasText: "管理员使用错误密码登录失败" });
  await firstDraftRow.getByRole("button", { name: "评审通过" }).click();
  await expect(page.getByText("管理员使用错误密码登录失败")).toHaveCount(0);

  const secondDraftRow = page
    .locator("tbody tr")
    .filter({ hasText: "管理员使用正确密码登录成功" });
  const remainingGroup = secondDraftRow.getByRole("combobox", {
    name: "设置“管理员使用正确密码登录成功”的分组",
  });
  await remainingGroup.click();
  await page.getByRole("option", { name: "登录与会话" }).click();
  await expect(page.getByText("用例分组已更新", { exact: true })).toBeVisible();
  await secondDraftRow.getByRole("button", { name: "评审通过" }).click();
  await expect(page.getByText("管理员使用正确密码登录成功")).toHaveCount(0);

  await page.goto("/test-cases");
  await expect(
    page.getByRole("link", { name: "管理员使用错误密码登录失败" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "管理员使用正确密码登录成功" }),
  ).toBeVisible();

  const verificationDatabase = new Database(databasePath, { readonly: true });
  const linkedCases = verificationDatabase
    .prepare(
      `SELECT "name", "userStoryId", "groupId"
       FROM "TestCase"
       WHERE "name" IN (?, ?)
       ORDER BY "name"`,
    )
    .all("管理员使用错误密码登录失败", "管理员使用正确密码登录成功") as Array<{
    name: string;
    userStoryId: string | null;
    groupId: string;
  }>;
  verificationDatabase.close();

  expect(linkedCases).toHaveLength(2);
  expect(
    linkedCases.every(
      (testCase) => testCase.userStoryId === "e2e-test-case-source-story",
    ),
  ).toBe(true);
  expect(
    linkedCases.every(
      (testCase) => testCase.groupId === "e2e-ai-test-case-group",
    ),
  ).toBe(true);
});

test("失败的 AI 任务可以使用原任务 ID 重新运行", async ({ page }) => {
  const databasePath = path.resolve(process.cwd(), "data", "e2e.db");

  await page.goto("/login");
  await page.getByRole("textbox", { name: "用户名" }).fill("admin");
  await page.getByRole("textbox", { name: "密码" }).fill("admin12345");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(
    (url) => url.pathname !== "/login" && url.pathname !== "/",
  );

  await page.goto("/projects");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page
    .getByRole("textbox", { name: "项目名称" })
    .fill("E2E 任务重跑项目");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/project-settings$/);

  const database = new Database(databasePath);
  const context = database
    .prepare(
      `SELECT p."id" AS "projectId", u."id" AS "userId"
       FROM "Project" p
       JOIN "User" u ON u."username" = 'admin'
       WHERE p."name" = ?`,
    )
    .get("E2E 任务重跑项目") as { projectId: string; userId: string };
  const queuedAt = new Date(Date.now() - 60_000).toISOString();
  const finishedAt = new Date(Date.now() - 30_000).toISOString();

  database
    .prepare(
      `INSERT INTO "AiExecution" (
        "id", "projectId", "requestedById", "capability", "status", "stage",
        "requirementText", "errorMessage", "queuedAt", "startedAt",
        "finishedAt", "durationMs", "createdAt", "updatedAt"
      ) VALUES (
        ?, ?, ?, 'GENERATE_USER_STORY', 'FAILED', 'GENERATING_DRAFT',
        ?, ?, ?, ?, ?, 30000, ?, ?
      )`,
    )
    .run(
      "e2e-retry-task",
      context.projectId,
      context.userId,
      "生成一个支持失败重跑的用户故事",
      "初次执行失败",
      queuedAt,
      queuedAt,
      finishedAt,
      queuedAt,
      finishedAt,
    );
  database
    .prepare(
      `INSERT INTO "AiExecutionLog" (
        "id", "executionId", "position", "level", "stage", "message", "createdAt"
      ) VALUES (?, ?, 0, 'ERROR', 'GENERATING_DRAFT', ?, ?)`,
    )
    .run(
      "e2e-retry-task-old-log",
      "e2e-retry-task",
      "旧日志：初次执行失败。",
      finishedAt,
    );
  database.close();

  await page.goto("/execution-tasks");
  await expect(page.getByRole("heading", { name: "执行任务" })).toBeVisible();
  await expect(
    page.getByText("生成一个支持失败重跑的用户故事", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("e2e-retry-task", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("AI辅助生成US", { exact: true })).toBeVisible();

  // 该用例只验证原任务 ID 重跑；列表“查看”导航已由核心流程覆盖。
  await page.goto("/execution-tasks/e2e-retry-task");
  await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("旧日志：初次执行失败。");

  await page.getByRole("button", { name: "重新运行" }).click();
  await expect(
    page.getByText("任务已重新进入队列", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/execution-tasks\/e2e-retry-task$/);
  await expect(page.getByRole("log")).toContainText("任务已重新进入队列");
  await expect(page.getByRole("log")).not.toContainText(
    "旧日志：初次执行失败。",
  );
  await expectAiWorkerIdleAfterTask(databasePath, "e2e-retry-task");

  await page.goto("/execution-tasks");
  await expect(
    page.getByText("生成一个支持失败重跑的用户故事", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("e2e-retry-task", { exact: true }).first(),
  ).toBeVisible();
});

test("执行任务支持筛选和逻辑删除", async ({ page }) => {
  const databasePath = path.resolve(process.cwd(), "data", "e2e.db");

  await page.goto("/login");
  await page.getByRole("textbox", { name: "用户名" }).fill("admin");
  await page.getByRole("textbox", { name: "密码" }).fill("admin12345");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(
    (url) => url.pathname !== "/login" && url.pathname !== "/",
  );

  await page.goto("/projects");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page
    .getByRole("textbox", { name: "项目名称" })
    .fill("E2E 执行任务筛选项目");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/project-settings$/);

  const database = new Database(databasePath);
  const context = database
    .prepare(
      `SELECT p."id" AS "projectId", u."id" AS "userId"
       FROM "Project" p
       JOIN "User" u ON u."username" = 'admin'
       WHERE p."name" = ?`,
    )
    .get("E2E 执行任务筛选项目") as {
    projectId: string;
    userId: string;
  };
  const insertExecution = database.prepare(
    `INSERT INTO "AiExecution" (
      "id", "projectId", "requestedById", "capability", "status", "stage",
      "requirementText", "queuedAt", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, 'GENERATE_USER_STORY', ?, ?, ?, ?, ?, ?)`,
  );
  const now = Date.now();
  insertExecution.run(
    "e2e-filter-success",
    context.projectId,
    context.userId,
    "SUCCEEDED",
    "COMPLETED",
    "生成可筛选的成功需求",
    new Date(now - 30_000).toISOString(),
    new Date(now - 30_000).toISOString(),
    new Date(now - 20_000).toISOString(),
  );
  insertExecution.run(
    "e2e-filter-failed",
    context.projectId,
    context.userId,
    "FAILED",
    "GENERATING_DRAFT",
    "生成可筛选的失败需求",
    new Date(now - 20_000).toISOString(),
    new Date(now - 20_000).toISOString(),
    new Date(now - 10_000).toISOString(),
  );
  insertExecution.run(
    "e2e-filter-queued",
    context.projectId,
    context.userId,
    "QUEUED",
    "QUEUED",
    "生成不可删除的排队需求",
    new Date(now - 10_000).toISOString(),
    new Date(now - 10_000).toISOString(),
    new Date(now - 10_000).toISOString(),
  );
  database
    .prepare(
      `INSERT INTO "AiExecutionLog" (
        "id", "executionId", "position", "level", "stage", "message", "createdAt"
      ) VALUES (?, ?, 0, 'ERROR', 'GENERATING_DRAFT', ?, ?)`,
    )
    .run(
      "e2e-filter-failed-log",
      "e2e-filter-failed",
      "失败任务日志仍需保留。",
      new Date(now - 10_000).toISOString(),
    );
  database.close();

  await page.goto("/execution-tasks");
  const search = page.getByRole("textbox", {
    name: "搜索任务 ID 或任务内容",
  });
  await search.fill("e2e-filter-success");
  await search.press("Enter");
  await expect(page.getByText("生成可筛选的成功需求")).toBeVisible();
  await expect(page.getByText("生成可筛选的失败需求")).toHaveCount(0);

  await page.getByRole("button", { name: "清空搜索" }).click();
  await page.getByRole("combobox", { name: "任务状态" }).click();
  await page.getByRole("option", { name: "排队中" }).click();
  const queuedRow = page
    .locator("tbody tr")
    .filter({ hasText: "生成不可删除的排队需求" });
  await expect(queuedRow).toBeVisible();
  await expect(queuedRow.getByRole("button", { name: "删除" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "任务状态" }).click();
  await page.getByRole("option", { name: "全部任务状态" }).click();
  await search.fill("失败需求");
  await search.press("Enter");
  const failedRow = page
    .locator("tbody tr")
    .filter({ hasText: "生成可筛选的失败需求" });
  await failedRow.getByRole("button", { name: "删除" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "删除" })
    .click();
  await expect(page.getByText("执行任务已删除", { exact: true })).toBeVisible();
  await expect(page.getByText("生成可筛选的失败需求")).toHaveCount(0);

  await page.getByRole("button", { name: "清空搜索" }).click();
  const successRow = page
    .locator("tbody tr")
    .filter({ hasText: "生成可筛选的成功需求" });
  await successRow.getByRole("link", { name: "查看" }).click();
  await expect(page).toHaveURL(/\/execution-tasks\/e2e-filter-success$/);
  await page.getByRole("button", { name: "删除" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "删除" })
    .click();
  await expect(page).toHaveURL(/\/execution-tasks$/);
  await expect(page.getByText("生成可筛选的成功需求")).toHaveCount(0);

  const updatedDatabase = new Database(databasePath, { readonly: true });
  const deletedTasks = updatedDatabase
    .prepare(
      `SELECT "id", "deletedAt"
       FROM "AiExecution"
       WHERE "id" IN ('e2e-filter-success', 'e2e-filter-failed')
       ORDER BY "id"`,
    )
    .all() as Array<{ id: string; deletedAt: string | null }>;
  const retainedLogCount = (
    updatedDatabase
      .prepare(
        `SELECT COUNT(*) AS "count"
         FROM "AiExecutionLog"
         WHERE "executionId" = 'e2e-filter-failed'`,
      )
      .get() as { count: number }
  ).count;
  updatedDatabase.close();

  expect(deletedTasks).toHaveLength(2);
  expect(deletedTasks.every((task) => task.deletedAt)).toBe(true);
  expect(retainedLogCount).toBe(1);
});
