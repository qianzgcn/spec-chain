import { z } from "zod";

export const featureSchema = z.object({
  name: z.string().trim().min(1, "请输入 FE 名称").max(150),
  summary: z.string().trim().min(1, "请输入一句话描述").max(300),
  backgroundGoal: z.string().trim().min(1, "请输入业务背景与目标"),
});

export type FeatureValues = z.infer<typeof featureSchema>;
