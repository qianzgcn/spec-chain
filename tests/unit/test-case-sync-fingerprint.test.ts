import { describe, expect, it } from "vitest";

import {
  createTestCaseSetFingerprint,
  createUserStoryTestDesignFingerprint,
} from "@/lib/test-cases/sync-fingerprint";

const story = {
  title: "管理员登录",
  asA: "管理员",
  iWant: "使用账号密码登录",
  soThat: "访问管理功能",
  businessRules: null,
  nonFunctionalRequirements: null,
  acceptanceCriteria: [
    {
      given: "管理员未登录",
      when: "提交有效账号密码",
      then: "登录成功",
    },
  ],
};

const testCases = [
  {
    code: "TC-001",
    groupId: "group-auth",
    name: "管理员登录成功",
    priority: "P0",
    preconditions: "管理员未登录",
    steps: "1. 提交有效账号密码。\n2. 验证登录成功。",
    enabled: true,
  },
  {
    code: "TC-002",
    groupId: "group-auth",
    name: "管理员登录失败",
    priority: "P1",
    preconditions: "管理员未登录",
    steps: "1. 提交错误密码。\n2. 验证登录失败。",
    enabled: true,
  },
];

describe("需求用例同步指纹", () => {
  it("US 测试设计内容变化时失效", () => {
    const current = createUserStoryTestDesignFingerprint(story);
    expect(
      createUserStoryTestDesignFingerprint({
        ...story,
        iWant: "使用账号密码和验证码登录",
      }),
    ).not.toBe(current);
  });

  it("用例顺序不影响集合指纹，用例内容变化会失效", () => {
    const current = createTestCaseSetFingerprint(testCases);
    expect(createTestCaseSetFingerprint([...testCases].reverse())).toBe(
      current,
    );
    expect(
      createTestCaseSetFingerprint([
        { ...testCases[0]!, priority: "P1" },
        testCases[1]!,
      ]),
    ).not.toBe(current);
  });
});
