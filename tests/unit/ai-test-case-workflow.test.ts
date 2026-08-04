import { describe, expect, it } from "vitest";

import type { ModelProvider } from "@/ai/model-provider";
import type {
  RepositoryCodeSource,
  RepositoryTreeSnapshot,
} from "@/ai/repository-code-source";
import { builtInSkillResolver } from "@/ai/skills";
import {
  createGeneratedTestCasesDecisionSchema,
  createGenerateTestCasesWorkflow,
} from "@/ai/test-case-workflow";
import type { WorkflowLogEvent } from "@/ai/workflow";
import { VariableFieldKind, VariableKind } from "@/generated/prisma/enums";

const snapshot: RepositoryTreeSnapshot = {
  repositoryId: "repo-1",
  provider: "GITHUB",
  owner: "team",
  repository: "spec-chain",
  branch: "main",
  commitSha: "commit-sha",
  files: [{ path: "src/login.ts", sha: "blob-sha", size: 100 }],
  apiBaseUrl: "https://api.github.com/repos/team/spec-chain",
  headers: { Authorization: "Bearer must-not-leak" },
};

const codeSource: RepositoryCodeSource = {
  async loadTree() {
    return snapshot;
  },
  async readFile(_repository, file) {
    return {
      path: file.path,
      content: "export function login(username: string, password: string) {}",
    };
  },
};

function createFakeProvider({
  related = true,
  sufficient = true,
}: {
  related?: boolean;
  sufficient?: boolean;
} = {}): ModelProvider {
  return {
    async generateStructured({ schema, prompt }) {
      const output = prompt.includes("候选路径")
        ? {
            hasPotentialMatch: related,
            reason: related ? "包含登录业务入口" : "没有相关代码",
            files: related
              ? [{ path: "src/login.ts", reason: "核实登录输入和失败结果" }]
              : [],
          }
        : {
            sufficient,
            failureReason: sufficient ? "" : "没有说明可使用的账号状态",
            testCases: sufficient
              ? [
                  {
                    name: "管理员使用错误密码登录失败",
                    priority: "P1",
                    groupId: "group-auth",
                    preconditions:
                      "1. 系统中存在可登录的管理员账号 A。\n2. 当前用户未登录。",
                    steps:
                      "1. 访问登录入口。\n2. 使用 ${ADMIN.username} 和错误密码提交登录。\n3. 验证系统拒绝登录，用户仍处于未登录状态。",
                  },
                  {
                    name: "管理员使用正确密码登录成功",
                    priority: "P0",
                    groupId: "group-auth",
                    preconditions:
                      "1. 系统中存在可登录的管理员账号 A。\n2. 当前用户未登录。",
                    steps:
                      "1. 使用 ${ADMIN} 登录。\n2. 访问业务入口。\n3. 验证用户处于已登录状态。",
                  },
                ]
              : [],
          };

      return {
        output: schema.parse(output),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    },
  };
}

function createWorkflow(modelProvider: ModelProvider) {
  return createGenerateTestCasesWorkflow({
    modelProvider,
    repositoryCodeSource: codeSource,
    skillResolver: builtInSkillResolver,
  });
}

const workflowInput = {
  requirementText: "管理员使用正确或错误密码登录时，系统应返回对应结果",
  repositories: [
    {
      id: "repo-1",
      gitUrl: "https://github.com/team/spec-chain.git",
      branch: "main",
      pat: "must-not-leak",
    },
  ],
  groups: [{ id: "group-auth", name: "认证与会话" }],
  variables: [
    {
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
    },
  ],
};

describe("AI 生成测试用例工作流", () => {
  it("生成多条独立草稿并只保存代码引用", async () => {
    const logs: WorkflowLogEvent[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const provider = createFakeProvider();
    const recordingProvider: ModelProvider = {
      async generateStructured(options) {
        calls.push(options as unknown as Record<string, unknown>);
        return provider.generateStructured(options);
      },
    };

    const result = await createWorkflow(recordingProvider).run({
      ...workflowInput,
      onLog: async (event) => {
        logs.push(event);
      },
    });

    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0]?.name).toBe("管理员使用错误密码登录失败");
    expect(result.drafts[0]?.groupId).toBe("group-auth");
    expect(result.usage.totalTokens).toBe(30);
    expect(result.codeReferences).toEqual([
      expect.objectContaining({
        path: "src/login.ts",
        commitSha: "commit-sha",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("function login");
    expect(calls).toHaveLength(2);
    expect(logs.map((log) => log.message)).toContain(
      "已生成 2 条测试用例草稿，本次模型调用共使用 30 Token。",
    );
  });

  it("找不到相关代码时不调用最终生成", async () => {
    let callCount = 0;
    const provider = createFakeProvider({ related: false });
    const countingProvider: ModelProvider = {
      async generateStructured(options) {
        callCount += 1;
        return provider.generateStructured(options);
      },
    };

    await expect(
      createWorkflow(countingProvider).run(workflowInput),
    ).rejects.toThrow("没有在项目仓库中找到与需求相关的代码");
    expect(callCount).toBe(1);
  });

  it("信息不足时返回具体原因且不产生草稿", async () => {
    await expect(
      createWorkflow(createFakeProvider({ sufficient: false })).run(
        workflowInput,
      ),
    ).rejects.toThrow("没有说明可使用的账号状态");
  });

  it("拒绝空结果、超过 20 条和重复用例", () => {
    const decisionSchema = createGeneratedTestCasesDecisionSchema(
      ["group-auth"],
      workflowInput.variables,
    );
    expect(
      decisionSchema.safeParse({
        sufficient: true,
        failureReason: "",
        testCases: [],
      }).success,
    ).toBe(false);

    const baseCase = {
      name: "管理员登录",
      priority: "P1",
      groupId: "group-auth",
      preconditions: "",
      steps: "1. 提交登录。\n2. 验证登录结果。",
    };
    expect(
      decisionSchema.safeParse({
        sufficient: true,
        failureReason: "",
        testCases: Array.from({ length: 21 }, (_, index) => ({
          ...baseCase,
          name: `管理员登录 ${index}`,
        })),
      }).success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({
        sufficient: true,
        failureReason: "",
        testCases: [baseCase, { ...baseCase, name: "管理员 登录" }],
      }).success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({
        sufficient: true,
        failureReason: "",
        testCases: [{ ...baseCase, groupId: "unknown-group" }],
      }).success,
    ).toBe(false);
  });
});
