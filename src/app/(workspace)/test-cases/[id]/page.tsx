import type { Metadata } from "next";

import { Tag } from "antd";
import { notFound } from "next/navigation";

import { MarkdownView } from "@/components/markdown/markdown-view";
import { TestCaseDetailActions } from "@/components/test-cases/test-case-detail-actions";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";

export const metadata: Metadata = {
  title: "测试用例详情",
};

export default async function TestCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const testCase = await db.testCase.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    include: {
      group: { select: { name: true } },
      userStoryLinks: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          userStory: {
            select: {
              id: true,
              code: true,
              title: true,
              deletedAt: true,
              feature: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!testCase) notFound();

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500">
              {testCase.code}
            </span>
            <Tag color={TEST_PRIORITY_META[testCase.priority].color}>
              {testCase.priority}
            </Tag>
            <Tag color={testCase.enabled ? "success" : "default"}>
              {testCase.enabled ? "已启用" : "已停用"}
            </Tag>
            <span className="text-xs text-slate-500">
              {testCase.group.name}
            </span>
          </div>
          <h1 className="page-title">{testCase.name}</h1>
        </div>
        <TestCaseDetailActions id={testCase.id} />
      </div>

      <div className="content-panel max-w-[1180px]">
        <section className="border-b border-slate-200 px-7 py-6">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            前置条件
          </h2>
          <MarkdownView content={testCase.preconditions} />
        </section>

        <section className="border-b border-slate-200 px-7 py-6">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            测试步骤
          </h2>
          <MarkdownView content={testCase.steps} />
        </section>

        <section className="border-b border-slate-200 px-7 py-6">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            关联 US
          </h2>
          {testCase.userStoryLinks.length > 0 ? (
            <ul className="m-0 space-y-2 p-0">
              {testCase.userStoryLinks.map(({ userStory }) => (
                <li key={userStory.id} className="list-none text-sm">
                  {userStory.deletedAt ? (
                    <span className="text-slate-500">
                      {userStory.code} · {userStory.title}（已删除）
                    </span>
                  ) : (
                    <a
                      className="font-medium text-cyan-700 hover:text-cyan-800"
                      href={`/user-stories/${userStory.id}`}
                    >
                      {userStory.code} · {userStory.title}
                      {userStory.feature
                        ? `（${userStory.feature.name}）`
                        : "（独立 US）"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-slate-400">未关联 US</span>
          )}
        </section>

        <section className="border-b border-slate-200 px-7 py-6">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            Playwright TypeScript 脚本
          </h2>
          {testCase.script ? (
            <pre className="m-0 max-h-[520px] overflow-auto rounded-md bg-slate-950 p-5 text-xs leading-6 text-slate-100">
              <code>{testCase.script}</code>
            </pre>
          ) : (
            <span className="text-sm text-slate-400">尚未编写自动化脚本</span>
          )}
        </section>
      </div>
    </div>
  );
}
