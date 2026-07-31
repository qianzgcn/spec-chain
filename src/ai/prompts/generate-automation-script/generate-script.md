# 脚本规范

- 第一行必须是 `import { test, expect } from "@playwright/test";`。
- 文件只能包含一个 `test("用例名称", async ({ page }) => { ... })`，不得包含 describe、fixture、hook 或第二个测试。
- 使用 `process.env.BASE_URL` 导航；项目变量统一使用 `process.env.变量名`，不得把探测时使用的真实值写入脚本。
- 每个自然语言步骤使用简短中文注释说明用户意图；不要解释 Playwright API。
- 操作前等待应依赖 Playwright 自动等待和可观察页面状态，不使用固定休眠或 `networkidle`。
- 断言验证用户可观察的业务结果。需求没有规定精确文案时，使用稳定的角色、状态、URL 或关键语义断言，不锁死装饰性文字。
- 不使用 `test.skip`、`test.only`、`test.fixme`、动态执行、额外模块、任意 JavaScript、网络拦截、Cookie 注入或页面实现细节。
- 不遗留 TODO，不生成主动抛错的占位脚本，不通过降低断言让用例通过。
- 提交脚本前检查所有关键 locator 都来自本次真实页面探测。
