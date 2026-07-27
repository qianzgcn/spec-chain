import { z } from "zod";

import type { ModelProvider, ModelUsage } from "@/ai/model-provider";
import type {
  RepositoryAccess,
  RepositoryCodeSource,
  RepositoryFile,
  RepositoryTreeSnapshot,
} from "@/ai/repository-code-source";
import { RepositoryCodeError } from "@/ai/repository-code-source";
import type { AiSkill, SkillResolver } from "@/ai/skills";
import { AiCapability, AiExecutionStage } from "@/generated/prisma/enums";
import { parseRepositoryUrl } from "@/lib/git/repository-url";

const PATH_BATCH_SIZE = 1_000;
const MAX_SELECTED_FILES = 20;
const MAX_TOTAL_CODE_CHARACTERS = 240_000;
const FILE_READ_CONCURRENCY = 4;

const codeSelectionSchema = z.object({
  hasPotentialMatch: z.boolean(),
  reason: z.string(),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .max(8),
});

export const generatedUserStorySchema = z.object({
  title: z.string().trim().min(1).max(150),
  asA: z.string().trim().min(1),
  iWant: z.string().trim().min(1),
  soThat: z.string().trim().min(1),
  acceptanceCriteria: z
    .array(
      z.object({
        given: z.string().trim().min(1),
        when: z.string().trim().min(1),
        then: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(20),
  businessRules: z.string(),
  nonFunctionalRequirements: z.string(),
});

const generationDecisionSchema = z.object({
  sufficient: z.boolean(),
  failureReason: z.string(),
  userStory: generatedUserStorySchema.nullable(),
});

export type GeneratedUserStory = z.infer<typeof generatedUserStorySchema>;

export type RepositorySnapshotRecord = {
  repositoryId: string;
  provider: "GITHUB" | "GITEE";
  owner: string;
  repository: string;
  branch: string;
  commitSha: string;
};

export type CodeReferenceRecord = RepositorySnapshotRecord & {
  path: string;
  reason: string;
};

export type GenerateUserStoryWorkflowInput = {
  requirementText: string;
  featureContext: string | null;
  repositories: RepositoryAccess[];
  abortSignal?: AbortSignal;
  onStage?: (stage: AiExecutionStage) => Promise<void>;
  onRepositoriesLoaded?: (
    repositories: RepositorySnapshotRecord[],
  ) => Promise<void>;
  onCodeSelected?: (references: CodeReferenceRecord[]) => Promise<void>;
};

export type GenerateUserStoryWorkflowResult = {
  draft: GeneratedUserStory;
  skill: AiSkill;
  repositories: RepositorySnapshotRecord[];
  codeReferences: CodeReferenceRecord[];
  usage: ModelUsage;
};

export interface AiWorkflow<INPUT, OUTPUT> {
  run(input: INPUT): Promise<OUTPUT>;
}

export class AiWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiWorkflowError";
  }
}

type WorkflowDependencies = {
  modelProvider: ModelProvider;
  repositoryCodeSource: RepositoryCodeSource;
  skillResolver: SkillResolver;
};

type SelectedFile = {
  snapshot: RepositoryTreeSnapshot;
  file: RepositoryFile;
  reason: string;
};

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(target: ModelUsage, addition: ModelUsage) {
  target.inputTokens += addition.inputTokens;
  target.outputTokens += addition.outputTokens;
  target.totalTokens += addition.totalTokens;
}

function buildSelectionPrompt(
  requirementText: string,
  featureContext: string | null,
  snapshot: RepositoryTreeSnapshot,
  paths: string[],
) {
  return `请从下面这一批真实仓库路径中选择可能与需求直接相关、值得读取内容的源码或配置文件。

需求内容：
${requirementText}

FE 上下文：
${featureContext ?? "无"}

仓库：${snapshot.owner}/${snapshot.repository}
分支：${snapshot.branch}
提交：${snapshot.commitSha}

候选路径：
${paths.map((path) => `- ${path}`).join("\n")}

只允许返回候选路径中完整、精确的路径。不要因为文件名看起来通用就选择；优先选择页面、路由、接口、领域模型、权限、状态和相关测试代码。`;
}

function buildGenerationPrompt(
  requirementText: string,
  featureContext: string | null,
  files: Array<SelectedFile & { content: string }>,
) {
  const codeContext = files
    .map(
      ({ snapshot, file, reason, content }) => `--- 代码证据开始 ---
仓库：${snapshot.owner}/${snapshot.repository}
路径：${file.path}
提交：${snapshot.commitSha}
选择原因：${reason}

${content}
--- 代码证据结束 ---`,
    )
    .join("\n\n");

  return `请根据需求、FE 上下文和真实代码证据判断信息是否足够，并生成一个结构化用户故事。

需求内容：
${requirementText}

FE 上下文：
${featureContext ?? "无"}

真实代码证据：
${codeContext}

如果需求缺少关键角色、目标、业务价值、可验证结果，或者代码证据与需求没有实际关联，请设置 sufficient=false、填写具体 failureReason，并将 userStory 设为 null。
如果信息足够，请设置 sufficient=true、failureReason 设为空字符串，并完整填写 userStory。`;
}

async function readSelectedFiles(
  source: RepositoryCodeSource,
  selectedFiles: SelectedFile[],
  abortSignal?: AbortSignal,
) {
  const readable: Array<SelectedFile & { content: string }> = [];
  let totalCharacters = 0;

  for (
    let offset = 0;
    offset < selectedFiles.length;
    offset += FILE_READ_CONCURRENCY
  ) {
    const batch = selectedFiles.slice(offset, offset + FILE_READ_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (selected) => ({
        selected,
        code: await source.readFile(
          selected.snapshot,
          selected.file,
          abortSignal,
        ),
      })),
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { selected, code } = result.value;
      if (totalCharacters + code.content.length > MAX_TOTAL_CODE_CHARACTERS) {
        continue;
      }

      totalCharacters += code.content.length;
      readable.push({ ...selected, content: code.content });
    }
  }

  return readable;
}

export function createGenerateUserStoryWorkflow({
  modelProvider,
  repositoryCodeSource,
  skillResolver,
}: WorkflowDependencies): AiWorkflow<
  GenerateUserStoryWorkflowInput,
  GenerateUserStoryWorkflowResult
> {
  return {
    async run({
      requirementText,
      featureContext,
      repositories,
      abortSignal,
      onStage,
      onRepositoriesLoaded,
      onCodeSelected,
    }) {
      const usage = emptyUsage();
      const skill = skillResolver.resolve(AiCapability.GENERATE_USER_STORY);

      await onStage?.(AiExecutionStage.CHECKING_REPOSITORIES);
      const snapshots = await Promise.all(
        repositories.map(async (repository) => {
          try {
            return await repositoryCodeSource.loadTree(repository, abortSignal);
          } catch (error) {
            if (error instanceof RepositoryCodeError) {
              const location = parseRepositoryUrl(repository.gitUrl);
              throw new RepositoryCodeError(
                error.code,
                `仓库 ${location.owner}/${location.repository}：${error.message}`,
              );
            }
            throw error;
          }
        }),
      );
      const repositoryRecords = snapshots.map((snapshot) => ({
        repositoryId: snapshot.repositoryId,
        provider: snapshot.provider,
        owner: snapshot.owner,
        repository: snapshot.repository,
        branch: snapshot.branch,
        commitSha: snapshot.commitSha,
      }));
      await onRepositoriesLoaded?.(repositoryRecords);

      await onStage?.(AiExecutionStage.SELECTING_CODE);
      const selectedByKey = new Map<string, SelectedFile>();

      for (const snapshot of snapshots) {
        const fileByPath = new Map(
          snapshot.files.map((file) => [file.path, file]),
        );

        for (
          let offset = 0;
          offset < snapshot.files.length;
          offset += PATH_BATCH_SIZE
        ) {
          const batch = snapshot.files.slice(offset, offset + PATH_BATCH_SIZE);
          const selection = await modelProvider.generateStructured({
            schema: codeSelectionSchema,
            system: `${skill.instructions}

当前步骤只负责定位相关文件，不生成用户故事。`,
            prompt: buildSelectionPrompt(
              requirementText,
              featureContext,
              snapshot,
              batch.map((file) => file.path),
            ),
            abortSignal,
            maxOutputTokens: 1_024,
          });
          addUsage(usage, selection.usage);

          if (!selection.output.hasPotentialMatch) continue;
          for (const selected of selection.output.files) {
            const file = fileByPath.get(selected.path);
            if (!file) continue;

            const key = `${snapshot.repositoryId}:${file.path}`;
            if (!selectedByKey.has(key)) {
              selectedByKey.set(key, {
                snapshot,
                file,
                reason: selected.reason,
              });
            }
          }
        }
      }

      const selectedFiles = [...selectedByKey.values()].slice(
        0,
        MAX_SELECTED_FILES,
      );
      if (selectedFiles.length === 0) {
        throw new AiWorkflowError("没有在项目仓库中找到与需求相关的代码");
      }

      const readableFiles = await readSelectedFiles(
        repositoryCodeSource,
        selectedFiles,
        abortSignal,
      );
      if (readableFiles.length === 0) {
        throw new AiWorkflowError("相关代码文件无法读取，不能可靠生成 US");
      }
      const codeReferenceRecords = readableFiles.map(
        ({ snapshot, file, reason }) => ({
          repositoryId: snapshot.repositoryId,
          provider: snapshot.provider,
          owner: snapshot.owner,
          repository: snapshot.repository,
          branch: snapshot.branch,
          commitSha: snapshot.commitSha,
          path: file.path,
          reason,
        }),
      );
      await onCodeSelected?.(codeReferenceRecords);

      await onStage?.(AiExecutionStage.GENERATING_DRAFT);
      const generation = await modelProvider.generateStructured({
        schema: generationDecisionSchema,
        system: skill.instructions,
        prompt: buildGenerationPrompt(
          requirementText,
          featureContext,
          readableFiles,
        ),
        abortSignal,
        maxOutputTokens: 4_096,
      });
      addUsage(usage, generation.usage);

      if (!generation.output.sufficient || !generation.output.userStory) {
        throw new AiWorkflowError(
          generation.output.failureReason.trim() ||
            "需求信息不足，无法生成完整 US",
        );
      }

      return {
        draft: generation.output.userStory,
        skill,
        repositories: repositoryRecords,
        codeReferences: codeReferenceRecords,
        usage,
      };
    },
  };
}
