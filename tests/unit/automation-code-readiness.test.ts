import { describe, expect, it, vi } from "vitest";

import { resolveProjectRepositories } from "@/ai/repository-access";
import type { ModelProvider } from "@/ai/model-provider";
import { buildAutomationCodeSelectionPrompt } from "@/automation/prompts";
import { checkAutomationCodeReadiness } from "@/automation/code-readiness";
import type { RepositoryCodeSource } from "@/ai/repository-code-source";

const testCase = {
  code: "TC-20260804001",
  name: "管理员查看项目列表",
  preconditions: "管理员账号已准备",
  steps: "1. 打开项目列表\n2. 验证项目列表可见",
};

function createSource(
  content = "export function ProjectList() { return null; }",
): RepositoryCodeSource {
  return {
    loadTree: vi.fn().mockResolvedValue({
      repositoryId: "repo-1",
      provider: "GITHUB",
      owner: "team",
      repository: "spec-chain",
      branch: "main",
      commitSha: "commit-1",
      files: [{ path: "src/projects/page.tsx", sha: "blob-1", size: 20 }],
      headers: {},
      apiBaseUrl: "https://api.github.com/repos/team/spec-chain",
    }),
    readFile: vi.fn().mockResolvedValue({
      path: "src/projects/page.tsx",
      content,
    }),
  };
}

function createProvider(hasMatch: boolean): ModelProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({
      output: {
        hasPotentialMatch: hasMatch,
        reason: hasMatch ? "核实项目列表入口" : "本批没有相关实现",
        files: hasMatch
          ? [{ path: "src/projects/page.tsx", reason: "核实项目列表入口" }]
          : [],
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }),
  };
}

describe("自动化脚本代码预检", () => {
  it("只使用测试用例文本定位代码，不使用 US 信息", () => {
    const prompt = buildAutomationCodeSelectionPrompt({
      requirementText: "测试用例名称：管理员查看项目列表",
      repository: "team/spec-chain",
      branch: "main",
      commitSha: "commit-1",
      candidatePaths: ["src/projects/page.tsx"],
    });

    expect(prompt).toContain("管理员查看项目列表");
    expect(prompt).toContain("src/projects/page.tsx");
    expect(prompt).not.toContain("US 状态");
  });

  it("找到可读源码后返回受限代码上下文", async () => {
    const source = createSource();
    const result = await checkAutomationCodeReadiness({
      testCase,
      repositories: [
        {
          id: "repo-1",
          gitUrl: "https://github.com/team/spec-chain.git",
          branch: "main",
          pat: "secret",
        },
      ],
      modelProvider: createProvider(true),
      repositoryCodeSource: source,
    });

    expect(result.codeEvidence).toHaveLength(1);
    expect(result.codeEvidence[0]?.content).toContain("ProjectList");
    expect(source.readFile).toHaveBeenCalledTimes(1);
  });

  it("限制传给脚本模型的单文件代码上下文长度", async () => {
    const result = await checkAutomationCodeReadiness({
      testCase,
      repositories: [
        {
          id: "repo-1",
          gitUrl: "https://github.com/team/spec-chain.git",
          branch: "main",
          pat: "secret",
        },
      ],
      modelProvider: createProvider(true),
      repositoryCodeSource: createSource("x".repeat(40_000)),
    });

    expect(result.codeEvidence[0]?.content).toContain("代码上下文已截断");
    expect(result.codeEvidence[0]?.content.length).toBeLessThan(32_100);
  });

  it("没有相关源码时不会读取文件并返回失败", async () => {
    const source = createSource();

    await expect(
      checkAutomationCodeReadiness({
        testCase,
        repositories: [
          {
            id: "repo-1",
            gitUrl: "https://github.com/team/spec-chain.git",
            branch: "main",
            pat: "secret",
          },
        ],
        modelProvider: createProvider(false),
        repositoryCodeSource: source,
      }),
    ).rejects.toThrow("未找到与当前测试用例相关的可读代码");
    expect(source.readFile).not.toHaveBeenCalled();
  });
});

describe("项目仓库访问配置", () => {
  it("没有仓库时在模型调用前失败", () => {
    const decryptSecret = vi.fn(() => "secret");

    expect(() =>
      resolveProjectRepositories(
        {
          githubPatEncrypted: null,
          giteePatEncrypted: null,
          repositories: [],
        },
        decryptSecret,
      ),
    ).toThrow("当前项目尚未配置代码仓库");
    expect(decryptSecret).not.toHaveBeenCalled();
  });
});
