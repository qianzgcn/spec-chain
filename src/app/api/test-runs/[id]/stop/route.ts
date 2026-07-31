import { NextResponse } from "next/server";

import { RunStatus, TestRunStage } from "@/generated/prisma/enums";
import { getAuthenticatedApiContext } from "@/server/api/context";
import { db } from "@/server/db";

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
  const run = await db.testRun.findFirst({
    where: {
      id,
      deletedAt: null,
      testCase: { projectId: context.project.id },
    },
    select: { id: true, status: true, startedAt: true },
  });
  if (!run) {
    return NextResponse.json({ message: "运行记录不存在" }, { status: 404 });
  }

  if (run.status === RunStatus.QUEUED) {
    const now = new Date();
    const stopped = await db.testRun.updateMany({
      where: { id, status: RunStatus.QUEUED, deletedAt: null },
      data: {
        status: RunStatus.STOPPED,
        stage: TestRunStage.COMPLETED,
        cancelRequestedAt: now,
        finishedAt: now,
        durationMs: 0,
        errorSummary: "排队任务已由用户停止",
      },
    });
    if (stopped.count === 1) {
      return NextResponse.json({ message: "排队任务已停止" });
    }

    // 调度器可能恰好领取了任务，此时继续提交运行中停止请求。
    const cancelRequested = await db.testRun.updateMany({
      where: { id, status: RunStatus.RUNNING, deletedAt: null },
      data: { cancelRequestedAt: now },
    });
    if (cancelRequested.count === 1) {
      return NextResponse.json({ message: "已提交停止请求" });
    }
  }

  if (run.status === RunStatus.RUNNING) {
    const cancelRequested = await db.testRun.updateMany({
      where: { id, status: RunStatus.RUNNING, deletedAt: null },
      data: { cancelRequestedAt: new Date() },
    });
    if (cancelRequested.count === 1) {
      return NextResponse.json({ message: "已提交停止请求" });
    }
  }

  return NextResponse.json(
    { message: "任务状态已发生变化，请刷新后重试" },
    { status: 409 },
  );
}
