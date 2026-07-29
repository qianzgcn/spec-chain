import { z } from "zod";

import { TestPriority } from "@/generated/prisma/enums";

export const testCaseGroupNameSchema = z
  .string()
  .trim()
  .min(1, "请输入分组名称")
  .max(100, "分组名称不能超过 100 个字符");

export const testCaseGroupFormSchema = z.object({
  name: testCaseGroupNameSchema,
});

export const testCaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请输入用例名称")
    .max(200, "用例名称不能超过 200 个字符"),
  groupId: z.string().min(1, "请选择用例分组"),
  priority: z.enum(TestPriority),
  preconditions: z.string().trim().max(100_000, "前置条件内容过长"),
  enabled: z.boolean(),
  script: z.string().max(500_000, "自动化脚本不能超过 500000 个字符"),
  steps: z
    .string()
    .trim()
    .min(1, "测试步骤不能为空")
    .max(100_000, "测试步骤内容过长"),
  userStoryIds: z.array(z.string()),
});

export type TestCaseFormValues = z.infer<typeof testCaseSchema>;
export type TestCaseGroupFormValues = z.infer<typeof testCaseGroupFormSchema>;
