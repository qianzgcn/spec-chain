import "server-only";

import {
  AutomationAuthenticationError,
  validateLoginMethodCompilation,
} from "@/automation/authentication";
import { VariableKind } from "@/generated/prisma/enums";
import type {
  ProjectTestingSettingsFormValues,
  ProjectTestingSettingsInput,
} from "@/lib/projects/schema";
import type { ProjectVariableMetadata } from "@/lib/project-variables/references";
import { db } from "@/server/db";
import { env } from "@/server/env";
import {
  assertProjectVariableUsagesRemainValid,
  ProjectVariableUsageError,
} from "@/server/projects/project-variables";
import { encodeVariableValue } from "@/server/projects/variable-storage";

type SubmittedVariable = ProjectTestingSettingsInput["variables"][number];

const VARIABLE_SELECT = {
  id: true,
  name: true,
  value: true,
  description: true,
  kind: true,
  encrypted: true,
  position: true,
  fields: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      name: true,
      value: true,
      description: true,
      kind: true,
      encrypted: true,
    },
  },
};

async function loadProject(projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      loginMethodSource: true,
      variables: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: VARIABLE_SELECT,
      },
    },
  });
  if (!project) {
    throw new ProjectTestingSettingsError("项目不存在或已删除");
  }
  return project;
}

type StoredVariable = Awaited<
  ReturnType<typeof loadProject>
>["variables"][number];
type StoredField = StoredVariable["fields"][number];

type PreparedField = {
  name: string;
  value: string;
  description: string | null;
  kind: StoredField["kind"];
  encrypted: boolean;
  position: number;
};

type PreparedVariable = {
  id?: string;
  name: string;
  value: string;
  description: string | null;
  kind: StoredVariable["kind"];
  encrypted: boolean;
  position: number;
  fields: PreparedField[];
};

export class ProjectTestingSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectTestingSettingsError";
  }
}

function isExistingVariable(
  variable: SubmittedVariable,
): variable is SubmittedVariable & { id: string } {
  return Boolean(variable.id);
}

function toMetadata(variable: SubmittedVariable): ProjectVariableMetadata {
  return {
    name: variable.name,
    kind: variable.kind,
    encrypted:
      variable.kind === VariableKind.OBJECT ? false : variable.encrypted,
    description: variable.description || null,
    fields:
      variable.kind === VariableKind.OBJECT
        ? variable.fields.map((field) => ({
            name: field.name,
            kind: field.kind,
            encrypted: field.encrypted,
            description: field.description || null,
          }))
        : [],
  };
}

function assertUniqueNames(variables: readonly ProjectVariableMetadata[]) {
  const names = new Set<string>();
  for (const variable of variables) {
    if (names.has(variable.name)) {
      throw new ProjectTestingSettingsError(
        `项目变量名 ${variable.name} 不能重复`,
      );
    }
    names.add(variable.name);
  }
}

function encodeSubmittedValue(input: {
  label: string;
  value: string;
  kind: StoredVariable["kind"] | StoredField["kind"];
  encrypted: boolean;
  current?: {
    value: string;
    kind: StoredVariable["kind"] | StoredField["kind"];
    encrypted: boolean;
  };
}) {
  if (input.value) {
    return encodeVariableValue({
      value: input.value,
      encrypted: input.encrypted,
      encryptionKey: env.ENCRYPTION_KEY,
    });
  }

  // 密文永不回显；类型和加密方式未改变时，空值代表保留原密文。
  if (
    input.current?.encrypted &&
    input.encrypted &&
    input.current.kind === input.kind
  ) {
    return input.current.value;
  }

  throw new ProjectTestingSettingsError(`请输入${input.label}的值`);
}

function prepareVariable(
  variable: SubmittedVariable,
  current: StoredVariable | undefined,
  position: number,
): PreparedVariable {
  if (variable.kind !== VariableKind.OBJECT) {
    return {
      id: variable.id,
      name: variable.name,
      value: encodeSubmittedValue({
        label: `变量 ${variable.name}`,
        value: variable.value,
        kind: variable.kind,
        encrypted: variable.encrypted,
        current:
          current && current.kind !== VariableKind.OBJECT ? current : undefined,
      }),
      description: variable.description || null,
      kind: variable.kind,
      encrypted: variable.encrypted,
      position,
      fields: [],
    };
  }

  const currentFields = new Map(
    current?.fields.map((field) => [field.id, field]) ?? [],
  );
  const submittedFieldIds = variable.fields.flatMap((field) =>
    field.id ? [field.id] : [],
  );
  if (new Set(submittedFieldIds).size !== submittedFieldIds.length) {
    throw new ProjectTestingSettingsError(
      `对象变量 ${variable.name} 中包含重复字段`,
    );
  }
  if (submittedFieldIds.some((id) => !currentFields.has(id))) {
    throw new ProjectTestingSettingsError(
      `对象变量 ${variable.name} 中包含无效字段`,
    );
  }

  return {
    id: variable.id,
    name: variable.name,
    value: "",
    description: variable.description || null,
    kind: variable.kind,
    encrypted: false,
    position,
    fields: variable.fields.map((field, fieldPosition) => ({
      name: field.name,
      value: encodeSubmittedValue({
        label: `字段 ${variable.name}.${field.name}`,
        value: field.value,
        kind: field.kind,
        encrypted: field.encrypted,
        current: field.id ? currentFields.get(field.id) : undefined,
      }),
      description: field.description || null,
      kind: field.kind,
      encrypted: field.encrypted,
      position: fieldPosition,
    })),
  };
}

function toFormValues(
  input: Omit<ProjectTestingSettingsFormValues, "variables"> & {
    variables: StoredVariable[];
  },
): ProjectTestingSettingsFormValues {
  return {
    baseUrl: input.baseUrl,
    automationInstructions: input.automationInstructions,
    loginMethodSource: input.loginMethodSource,
    variables: input.variables.map((variable) =>
      variable.kind === VariableKind.OBJECT
        ? {
            id: variable.id,
            name: variable.name,
            description: variable.description ?? "",
            kind: VariableKind.OBJECT,
            fields: variable.fields.map((field) => ({
              id: field.id,
              name: field.name,
              value: field.encrypted ? "" : field.value,
              description: field.description ?? "",
              kind: field.kind,
              encrypted: field.encrypted,
            })),
          }
        : {
            id: variable.id,
            name: variable.name,
            value: variable.encrypted ? "" : variable.value,
            description: variable.description ?? "",
            kind: variable.kind,
            encrypted: variable.encrypted,
          },
    ),
  };
}

export async function saveProjectTestingSettings(
  input: ProjectTestingSettingsInput,
): Promise<ProjectTestingSettingsFormValues> {
  const project = await loadProject(input.projectId);
  const existingById = new Map(
    project.variables.map((variable) => [variable.id, variable]),
  );
  const submittedIds = input.variables
    .filter(isExistingVariable)
    .map((variable) => variable.id);

  if (new Set(submittedIds).size !== submittedIds.length) {
    throw new ProjectTestingSettingsError("项目变量中包含重复数据");
  }
  if (submittedIds.some((id) => !existingById.has(id))) {
    throw new ProjectTestingSettingsError("项目变量中包含无效数据");
  }

  const submittedIdSet = new Set(submittedIds);
  const removedVariables = project.variables.filter(
    (variable) => !submittedIdSet.has(variable.id),
  );
  const nextMetadata = input.variables.map(toMetadata);
  assertUniqueNames(nextMetadata);

  try {
    await assertProjectVariableUsagesRemainValid({
      projectId: project.id,
      variables: nextMetadata,
      removedVariableNames: removedVariables.map((variable) => variable.name),
    });
  } catch (error) {
    if (error instanceof ProjectVariableUsageError) {
      throw new ProjectTestingSettingsError(error.message);
    }
    throw error;
  }

  if (
    input.loginMethodSource &&
    input.loginMethodSource !== (project.loginMethodSource ?? "")
  ) {
    try {
      await validateLoginMethodCompilation(input.loginMethodSource);
    } catch (error) {
      if (error instanceof AutomationAuthenticationError) {
        throw new ProjectTestingSettingsError(error.message);
      }
      throw new ProjectTestingSettingsError("登录方法编译检查失败");
    }
  }

  const preparedVariables = input.variables.map((variable, position) =>
    prepareVariable(
      variable,
      variable.id ? existingById.get(variable.id) : undefined,
      position,
    ),
  );

  const variables = await db.$transaction(async (transaction) => {
    await transaction.project.update({
      where: { id: project.id },
      data: {
        baseUrl: input.baseUrl || null,
        automationInstructions: input.automationInstructions || null,
        loginMethodSource: input.loginMethodSource || null,
      },
    });

    if (removedVariables.length > 0) {
      const removedIds = removedVariables.map((variable) => variable.id);
      await transaction.projectVariableField.deleteMany({
        where: { variableId: { in: removedIds } },
      });
      await transaction.projectVariable.updateMany({
        where: { id: { in: removedIds }, deletedAt: null },
        data: { deletedAt: new Date(), value: "" },
      });
    }

    for (const variable of preparedVariables) {
      const data = {
        name: variable.name,
        value: variable.value,
        description: variable.description,
        kind: variable.kind,
        encrypted: variable.encrypted,
        position: variable.position,
      };

      const variableId = variable.id
        ? variable.id
        : (
            await transaction.projectVariable.create({
              data: { ...data, projectId: project.id },
              select: { id: true },
            })
          ).id;

      if (variable.id) {
        await transaction.projectVariable.update({
          where: { id: variable.id },
          data,
        });
        await transaction.projectVariableField.deleteMany({
          where: { variableId: variable.id },
        });
      }

      for (const field of variable.fields) {
        await transaction.projectVariableField.create({
          data: { ...field, variableId },
        });
      }
    }

    return transaction.projectVariable.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { position: "asc" },
      select: VARIABLE_SELECT,
    });
  });

  return toFormValues({
    baseUrl: input.baseUrl,
    automationInstructions: input.automationInstructions,
    loginMethodSource: input.loginMethodSource,
    variables,
  });
}
