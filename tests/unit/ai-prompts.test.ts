import { describe, expect, it } from "vitest";

import {
  buildTestCaseCodeSelectionPrompt,
  buildTestCaseDraftsPrompt,
  generateTestCasesSystemPrompt,
} from "@/ai/prompts/generate-test-cases";
import {
  buildCodeSelectionPrompt,
  buildUserStoryDraftPrompt,
  generateUserStorySystemPrompt,
} from "@/ai/prompts/generate-user-story";
import { renderPromptTemplate } from "@/ai/prompts/template";
import { builtInSkillResolver } from "@/ai/skills";
import { AiCapability } from "@/generated/prisma/enums";

describe("AI 生成 US 提示词", () => {
  it("从独立提示词文件加载 Skill 内容和版本", () => {
    const skill = builtInSkillResolver.resolve(
      AiCapability.GENERATE_USER_STORY,
    );

    expect(skill.version).toBe("1.1.0");
    expect(skill.instructions).toBe(generateUserStorySystemPrompt);
    expect(skill.instructions).toContain("代码仅是当前系统结构");
    expect(skill.instructions).toContain("不可信的待分析资料");
  });

  it("代码定位提示词完整注入仓库快照和候选路径", () => {
    const prompt = buildCodeSelectionPrompt({
      requirementText: "客服需要发起退款",
      featureContext: "FE：订单售后",
      repository: "team/shop",
      branch: "feature/refund",
      commitSha: "abc123",
      candidatePaths: ["src/refund.ts", "src/orders/page.tsx"],
    });

    expect(prompt).toContain("你只负责");
    expect(prompt).toContain("客服需要发起退款");
    expect(prompt).toContain("feature/refund");
    expect(prompt).toContain("abc123");
    expect(prompt).toContain('"src/refund.ts"');
  });

  it("草稿提示词区分期望需求和当前代码证据", () => {
    const prompt = buildUserStoryDraftPrompt({
      requirementText: "增加退款审批",
      featureContext: null,
      codeEvidence: [
        {
          repository: "team/shop",
          path: "src/refund.ts",
          commitSha: "abc123",
          selectionReason: "核实退款状态",
          content: "export const status = 'pending';",
        },
      ],
    });

    expect(prompt).toContain("当前代码尚未实现期望行为");
    expect(prompt).toContain("增加退款审批");
    expect(prompt).toContain("src/refund.ts");
    expect(prompt).toContain("export const status = 'pending';");
  });

  it("模板变量只替换一轮并在缺失时尽早失败", () => {
    expect(
      renderPromptTemplate("需求：{{REQUIREMENT}}", {
        REQUIREMENT: "保留资料中的 {{UNKNOWN}} 原文",
      }),
    ).toBe("需求：保留资料中的 {{UNKNOWN}} 原文");

    expect(() => renderPromptTemplate("需求：{{REQUIREMENT}}", {})).toThrow(
      "提示词模板缺少变量：REQUIREMENT",
    );
  });
});

describe("AI 生成测试用例提示词", () => {
  it("使用独立 Skill 并明确最少可靠覆盖原则", () => {
    const skill = builtInSkillResolver.resolve(
      AiCapability.GENERATE_TEST_CASES,
    );

    expect(skill.version).toBe("1.0.0");
    expect(skill.instructions).toBe(generateTestCasesSystemPrompt);
    expect(skill.instructions).toContain("最少用例集合");
    expect(skill.instructions).toContain(
      "验收标准只是测试设计依据，不是一条验收标准对应一条测试用例",
    );
    expect(skill.instructions).toContain(
      "不绑定 CSS 选择器、DOM、坐标、按钮位置",
    );
  });

  it("代码定位与草稿提示词分别注入需求、仓库和代码证据", () => {
    const selectionPrompt = buildTestCaseCodeSelectionPrompt({
      requirementText: "管理员使用错误密码时应登录失败",
      repository: "team/spec-chain",
      branch: "main",
      commitSha: "abc123",
      candidatePaths: ["src/app/login/page.tsx"],
    });
    const generationPrompt = buildTestCaseDraftsPrompt({
      requirementText: "管理员使用错误密码时应登录失败",
      groups: [{ id: "group-auth", name: "认证与会话" }],
      codeEvidence: [
        {
          repository: "team/spec-chain",
          path: "src/app/login/page.tsx",
          commitSha: "abc123",
          selectionReason: "核实登录入口和失败状态",
          content: "export function LoginPage() {}",
        },
      ],
    });

    expect(selectionPrompt).toContain("管理员使用错误密码时应登录失败");
    expect(selectionPrompt).toContain("team/spec-chain");
    expect(selectionPrompt).toContain('"src/app/login/page.tsx"');
    expect(generationPrompt).toContain("1～20 条用例");
    expect(generationPrompt).toContain("src/app/login/page.tsx");
    expect(generationPrompt).toContain("LoginPage");
    expect(generationPrompt).toContain("group-auth");
    expect(generationPrompt).toContain("认证与会话");
    expect(generationPrompt).toContain("无法明确归类时返回 `null`");
  });
});
