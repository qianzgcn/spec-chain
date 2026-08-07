import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DeliveryVersionStatus } from "@/generated/prisma/enums";
import { isDeliveryVersionContentLocked } from "@/lib/delivery-versions/rules";
import {
  createDeliverySpecificationFingerprint,
  createRegressionFingerprint,
} from "@/server/delivery-versions/fingerprint";

const testCase = {
  id: "case-1",
  code: "TC-001",
  name: "查看需求创建人",
  preconditions: "存在需求",
  steps: "1. 打开需求列表\n2. 验证创建人",
  enabled: true,
  userStoryId: "story-1",
};

const story = {
  id: "story-1",
  code: "US-001",
  title: "查看需求创建人",
  asA: "项目成员",
  iWant: "查看创建人",
  soThat: "追踪需求来源",
  businessRules: null,
  nonFunctionalRequirements: null,
  acceptanceCriteria: [
    {
      position: 0,
      given: "存在需求",
      when: "打开需求列表",
      then: "显示创建人",
    },
  ],
  testCases: [testCase],
};

describe("交付版本规则", () => {
  it("手动锁定或已交付都会锁定需求内容", () => {
    expect(
      isDeliveryVersionContentLocked({
        lockedAt: new Date(),
        status: DeliveryVersionStatus.IN_PROGRESS,
      }),
    ).toBe(true);
    expect(
      isDeliveryVersionContentLocked({
        lockedAt: null,
        status: DeliveryVersionStatus.DELIVERED,
      }),
    ).toBe(true);
    expect(
      isDeliveryVersionContentLocked({
        lockedAt: null,
        status: DeliveryVersionStatus.PENDING,
      }),
    ).toBe(false);
  });

  it("需求或用例内容变化会使需求规格指纹变化", () => {
    const current = createDeliverySpecificationFingerprint([story]);
    const changedRequirement = createDeliverySpecificationFingerprint([
      { ...story, iWant: "查看需求创建人与更新时间" },
    ]);
    const changedCase = createDeliverySpecificationFingerprint([
      {
        ...story,
        testCases: [
          { ...testCase, steps: `${testCase.steps}\n3. 验证更新时间` },
        ],
      },
    ]);

    expect(changedRequirement).not.toBe(current);
    expect(changedCase).not.toBe(current);
  });

  it("回归范围指纹不因运行中补生成脚本而变化", () => {
    const withoutScript = createRegressionFingerprint([testCase]);
    const generatedScriptCase = {
      ...testCase,
      script: "test('case', async () => {});",
      scriptSource: "AI",
      aiScriptFingerprint: "fingerprint",
    };
    const withGeneratedScript = createRegressionFingerprint([
      generatedScriptCase,
    ]);

    expect(withGeneratedScript).toBe(withoutScript);
  });
});
