import { describe, expect, it } from "vitest";

import type { ModelProvider } from "@/ai/model-provider";
import type {
  RepositoryCodeSource,
  RepositoryTreeSnapshot,
} from "@/ai/repository-code-source";
import { builtInSkillResolver } from "@/ai/skills";
import {
  AiWorkflowError,
  createGenerateUserStoryWorkflow,
  type WorkflowLogEvent,
} from "@/ai/user-story-workflow";

const snapshot: RepositoryTreeSnapshot = {
  repositoryId: "repo-1",
  provider: "GITHUB",
  owner: "team",
  repository: "spec-chain",
  branch: "main",
  commitSha: "commit-sha",
  files: [{ path: "src/refund.ts", sha: "blob-sha", size: 100 }],
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
      content: "export function createRefund(orderId: string) {}",
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
            reason: related ? "包含退款领域代码" : "没有相关代码",
            files: related
              ? [{ path: "src/refund.ts", reason: "负责创建退款记录" }]
              : [],
          }
        : {
            sufficient,
            failureReason: sufficient ? "" : "没有说明谁可以发起退款",
            userStory: sufficient
              ? {
                  title: "客服提交订单退款",
                  asA: "客服专员",
                  iWant: "为符合条件的订单提交退款申请",
                  soThat: "及时解决客户退款诉求",
                  acceptanceCriteria: [
                    {
                      given: "订单符合退款条件",
                      when: "客服提交退款申请",
                      then: "系统创建退款记录",
                    },
                  ],
                  businessRules: "",
                  nonFunctionalRequirements: "",
                }
              : null,
          };

      return {
        output: schema.parse(output),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    },
  };
}

function createWorkflow(modelProvider: ModelProvider) {
  return createGenerateUserStoryWorkflow({
    modelProvider,
    repositoryCodeSource: codeSource,
    skillResolver: builtInSkillResolver,
  });
}

const workflowInput = {
  requirementText: "客服需要为符合条件的订单提交退款",
  featureContext: null,
  repositories: [
    {
      id: "repo-1",
      gitUrl: "https://github.com/team/spec-chain.git",
      branch: "main",
      pat: "must-not-leak",
    },
  ],
};

describe("AI 生成 US 工作流", () => {
  it("基于真实文件生成结构化草稿并只保存代码引用", async () => {
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

    expect(result.draft.title).toBe("客服提交订单退款");
    expect(result.draft.acceptanceCriteria).toHaveLength(1);
    expect(result.codeReferences).toEqual([
      expect.objectContaining({
        path: "src/refund.ts",
        commitSha: "commit-sha",
        reason: "负责创建退款记录",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("createRefund");
    expect(result.usage.totalTokens).toBe(30);
    expect(calls).toHaveLength(2);
    expect(calls.every((options) => !("maxOutputTokens" in options))).toBe(
      true,
    );
    expect(logs.map((log) => log.message)).toEqual(
      expect.arrayContaining([
        "已读取 1 个仓库的文件树，共 1 个文件。",
        "已定位 1 个候选文件，开始读取代码内容。",
        "已读取 1 个相关代码文件。",
        "US 草稿生成完成，本次模型调用共使用 30 Token。",
      ]),
    );
  });

  it("没有相关代码时直接失败且不生成草稿", async () => {
    await expect(
      createWorkflow(createFakeProvider({ related: false })).run(workflowInput),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AiWorkflowError>>({
        message: "没有在项目仓库中找到与需求相关的代码",
      }),
    );
  });

  it("信息不足时返回模型给出的具体原因", async () => {
    await expect(
      createWorkflow(createFakeProvider({ sufficient: false })).run(
        workflowInput,
      ),
    ).rejects.toThrow("没有说明谁可以发起退款");
  });
});
