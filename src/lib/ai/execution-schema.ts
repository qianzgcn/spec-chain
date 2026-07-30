import { z } from "zod";

export const createAiExecutionSchema = z.object({
  requirementText: z
    .string()
    .trim()
    .min(1, "请输入需求内容")
    .max(10_000, "需求内容不能超过 10000 个字符"),
  featureId: z.string().nullable().optional(),
});

export const aiUserStoryGeneratorFormSchema = z.object({
  requirementText: createAiExecutionSchema.shape.requirementText,
});

export const retryAiExecutionSchema = z.object({
  executionId: z.string().min(1),
});

export const deleteAiExecutionSchema = retryAiExecutionSchema;

export type AiUserStoryGeneratorFormValues = z.infer<
  typeof aiUserStoryGeneratorFormSchema
>;
