import { z } from "zod";

import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";
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

export const variableNameSchema = z
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

const automationInstructionsSchema = z
  .string()
  .trim()
  .max(20_000, "自动化约束不能超过 20000 个字符");

const loginMethodSourceSchema = z
  .string()
  .trim()
  .max(100_000, "登录方法不能超过 100000 个字符");

const variableValueSchema = z
  .string()
  .max(20_000, "变量值不能超过 20000 个字符");

function isNumberValue(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 && Number.isFinite(Number(normalized));
}

export const projectVariableFieldFormSchema = z
  .object({
    id: z.string().optional(),
    name: variableNameSchema,
    description: variableDescriptionSchema,
    kind: z.enum(VariableFieldKind),
    value: variableValueSchema,
    encrypted: z.boolean(),
  })
  .strict();

function validateVariableCollection(
  value: {
    variables: ReadonlyArray<{
      name: string;
      kind: VariableKind;
      fields?: readonly { name: string }[];
    }>;
  },
  context: z.core.$RefinementCtx,
) {
  const names = new Set<string>();
  for (const [variableIndex, variable] of value.variables.entries()) {
    if (names.has(variable.name)) {
      context.addIssue({
        code: "custom",
        path: ["variables", variableIndex, "name"],
        message: "项目变量名不能重复",
      });
    }
    names.add(variable.name);
  }
}

export const projectVariableFormSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        id: z.string().optional(),
        name: variableNameSchema,
        value: variableValueSchema,
        description: variableDescriptionSchema,
        kind: z.literal(VariableKind.STRING),
        encrypted: z.boolean(),
      })
      .strict(),
    z
      .object({
        id: z.string().optional(),
        name: variableNameSchema,
        value: variableValueSchema,
        description: variableDescriptionSchema,
        kind: z.literal(VariableKind.NUMBER),
        encrypted: z.boolean(),
      })
      .strict(),
    z
      .object({
        id: z.string().optional(),
        name: variableNameSchema,
        description: variableDescriptionSchema,
        kind: z.literal(VariableKind.OBJECT),
        fields: z
          .array(projectVariableFieldFormSchema)
          .min(1, "对象变量至少需要一个字段")
          .max(100, "对象变量最多支持 100 个字段"),
      })
      .strict(),
  ])
  .superRefine((variable, context) => {
    if (variable.kind !== VariableKind.OBJECT) {
      if (!variable.id && !variable.value) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "请输入变量值",
        });
      } else if (
        variable.kind === VariableKind.NUMBER &&
        variable.value &&
        !isNumberValue(variable.value)
      ) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "请输入有效数字",
        });
      }
      return;
    }

    const names = new Set<string>();
    for (const [fieldIndex, field] of variable.fields.entries()) {
      if (names.has(field.name)) {
        context.addIssue({
          code: "custom",
          path: ["fields", fieldIndex, "name"],
          message: "同一对象中的字段名不能重复",
        });
      }
      names.add(field.name);
      if (!field.id && !field.value) {
        context.addIssue({
          code: "custom",
          path: ["fields", fieldIndex, "value"],
          message: "请输入字段值",
        });
      } else if (
        field.kind === VariableFieldKind.NUMBER &&
        field.value &&
        !isNumberValue(field.value)
      ) {
        context.addIssue({
          code: "custom",
          path: ["fields", fieldIndex, "value"],
          message: "请输入有效数字",
        });
      }
    }
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

export const projectTestingSettingsSchema = z
  .object({
    projectId: z.string().min(1),
    baseUrl: z.union([z.literal(""), z.url("请输入有效的 Base URL")]),
    automationInstructions: automationInstructionsSchema.optional().default(""),
    variables: z.array(projectVariableFormSchema),
    loginMethodSource: loginMethodSourceSchema,
  })
  .superRefine((value, context) => {
    validateVariableCollection(value, context);
  });

export const projectTestingSettingsFormSchema = z
  .object({
    baseUrl: z.union([z.literal(""), z.url("请输入有效的 Base URL")]),
    automationInstructions: automationInstructionsSchema,
    variables: z.array(projectVariableFormSchema),
    loginMethodSource: loginMethodSourceSchema,
  })
  .superRefine((value, context) => {
    validateVariableCollection(value, context);
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
export type ProjectTestingSettingsInput = z.infer<
  typeof projectTestingSettingsSchema
>;
export type ProjectVariableFormValue = z.infer<
  typeof projectVariableFormSchema
>;
