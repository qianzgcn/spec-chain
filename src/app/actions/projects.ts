"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { VariableKind } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import {
  GIT_PROVIDER_LABELS,
  parseRepositoryUrl,
} from "@/lib/git/repository-url";
import { decryptAesGcm, encryptAesGcm } from "@/lib/security/aes-gcm";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { CURRENT_PROJECT_COOKIE } from "@/server/projects/current-project";
import {
  checkRepositoryConnection,
  RepositoryConnectionError,
  type RepositoryConnectionSummary,
  verifyGitCredential,
} from "@/server/projects/repository-connection";

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

const gitProviderSchema = z.enum(["GITHUB", "GITEE"]);

const projectBasicSettingsSchema = z.object({
  projectId: z.string().min(1),
  name: projectSchema.shape.name,
  description: projectSchema.shape.description,
});

const projectRepositoriesSchema = z.object({
  projectId: z.string().min(1),
  repositories: z.array(repositorySchema),
});

const projectTestingSettingsSchema = z.object({
  projectId: z.string().min(1),
  baseUrl: z.union([z.literal(""), z.url("请输入有效的 Base URL")]),
  variables: z.array(variableSchema),
});

const projectPatSchema = z.object({
  projectId: z.string().min(1),
  provider: gitProviderSchema,
  pat: z
    .string()
    .trim()
    .min(1, "请输入 PAT")
    .max(500, "PAT 不能超过 500 个字符"),
});

const deleteProjectPatSchema = projectPatSchema.omit({ pat: true });

const repositoryConnectionSchema = z.object({
  projectId: z.string().min(1),
  gitUrl: repositorySchema.shape.gitUrl,
  branch: repositorySchema.shape.branch,
});

type CredentialStatus = {
  hasGithubPat: boolean;
  hasGiteePat: boolean;
  githubPatAccount: string | null;
  giteePatAccount: string | null;
};

function getCredentialStatus(project: {
  githubPatEncrypted: string | null;
  giteePatEncrypted: string | null;
  githubPatAccount: string | null;
  giteePatAccount: string | null;
}): CredentialStatus {
  return {
    hasGithubPat: Boolean(project.githubPatEncrypted),
    hasGiteePat: Boolean(project.giteePatEncrypted),
    githubPatAccount: project.githubPatAccount,
    giteePatAccount: project.giteePatAccount,
  };
}

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

export async function updateProjectBasicSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  await requireUser();
  const parsed = projectBasicSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查基础设置",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, deletedAt: null },
    select: { id: true },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  await db.project.update({
    where: { id: project.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/project-settings");
  revalidatePath("/projects");
  return { ok: true, message: "基础设置已保存" };
}

export async function updateProjectRepositoriesAction(input: unknown): Promise<
  ActionResult<{
    repositories: Array<{ id: string; gitUrl: string; branch: string }>;
  }>
> {
  await requireUser();
  const parsed = projectRepositoriesSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查代码仓库配置",
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
    },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  const repositoryIds = new Set(
    parsed.data.repositories.flatMap((item) => (item.id ? [item.id] : [])),
  );
  const existingRepositoryIds = new Set(
    project.repositories.map((item) => item.id),
  );

  if ([...repositoryIds].some((id) => !existingRepositoryIds.has(id))) {
    return { ok: false, message: "代码仓库配置中包含无效数据" };
  }

  const repositories = await db.$transaction(async (transaction) => {
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

    return transaction.repository.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, gitUrl: true, branch: true },
    });
  });

  revalidatePath("/project-settings/repositories");
  return {
    ok: true,
    message: "代码仓库已保存",
    data: { repositories },
  };
}

export async function updateProjectTestingSettingsAction(
  input: unknown,
): Promise<
  ActionResult<{
    baseUrl: string;
    variables: Array<{
      id: string;
      name: string;
      value: string;
      description: string;
      kind: VariableKind;
    }>;
  }>
> {
  await requireUser();
  const parsed = projectTestingSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查测试设置",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, deletedAt: null },
    select: {
      id: true,
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

  const variableIds = new Set(
    parsed.data.variables.flatMap((item) => (item.id ? [item.id] : [])),
  );
  const existingVariables = new Map(
    project.variables.map((item) => [item.id, item]),
  );

  if ([...variableIds].some((id) => !existingVariables.has(id))) {
    return { ok: false, message: "项目变量中包含无效数据" };
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

  const variables = await db.$transaction(async (transaction) => {
    await transaction.project.update({
      where: { id: project.id },
      data: { baseUrl: parsed.data.baseUrl || null },
    });

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

    return transaction.projectVariable.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        value: true,
        description: true,
        kind: true,
      },
    });
  });

  revalidatePath("/project-settings/testing");
  return {
    ok: true,
    message: "测试设置已保存",
    data: {
      baseUrl: parsed.data.baseUrl,
      variables: variables.map((variable) => ({
        ...variable,
        value: variable.kind === VariableKind.SECRET ? "" : variable.value,
        description: variable.description ?? "",
      })),
    },
  };
}

export async function addProjectPatAction(
  input: unknown,
): Promise<ActionResult<CredentialStatus>> {
  await requireUser();
  const parsed = projectPatSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.flatten().fieldErrors.pat?.[0] ?? "请检查 PAT 配置",
    };
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, deletedAt: null },
    select: {
      id: true,
      githubPatEncrypted: true,
      githubPatAccount: true,
      giteePatEncrypted: true,
      giteePatAccount: true,
    },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  const existingPat =
    parsed.data.provider === "GITHUB"
      ? project.githubPatEncrypted
      : project.giteePatEncrypted;
  const providerLabel = GIT_PROVIDER_LABELS[parsed.data.provider];

  if (existingPat) {
    return {
      ok: false,
      message: `${providerLabel} PAT 已存在，如需更换请先删除`,
    };
  }

  let identity: Awaited<ReturnType<typeof verifyGitCredential>>;
  try {
    identity = await verifyGitCredential(parsed.data.provider, parsed.data.pat);
  } catch (error) {
    if (error instanceof RepositoryConnectionError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: `${providerLabel} PAT 验证失败` };
  }

  const encryptedPat = encryptAesGcm(parsed.data.pat, env.ENCRYPTION_KEY);
  const updateResult = await db.project.updateMany({
    where:
      parsed.data.provider === "GITHUB"
        ? {
            id: project.id,
            deletedAt: null,
            githubPatEncrypted: null,
          }
        : {
            id: project.id,
            deletedAt: null,
            giteePatEncrypted: null,
          },
    data:
      parsed.data.provider === "GITHUB"
        ? {
            githubPatEncrypted: encryptedPat,
            githubPatAccount: identity.account,
          }
        : {
            giteePatEncrypted: encryptedPat,
            giteePatAccount: identity.account,
          },
  });

  if (updateResult.count === 0) {
    return {
      ok: false,
      message: `${providerLabel} PAT 已存在，如需更换请先删除`,
    };
  }

  const updatedCredentials =
    parsed.data.provider === "GITHUB"
      ? {
          ...project,
          githubPatEncrypted: encryptedPat,
          githubPatAccount: identity.account,
        }
      : {
          ...project,
          giteePatEncrypted: encryptedPat,
          giteePatAccount: identity.account,
        };

  revalidatePath("/project-settings/repositories");
  return {
    ok: true,
    message: `${providerLabel} PAT 已新增`,
    data: getCredentialStatus(updatedCredentials),
  };
}

export async function deleteProjectPatAction(
  input: unknown,
): Promise<ActionResult<CredentialStatus>> {
  await requireUser();
  const parsed = deleteProjectPatSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "请检查 PAT 配置" };
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, deletedAt: null },
    select: {
      id: true,
      githubPatEncrypted: true,
      githubPatAccount: true,
      giteePatEncrypted: true,
      giteePatAccount: true,
    },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  const existingPat =
    parsed.data.provider === "GITHUB"
      ? project.githubPatEncrypted
      : project.giteePatEncrypted;
  const providerLabel = GIT_PROVIDER_LABELS[parsed.data.provider];

  if (!existingPat) {
    return { ok: false, message: `${providerLabel} PAT 尚未配置` };
  }

  await db.project.update({
    where: { id: project.id },
    data:
      parsed.data.provider === "GITHUB"
        ? { githubPatEncrypted: null, githubPatAccount: null }
        : { giteePatEncrypted: null, giteePatAccount: null },
  });

  const updatedCredentials =
    parsed.data.provider === "GITHUB"
      ? {
          ...project,
          githubPatEncrypted: null,
          githubPatAccount: null,
        }
      : {
          ...project,
          giteePatEncrypted: null,
          giteePatAccount: null,
        };

  revalidatePath("/project-settings/repositories");
  return {
    ok: true,
    message: `${providerLabel} PAT 已删除`,
    data: getCredentialStatus(updatedCredentials),
  };
}

export async function verifyProjectPatAction(
  input: unknown,
): Promise<ActionResult<CredentialStatus>> {
  await requireUser();
  const parsed = deleteProjectPatSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "请检查 PAT 配置" };
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, deletedAt: null },
    select: {
      id: true,
      githubPatEncrypted: true,
      githubPatAccount: true,
      giteePatEncrypted: true,
      giteePatAccount: true,
    },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  const encryptedPat =
    parsed.data.provider === "GITHUB"
      ? project.githubPatEncrypted
      : project.giteePatEncrypted;
  const providerLabel = GIT_PROVIDER_LABELS[parsed.data.provider];

  if (!encryptedPat) {
    return { ok: false, message: `${providerLabel} PAT 尚未配置` };
  }

  try {
    const pat = decryptAesGcm(encryptedPat, env.ENCRYPTION_KEY);
    const identity = await verifyGitCredential(parsed.data.provider, pat);

    await db.project.update({
      where: { id: project.id },
      data:
        parsed.data.provider === "GITHUB"
          ? { githubPatAccount: identity.account }
          : { giteePatAccount: identity.account },
    });

    const updatedCredentials =
      parsed.data.provider === "GITHUB"
        ? { ...project, githubPatAccount: identity.account }
        : { ...project, giteePatAccount: identity.account };

    revalidatePath("/project-settings/repositories");
    return {
      ok: true,
      message: `${providerLabel} PAT 已验证`,
      data: getCredentialStatus(updatedCredentials),
    };
  } catch (error) {
    if (error instanceof RepositoryConnectionError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: `${providerLabel} PAT 无法读取，请删除后重新新增`,
    };
  }
}

export async function checkRepositoryConnectionAction(
  input: unknown,
): Promise<ActionResult<RepositoryConnectionSummary>> {
  await requireUser();
  const parsed = repositoryConnectionSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "请检查仓库地址和分支" };
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, deletedAt: null },
    select: {
      githubPatEncrypted: true,
      giteePatEncrypted: true,
    },
  });

  if (!project) {
    return { ok: false, message: "项目不存在或已删除" };
  }

  const location = parseRepositoryUrl(parsed.data.gitUrl);
  const encryptedPat =
    location.provider === "GITHUB"
      ? project.githubPatEncrypted
      : project.giteePatEncrypted;

  if (!encryptedPat) {
    return {
      ok: false,
      message: `请先新增 ${GIT_PROVIDER_LABELS[location.provider]} PAT`,
    };
  }

  let pat: string;
  try {
    pat = decryptAesGcm(encryptedPat, env.ENCRYPTION_KEY);
  } catch {
    return {
      ok: false,
      message: `${GIT_PROVIDER_LABELS[location.provider]} PAT 无法读取，请删除后重新新增`,
    };
  }

  try {
    const data = await checkRepositoryConnection(
      location,
      parsed.data.branch,
      pat,
    );
    return {
      ok: true,
      message: `${GIT_PROVIDER_LABELS[location.provider]} 仓库和分支连接正常`,
      data,
    };
  } catch (error) {
    if (error instanceof RepositoryConnectionError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "连接检查失败，请稍后重试" };
  }
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
    data: {
      deletedAt: new Date(),
      githubPatEncrypted: null,
      githubPatAccount: null,
      giteePatEncrypted: null,
      giteePatAccount: null,
    },
  });

  const cookieStore = await cookies();
  if (cookieStore.get(CURRENT_PROJECT_COOKIE)?.value === projectId) {
    cookieStore.delete(CURRENT_PROJECT_COOKIE);
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "项目已删除" };
}
