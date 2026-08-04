import { z } from "zod";

import type { ModelProvider, ModelUsage } from "@/ai/model-provider";
import {
  buildConsistencyCodeSelectionPrompt,
  buildConsistencyComparisonPrompt,
} from "@/ai/prompts/check-consistency";
import {
  addUsage,
  analyzeRelevantCodeFromSnapshots,
  type CodeEvidence,
  type CodeReferenceRecord,
  type RepositorySnapshotRecord,
} from "@/ai/relevant-code";
import type {
  RepositoryCodeFile,
  RepositoryCodeSource,
  RepositoryTreeSnapshot,
} from "@/ai/repository-code-source";
import type { AiSkill } from "@/ai/skills";
import type { WorkflowLogEvent } from "@/ai/workflow";
import { AiExecutionStage, TestPriority } from "@/generated/prisma/enums";
import {
  validateTestCaseVariableReferences,
  VariableReferenceError,
  type ProjectVariableMetadata,
} from "@/lib/project-variables/references";

const MAX_COMPARISON_CODE_CHARACTERS = 120_000;

const acceptanceCriterionSchema = z.object({
  given: z.string().trim().min(1).max(100_000),
  when: z.string().trim().min(1).max(100_000),
  then: z.string().trim().min(1).max(100_000),
});

const proposedUserStorySchema = z.object({
  asA: z.string().trim().min(1).max(500),
  iWant: z.string().trim().min(1).max(2_000),
  soThat: z.string().trim().min(1).max(2_000),
  businessRules: z.string().trim().max(100_000).nullable(),
  nonFunctionalRequirements: z.string().trim().max(100_000).nullable(),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1).max(50),
});

const proposedTestCaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  priority: z.enum(TestPriority),
  groupId: z.string().trim().min(1),
  preconditions: z.string().trim().max(100_000).nullable(),
  steps: z.string().trim().min(1).max(100_000),
});

const userStoryDecisionSchema = z.object({
  outcome: z.enum(["UNCHANGED", "UPDATE", "NEEDS_ATTENTION"]),
  reason: z.string().trim().min(1).max(4_000),
  proposed: proposedUserStorySchema.nullable(),
});

const testCaseDecisionSchema = z.object({
  outcome: z.enum([
    "UNCHANGED",
    "CREATE",
    "UPDATE",
    "RETIRE",
    "NEEDS_ATTENTION",
  ]),
  targetTestCaseId: z.string().trim().min(1).nullable(),
  reason: z.string().trim().min(1).max(4_000),
  proposed: proposedTestCaseSchema.nullable(),
});

export type ConsistencyUserStory = {
  id: string;
  code: string;
  title: string;
  currentVersion: number;
  asA: string;
  iWant: string;
  soThat: string;
  businessRules: string | null;
  nonFunctionalRequirements: string | null;
  acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
};

export type ConsistencyTestCase = {
  id: string;
  code: string;
  currentVersion: number;
  name: string;
  priority: TestPriority;
  groupId: string;
  groupName: string;
  preconditions: string | null;
  steps: string;
  enabled: boolean;
};

export type ConsistencyDecision = z.infer<
  ReturnType<typeof createConsistencyDecisionSchema>
>;

export function createConsistencyDecisionSchema(input: {
  hasUserStory: boolean;
  existingTestCaseIds: readonly string[];
  groupIds: readonly string[];
  variables: readonly ProjectVariableMetadata[];
  allowCreate: boolean;
}) {
  const existingIds = new Set(input.existingTestCaseIds);
  const validGroupIds = new Set(input.groupIds);

  return z
    .object({
      userStory: userStoryDecisionSchema.nullable(),
      testCases: z
        .array(testCaseDecisionSchema)
        .max(input.existingTestCaseIds.length + (input.allowCreate ? 20 : 0)),
    })
    .superRefine((value, context) => {
      if (input.hasUserStory !== Boolean(value.userStory)) {
        context.addIssue({
          code: "custom",
          path: ["userStory"],
          message: input.hasUserStory
            ? "US 检查必须返回 userStory 结论"
            : "平台用例检查不能返回 userStory 结论",
        });
      }
      if (
        value.userStory &&
        (value.userStory.outcome === "UPDATE") !==
          Boolean(value.userStory.proposed)
      ) {
        context.addIssue({
          code: "custom",
          path: ["userStory", "proposed"],
          message: "只有 US 更新结论需要建议内容",
        });
      }

      const returnedExistingIds = new Set<string>();
      let createdCount = 0;
      value.testCases.forEach((decision, index) => {
        const needsProposal =
          decision.outcome === "CREATE" || decision.outcome === "UPDATE";
        if (needsProposal !== Boolean(decision.proposed)) {
          context.addIssue({
            code: "custom",
            path: ["testCases", index, "proposed"],
            message: "只有新增或更新用例需要建议内容",
          });
        }

        if (decision.outcome === "CREATE") {
          createdCount += 1;
          if (!input.allowCreate || decision.targetTestCaseId) {
            context.addIssue({
              code: "custom",
              path: ["testCases", index, "targetTestCaseId"],
              message: "当前检查不能创建该类用例",
            });
          }
        } else if (
          !decision.targetTestCaseId ||
          !existingIds.has(decision.targetTestCaseId)
        ) {
          context.addIssue({
            code: "custom",
            path: ["testCases", index, "targetTestCaseId"],
            message: "已有用例结论必须引用当前检查中的用例 ID",
          });
        } else if (returnedExistingIds.has(decision.targetTestCaseId)) {
          context.addIssue({
            code: "custom",
            path: ["testCases", index, "targetTestCaseId"],
            message: "同一已有用例只能返回一次",
          });
        } else {
          returnedExistingIds.add(decision.targetTestCaseId);
        }

        if (decision.proposed) {
          if (!validGroupIds.has(decision.proposed.groupId)) {
            context.addIssue({
              code: "custom",
              path: ["testCases", index, "proposed", "groupId"],
              message: "用例分组不在当前项目的可选范围内",
            });
          }
          try {
            validateTestCaseVariableReferences({
              preconditions: decision.proposed.preconditions,
              steps: decision.proposed.steps,
              variables: input.variables,
            });
          } catch (error) {
            if (!(error instanceof VariableReferenceError)) throw error;
            context.addIssue({
              code: "custom",
              path: ["testCases", index, "proposed", "steps"],
              message: error.message,
            });
          }
        }
      });

      if (createdCount > 20) {
        context.addIssue({
          code: "custom",
          path: ["testCases"],
          message: "一次最多新增 20 条需求用例",
        });
      }
      for (const id of existingIds) {
        if (!returnedExistingIds.has(id)) {
          context.addIssue({
            code: "custom",
            path: ["testCases"],
            message: `缺少已有用例 ${id} 的结论`,
          });
        }
      }
    });
}

function normalizeOptional(value: string | null) {
  return value?.trim() || null;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeConsistencyDecision(input: {
  decision: ConsistencyDecision;
  userStory: ConsistencyUserStory | null;
  testCases: readonly ConsistencyTestCase[];
}) {
  const caseById = new Map(
    input.testCases.map((testCase) => [testCase.id, testCase]),
  );
  const caseFingerprints = new Set(
    input.testCases.map(
      (testCase) =>
        `${testCase.name.toLocaleLowerCase("zh-CN").replaceAll(/\s+/g, "")}|${testCase.steps.replaceAll(/\s+/g, "")}`,
    ),
  );
  let userStory = input.decision.userStory;
  if (
    userStory?.outcome === "UPDATE" &&
    userStory.proposed &&
    input.userStory
  ) {
    const current = {
      asA: input.userStory.asA.trim(),
      iWant: input.userStory.iWant.trim(),
      soThat: input.userStory.soThat.trim(),
      businessRules: normalizeOptional(input.userStory.businessRules),
      nonFunctionalRequirements: normalizeOptional(
        input.userStory.nonFunctionalRequirements,
      ),
      acceptanceCriteria: input.userStory.acceptanceCriteria.map(
        (criterion) => ({
          given: criterion.given.trim(),
          when: criterion.when.trim(),
          then: criterion.then.trim(),
        }),
      ),
    };
    const proposed = {
      ...userStory.proposed,
      businessRules: normalizeOptional(userStory.proposed.businessRules),
      nonFunctionalRequirements: normalizeOptional(
        userStory.proposed.nonFunctionalRequirements,
      ),
    };
    userStory = { ...userStory, proposed };
    if (sameJson(current, proposed)) {
      userStory = {
        outcome: "UNCHANGED",
        reason: userStory.reason,
        proposed: null,
      };
    }
  }

  const testCases = input.decision.testCases.map((decision) => {
    const normalizedDecision = decision.proposed
      ? {
          ...decision,
          proposed: {
            ...decision.proposed,
            preconditions: normalizeOptional(decision.proposed.preconditions),
          },
        }
      : decision;
    if (
      normalizedDecision.outcome === "CREATE" &&
      normalizedDecision.proposed
    ) {
      const fingerprint = `${normalizedDecision.proposed.name
        .toLocaleLowerCase("zh-CN")
        .replaceAll(/\s+/g, "")}|${normalizedDecision.proposed.steps.replaceAll(
        /\s+/g,
        "",
      )}`;
      if (caseFingerprints.has(fingerprint)) {
        return {
          ...normalizedDecision,
          outcome: "NEEDS_ATTENTION" as const,
          reason: "建议新增用例与现有或本批其他用例重复，未生成草稿。",
          proposed: null,
        };
      }
      caseFingerprints.add(fingerprint);
    }
    if (
      normalizedDecision.outcome !== "UPDATE" ||
      !normalizedDecision.proposed ||
      !normalizedDecision.targetTestCaseId
    ) {
      return normalizedDecision;
    }
    const current = caseById.get(normalizedDecision.targetTestCaseId);
    if (!current) return normalizedDecision;
    const currentContent = {
      name: current.name.trim(),
      priority: current.priority,
      groupId: current.groupId,
      preconditions: normalizeOptional(current.preconditions),
      steps: current.steps.trim(),
    };
    return sameJson(currentContent, normalizedDecision.proposed)
      ? {
          ...normalizedDecision,
          outcome: "UNCHANGED" as const,
          proposed: null,
        }
      : normalizedDecision;
  });
  return { userStory, testCases };
}

function limitCodeEvidence(files: readonly CodeEvidence[]) {
  const result: CodeEvidence[] = [];
  let remaining = MAX_COMPARISON_CODE_CHARACTERS;
  for (const file of files) {
    if (remaining <= 0) break;
    const content = file.content.slice(0, remaining);
    if (!content) continue;
    result.push({ ...file, content });
    remaining -= content.length;
  }
  return result;
}

function formatTestCase(testCase: ConsistencyTestCase) {
  return `${
    testCase.enabled
      ? `用例 ID：${testCase.id}`
      : "停用用例：仅用于去重，不返回结论"
  }
编号：${testCase.code}
名称：${testCase.name}
状态：${testCase.enabled ? "启用" : "停用（仅用于去重）"}
分组：${testCase.groupName}（${testCase.groupId}）
优先级：${testCase.priority}
前置条件：${testCase.preconditions ?? "无"}
测试步骤：
${testCase.steps}`;
}

export function formatConsistencySpecification(input: {
  userStory: ConsistencyUserStory | null;
  testCases: readonly ConsistencyTestCase[];
}) {
  const story = input.userStory
    ? `US ID：${input.userStory.id}
编号：${input.userStory.code}
标题（不可修改）：${input.userStory.title}
当前版本：v${input.userStory.currentVersion}
As：${input.userStory.asA}
I want：${input.userStory.iWant}
so that：${input.userStory.soThat}
业务规则：${input.userStory.businessRules ?? "无"}
非功能需求：${input.userStory.nonFunctionalRequirements ?? "无"}
验收标准：
${input.userStory.acceptanceCriteria
  .map(
    (criterion, index) =>
      `${index + 1}. Given ${criterion.given}\n   When ${criterion.when}\n   Then ${criterion.then}`,
  )
  .join("\n")}`
    : "平台用例检查（不存在关联 US）";
  const cases = input.testCases.length
    ? input.testCases.map(formatTestCase).join("\n\n")
    : "暂无用例";
  return `${story}\n\n现有测试用例：\n${cases}`;
}

export async function checkConsistencyUnit(input: {
  userStory: ConsistencyUserStory | null;
  activeTestCases: readonly ConsistencyTestCase[];
  deduplicationTestCases?: readonly ConsistencyTestCase[];
  snapshots: RepositoryTreeSnapshot[];
  modelProvider: ModelProvider;
  repositoryCodeSource: RepositoryCodeSource;
  skill: AiSkill;
  groups: readonly { id: string; name: string }[];
  variables: readonly ProjectVariableMetadata[];
  abortSignal?: AbortSignal;
  readCache?: Map<string, Promise<RepositoryCodeFile>>;
  onStage?: (stage: AiExecutionStage) => Promise<void>;
  onLog?: (event: WorkflowLogEvent) => Promise<void>;
  onCodeSelected?: (references: CodeReferenceRecord[]) => Promise<void>;
}): Promise<{
  decision: ReturnType<typeof normalizeConsistencyDecision>;
  repositories: RepositorySnapshotRecord[];
  codeReferences: CodeReferenceRecord[];
  usage: ModelUsage;
}> {
  const allCases = [
    ...input.activeTestCases,
    ...(input.deduplicationTestCases ?? []),
  ];
  const specification = formatConsistencySpecification({
    userStory: input.userStory,
    testCases: allCases,
  });
  const relevantCode = await analyzeRelevantCodeFromSnapshots({
    requirementText: specification,
    businessContext: null,
    snapshots: input.snapshots,
    modelProvider: input.modelProvider,
    repositoryCodeSource: input.repositoryCodeSource,
    systemPrompt: input.skill.instructions,
    buildSelectionPrompt: (selection) =>
      buildConsistencyCodeSelectionPrompt({
        specification: selection.requirementText,
        repository: selection.repository,
        branch: selection.branch,
        commitSha: selection.commitSha,
        candidatePaths: selection.candidatePaths,
      }),
    abortSignal: input.abortSignal,
    readCache: input.readCache,
    onStage: input.onStage,
    onLog: input.onLog,
    onCodeSelected: input.onCodeSelected,
  });

  await input.onStage?.(AiExecutionStage.GENERATING_DRAFT);
  const comparison = await input.modelProvider.generateStructured({
    schema: createConsistencyDecisionSchema({
      hasUserStory: Boolean(input.userStory),
      existingTestCaseIds: input.activeTestCases.map((testCase) => testCase.id),
      groupIds: input.groups.map((group) => group.id),
      variables: input.variables,
      allowCreate: Boolean(input.userStory),
    }),
    system: input.skill.instructions,
    prompt: buildConsistencyComparisonPrompt({
      specification,
      codeEvidence: limitCodeEvidence(relevantCode.codeEvidence),
      groups: input.groups,
      variables: input.variables,
    }),
    abortSignal: input.abortSignal,
    onRetry: ({ nextAttempt, maxAttempts, reason }) =>
      input.onLog?.({
        level: "WARN",
        stage: AiExecutionStage.GENERATING_DRAFT,
        message: `一致性结论无法校验（${reason}），正在进行第 ${nextAttempt}/${maxAttempts} 次生成。`,
      }),
  });
  addUsage(relevantCode.usage, comparison.usage);
  return {
    decision: normalizeConsistencyDecision({
      decision: comparison.output,
      userStory: input.userStory,
      testCases: allCases,
    }),
    repositories: relevantCode.repositories,
    codeReferences: relevantCode.codeReferences,
    usage: relevantCode.usage,
  };
}
