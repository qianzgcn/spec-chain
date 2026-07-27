import { NextResponse } from "next/server";

import { RunStatus } from "@/generated/prisma/enums";
import { getAuthenticatedApiContext } from "@/server/api/context";
import { db } from "@/server/db";
import { startQueueWorker } from "@/server/runner/launcher";

const ARTIFACT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

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
    where: { testCaseId: id },
    orderBy: { queuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
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
  if (!testCase.script?.trim()) {
    return NextResponse.json(
      { message: "请先编写 Playwright TypeScript 脚本" },
      { status: 400 },
    );
  }
  if (!context.project.baseUrl) {
    return NextResponse.json(
      { message: "请先在项目设置中配置 Base URL" },
      { status: 400 },
    );
  }

  const run = await db.testRun.create({
    data: {
      testCaseId: testCase.id,
      requestedById: context.user.id,
      status: RunStatus.QUEUED,
      artifactsExpireAt: new Date(Date.now() + ARTIFACT_RETENTION_MS),
      testCaseCodeSnapshot: testCase.code,
      testCaseNameSnapshot: testCase.name,
      scriptSnapshot: testCase.script,
      baseUrlSnapshot: context.project.baseUrl,
    },
    select: { id: true, status: true },
  });

  if (!startQueueWorker()) {
    await db.testRun.update({
      where: { id: run.id },
      data: {
        status: RunStatus.FAILED,
        finishedAt: new Date(),
        errorSummary: "无法启动运行队列子进程",
      },
    });
    return NextResponse.json(
      { message: "无法启动运行队列，请查看服务日志" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { run: { id: run.id, status: run.status } },
    { status: 202 },
  );
}
