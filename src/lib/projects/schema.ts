import { z } from "zod";

import { VariableKind } from "@/generated/prisma/enums";
import { parseRepositoryUrl } from "@/lib/git/repository-url";

const projectNameSchema = z
  .string()
  .trim()
  .min(1, "请输入项目名称")
  .max(100, "项目名称不能超过 100 个字符");

const projectDescriptionSchema = z
  .string()
  .trim()
  .max(1_000, "项目描述不能超过 1000 个字符");

export const projectSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional().default(""),
});

export const projectFormSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema,
});

export const repositorySchema = z.object({
  id: z.string().optional(),
  gitUrl: z
    .string()
    .trim()
    .min(1, "请输入 Git 地址")
    .max(500, "Git 地址不能超过 500 个字符")
    .refine(
      (value) => {
        try {
          parseRepositoryUrl(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "请输入有效的 GitHub 或 Gitee 官方仓库地址" },
    ),
  branch: z
    .string()
    .trim()
    .min(1, "请输入分支")
    .max(100, "分支不能超过 100 个字符"),
});

const variableNameSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "变量名只能包含字母、数字和下划线，且不能以数字开头",
  );

const variableDescriptionSchema = z
  .string()
  .trim()
  .max(500, "描述不能超过 500 个字符");

const variableActionSchema = z.object({
  id: z.string().optional(),
  name: variableNameSchema,
  value: z.string().optional().default(""),
  description: variableDescriptionSchema.optional().default(""),
  kind: z.enum(VariableKind),
});

const variableFormSchema = z.object({
  id: z.string().optional(),
  name: variableNameSchema,
  value: z.string(),
  description: variableDescriptionSchema,
  kind: z.enum(VariableKind),
});

export const gitProviderSchema = z.enum(["GITHUB", "GITEE"]);

export const projectBasicSettingsSchema = z.object({
  projectId: z.string().min(1),
  name: projectNameSchema,
  description: projectDescriptionSchema.optional().default(""),
});

export const projectBasicSettingsFormSchema = projectFormSchema;

export const projectRepositoriesSchema = z.object({
  projectId: z.string().min(1),
  repositories: z.array(repositorySchema),
});

export const projectRepositoriesFormSchema = z.object({
  repositories: z.array(repositorySchema),
});

export const projectTestingSettingsSchema = z.object({
  projectId: z.string().min(1),
  baseUrl: z.union([z.literal(""), z.url("请输入有效的 Base URL")]),
  variables: z.array(variableActionSchema),
});

export const projectTestingSettingsFormSchema = z.object({
  baseUrl: z.union([z.literal(""), z.url("请输入有效的 Base URL")]),
  variables: z.array(variableFormSchema),
});

export const projectPatSchema = z.object({
  projectId: z.string().min(1),
  provider: gitProviderSchema,
  pat: z
    .string()
    .trim()
    .min(1, "请输入 PAT")
    .max(500, "PAT 不能超过 500 个字符"),
});

export const deleteProjectPatSchema = projectPatSchema.omit({ pat: true });

export const repositoryConnectionSchema = z.object({
  projectId: z.string().min(1),
  gitUrl: repositorySchema.shape.gitUrl,
  branch: repositorySchema.shape.branch,
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export type ProjectBasicSettingsValues = z.infer<
  typeof projectBasicSettingsFormSchema
>;
export type ProjectRepositoriesFormValues = z.infer<
  typeof projectRepositoriesFormSchema
>;
export type ProjectTestingSettingsFormValues = z.infer<
  typeof projectTestingSettingsFormSchema
>;
