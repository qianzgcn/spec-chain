import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/server/api/context";
import { db } from "@/server/db";
import { startTaskScheduler } from "@/server/tasks/launcher";
import {
  createQueuedTestRun,
  failQueuedRunsAfterSchedulerError,
  TestRunCreationError,
} from "@/server/test-runs/create-run";

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
    where: { id, projectId: context.project.id, deletedAt: null },
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
  if (!context.project.baseUrl) {
    return NextResponse.json(
      { message: "请先在项目设置中配置 Base URL" },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const created = await db.$transaction((transaction) =>
      createQueuedTestRun(transaction, {
        projectId: context.project!.id,
        testCaseId: id,
        requestedById: context.user.id,
        baseUrl: context.project!.baseUrl!,
      }),
    );

    if (!startTaskScheduler()) {
      await db.$transaction((transaction) =>
        failQueuedRunsAfterSchedulerError(transaction, {
          runIds: [created.run.id],
          scriptTaskIds: created.scriptTaskId ? [created.scriptTaskId] : [],
        }),
      );
      return NextResponse.json(
        { message: "无法启动任务调度器，请查看服务日志" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { run: { id: created.run.id, status: created.run.status } },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof TestRunCreationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
