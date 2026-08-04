import "server-only";

import {
  parseScriptVariableReferences,
  parseVariableReferences,
  validateScriptVariableReferences,
  validateTestCaseVariableReferences,
  VariableReferenceError,
  type ProjectVariableMetadata,
} from "@/lib/project-variables/references";
import { db } from "@/server/db";

export const PROJECT_VARIABLE_METADATA_SELECT = {
  name: true,
  kind: true,
  encrypted: true,
  description: true,
  fields: {
    orderBy: { position: "asc" as const },
    select: {
      name: true,
      kind: true,
      encrypted: true,
      description: true,
    },
  },
};

export async function getProjectVariableMetadata(projectId: string) {
  const variables = await db.projectVariable.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { position: "asc" },
    select: PROJECT_VARIABLE_METADATA_SELECT,
  });
  return variables satisfies ProjectVariableMetadata[];
}

export class ProjectVariableUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectVariableUsageError";
  }
}

function validateUsage(input: {
  location: string;
  preconditions: string | null;
  steps: string;
  script?: string | null;
  variables: readonly ProjectVariableMetadata[];
  removedVariableNames: ReadonlySet<string>;
}) {
  try {
    const textReferences = parseVariableReferences(
      `${input.preconditions ?? ""}\n${input.steps}`,
    );
    const scriptReferences = input.script
      ? parseScriptVariableReferences(input.script)
      : [];
    const removedReference = [...textReferences, ...scriptReferences].find(
      (reference) => input.removedVariableNames.has(reference.variableName),
    );
    if (removedReference) {
      throw new ProjectVariableUsageError(
        `${input.location}正在引用变量 ${removedReference.variableName}，无法删除`,
      );
    }

    validateTestCaseVariableReferences({
      preconditions: input.preconditions,
      steps: input.steps,
      variables: input.variables,
    });
    if (input.script) {
      validateScriptVariableReferences({
        script: input.script,
        variables: input.variables,
      });
    }
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      throw new ProjectVariableUsageError(
        `${input.location}中的变量引用无效：${error.message}`,
      );
    }
    throw error;
  }
}

/** 保存设置前用新结构重验所有有效引用，避免改名或删除造成悬空引用。 */
export async function assertProjectVariableUsagesRemainValid(input: {
  projectId: string;
  variables: readonly ProjectVariableMetadata[];
  removedVariableNames?: readonly string[];
}) {
  const removedVariableNames = new Set(input.removedVariableNames ?? []);
  const [testCases, drafts] = await Promise.all([
    db.testCase.findMany({
      where: { projectId: input.projectId, deletedAt: null },
      select: {
        code: true,
        name: true,
        preconditions: true,
        steps: true,
        script: true,
      },
    }),
    db.testCaseDraft.findMany({
      where: {
        deletedAt: null,
        status: "PENDING",
        batch: { projectId: input.projectId, deletedAt: null },
      },
      select: {
        name: true,
        preconditions: true,
        steps: true,
      },
    }),
  ]);

  for (const testCase of testCases) {
    validateUsage({
      location: `测试用例“${testCase.code} · ${testCase.name}”`,
      ...testCase,
      variables: input.variables,
      removedVariableNames,
    });
  }
  for (const draft of drafts) {
    validateUsage({
      location: `待评审用例“${draft.name}”`,
      ...draft,
      variables: input.variables,
      removedVariableNames,
    });
  }
}
