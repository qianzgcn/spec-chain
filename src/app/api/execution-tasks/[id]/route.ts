import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/server/api/context";
import { getExecutionTaskDetail } from "@/server/execution-tasks/dto";

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
  const task = await getExecutionTaskDetail(context.project.id, id);
  if (!task) {
    return NextResponse.json({ message: "执行任务不存在" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
