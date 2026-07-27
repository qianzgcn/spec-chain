import { describe, expect, it } from "vitest";

import { RequirementStatus } from "@/generated/prisma/enums";
import { deriveFeatureStatus } from "@/lib/requirements/status";

describe("FE 状态派生", () => {
  it("没有子 US 时为设计", () => {
    expect(deriveFeatureStatus([])).toBe(RequirementStatus.DESIGN);
  });

  it("取全部子 US 中进度最慢的状态", () => {
    expect(
      deriveFeatureStatus([
        RequirementStatus.TESTING,
        RequirementStatus.DEVELOPMENT,
        RequirementStatus.COMPLETED,
      ]),
    ).toBe(RequirementStatus.DEVELOPMENT);
  });

  it("全部完成时为完成", () => {
    expect(
      deriveFeatureStatus([
        RequirementStatus.COMPLETED,
        RequirementStatus.COMPLETED,
      ]),
    ).toBe(RequirementStatus.COMPLETED);
  });
});
