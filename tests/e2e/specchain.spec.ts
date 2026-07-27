import { expect, test } from "@playwright/test";

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
  await page.getByRole("button", { name: "创建项目" }).click();
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
    .getByRole("textbox", { name: "操作步骤" })
    .fill("输入退款原因并提交");
  await page
    .getByRole("textbox", { name: "预期结果" })
    .fill("退款记录创建成功");
  await page.getByRole("button", { name: "保 存" }).click();

  await expect(
    page.getByRole("heading", { name: "客服成功提交退款" }),
  ).toBeVisible();
  await expect(page.getByText("输入退款原因并提交")).toBeVisible();
  await expect(page.getByText("退款记录创建成功")).toBeVisible();
  await expect(page.getByText("尚未编写自动化脚本").first()).toBeVisible();
});
