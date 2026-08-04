import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VARIABLE_HELPER_CALL_PATTERN =
  /\b(getVariable|getCredentials)\s*\(\s*(["'])(.*?)\2\s*\)/g;

export type ProjectVariableFieldMetadata = {
  name: string;
  kind: VariableFieldKind;
  encrypted: boolean;
  description: string | null;
};

export type ProjectVariableMetadata = {
  name: string;
  kind: VariableKind;
  encrypted: boolean;
  description: string | null;
  fields: readonly ProjectVariableFieldMetadata[];
};

export type VariableReference = {
  path: string;
  variableName: string;
  fieldName: string | null;
  index: number;
};

export type ValidatedVariableReferences = {
  references: VariableReference[];
  credentialVariableName: string | null;
};

export class VariableReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariableReferenceError";
  }
}

function parseReferencePath(path: string, index: number): VariableReference {
  const [variableName, fieldName, ...remaining] = path.split(".");
  if (
    !variableName ||
    !IDENTIFIER_PATTERN.test(variableName) ||
    (fieldName !== undefined && !IDENTIFIER_PATTERN.test(fieldName)) ||
    remaining.length > 0
  ) {
    throw new VariableReferenceError(
      `变量引用 \${${path}} 格式不正确，请使用 \${NAME} 或 \${NAME.field}`,
    );
  }

  return {
    path,
    variableName,
    fieldName: fieldName ?? null,
    index,
  };
}

export function parseVariableReferences(text: string) {
  const references: VariableReference[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("${", cursor);
    if (start === -1) break;
    const end = text.indexOf("}", start + 2);
    if (end === -1) {
      throw new VariableReferenceError("变量引用缺少结束符号 }");
    }

    const path = text.slice(start + 2, end);
    references.push(parseReferencePath(path, start));
    cursor = end + 1;
  }

  return references;
}

function getVariableMap(variables: readonly ProjectVariableMetadata[]) {
  return new Map(variables.map((variable) => [variable.name, variable]));
}

function assertCredentialObject(variable: ProjectVariableMetadata) {
  const fields = new Map(variable.fields.map((field) => [field.name, field]));
  const username = fields.get("username");
  const password = fields.get("password");

  if (!username || !password) {
    throw new VariableReferenceError(
      `对象变量 ${variable.name} 作为登录账号使用时，必须包含 username 和 password 字段`,
    );
  }
  if (
    username.kind !== VariableFieldKind.STRING ||
    password.kind !== VariableFieldKind.STRING ||
    !password.encrypted
  ) {
    throw new VariableReferenceError(
      `对象变量 ${variable.name} 的 username 和 password 必须是字符串，且 password 需要开启加密`,
    );
  }
}

export function validateVariableReferences(input: {
  text: string;
  variables: readonly ProjectVariableMetadata[];
}): ValidatedVariableReferences {
  const references = parseVariableReferences(input.text);
  const variables = getVariableMap(input.variables);
  const credentialVariables = new Set<string>();

  for (const reference of references) {
    const variable = variables.get(reference.variableName);
    if (!variable) {
      throw new VariableReferenceError(
        `项目变量 ${reference.variableName} 不存在`,
      );
    }

    if (reference.fieldName) {
      if (variable.kind !== VariableKind.OBJECT) {
        throw new VariableReferenceError(
          `项目变量 ${variable.name} 不是对象，不能引用字段 ${reference.fieldName}`,
        );
      }
      if (
        !variable.fields.some((field) => field.name === reference.fieldName)
      ) {
        throw new VariableReferenceError(
          `对象变量 ${variable.name} 不包含字段 ${reference.fieldName}`,
        );
      }
      continue;
    }

    if (variable.kind === VariableKind.OBJECT) {
      assertCredentialObject(variable);
      credentialVariables.add(variable.name);
    }
  }

  if (credentialVariables.size > 1) {
    throw new VariableReferenceError(
      "一条测试用例最多只能使用一个完整账号对象登录",
    );
  }

  return {
    references,
    credentialVariableName: [...credentialVariables][0] ?? null,
  };
}

export function validateTestCaseVariableReferences(input: {
  preconditions: string | null;
  steps: string;
  variables: readonly ProjectVariableMetadata[];
}) {
  return validateVariableReferences({
    text: `${input.preconditions ?? ""}\n${input.steps}`,
    variables: input.variables,
  });
}

export function parseScriptVariableReferences(script: string) {
  const references: Array<VariableReference & { helper: string }> = [];
  for (const match of script.matchAll(VARIABLE_HELPER_CALL_PATTERN)) {
    const helper = match[1];
    const path = match[3];
    if (!helper || path === undefined) continue;
    const reference = parseReferencePath(path, match.index);
    if (helper === "getCredentials" && reference.fieldName) {
      throw new VariableReferenceError(
        "getCredentials 只能接收对象变量名，不能接收字段路径",
      );
    }
    references.push({ ...reference, helper });
  }
  return references;
}

export function validateScriptVariableReferences(input: {
  script: string;
  variables: readonly ProjectVariableMetadata[];
}) {
  const helperCalls = [
    ...input.script.matchAll(/\b(?:getVariable|getCredentials)\s*\(/g),
  ];
  const references = parseScriptVariableReferences(input.script);
  if (helperCalls.length !== references.length) {
    throw new VariableReferenceError(
      "变量助手只能使用明确的字符串字面量变量路径",
    );
  }
  if (
    /\bprocess\.env\.(?!BASE_URL\b)[A-Za-z_][A-Za-z0-9_]*/.test(input.script)
  ) {
    throw new VariableReferenceError(
      "项目变量必须通过 getVariable 或 getCredentials 引用",
    );
  }

  for (const reference of references) {
    const validated = validateVariableReferences({
      text: `\${${reference.path}}`,
      variables: input.variables,
    });
    if (reference.helper === "getVariable") {
      const variable = input.variables.find(
        (item) => item.name === reference.variableName,
      );
      if (!reference.fieldName && variable?.kind === VariableKind.OBJECT) {
        throw new VariableReferenceError(
          `对象变量 ${reference.variableName} 不能通过 getVariable 整体读取`,
        );
      }
    } else if (!validated.credentialVariableName) {
      throw new VariableReferenceError(
        `getCredentials 只能引用有效的账号对象 ${reference.variableName}`,
      );
    }
  }

  return references;
}

export function referencedVariableNames(input: {
  testCase: { preconditions: string | null; steps: string };
  variables: readonly ProjectVariableMetadata[];
}) {
  const validated = validateTestCaseVariableReferences({
    ...input.testCase,
    variables: input.variables,
  });
  return new Set(
    validated.references.map((reference) => reference.variableName),
  );
}
