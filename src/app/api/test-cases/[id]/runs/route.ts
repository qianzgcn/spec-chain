import { NextResponse } from "next/server";

import { createAutomationInputFingerprint } from "@/automation/fingerprint";
import { getAutomationScriptStatus } from "@/automation/script-status";
import {
  AiCapability,
  AiExecutionOrigin,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
  RunStatus,
  TestRunStage,
} from "@/generated/prisma/enums";
import { VariableReferenceError } from "@/lib/project-variables/references";
import { formatAutomationRunLog } from "@/automation/script-generation-run";
import { getAuthenticatedApiContext } from "@/server/api/context";
import { db } from "@/server/db";
import {
  createQueuedAiExecutionRecord,
  formatAutomationScriptRequirement,
} from "@/server/tasks/ai-execution-record";
import { startTaskScheduler } from "@/server/tasks/launcher";

const ARTIFACT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

// 测试运行归属于单个用例，由用例执行记录页面统一创建和读取。
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthenticatedApiContext();
  if (!context) {
    return NextResponse.json({ message: "请先登录" }, { status: 401 });
  }
  if (!context.project) {
    return NextResponse.json({ message: "请先创建项目" }, { status: 400 });
  }

  const { id } = await params;
  const testCase = await db.testCase.findFirst({
    where: {
      id,
      projectId: context.project.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!testCase) {
    return NextResponse.json(
      { message: "测试用例不存在或已删除" },
      { status: 404 },
    );
  }

  const runs = await db.testRun.findMany({
    where: { testCaseId: id, deletedAt: null },
    orderBy: { queuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      stage: true,
      queuedAt: true,
      startedAt: true,
      durationMs: true,
      requestedBy: { select: { username: true } },
    },
  });

  return NextResponse.json({
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      stage: run.stage,
      queuedAt: run.queuedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      durationMs: run.durationMs,
      requestedBy: run.requestedBy.username,
    })),
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getAuthenticatedApiContext();
  if (!context) {
    return NextResponse.json({ message: "请先登录" }, { status: 401 });
  }
  if (!context.project) {
    return NextResponse.json({ message: "请先创建项目" }, { status: 400 });
  }
  const project = context.project;

  const { id } = await params;
  const testCase = await db.testCase.findFirst({
    where: {
      id,
      projectId: context.project.id,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      enabled: true,
      script: true,
      scriptSource: true,
      aiScriptFingerprint: true,
      preconditions: true,
      steps: true,
      project: {
        select: {
          automationInstructions: true,
          variables: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
            select: {
              name: true,
              kind: true,
              encrypted: true,
              description: true,
              fields: {
                orderBy: { position: "asc" },
                select: {
                  name: true,
                  kind: true,
                  encrypted: true,
                  description: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!testCase) {
    return NextResponse.json(
      { message: "测试用例不存在或已删除" },
      { status: 404 },
    );
  }
  if (!testCase.enabled) {
    return NextResponse.json(
      { message: "测试用例已停用，不能运行" },
      { status: 400 },
    );
  }
  if (!context.project.baseUrl) {
    return NextResponse.json(
      { message: "请先在项目设置中配置 Base URL" },
      { status: 400 },
    );
  }
  const baseUrl = context.project.baseUrl;

  const activeRun = await db.testRun.findFirst({
    where: {
      testCaseId: testCase.id,
      status: { in: [RunStatus.QUEUED, RunStatus.RUNNING] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (activeRun) {
    return NextResponse.json(
      { message: "该用例正在执行，请等待当前任务完成" },
      { status: 409 },
    );
  }

  let fingerprint: string;
  try {
    fingerprint = createAutomationInputFingerprint({
      testCase,
      baseUrl,
      automationInstructions: testCase.project.automationInstructions,
      variables: testCase.project.variables,
    });
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      return NextResponse.json(
        { message: `测试用例变量引用无效：${error.message}` },
        { status: 400 },
      );
    }
    throw error;
  }
  const scriptStatus = getAutomationScriptStatus({
    script: testCase.script,
    source: testCase.scriptSource,
    aiFingerprint: testCase.aiScriptFingerprint,
    currentFingerprint: fingerprint,
  });
  const scriptSnapshot =
    scriptStatus === "NOT_GENERATED" || scriptStatus === "STALE"
      ? null
      : testCase.script;

  const needsScriptGeneration = scriptSnapshot === null;
  if (needsScriptGeneration) {
    const activeScriptTask = await db.aiExecution.findFirst({
      where: {
        projectId: context.project.id,
        testCaseId: testCase.id,
        capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
        status: { in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (activeScriptTask) {
      return NextResponse.json(
        { message: "该用例的 AI 脚本生成任务正在执行，请等待任务完成" },
        { status: 409 },
      );
    }
  }

  // 无脚本时把 AI 生成任务和 TestRun 放进同一事务，避免调度器提前领取 TestRun。
  const created = await db.$transaction(async (transaction) => {
    const activeRunInTransaction = await transaction.testRun.findFirst({
      where: {
        testCaseId: testCase.id,
        status: { in: [RunStatus.QUEUED, RunStatus.RUNNING] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (activeRunInTransaction) {
      return {
        conflict: true as const,
        message: "该用例正在执行，请等待当前任务完成",
      };
    }

    if (needsScriptGeneration) {
      const activeScriptTaskInTransaction =
        await transaction.aiExecution.findFirst({
          where: {
            projectId: project.id,
            testCaseId: testCase.id,
            capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
            status: {
              in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
            },
            deletedAt: null,
          },
          select: { id: true },
        });
      if (activeScriptTaskInTransaction) {
        return {
          conflict: true as const,
          message: "该用例的 AI 脚本生成任务正在执行，请等待任务完成",
        };
      }
    }

    const scriptTask = needsScriptGeneration
      ? await createQueuedAiExecutionRecord(transaction, {
          projectId: project.id,
          requestedById: context.user.id,
          testCaseId: testCase.id,
          capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
          origin: AiExecutionOrigin.TEST_RUN,
          requirementText: formatAutomationScriptRequirement(testCase),
        })
      : null;
    const run = await transaction.testRun.create({
      data: {
        testCaseId: testCase.id,
        requestedById: context.user.id,
        status: RunStatus.QUEUED,
        stage: needsScriptGeneration
          ? TestRunStage.GENERATING_SCRIPT
          : TestRunStage.QUEUED,
        artifactsExpireAt: new Date(Date.now() + ARTIFACT_RETENTION_MS),
        testCaseCodeSnapshot: testCase.code,
        testCaseNameSnapshot: testCase.name,
        scriptSnapshot,
        baseUrlSnapshot: baseUrl,
        logContent: needsScriptGeneration
          ? formatAutomationRunLog(
              "INFO",
              "生成自动化脚本",
              "运行任务已创建，等待 AI 脚本任务开始。",
            )
          : null,
      },
      select: { id: true, status: true },
    });
    return {
      conflict: false as const,
      run,
      scriptTaskId: scriptTask?.id ?? null,
    };
  });

  if (created.conflict) {
    return NextResponse.json({ message: created.message }, { status: 409 });
  }

  if (!startTaskScheduler()) {
    const finishedAt = new Date();
    await db.$transaction(async (transaction) => {
      await transaction.testRun.update({
        where: { id: created.run.id },
        data: {
          status: RunStatus.FAILED,
          stage: TestRunStage.COMPLETED,
          finishedAt,
          errorSummary: "无法启动任务调度器",
        },
      });
      if (created.scriptTaskId) {
        await transaction.aiExecution.update({
          where: { id: created.scriptTaskId },
          data: {
            status: AiExecutionStatus.FAILED,
            stage: AiExecutionStage.QUEUED,
            finishedAt,
            errorMessage: "无法启动任务调度器",
            logs: {
              create: {
                position: 1,
                level: AiExecutionLogLevel.ERROR,
                stage: AiExecutionStage.QUEUED,
                message: "任务失败（SCHEDULER_START）：无法启动任务调度器。",
                createdAt: finishedAt,
              },
            },
          },
        });
      }
    });
    return NextResponse.json(
      { message: "无法启动任务调度器，请查看服务日志" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { run: { id: created.run.id, status: created.run.status } },
    { status: 202 },
  );
}
