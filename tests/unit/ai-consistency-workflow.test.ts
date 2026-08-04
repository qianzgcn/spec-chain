import { describe, expect, it } from "vitest";

import {
  createConsistencyDecisionSchema,
  formatConsistencySpecification,
  normalizeConsistencyDecision,
  type ConsistencyTestCase,
  type ConsistencyUserStory,
} from "@/ai/consistency-workflow";
import {
  buildConsistencyCodeSelectionPrompt,
  checkConsistencySystemPrompt,
} from "@/ai/prompts/check-consistency";
import { TestPriority } from "@/generated/prisma/enums";

const story: ConsistencyUserStory = {
  id: "us-1",
  code: "US-001",
  title: "查看需求创建人",
  currentVersion: 1,
  asA: "项目成员",
  iWant: "查看需求创建人",
  soThat: "追踪需求来源",
  businessRules: null,
  nonFunctionalRequirements: null,
  acceptanceCriteria: [
    { given: "存在需求", when: "查看列表", then: "显示创建人" },
  ],
};

const testCase: ConsistencyTestCase = {
  id: "tc-1",
  code: "TC-001",
  currentVersion: 1,
  name: "查看需求创建人",
  priority: TestPriority.P1,
  groupId: "group-1",
  groupName: "需求管理",
  preconditions: "存在需求",
  steps: "1. 查看需求列表。\n2. 验证显示创建人。",
  enabled: true,
};

const groups = ["group-1"];

describe("一致性检查结构化结论", () => {
  it("要求每条已有用例恰好返回一次，并允许需求用例新增", () => {
    const schema = createConsistencyDecisionSchema({
      hasUserStory: true,
      existingTestCaseIds: [testCase.id],
      groupIds: groups,
      variables: [],
      allowCreate: true,
    });

    expect(
      schema.safeParse({
        userStory: {
          outcome: "UNCHANGED",
          reason: "外部业务行为未变化",
          proposed: null,
        },
        testCases: [
          {
            outcome: "UNCHANGED",
            targetTestCaseId: testCase.id,
            reason: "用例仍覆盖当前行为",
            proposed: null,
          },
          {
            outcome: "CREATE",
            targetTestCaseId: null,
            reason: "代码新增了明确的权限拒绝场景",
            proposed: {
              name: "无权限成员不能查看创建人",
              priority: "P1",
              groupId: "group-1",
              preconditions: "存在无权限成员",
              steps: "1. 访问需求列表。\n2. 验证系统拒绝访问。",
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("禁止平台用例检查创建新用例", () => {
    const schema = createConsistencyDecisionSchema({
      hasUserStory: false,
      existingTestCaseIds: [testCase.id],
      groupIds: groups,
      variables: [],
      allowCreate: false,
    });
    const result = schema.safeParse({
      userStory: null,
      testCases: [
        {
          outcome: "UNCHANGED",
          targetTestCaseId: testCase.id,
          reason: "行为一致",
          proposed: null,
        },
        {
          outcome: "CREATE",
          targetTestCaseId: null,
          reason: "建议新增",
          proposed: {
            name: "新平台场景",
            priority: "P2",
            groupId: "group-1",
            preconditions: null,
            steps: "1. 执行场景。",
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("将与正式内容相同的更新规范化为无变化", () => {
    const result = normalizeConsistencyDecision({
      userStory: story,
      testCases: [testCase],
      decision: {
        userStory: {
          outcome: "UPDATE",
          reason: "模型误判",
          proposed: {
            asA: story.asA,
            iWant: story.iWant,
            soThat: story.soThat,
            businessRules: null,
            nonFunctionalRequirements: null,
            acceptanceCriteria: story.acceptanceCriteria,
          },
        },
        testCases: [
          {
            outcome: "UPDATE",
            targetTestCaseId: testCase.id,
            reason: "模型误判",
            proposed: {
              name: testCase.name,
              priority: testCase.priority,
              groupId: testCase.groupId,
              preconditions: testCase.preconditions,
              steps: testCase.steps,
            },
          },
        ],
      },
    });
    expect(result.userStory?.outcome).toBe("UNCHANGED");
    expect(result.testCases[0]?.outcome).toBe("UNCHANGED");
  });

  it("不会为已有场景创建重复需求用例", () => {
    const result = normalizeConsistencyDecision({
      userStory: story,
      testCases: [testCase],
      decision: {
        userStory: {
          outcome: "UNCHANGED",
          reason: "需求一致",
          proposed: null,
        },
        testCases: [
          {
            outcome: "UNCHANGED",
            targetTestCaseId: testCase.id,
            reason: "用例一致",
            proposed: null,
          },
          {
            outcome: "CREATE",
            targetTestCaseId: null,
            reason: "模型重复建议",
            proposed: {
              name: testCase.name,
              priority: testCase.priority,
              groupId: testCase.groupId,
              preconditions: testCase.preconditions,
              steps: testCase.steps,
            },
          },
        ],
      },
    });
    expect(result.testCases[1]).toMatchObject({
      outcome: "NEEDS_ATTENTION",
      proposed: null,
    });
  });

  it("检查资料只包含 US 和用例，不包含 FE", () => {
    const specification = formatConsistencySpecification({
      userStory: story,
      testCases: [testCase],
    });
    expect(specification).toContain("US-001");
    expect(specification).toContain("TC-001");
    expect(specification).not.toContain("FE：");
  });

  it("提示词以外部业务变化为边界，并使用固定提交定位代码", () => {
    const prompt = buildConsistencyCodeSelectionPrompt({
      specification: formatConsistencySpecification({
        userStory: story,
        testCases: [testCase],
      }),
      repository: "team/spec-chain",
      branch: "main",
      commitSha: "abc123",
      candidatePaths: ["src/app/requirements/page.tsx"],
    });
    expect(checkConsistencySystemPrompt).toContain("内部重构");
    expect(checkConsistencySystemPrompt).toContain("外部可观察");
    expect(checkConsistencySystemPrompt).toContain("平台用例不关联 US");
    expect(prompt).toContain("abc123");
    expect(prompt).toContain('"src/app/requirements/page.tsx"');
  });
});
