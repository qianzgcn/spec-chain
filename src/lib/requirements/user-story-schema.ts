import { z } from "zod";

import { RequirementStatus } from "@/generated/prisma/enums";

export const acceptanceCriterionInputSchema = z.object({
  id: z.string().optional(),
  given: z.string().trim().min(1, "Given 不能为空"),
  when: z.string().trim().min(1, "When 不能为空"),
  then: z.string().trim().min(1, "Then 不能为空"),
});

export const userStoryInputSchema = z.object({
  featureId: z.string().nullable().optional(),
  title: z.string().trim().min(1, "请输入 US 标题").max(150),
  asA: z.string().trim().min(1, "As 不能为空"),
  iWant: z.string().trim().min(1, "I want 不能为空"),
  soThat: z.string().trim().min(1, "so that 不能为空"),
  status: z.enum(RequirementStatus),
  businessRules: z.string().trim().optional().default(""),
  nonFunctionalRequirements: z.string().trim().optional().default(""),
  acceptanceCriteria: z
    .array(acceptanceCriterionInputSchema)
    .min(1, "至少需要一条验收标准"),
});

export const userStoryDraftInputSchema = userStoryInputSchema.omit({
  featureId: true,
  status: true,
});
