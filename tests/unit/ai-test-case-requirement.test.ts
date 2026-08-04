import { describe, expect, it } from "vitest";

import { formatUserStoryForTestCaseGeneration } from "@/ai/test-case-requirement";
import { createAiTestCaseExecutionSchema } from "@/lib/ai/execution-schema";

describe("AI 测试用例需求快照", () => {
  it("完整保存 US、验收标准、补充约束和所属 FE", () => {
    const snapshot = formatUserStoryForTestCaseGeneration({
      title: "管理员登录失败",
      asA: "管理员",
      iWant: "使用用户名和密码登录",
      soThat: "安全进入系统",
      businessRules: "连续失败不会创建登录会话。",
      nonFunctionalRequirements: "登录结果应在合理时间内返回。",
      acceptanceCriteria: [
        {
          given: "管理员账号存在且当前未登录",
          when: "使用错误密码提交登录",
          then: "系统拒绝登录并保持未登录状态",
        },
        {
          given: "管理员账号存在",
          when: "使用正确密码提交登录",
          then: "系统创建登录会话",
        },
      ],
      feature: {
        name: "账号与访问控制",
        summary: "统一平台登录能力",
        backgroundGoal: "保障平台访问安全。",
      },
      testCases: [
        {
          code: "TC-001",
          name: "管理员错误密码登录失败",
          preconditions: "管理员未登录",
          steps: "1. 使用错误密码登录。\n2. 验证登录失败。",
          enabled: true,
        },
      ],
    });

    expect(snapshot).toContain("US 标题：管理员登录失败");
    expect(snapshot).toContain("As：管理员");
    expect(snapshot).toContain("1. Given：管理员账号存在且当前未登录");
    expect(snapshot).toContain("2. Given：管理员账号存在");
    expect(snapshot).toContain("连续失败不会创建登录会话");
    expect(snapshot).toContain("名称：账号与访问控制");
    expect(snapshot).toContain("不要求逐条转换为用例");
    expect(snapshot).toContain("已有需求用例");
    expect(snapshot).toContain("TC-001");
  });

  it("独立 US 的可选内容使用明确占位", () => {
    const snapshot = formatUserStoryForTestCaseGeneration({
      title: "修改密码",
      asA: "登录用户",
      iWant: "修改自己的密码",
      soThat: "保持账号安全",
      businessRules: null,
      nonFunctionalRequirements: null,
      acceptanceCriteria: [
        {
          given: "用户已登录",
          when: "提交有效的新密码",
          then: "密码更新成功",
        },
      ],
      feature: null,
    });

    expect(snapshot).toContain("业务规则：\n未提供");
    expect(snapshot).toContain("非功能需求：\n未提供");
    expect(snapshot).toContain("所属 FE：\n未归属 FE");
  });
});

describe("AI 测试用例生成来源", () => {
  it("只允许已有 US 或需求文本二选一", () => {
    expect(
      createAiTestCaseExecutionSchema.safeParse({
        sourceMode: "USER_STORY",
        userStoryId: "story-1",
        requirementText: "",
      }).success,
    ).toBe(true);
    expect(
      createAiTestCaseExecutionSchema.safeParse({
        sourceMode: "TEXT",
        userStoryId: null,
        requirementText: "验证管理员错误密码登录失败",
      }).success,
    ).toBe(true);
    expect(
      createAiTestCaseExecutionSchema.safeParse({
        sourceMode: "USER_STORY",
        userStoryId: "story-1",
        requirementText: "不能同时输入",
      }).success,
    ).toBe(false);
    expect(
      createAiTestCaseExecutionSchema.safeParse({
        sourceMode: "TEXT",
        userStoryId: "story-1",
        requirementText: "不能同时选择",
      }).success,
    ).toBe(false);
  });
});
