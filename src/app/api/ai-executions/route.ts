import { NextResponse } from "next/server";

import { getAiExecutionSummaries } from "@/server/ai/execution-dto";
import { getAuthenticatedApiContext } from "@/server/api/context";

export async function GET() {
  const context = await getAuthenticatedApiContext();
  if (!context) {
    return NextResponse.json({ message: "请先登录" }, { status: 401 });
  }
  if (!context.project) {
    return NextResponse.json({ message: "请先创建项目" }, { status: 400 });
  }

  const executions = await getAiExecutionSummaries(context.project.id);
  return NextResponse.json({ executions });
}
