import { z } from "zod";

import type { ModelProvider, ModelUsage } from "@/ai/model-provider";
import type {
  RepositoryAccess,
  RepositoryCodeSource,
  RepositoryFile,
  RepositoryTreeSnapshot,
} from "@/ai/repository-code-source";
import { RepositoryCodeError } from "@/ai/repository-code-source";
import { AiWorkflowError, type WorkflowLogEvent } from "@/ai/workflow";
import { AiExecutionStage } from "@/generated/prisma/enums";
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

export type CodeEvidence = {
  repository: string;
  path: string;
  commitSha: string;
  selectionReason: string;
  content: string;
};

type SelectedFile = {
  snapshot: RepositoryTreeSnapshot;
  file: RepositoryFile;
  reason: string;
};

export type RelevantCodeAnalysisInput = {
  requirementText: string;
  businessContext: string | null;
  repositories: RepositoryAccess[];
  modelProvider: ModelProvider;
  repositoryCodeSource: RepositoryCodeSource;
  systemPrompt: string;
  buildSelectionPrompt: (input: {
    requirementText: string;
    businessContext: string | null;
    repository: string;
    branch: string;
    commitSha: string;
    candidatePaths: readonly string[];
  }) => string;
  abortSignal?: AbortSignal;
  onStage?: (stage: AiExecutionStage) => Promise<void>;
  onLog?: (event: WorkflowLogEvent) => Promise<void>;
  onRepositoriesLoaded?: (
    repositories: RepositorySnapshotRecord[],
  ) => Promise<void>;
  onCodeSelected?: (references: CodeReferenceRecord[]) => Promise<void>;
};

export type RelevantCodeAnalysisResult = {
  repositories: RepositorySnapshotRecord[];
  codeReferences: CodeReferenceRecord[];
  codeEvidence: CodeEvidence[];
  usage: ModelUsage;
};

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export function addUsage(target: ModelUsage, addition: ModelUsage) {
  target.inputTokens += addition.inputTokens;
  target.outputTokens += addition.outputTokens;
  target.totalTokens += addition.totalTokens;
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

export async function analyzeRelevantCode({
  requirementText,
  businessContext,
  repositories,
  modelProvider,
  repositoryCodeSource,
  systemPrompt,
  buildSelectionPrompt,
  abortSignal,
  onStage,
  onLog,
  onRepositoriesLoaded,
  onCodeSelected,
}: RelevantCodeAnalysisInput): Promise<RelevantCodeAnalysisResult> {
  const usage = emptyUsage();

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
  const repositoryFileCount = snapshots.reduce(
    (total, snapshot) => total + snapshot.files.length,
    0,
  );
  await onLog?.({
    level: "INFO",
    stage: AiExecutionStage.CHECKING_REPOSITORIES,
    message: `已读取 ${snapshots.length} 个仓库的文件树，共 ${repositoryFileCount} 个文件。`,
  });

  await onStage?.(AiExecutionStage.SELECTING_CODE);
  const selectedByKey = new Map<string, SelectedFile>();

  for (const snapshot of snapshots) {
    const fileByPath = new Map(snapshot.files.map((file) => [file.path, file]));
    const batchCount = Math.ceil(snapshot.files.length / PATH_BATCH_SIZE);

    for (
      let offset = 0;
      offset < snapshot.files.length;
      offset += PATH_BATCH_SIZE
    ) {
      const batch = snapshot.files.slice(offset, offset + PATH_BATCH_SIZE);
      const batchNumber = Math.floor(offset / PATH_BATCH_SIZE) + 1;
      await onLog?.({
        level: "INFO",
        stage: AiExecutionStage.SELECTING_CODE,
        message: `正在分析 ${snapshot.owner}/${snapshot.repository} 的第 ${batchNumber}/${batchCount} 批路径（${batch.length} 个文件）。`,
      });
      const selection = await modelProvider.generateStructured({
        schema: codeSelectionSchema,
        system: systemPrompt,
        prompt: buildSelectionPrompt({
          requirementText,
          businessContext,
          repository: `${snapshot.owner}/${snapshot.repository}`,
          branch: snapshot.branch,
          commitSha: snapshot.commitSha,
          candidatePaths: batch.map((file) => file.path),
        }),
        abortSignal,
        onRetry: ({ nextAttempt, maxAttempts, reason }) =>
          onLog?.({
            level: "WARN",
            stage: AiExecutionStage.SELECTING_CODE,
            message: `模型返回的代码定位结果无法校验（${reason}），正在进行第 ${nextAttempt}/${maxAttempts} 次生成。`,
          }),
      });
      addUsage(usage, selection.usage);
      await onLog?.({
        level: "INFO",
        stage: AiExecutionStage.SELECTING_CODE,
        message: `第 ${batchNumber}/${batchCount} 批路径分析完成，模型返回 ${selection.output.files.length} 个候选文件。`,
      });

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
  await onLog?.({
    level: "INFO",
    stage: AiExecutionStage.SELECTING_CODE,
    message: `已定位 ${selectedFiles.length} 个候选文件，开始读取代码内容。`,
  });

  const readableFiles = await readSelectedFiles(
    repositoryCodeSource,
    selectedFiles,
    abortSignal,
  );
  if (readableFiles.length === 0) {
    throw new AiWorkflowError("相关代码文件无法读取，不能可靠生成内容");
  }
  await onLog?.({
    level: "INFO",
    stage: AiExecutionStage.SELECTING_CODE,
    message: `已读取 ${readableFiles.length} 个相关代码文件。`,
  });

  const codeReferences = readableFiles.map(({ snapshot, file, reason }) => ({
    repositoryId: snapshot.repositoryId,
    provider: snapshot.provider,
    owner: snapshot.owner,
    repository: snapshot.repository,
    branch: snapshot.branch,
    commitSha: snapshot.commitSha,
    path: file.path,
    reason,
  }));
  await onCodeSelected?.(codeReferences);

  return {
    repositories: repositoryRecords,
    codeReferences,
    codeEvidence: readableFiles.map(({ snapshot, file, reason, content }) => ({
      repository: `${snapshot.owner}/${snapshot.repository}`,
      path: file.path,
      commitSha: snapshot.commitSha,
      selectionReason: reason,
      content,
    })),
    usage,
  };
}
