import { z } from "zod";

const requirementTextSchema = z
  .string()
  .trim()
  .min(1, "请输入需求内容")
  .max(10_000, "需求内容不能超过 10000 个字符");

export const createAiUserStoryExecutionSchema = z.object({
  requirementText: requirementTextSchema,
  featureId: z.string().nullable().optional(),
});

export const aiUserStoryGeneratorFormSchema = z.object({
  requirementText: requirementTextSchema,
});

export const aiTestCaseSourceModeSchema = z.enum(["USER_STORY", "TEXT"]);

export const createAiTestCaseExecutionSchema = z
  .object({
    sourceMode: aiTestCaseSourceModeSchema,
    userStoryId: z.string().nullable(),
    requirementText: z.string().max(10_000, "需求内容不能超过 10000 个字符"),
  })
  .superRefine((value, context) => {
    if (value.sourceMode === "USER_STORY") {
      if (!value.userStoryId) {
        context.addIssue({
          code: "custom",
          path: ["userStoryId"],
          message: "请选择一个 US",
        });
      }
      if (value.requirementText.trim()) {
        context.addIssue({
          code: "custom",
          path: ["requirementText"],
          message: "选择已有 US 时不能同时输入需求内容",
        });
      }
      return;
    }

    if (value.userStoryId) {
      context.addIssue({
        code: "custom",
        path: ["userStoryId"],
        message: "输入需求内容时不能同时选择 US",
      });
    }
    if (!value.requirementText.trim()) {
      context.addIssue({
        code: "custom",
        path: ["requirementText"],
        message: "请输入需求内容",
      });
    }
  });

export const aiTestCaseGeneratorFormSchema = createAiTestCaseExecutionSchema;

export const retryExecutionTaskSchema = z.object({
  taskId: z.string().min(1),
});

export const deleteExecutionTaskSchema = retryExecutionTaskSchema;

export const createAutomationScriptExecutionSchema = z.object({
  testCaseId: z.string().min(1),
});

export type AiUserStoryGeneratorFormValues = z.infer<
  typeof aiUserStoryGeneratorFormSchema
>;

export type AiTestCaseGeneratorFormValues = z.infer<
  typeof aiTestCaseGeneratorFormSchema
>;
