import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";
import type {
  ProjectVariableFieldMetadata,
  ProjectVariableMetadata,
} from "@/lib/project-variables/references";

export const VARIABLES_MODULE_IMPORT =
  'import { getCredentials, getUniqueValue, getVariable } from "./specchain/variables";';

export type StoredProjectVariable = Omit<ProjectVariableMetadata, "fields"> & {
  value: string;
  fields: Array<ProjectVariableFieldMetadata & { value: string }>;
};

export type ResolvedProjectVariables = {
  metadata: ProjectVariableMetadata[];
  values: Readonly<Record<string, string>>;
  secretValues: string[];
};

export class ProjectVariableRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectVariableRuntimeError";
  }
}

export function resolveProjectVariables(
  variables: readonly StoredProjectVariable[],
  decrypt: (payload: string) => string,
): ResolvedProjectVariables {
  const metadata: ProjectVariableMetadata[] = [];
  const values: Record<string, string> = {};
  const secretValues: string[] = [];

  for (const variable of variables) {
    const fields = variable.fields.map(
      ({ name, kind, encrypted, description }) => ({
        name,
        kind,
        encrypted,
        description,
      }),
    );
    metadata.push({
      name: variable.name,
      kind: variable.kind,
      encrypted: variable.encrypted,
      description: variable.description,
      fields,
    });

    if (variable.kind === VariableKind.OBJECT) {
      for (const field of variable.fields) {
        const variablePath = `${variable.name}.${field.name}`;
        try {
          values[variablePath] = field.encrypted
            ? decrypt(field.value)
            : field.value;
        } catch {
          throw new ProjectVariableRuntimeError(
            `项目变量 ${variablePath} 无法读取，请重新配置`,
          );
        }
        if (values[variablePath]) secretValues.push(values[variablePath]);
      }
      continue;
    }

    try {
      values[variable.name] = variable.encrypted
        ? decrypt(variable.value)
        : variable.value;
    } catch {
      throw new ProjectVariableRuntimeError(
        `项目变量 ${variable.name} 无法读取，请重新配置`,
      );
    }
    if (values[variable.name]) secretValues.push(values[variable.name]);
  }

  return { metadata, values, secretValues };
}

function isCredentialVariable(variable: ProjectVariableMetadata) {
  if (variable.kind !== VariableKind.OBJECT) return false;
  const fields = new Map(variable.fields.map((field) => [field.name, field]));
  return (
    fields.get("username")?.kind === VariableFieldKind.STRING &&
    fields.get("password")?.kind === VariableFieldKind.STRING &&
    fields.get("password")?.encrypted === true
  );
}

export function createVariableRuntimeBundle(input: {
  metadata: readonly ProjectVariableMetadata[];
  values: Readonly<Record<string, string>>;
  runId?: string;
}) {
  const paths = Object.keys(input.values).toSorted((left, right) =>
    left.localeCompare(right, "en"),
  );
  const environmentKeys = Object.fromEntries(
    paths.map((variablePath, index) => [
      variablePath,
      `SPECCHAIN_VARIABLE_${index + 1}`,
    ]),
  );
  const environment = Object.fromEntries(
    paths.map((variablePath) => [
      environmentKeys[variablePath],
      input.values[variablePath],
    ]),
  );
  if (input.runId) {
    environment.SPECCHAIN_TEST_RUN_ID = input.runId;
  }
  const credentialNames = input.metadata
    .filter(isCredentialVariable)
    .map((variable) => variable.name)
    .toSorted((left, right) => left.localeCompare(right, "en"));
  const credentialType = credentialNames.length
    ? credentialNames.map((name) => JSON.stringify(name)).join(" | ")
    : "never";
  const source = `const variableKeys = ${JSON.stringify(environmentKeys, null, 2)} as const;

export type VariablePath = keyof typeof variableKeys;
export type CredentialVariableName = ${credentialType};
let uniqueValueSequence = 0;

export function getVariable(path: VariablePath): string {
  const value = process.env[variableKeys[path]];
  if (value === undefined) {
    throw new Error(\`项目变量 \${path} 未注入\`);
  }
  return value;
}

export function getCredentials(name: CredentialVariableName) {
  return {
    username: getVariable(\`\${name}.username\` as VariablePath),
    password: getVariable(\`\${name}.password\` as VariablePath),
  };
}

export function getUniqueValue(prefix: string): string {
  const runId = process.env.SPECCHAIN_TEST_RUN_ID;
  if (!runId) {
    throw new Error("当前测试运行没有注入唯一数据标识");
  }
  uniqueValueSequence += 1;
  return \`\${prefix}-\${runId}-\${uniqueValueSequence}\`;
}
`;

  return { environment, source, paths, credentialNames };
}

export async function writeVariableModule(workDir: string, source: string) {
  const moduleDir = path.join(workDir, "specchain");
  await mkdir(moduleDir, { recursive: true });
  await writeFile(path.join(moduleDir, "variables.ts"), source, "utf8");
}
