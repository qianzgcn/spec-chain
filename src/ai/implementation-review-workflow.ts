import { z } from "zod";

import type { ModelProvider, ModelUsage } from "@/ai/model-provider";
import {
  buildImplementationReviewCodeSelectionPrompt,
  buildImplementationReviewPrompt,
} from "@/ai/prompts/review-requirement-implementation";
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
import {
  AcceptanceCriterionReviewStatus,
  AiExecutionStage,
  ImplementationFindingSeverity,
  ImplementationFindingType,
  RequirementImplementationStatus,
  TestCoverageStatus,
  TestPriority,
} from "@/generated/prisma/enums";

const MAX_REVIEW_CODE_CHARACTERS = 120_000;

const evidenceSchema = z.object({
  repository: z.string().trim().min(1).max(300),
  commitSha: z.string().trim().min(1).max(100),
  path: z.string().trim().min(1).max(1_000),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  summary: z.string().trim().min(1).max(2_000),
});

const criterionResultSchema = z.object({
  position: z.number().int().positive(),
  status: z.enum(AcceptanceCriterionReviewStatus),
  reason: z.string().trim().min(1).max(4_000),
  evidence: z.array(evidenceSchema).max(10),
});

const findingSchema = z.object({
  type: z.enum(ImplementationFindingType),
  severity: z.enum(ImplementationFindingSeverity),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().min(1).max(4_000),
  evidence: z.array(evidenceSchema).max(10),
});

export type ImplementationReviewUserStory = {
  id: string;
  code: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  businessRules: string | null;
  nonFunctionalRequirements: string | null;
  acceptanceCriteria: Array<{
    given: string;
    when: string;
    then: string;
  }>;
  testCases: Array<{
    code: string;
    name: string;
    priority: TestPriority;
    preconditions: string | null;
    steps: string;
  }>;
};

export type ImplementationReviewEvidence = z.infer<typeof evidenceSchema>;

export type ImplementationReviewDecision = {
  implementationStatus: RequirementImplementationStatus;
  coverageStatus: TestCoverageStatus;
  summary: string;
  criteria: Array<{
    position: number;
    status: AcceptanceCriterionReviewStatus;
    reason: string;
    evidence: ImplementationReviewEvidence[];
  }>;
  findings: Array<{
    type: ImplementationFindingType;
    severity: ImplementationFindingSeverity;
    title: string;
    detail: string;
    evidence: ImplementationReviewEvidence[];
  }>;
};

export function createImplementationReviewSchema(criterionCount: number) {
  const expectedPositions = new Set(
    Array.from({ length: criterionCount }, (_, index) => index + 1),
  );
  return z
    .object({
      implementationStatus: z.enum(RequirementImplementationStatus),
      coverageStatus: z.enum(TestCoverageStatus),
      summary: z.string().trim().min(1).max(4_000),
      criteria: z.array(criterionResultSchema).length(criterionCount),
      findings: z.array(findingSchema).max(50),
    })
    .superRefine((value, context) => {
      const returned = new Set(value.criteria.map((item) => item.position));
      if (
        returned.size !== expectedPositions.size ||
        [...expectedPositions].some((position) => !returned.has(position))
      ) {
        context.addIssue({
          code: "custom",
          path: ["criteria"],
          message: "必须逐条返回全部验收标准，且位置不能重复",
        });
      }
      for (const criterion of value.criteria) {
        if (criterion.evidence.some((item) => item.lineEnd < item.lineStart)) {
          context.addIssue({
            code: "custom",
            path: ["criteria", criterion.position, "evidence"],
            message: "证据结束行不能小于开始行",
          });
        }
      }
    });
}

function limitCodeEvidence(files: readonly CodeEvidence[]) {
  const result: CodeEvidence[] = [];
  let remaining = MAX_REVIEW_CODE_CHARACTERS;
  for (const file of files) {
    if (remaining <= 0) break;
    const content = file.content.slice(0, remaining);
    if (!content) continue;
    result.push({ ...file, content });
    remaining -= content.length;
  }
  return result;
}

function validateEvidence(
  evidence: readonly ImplementationReviewEvidence[],
  files: readonly CodeEvidence[],
) {
  return evidence.filter((item) => {
    const file = files.find(
      (candidate) =>
        candidate.repository === item.repository &&
        candidate.commitSha === item.commitSha &&
        candidate.path === item.path,
    );
    if (!file) return false;
    const lineCount = file.content.split(/\r?\n/).length;
    return item.lineStart <= item.lineEnd && item.lineEnd <= lineCount;
  });
}

export function normalizeImplementationReviewDecision(input: {
  decision: ImplementationReviewDecision;
  codeEvidence: readonly CodeEvidence[];
}) {
  const criteria = input.decision.criteria
    .toSorted((left, right) => left.position - right.position)
    .map((criterion) => ({
      ...criterion,
      evidence: validateEvidence(criterion.evidence, input.codeEvidence),
    }));
  const findings = input.decision.findings.map((finding) => {
    const evidence = validateEvidence(finding.evidence, input.codeEvidence);
    return {
      ...finding,
      type:
        finding.type === ImplementationFindingType.CONFIRMED_BUG &&
        evidence.length === 0
          ? ImplementationFindingType.POTENTIAL_DEFECT
          : finding.type,
      evidence,
    };
  });
  if (
    input.decision.coverageStatus === TestCoverageStatus.INSUFFICIENT &&
    !findings.some(
      (finding) => finding.type === ImplementationFindingType.TEST_COVERAGE_GAP,
    )
  ) {
    findings.push({
      type: ImplementationFindingType.TEST_COVERAGE_GAP,
      severity: ImplementationFindingSeverity.MAJOR,
      title: "需求用例覆盖不足",
      detail: "现有启用需求用例不能完整验证本用户故事的验收标准。",
      evidence: [],
    });
  }

  const hasViolatedCriterion = criteria.some(
    (criterion) =>
      criterion.status === AcceptanceCriterionReviewStatus.VIOLATED,
  );
  const implementationStatus =
    input.decision.implementationStatus ===
      RequirementImplementationStatus.IMPLEMENTED && hasViolatedCriterion
      ? RequirementImplementationStatus.PARTIALLY_IMPLEMENTED
      : input.decision.implementationStatus;

  return {
    ...input.decision,
    implementationStatus,
    criteria,
    findings,
  };
}

export function formatImplementationReviewSpecification(
  story: ImplementationReviewUserStory,
) {
  const criteria = story.acceptanceCriteria
    .map(
      (criterion, index) =>
        `${index + 1}. Given ${criterion.given}\n   When ${criterion.when}\n   Then ${criterion.then}`,
    )
    .join("\n");
  const testCases = story.testCases.length
    ? story.testCases
        .map(
          (testCase) => `编号：${testCase.code}
名称：${testCase.name}
优先级：${testCase.priority}
前置条件：${testCase.preconditions ?? "无"}
步骤：
${testCase.steps}`,
        )
        .join("\n\n")
    : "暂无启用的需求用例";
  return `US 编号：${story.code}
标题：${story.title}
As：${story.asA}
I want：${story.iWant}
so that：${story.soThat}
业务规则：${story.businessRules ?? "无"}
非功能需求：${story.nonFunctionalRequirements ?? "无"}
验收标准：
${criteria}

现有启用需求用例：
${testCases}`;
}

export async function reviewRequirementImplementation(input: {
  userStory: ImplementationReviewUserStory;
  snapshots: RepositoryTreeSnapshot[];
  modelProvider: ModelProvider;
  repositoryCodeSource: RepositoryCodeSource;
  skill: AiSkill;
  abortSignal?: AbortSignal;
  readCache?: Map<string, Promise<RepositoryCodeFile>>;
  onStage?: (stage: AiExecutionStage) => Promise<void>;
  onLog?: (event: WorkflowLogEvent) => Promise<void>;
  onCodeSelected?: (references: CodeReferenceRecord[]) => Promise<void>;
}): Promise<{
  decision: ReturnType<typeof normalizeImplementationReviewDecision>;
  repositories: RepositorySnapshotRecord[];
  codeReferences: CodeReferenceRecord[];
  usage: ModelUsage;
}> {
  const specification = formatImplementationReviewSpecification(
    input.userStory,
  );
  const relevantCode = await analyzeRelevantCodeFromSnapshots({
    requirementText: specification,
    businessContext: null,
    snapshots: input.snapshots,
    modelProvider: input.modelProvider,
    repositoryCodeSource: input.repositoryCodeSource,
    systemPrompt: input.skill.instructions,
    buildSelectionPrompt: (selection) =>
      buildImplementationReviewCodeSelectionPrompt({
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

  await input.onStage?.(AiExecutionStage.REVIEWING_IMPLEMENTATION);
  const review = await input.modelProvider.generateStructured({
    schema: createImplementationReviewSchema(
      input.userStory.acceptanceCriteria.length,
    ),
    system: input.skill.instructions,
    prompt: buildImplementationReviewPrompt({
      specification,
      codeEvidence: limitCodeEvidence(relevantCode.codeEvidence),
    }),
    abortSignal: input.abortSignal,
    onRetry: ({ nextAttempt, maxAttempts, reason }) =>
      input.onLog?.({
        level: "WARN",
        stage: AiExecutionStage.REVIEWING_IMPLEMENTATION,
        message: `审查结论无法校验（${reason}），正在进行第 ${nextAttempt}/${maxAttempts} 次生成。`,
      }),
  });
  addUsage(relevantCode.usage, review.usage);

  return {
    decision: normalizeImplementationReviewDecision({
      decision: review.output,
      codeEvidence: relevantCode.codeEvidence,
    }),
    repositories: relevantCode.repositories,
    codeReferences: relevantCode.codeReferences,
    usage: relevantCode.usage,
  };
}
