import { NextResponse } from "next/server";

import { getAiExecutionDetail } from "@/server/ai/execution-dto";
import { getAuthenticatedApiContext } from "@/server/api/context";

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
  const execution = await getAiExecutionDetail(context.project.id, id);
  if (!execution) {
    return NextResponse.json({ message: "AI 执行记录不存在" }, { status: 404 });
  }

  return NextResponse.json({ execution });
}
