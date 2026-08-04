import { describe, expect, it } from "vitest";

import {
  createVariableRuntimeBundle,
  resolveProjectVariables,
} from "@/automation/variable-runtime";
import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";
import {
  validateTestCaseVariableReferences,
  validateVariableReferences,
  VariableReferenceError,
  type ProjectVariableMetadata,
} from "@/lib/project-variables/references";
import {
  projectTestingSettingsFormSchema,
  projectTestingSettingsSchema,
} from "@/lib/projects/schema";
import { decryptAesGcm } from "@/lib/security/aes-gcm";
import { encodeVariableValue } from "@/server/projects/variable-storage";

const encryptionKey = Buffer.alloc(32, 7);
const accountVariable: ProjectVariableMetadata = {
  name: "ADMIN",
  kind: VariableKind.OBJECT,
  encrypted: false,
  description: "管理员账号",
  fields: [
    {
      name: "username",
      kind: VariableFieldKind.STRING,
      encrypted: false,
      description: "用户名",
    },
    {
      name: "password",
      kind: VariableFieldKind.STRING,
      encrypted: true,
      description: "密码",
    },
  ],
};

describe("项目变量表单", () => {
  it("支持字符串、数字和一层对象，并拒绝无效数字或重复字段名", () => {
    const valid = {
      baseUrl: "http://localhost:3000",
      automationInstructions: "",
      loginMethodSource: "",
      variables: [
        {
          name: "ADMIN",
          description: "管理员账号",
          kind: VariableKind.OBJECT,
          fields: [
            {
              name: "username",
              description: "用户名",
              kind: VariableFieldKind.STRING,
              value: "admin",
              encrypted: false,
            },
            {
              name: "password",
              description: "密码",
              kind: VariableFieldKind.STRING,
              value: "secret",
              encrypted: true,
            },
            {
              name: "tenantId",
              description: "租户 ID",
              kind: VariableFieldKind.NUMBER,
              value: "1001",
              encrypted: false,
            },
          ],
        },
      ],
    };

    expect(projectTestingSettingsFormSchema.safeParse(valid).success).toBe(
      true,
    );
    expect(
      projectTestingSettingsFormSchema.safeParse({
        ...valid,
        variables: [
          {
            ...valid.variables[0],
            fields: [
              valid.variables[0]!.fields[0],
              valid.variables[0]!.fields[0],
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      projectTestingSettingsFormSchema.safeParse({
        ...valid,
        variables: [
          {
            name: "RETRY_COUNT",
            description: "",
            kind: VariableKind.NUMBER,
            value: "not-a-number",
            encrypted: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("保存接口接收已有变量的完整编辑内容", () => {
    const base = {
      projectId: "project-1",
      baseUrl: "",
      automationInstructions: "",
      loginMethodSource: "",
    };
    expect(
      projectTestingSettingsSchema.safeParse({
        ...base,
        variables: [
          {
            id: "variable-1",
            name: "ADMIN_USERNAME",
            description: "管理员用户名",
            kind: VariableKind.STRING,
            value: "",
            encrypted: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      projectTestingSettingsSchema.safeParse({
        ...base,
        variables: [{ id: "variable-1" }],
      }).success,
    ).toBe(false);
  });

  it("加密开关独立决定存储方式", () => {
    const plain = encodeVariableValue({
      value: "plain-value",
      encrypted: false,
      encryptionKey,
    });
    const encrypted = encodeVariableValue({
      value: "secret-value",
      encrypted: true,
      encryptionKey,
    });

    expect(plain).toBe("plain-value");
    expect(encrypted).not.toBe("secret-value");
    expect(decryptAesGcm(encrypted, encryptionKey)).toBe("secret-value");
  });
});

describe("变量引用解析", () => {
  it("完整账号对象触发预登录，字段路径不触发", () => {
    expect(
      validateTestCaseVariableReferences({
        preconditions: "使用 ${ADMIN} 登录 SpecChain",
        steps: "1. 打开需求列表。",
        variables: [accountVariable],
      }).credentialVariableName,
    ).toBe("ADMIN");
    expect(
      validateTestCaseVariableReferences({
        preconditions: "当前用户未登录",
        steps: "1. 使用 ${ADMIN.username} 和错误密码登录。",
        variables: [accountVariable],
      }).credentialVariableName,
    ).toBeNull();
  });

  it.each([
    ["${UNKNOWN}", "不存在"],
    ["${ADMIN.token}", "不包含字段"],
    ["${ADMIN.password.value}", "格式不正确"],
    ["${ADMIN", "缺少结束符号"],
  ])("拒绝无效引用 %s", (text, message) => {
    expect(() =>
      validateVariableReferences({ text, variables: [accountVariable] }),
    ).toThrowError(message);
  });

  it("拒绝未加密密码和多个完整账号对象", () => {
    const invalidAccount = {
      ...accountVariable,
      fields: accountVariable.fields.map((field) => ({
        ...field,
        encrypted: field.name === "password" ? false : field.encrypted,
      })),
    };
    expect(() =>
      validateVariableReferences({
        text: "${ADMIN}",
        variables: [invalidAccount],
      }),
    ).toThrowError(VariableReferenceError);
    expect(() =>
      validateVariableReferences({
        text: "${ADMIN} ${MEMBER}",
        variables: [accountVariable, { ...accountVariable, name: "MEMBER" }],
      }),
    ).toThrowError("最多只能使用一个完整账号对象");
  });
});

describe("对象变量任务解析", () => {
  it("字段独立解密，生成的助手源码不包含真实值", () => {
    const encryptedPassword = encodeVariableValue({
      value: "admin-password",
      encrypted: true,
      encryptionKey,
    });
    const resolved = resolveProjectVariables(
      [
        {
          ...accountVariable,
          value: "",
          fields: [
            { ...accountVariable.fields[0]!, value: "admin" },
            { ...accountVariable.fields[1]!, value: encryptedPassword },
          ],
        },
      ],
      (value) => decryptAesGcm(value, encryptionKey),
    );
    const runtime = createVariableRuntimeBundle(resolved);

    expect(resolved.values).toEqual({
      "ADMIN.username": "admin",
      "ADMIN.password": "admin-password",
    });
    expect(runtime.source).toContain("ADMIN.password");
    expect(runtime.source).not.toContain("admin-password");
    expect(Object.values(runtime.environment)).toContain("admin-password");
  });
});
