"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { VariableKind } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { encryptAesGcm } from "@/lib/security/aes-gcm";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { CURRENT_PROJECT_COOKIE } from "@/server/projects/current-project";

const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请输入项目名称")
    .max(100, "项目名称不能超过 100 个字符"),
  description: z
    .string()
    .trim()
    .max(1_000, "项目描述不能超过 1000 个字符")
    .optional()
    .default(""),
});

const repositorySchema = z.object({
  id: z.string().optional(),
  gitUrl: z
    .string()
    .trim()
    .min(1, "请输入 Git 地址")
    .max(500, "Git 地址不能超过 500 个字符"),
  branch: z.string().trim().min(1, "请输入分支").max(100),
});

const variableSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      "变量名只能包含字母、数字和下划线，且不能以数字开头",
    ),
  value: z.string().optional().default(""),
  description: z
    .string()
    .trim()
    .max(500, "描述不能超过 500 个字符")
    .optional()
    .default(""),
  kind: z.enum(VariableKind),
});

const projectSettingsSchema = z.object({
  projectId: z.string().min(1),
  name: projectSchema.shape.name,
  description: projectSchema.shape.description,
  baseUrl: z.union([z.literal(""), z.url("请输入有效的 base URL")]),
  repositories: z.array(repositorySchema),
  variables: z.array(variableSchema),
});

export async function createProjectAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const parsed = projectSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查项目信息",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const project = await db.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
    },
    select: { id: true },
  });

  (await cookies()).set(CURRENT_PROJECT_COOKIE, project.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
  return { ok: true, message: "项目已创建", data: project };
}

export async function switchProjectAction(
  projectId: string,
): Promise<ActionResult> {
  await requireUser();

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  (await cookies()).set(CURRENT_PROJECT_COOKIE, project.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateProjectSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  await requireUser();
  const parsed = projectSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查项目配置",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, deletedAt: null },
    select: {
      id: true,
      repositories: {
        where: { deletedAt: null },
        select: { id: true },
      },
      variables: {
        where: { deletedAt: null },
        select: {
          id: true,
          value: true,
          kind: true,
        },
      },
    },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  const variableNames = parsed.data.variables.map((item) => item.name);
  if (new Set(variableNames).size !== variableNames.length) {
    return { ok: false, message: "项目变量名不能重复" };
  }

  const repositoryIds = new Set(
    parsed.data.repositories.flatMap((item) => (item.id ? [item.id] : [])),
  );
  const variableIds = new Set(
    parsed.data.variables.flatMap((item) => (item.id ? [item.id] : [])),
  );
  const existingRepositoryIds = new Set(
    project.repositories.map((item) => item.id),
  );
  const existingVariables = new Map(
    project.variables.map((item) => [item.id, item]),
  );

  if (
    [...repositoryIds].some((id) => !existingRepositoryIds.has(id)) ||
    [...variableIds].some((id) => !existingVariables.has(id))
  ) {
    return { ok: false, message: "项目配置中包含无效数据" };
  }

  for (const variable of parsed.data.variables) {
    const existing = variable.id
      ? existingVariables.get(variable.id)
      : undefined;

    if (!variable.value && (!existing || existing.kind !== variable.kind)) {
      return {
        ok: false,
        message: `变量 ${variable.name} 需要填写值`,
      };
    }
  }

  await db.$transaction(async (transaction) => {
    await transaction.project.update({
      where: { id: project.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        baseUrl: parsed.data.baseUrl || null,
      },
    });

    await transaction.repository.updateMany({
      where: {
        projectId: project.id,
        deletedAt: null,
        id: { notIn: [...repositoryIds] },
      },
      data: { deletedAt: new Date() },
    });

    for (const [position, repository] of parsed.data.repositories.entries()) {
      if (repository.id) {
        await transaction.repository.update({
          where: { id: repository.id },
          data: {
            gitUrl: repository.gitUrl,
            branch: repository.branch,
            position,
          },
        });
      } else {
        await transaction.repository.create({
          data: {
            projectId: project.id,
            gitUrl: repository.gitUrl,
            branch: repository.branch,
            position,
          },
        });
      }
    }

    await transaction.projectVariable.updateMany({
      where: {
        projectId: project.id,
        deletedAt: null,
        id: { notIn: [...variableIds] },
      },
      data: { deletedAt: new Date() },
    });

    for (const [position, variable] of parsed.data.variables.entries()) {
      const existing = variable.id
        ? existingVariables.get(variable.id)
        : undefined;
      const storedValue =
        existing && !variable.value
          ? existing.value
          : variable.kind === VariableKind.SECRET
            ? encryptAesGcm(variable.value, env.ENCRYPTION_KEY)
            : variable.value;

      if (variable.id) {
        await transaction.projectVariable.update({
          where: { id: variable.id },
          data: {
            name: variable.name,
            description: variable.description || null,
            kind: variable.kind,
            value: storedValue,
            position,
          },
        });
      } else {
        await transaction.projectVariable.create({
          data: {
            projectId: project.id,
            name: variable.name,
            description: variable.description || null,
            kind: variable.kind,
            value: storedValue,
            position,
          },
        });
      }
    }
  });

  revalidatePath("/", "layout");
  revalidatePath("/project-settings");
  revalidatePath("/projects");
  return { ok: true, message: "项目配置已保存" };
}

export async function deleteProjectAction(
  projectId: string,
): Promise<ActionResult> {
  await requireUser();

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  const [featureCount, userStoryCount, testCaseCount] = await Promise.all([
    db.feature.count({ where: { projectId, deletedAt: null } }),
    db.userStory.count({ where: { projectId, deletedAt: null } }),
    db.testCase.count({ where: { projectId, deletedAt: null } }),
  ]);

  if (featureCount + userStoryCount + testCaseCount > 0) {
    return {
      ok: false,
      message: "项目中仍有需求或测试用例，不能删除",
    };
  }

  await db.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });

  const cookieStore = await cookies();
  if (cookieStore.get(CURRENT_PROJECT_COOKIE)?.value === projectId) {
    cookieStore.delete(CURRENT_PROJECT_COOKIE);
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "项目已删除" };
}
