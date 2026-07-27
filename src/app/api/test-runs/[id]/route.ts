import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/server/api/context";
import { db } from "@/server/db";

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
  const run = await db.testRun.findFirst({
    where: {
      id,
      testCase: { projectId: context.project.id },
    },
    select: {
      id: true,
      status: true,
      queuedAt: true,
      startedAt: true,
      durationMs: true,
      errorSummary: true,
      logContent: true,
      screenshotPath: true,
      artifactsExpireAt: true,
      artifactsPurgedAt: true,
      cancelRequestedAt: true,
      baseUrlSnapshot: true,
    },
  });
  if (!run) {
    return NextResponse.json({ message: "运行记录不存在" }, { status: 404 });
  }

  const artifactsExpired =
    Boolean(run.artifactsPurgedAt) ||
    run.artifactsExpireAt.getTime() <= Date.now();

  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      queuedAt: run.queuedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      durationMs: run.durationMs,
      errorSummary: run.errorSummary,
      logContent: artifactsExpired ? null : run.logContent,
      hasScreenshot: !artifactsExpired && Boolean(run.screenshotPath),
      artifactsExpired,
      cancelRequested: Boolean(run.cancelRequestedAt),
      baseUrl: run.baseUrlSnapshot,
    },
  });
}
