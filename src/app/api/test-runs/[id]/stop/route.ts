import { NextResponse } from "next/server";

import { RunStatus } from "@/generated/prisma/enums";
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
      testCase: { projectId: context.project.id },
    },
    select: { id: true, status: true, startedAt: true },
  });
  if (!run) {
    return NextResponse.json({ message: "运行记录不存在" }, { status: 404 });
  }

  if (run.status === RunStatus.QUEUED) {
    const now = new Date();
    await db.testRun.updateMany({
      where: { id, status: RunStatus.QUEUED },
      data: {
        status: RunStatus.STOPPED,
        cancelRequestedAt: now,
        finishedAt: now,
        durationMs: 0,
        errorSummary: "排队任务已由用户停止",
      },
    });
    return NextResponse.json({ message: "排队任务已停止" });
  }

  if (run.status === RunStatus.RUNNING) {
    await db.testRun.updateMany({
      where: { id, status: RunStatus.RUNNING },
      data: { cancelRequestedAt: new Date() },
    });
    return NextResponse.json({ message: "已提交停止请求" });
  }

  return NextResponse.json(
    { message: "该运行已经结束，无需停止" },
    { status: 409 },
  );
}
