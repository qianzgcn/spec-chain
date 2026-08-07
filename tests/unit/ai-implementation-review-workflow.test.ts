import { describe, expect, it } from "vitest";

import {
  createImplementationReviewSchema,
  formatImplementationReviewSpecification,
  normalizeImplementationReviewDecision,
  type ImplementationReviewDecision,
} from "@/ai/implementation-review-workflow";
import {
  AcceptanceCriterionReviewStatus,
  ImplementationFindingSeverity,
  ImplementationFindingType,
  RequirementImplementationStatus,
  TestCoverageStatus,
  TestPriority,
} from "@/generated/prisma/enums";

function createDecision(): ImplementationReviewDecision {
  return {
    implementationStatus: RequirementImplementationStatus.IMPLEMENTED,
    coverageStatus: TestCoverageStatus.SUFFICIENT,
    summary: "代码实现与需求一致",
    criteria: [
      {
        position: 1,
        status: AcceptanceCriterionReviewStatus.SATISFIED,
        reason: "列表已读取并展示创建人",
        evidence: [
          {
            repository: "team/spec-chain",
            commitSha: "abc123",
            path: "src/requirements.tsx",
            lineStart: 8,
            lineEnd: 9,
            summary: "创建人列已渲染",
          },
        ],
      },
    ],
    findings: [],
  };
}

describe("需求实现审查结构", () => {
  it("必须逐条且不重复返回全部验收标准", () => {
    const schema = createImplementationReviewSchema(2);
    const decision = createDecision();

    expect(
      schema.safeParse({
        ...decision,
        criteria: [decision.criteria[0], decision.criteria[0]],
      }).success,
    ).toBe(false);
  });

  it("移除虚构证据，并把无证据的明确 Bug 降级为潜在缺陷", () => {
    const decision = createDecision();
    decision.findings.push({
      type: ImplementationFindingType.CONFIRMED_BUG,
      severity: ImplementationFindingSeverity.MAJOR,
      title: "创建人字段缺失",
      detail: "列表没有展示创建人",
      evidence: [
        {
          repository: "team/spec-chain",
          commitSha: "abc123",
          path: "src/not-found.tsx",
          lineStart: 1,
          lineEnd: 2,
          summary: "虚构路径",
        },
      ],
    });

    const normalized = normalizeImplementationReviewDecision({
      decision,
      codeEvidence: [
        {
          repository: "team/spec-chain",
          commitSha: "abc123",
          path: "src/requirements.tsx",
          selectionReason: "核实列表字段",
          content: Array.from(
            { length: 12 },
            (_, index) => `line ${index + 1}`,
          ).join("\n"),
        },
      ],
    });

    expect(normalized.criteria[0]?.evidence).toHaveLength(1);
    expect(normalized.findings[0]?.evidence).toEqual([]);
    expect(normalized.findings[0]?.type).toBe(
      ImplementationFindingType.POTENTIAL_DEFECT,
    );
  });

  it("审查输入只包含 US 规格和启用需求用例，不包含 FE", () => {
    const specification = formatImplementationReviewSpecification({
      id: "story-1",
      code: "US-001",
      title: "查看需求创建人",
      asA: "项目成员",
      iWant: "在需求列表查看创建人",
      soThat: "追踪需求来源",
      businessRules: "历史数据展示 --",
      nonFunctionalRequirements: null,
      acceptanceCriteria: [
        { given: "存在需求", when: "打开列表", then: "显示创建人" },
      ],
      testCases: [
        {
          code: "TC-001",
          name: "查看需求创建人",
          priority: TestPriority.P1,
          preconditions: "存在一条需求",
          steps: "1. 打开需求列表\n2. 验证创建人",
        },
      ],
    });

    expect(specification).toContain("US-001");
    expect(specification).toContain("TC-001");
    expect(specification).not.toContain("FE：");
  });
});
