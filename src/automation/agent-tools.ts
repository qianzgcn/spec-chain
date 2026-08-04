import { tool } from "ai";
import { z } from "zod";

import { PlaywrightCliSession } from "@/automation/playwright-cli-session";

export const AUTOMATION_AGENT_TOOL_NAMES = [
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
] as const;

type AutomationAgentToolName = (typeof AUTOMATION_AGENT_TOOL_NAMES)[number];

export type AutomationAgentTerminalResult =
  | { kind: "SCRIPT"; script: string }
  | { kind: "FAILURE"; reason: string; suggestion: string };

const elementReferenceSchema = z
  .string()
  .regex(/^e\d+$/, "请使用最新页面快照中的元素编号");
const variablePathSchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/,
    "变量路径格式不正确",
  );
const toolValueSchema = z
  .object({
    literal: z.string().max(2_000).optional(),
    variablePath: variablePathSchema.optional(),
  })
  .superRefine((value, context) => {
    if ((value.literal === undefined) === (value.variablePath === undefined)) {
      context.addIssue({
        code: "custom",
        message: "literal 和 variablePath 必须且只能提供一个",
      });
    }
  });
const variablesContextSchema = z.object({
  variables: z.record(z.string(), z.string()),
});

function resolveToolValue(
  input: z.infer<typeof toolValueSchema>,
  variables: Readonly<Record<string, string>>,
) {
  if (!input.variablePath) return input.literal ?? "";
  if (!Object.hasOwn(variables, input.variablePath)) {
    throw new Error(`项目变量 ${input.variablePath} 不存在`);
  }
  return variables[input.variablePath];
}

function commandResult(observation: string) {
  return {
    ok: true as const,
    observation: observation || "命令执行成功，页面没有返回额外内容。",
  };
}

/**
 * 模型只能访问这里声明的页面操作；变量值通过 toolsContext 留在服务端，
 * 不会拼进提示词或模型可见的工具定义。
 */
export function createAutomationAgentTools(input: {
  session: PlaywrightCliSession;
  variables: Readonly<Record<string, string>>;
  onLog?: (message: string) => void | Promise<void>;
  onScriptSubmitted?: () => void | Promise<void>;
}) {
  let terminalResult: AutomationAgentTerminalResult | null = null;

  const tools = {
    openPage: tool({
      description:
        "打开项目 Base URL 或其同源路径。首次探测必须先调用此工具。path 可以是 / 开头的路径或同源完整 URL。",
      inputSchema: z.object({
        path: z.string().trim().min(1).max(2_000).default("/"),
      }),
      execute: async ({ path }) => {
        await input.onLog?.(`正在打开同源页面 ${path}`);
        return commandResult(await input.session.open(path));
      },
    }),
    snapshotPage: tool({
      description:
        "获取当前页面的语义快照和最新元素编号。页面变化后必须重新调用；大型页面可降低 depth。",
      inputSchema: z.object({
        depth: z.number().int().min(3).max(12).default(8),
      }),
      execute: async ({ depth }) =>
        commandResult(await input.session.snapshot(depth)),
    }),
    findOnPage: tool({
      description:
        "在当前页面快照中查找文字并返回附近节点。用于缩小大型页面的探测范围。",
      inputSchema: z.object({
        text: z.string().trim().min(1).max(200),
      }),
      execute: async ({ text }) =>
        commandResult(await input.session.find(text)),
    }),
    generateLocator: tool({
      description:
        "为最新页面快照中的元素生成稳定 Playwright locator。关键操作和断言应调用此工具确认定位方式。",
      inputSchema: z.object({ target: elementReferenceSchema }),
      execute: async ({ target }) =>
        commandResult(await input.session.generateLocator(target)),
    }),
    clickElement: tool({
      description: "点击最新页面快照中的可交互元素。",
      inputSchema: z.object({ target: elementReferenceSchema }),
      execute: async ({ target }) =>
        commandResult(await input.session.click(target)),
    }),
    fillField: tool({
      description:
        "填写最新页面快照中的输入框。项目变量只能通过 variablePath 引用，普通临时输入使用 literal。",
      inputSchema: z
        .object({ target: elementReferenceSchema })
        .and(toolValueSchema),
      contextSchema: variablesContextSchema,
      execute: async (value, { context }) =>
        commandResult(
          await input.session.fill(
            value.target,
            resolveToolValue(value, context.variables),
          ),
        ),
    }),
    selectOption: tool({
      description:
        "选择最新页面快照中的下拉选项。项目变量只能通过 variablePath 引用，普通选项值使用 literal。",
      inputSchema: z
        .object({ target: elementReferenceSchema })
        .and(toolValueSchema),
      contextSchema: variablesContextSchema,
      execute: async (value, { context }) =>
        commandResult(
          await input.session.select(
            value.target,
            resolveToolValue(value, context.variables),
          ),
        ),
    }),
    checkElement: tool({
      description: "勾选最新页面快照中的复选框或单选框。",
      inputSchema: z.object({ target: elementReferenceSchema }),
      execute: async ({ target }) =>
        commandResult(await input.session.check(target)),
    }),
    uncheckElement: tool({
      description: "取消勾选最新页面快照中的复选框。",
      inputSchema: z.object({ target: elementReferenceSchema }),
      execute: async ({ target }) =>
        commandResult(await input.session.uncheck(target)),
    }),
    pressKey: tool({
      description: "在当前聚焦元素上按下一个受支持的键。",
      inputSchema: z.object({
        key: z.enum([
          "Enter",
          "Escape",
          "Tab",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
        ]),
      }),
      execute: async ({ key }) => commandResult(await input.session.press(key)),
    }),
    handleDialog: tool({
      description: "接受或取消当前浏览器对话框。",
      inputSchema: z.object({
        action: z.enum(["ACCEPT", "DISMISS"]),
        prompt: z.string().max(500).optional(),
      }),
      execute: async ({ action, prompt }) =>
        commandResult(
          action === "ACCEPT"
            ? await input.session.acceptDialog(prompt)
            : await input.session.dismissDialog(),
        ),
    }),
    goBack: tool({
      description: "返回当前浏览器会话的上一页。",
      inputSchema: z.object({}),
      execute: async () => commandResult(await input.session.goBack()),
    }),
    submitScript: tool({
      description:
        "完成真实页面探测且能够可靠实现用例后，提交完整的单文件 Playwright Test TypeScript 脚本。",
      inputSchema: z.object({
        script: z.string().trim().min(1).max(500_000),
      }),
      execute: async ({ script }) => {
        terminalResult = { kind: "SCRIPT", script };
        await input.onScriptSubmitted?.();
        return { accepted: true as const };
      },
    }),
    reportFailure: tool({
      description:
        "需求、前置条件、页面或安全条件不足，无法生成可靠脚本时提交具体失败原因和修改建议。",
      inputSchema: z.object({
        reason: z.string().trim().min(1).max(2_000),
        suggestion: z.string().trim().min(1).max(2_000),
      }),
      execute: async ({ reason, suggestion }) => {
        terminalResult = { kind: "FAILURE", reason, suggestion };
        return { accepted: true as const };
      },
    }),
  } satisfies Record<AutomationAgentToolName, unknown>;

  return {
    tools,
    toolsContext: {
      fillField: { variables: input.variables },
      selectOption: { variables: input.variables },
    },
    getTerminalResult: () => terminalResult,
  };
}
