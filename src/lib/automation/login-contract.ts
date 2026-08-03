export const LOGIN_METHOD_IMPORT =
  'import { expect, type Page } from "@playwright/test";';

export const LOGIN_MODULE_IMPORT = 'import { login } from "./specchain/login";';

export const LOGIN_METHOD_TEMPLATE = `${LOGIN_METHOD_IMPORT}

export type LoginCredentials = {
  username: string;
  password: string;
};

export async function login(
  page: Page,
  credentials: LoginCredentials,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(credentials.username);
  await page.getByLabel("密码").fill(credentials.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\\/login$/);
}
`;
