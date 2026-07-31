import path from "node:path";
import { readFile } from "node:fs/promises";

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
      deletedAt: null,
      testCase: { projectId: context.project.id },
    },
    select: {
      screenshotPath: true,
      artifactsExpireAt: true,
      artifactsPurgedAt: true,
    },
  });

  if (
    !run?.screenshotPath ||
    run.artifactsPurgedAt ||
    run.artifactsExpireAt.getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { message: "失败截图不存在或已过期" },
      { status: 404 },
    );
  }

  const dataRoot = path.join(process.cwd(), "data");
  const screenshotPath = path.resolve(dataRoot, run.screenshotPath);
  if (!screenshotPath.startsWith(`${dataRoot}${path.sep}`)) {
    return NextResponse.json({ message: "截图路径无效" }, { status: 400 });
  }

  try {
    const content = await readFile(screenshotPath);
    return new Response(content, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="failure-${id}.png"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "失败截图不存在或已过期" },
      { status: 404 },
    );
  }
}
