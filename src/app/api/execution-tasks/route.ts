import { NextResponse } from "next/server";

import { getAuthenticatedApiContext } from "@/server/api/context";
import { getExecutionTaskSummaries } from "@/server/execution-tasks/dto";

export async function GET() {
  const context = await getAuthenticatedApiContext();
  if (!context) {
    return NextResponse.json({ message: "请先登录" }, { status: 401 });
  }
  if (!context.project) {
    return NextResponse.json({ message: "请先创建项目" }, { status: 400 });
  }

  const tasks = await getExecutionTaskSummaries(context.project.id);
  return NextResponse.json({ tasks });
}
