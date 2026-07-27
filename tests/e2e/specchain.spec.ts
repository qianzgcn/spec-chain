import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

async function expectTablePageFillsWorkspace(page: Page) {
  const metrics = await page.locator("main").evaluate((main) => {
    const panel = main.querySelector<HTMLElement>(".table-page-panel");
    const tableBody = panel?.querySelector<HTMLElement>(".ant-table-body");
    const pagination = panel?.querySelector<HTMLElement>(
      ".ant-table-pagination",
    );

    if (!panel || !tableBody || !pagination) return null;

    const panelRect = panel.getBoundingClientRect();
    const tableBodyRect = tableBody.getBoundingClientRect();
    const paginationRect = pagination.getBoundingClientRect();
    const scrollingElement = document.scrollingElement;

    return {
      documentOverflow:
        (scrollingElement?.scrollHeight ?? 0) -
        (scrollingElement?.clientHeight ?? 0),
      documentOverflowY: scrollingElement
        ? getComputedStyle(scrollingElement).overflowY
        : null,
      workspaceOverflow: main.scrollHeight - main.clientHeight,
      workspaceOverflowY: getComputedStyle(main).overflowY,
      panelHeight: panelRect.height,
      tableBodyHeight: tableBodyRect.height,
      tableBodyOverflowY: getComputedStyle(tableBody).overflowY,
      paginationBottomGap: panelRect.bottom - paginationRect.bottom,
    };
  });

  expect(metrics).not.toBeNull();
  if (!metrics) throw new Error("未找到完整的表格页面结构");

  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
  expect(metrics.documentOverflowY).toBe("hidden");
  expect(metrics.workspaceOverflow).toBeLessThanOrEqual(1);
  expect(metrics.workspaceOverflowY).toBe("hidden");
  expect(metrics.panelHeight).toBeGreaterThan(300);
  expect(metrics.tableBodyHeight).toBeGreaterThan(100);
  expect(["auto", "scroll"]).toContain(metrics.tableBodyOverflowY);
  expect(metrics.paginationBottomGap).toBeLessThanOrEqual(24);
}

async function expectTestCaseActionsAligned(page: Page) {
  const alignment = await page.evaluate(() => {
    const header = [
      ...document.querySelectorAll<HTMLTableCellElement>(
        ".ant-table-header th",
      ),
    ].find((cell) => cell.textContent?.trim() === "操作");
    const row = document.querySelector<HTMLTableRowElement>(
      "tbody tr:not(.ant-table-measure-row)",
    );
    const content = header
      ? (row?.cells.item(header.cellIndex) as HTMLElement | null)
      : null;
    const actions = content?.querySelector<HTMLElement>(
      '[data-testid="test-case-actions"]',
    );

    if (!header || !content || !actions) return null;
    const headerRect = header.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();

    return {
      headerCenter: (headerRect.left + headerRect.right) / 2,
      actionsCenter: (actionsRect.left + actionsRect.right) / 2,
    };
  });

  expect(alignment).not.toBeNull();
  expect(
    Math.abs(alignment!.headerCenter - alignment!.actionsCenter),
  ).toBeLessThanOrEqual(1);
  const moreButton = page.getByRole("button", { name: "更多操作" }).first();
  await expect(moreButton).toBeVisible();
  await expect(moreButton).toHaveText("");
}

test("从登录到需求和测试用例的核心流程", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("textbox", { name: "用户名" }).fill("admin");
  await page.getByRole("textbox", { name: "密码" }).fill("wrong-password");
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page.getByText("用户名或密码错误")).toBeVisible();

  await page.getByRole("textbox", { name: "密码" }).fill("admin12345");
  await page.getByRole("button", { name: "登 录" }).click();
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
      name: /当前业务问题/,
    })
    .fill("统一退款入口，降低人工操作风险。");
  await page.getByRole("button", { name: "保 存" }).click();
  await expect(page.getByRole("heading", { name: "订单退款" })).toBeVisible();
  await expect(page.getByText("共 0 个")).toBeVisible();

  await page.getByRole("link", { name: "新建子 US" }).click();
  await page.getByRole("textbox", { name: "US 标题" }).fill("客服提交退款");
  await page.getByRole("textbox", { name: "As" }).fill("客服专员");
  await page.getByRole("textbox", { name: "I want" }).fill("提交订单退款申请");
  await page.getByRole("textbox", { name: "so that" }).fill("及时处理客户诉求");
  await page.getByRole("textbox", { name: "Given" }).fill("订单已支付");
  await page.getByRole("textbox", { name: "When" }).fill("客服确认退款");
  await page.getByRole("textbox", { name: "Then" }).fill("系统创建退款记录");
  await page.getByRole("button", { name: "保 存" }).click();
  await expect(
    page.getByRole("heading", { name: "客服提交退款" }),
  ).toBeVisible();

  await page.goto("/test-case-groups");
  await page.getByRole("button", { name: "新建分组" }).click();
  await page.getByRole("textbox", { name: "分组名称" }).fill("退款流程");
  await page.getByRole("button", { name: "保 存" }).click();
  await expect(page.getByText("退款流程")).toBeVisible();

  await page.goto("/test-cases/new");
  await page
    .getByRole("textbox", { name: "用例名称" })
    .fill("客服成功提交退款");
  await page
    .getByRole("textbox", { name: "测试步骤" })
    .fill("1. 输入退款原因\n2. 点击提交，退款记录创建成功");
  await page.getByRole("button", { name: "保 存" }).click();

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
  await page.getByRole("link", { name: "执行记录" }).click();
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
    "/test-cases",
    "/test-case-groups",
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

  await page.goto("/project-settings/variables");
  await expect(
    page.getByRole("heading", { name: "项目变量", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加变量" }).click();
  const variableType = page.getByRole("combobox", { name: "类型" });
  await expect(variableType).toBeVisible();
  await variableType.click();
  await page
    .locator(".ant-select-item-option", { hasText: "敏感变量" })
    .click();
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
  const githubPatInput = page.getByRole("textbox", {
    name: "GitHub PAT",
    exact: true,
  });
  await githubPatInput.fill(githubPat);
  await page.getByRole("button", { name: "新增 GitHub PAT" }).click();

  const maskedGithubPat = page.getByRole("textbox", {
    name: "GitHub PAT（已脱敏）",
  });
  await expect(maskedGithubPat).toHaveValue("••••••••••••");
  await expect(maskedGithubPat).toHaveAttribute("readonly", "");
  await expect(githubPatInput).toHaveCount(0);
  await expect(page.getByText("已配置", { exact: true })).toBeVisible();

  const databasePath = path.resolve(process.cwd(), "data", "e2e.db");
  const database = new Database(databasePath, { readonly: true });
  const encryptedCredential = database
    .prepare(
      'SELECT "githubPatEncrypted" FROM "Project" WHERE "name" = ? AND "deletedAt" IS NULL',
    )
    .get("E2E 验收项目") as { githubPatEncrypted: string };
  database.close();

  expect(encryptedCredential.githubPatEncrypted).not.toContain(githubPat);

  await page.getByRole("button", { name: "删除 GitHub PAT" }).click();
  const deletePatDialog = page.getByRole("dialog");
  await expect(deletePatDialog).toBeVisible();
  await deletePatDialog
    .getByRole("button", { name: "确认删除 GitHub PAT" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "GitHub PAT", exact: true }),
  ).toBeVisible();
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
});
