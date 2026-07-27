import { describe, expect, it } from "vitest";

import {
  buildFeatureMarkdown,
  buildUserStoryMarkdown,
} from "@/lib/requirements/markdown";

const story = {
  title: "客服发起退款",
  asA: "客服专员",
  iWant: "提交退款申请",
  soThat: "及时处理客户诉求",
  businessRules: "- 已退款订单不可重复提交",
  nonFunctionalRequirements: "接口应在 2 秒内返回",
  acceptanceCriteria: [
    {
      given: "订单已支付",
      when: "客服确认退款",
      then: "系统创建退款记录",
    },
  ],
};

describe("需求 Markdown", () => {
  it("导出 US 三段式模板和 Given/When/Then", () => {
    const markdown = buildUserStoryMarkdown(story);

    expect(markdown).toContain("# 客服发起退款");
    expect(markdown).toContain("**As** 客服专员");
    expect(markdown).toContain("**I want** 提交退款申请");
    expect(markdown).toContain("**so that** 及时处理客户诉求");
    expect(markdown).toContain("- **Given** 订单已支付");
    expect(markdown).toContain("- **When** 客服确认退款");
    expect(markdown).toContain("- **Then** 系统创建退款记录");
  });

  it("导出 FE 时保留正确标题层级并包含子 US", () => {
    const markdown = buildFeatureMarkdown({
      name: "订单退款能力",
      summary: "统一退款入口",
      backgroundGoal: "降低人工误操作",
      userStories: [story],
    });

    expect(markdown).toContain("# 订单退款能力");
    expect(markdown).toContain("## 用户故事");
    expect(markdown).toContain("### 客服发起退款");
    expect(markdown).toContain("#### 验收标准");
    expect(markdown).toContain("##### 1");
  });

  it("导出内容不添加业务编号或状态", () => {
    const markdown = buildUserStoryMarkdown(story);
    expect(markdown).not.toMatch(/\b(?:FE|US)-\d+/);
    expect(markdown).not.toContain("当前状态");
  });
});
