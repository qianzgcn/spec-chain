import { NextResponse } from "next/server";

import { createAutomationInputFingerprint } from "@/automation/fingerprint";
import { getAutomationScriptStatus } from "@/automation/script-status";
import { RunStatus, TestRunStage } from "@/generated/prisma/enums";
import { VariableReferenceError } from "@/lib/project-variables/references";
import { getAuthenticatedApiContext } from "@/server/api/context";
import { db } from "@/server/db";
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

  let fingerprint: string;
  try {
    fingerprint = createAutomationInputFingerprint({
      testCase,
      baseUrl: context.project.baseUrl,
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

  const run = await db.testRun.create({
    data: {
      testCaseId: testCase.id,
      requestedById: context.user.id,
      status: RunStatus.QUEUED,
      artifactsExpireAt: new Date(Date.now() + ARTIFACT_RETENTION_MS),
      testCaseCodeSnapshot: testCase.code,
      testCaseNameSnapshot: testCase.name,
      scriptSnapshot,
      baseUrlSnapshot: context.project.baseUrl,
    },
    select: { id: true, status: true },
  });

  if (!startTaskScheduler()) {
    await db.testRun.update({
      where: { id: run.id },
      data: {
        status: RunStatus.FAILED,
        stage: TestRunStage.COMPLETED,
        finishedAt: new Date(),
        errorSummary: "无法启动任务调度器",
      },
    });
    return NextResponse.json(
      { message: "无法启动任务调度器，请查看服务日志" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { run: { id: run.id, status: run.status } },
    { status: 202 },
  );
}
