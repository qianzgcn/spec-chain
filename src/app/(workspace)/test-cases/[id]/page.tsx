import type { Metadata } from "next";

import { Tag } from "antd";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
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
      <PageHeader
        title={testCase.name}
        meta={
          <>
            <span className="page-code">{testCase.code}</span>
            <Tag color={TEST_PRIORITY_META[testCase.priority].color}>
              {testCase.priority}
            </Tag>
            <Tag color={testCase.enabled ? "success" : "default"}>
              {testCase.enabled ? "已启用" : "已停用"}
            </Tag>
            <span className="text-xs text-slate-500">
              {testCase.group.name}
            </span>
          </>
        }
        actions={<TestCaseDetailActions id={testCase.id} />}
      />

      <div className="detail-sections">
        <PageSection title="用例内容">
          <div className="detail-two-columns detail-two-columns--weighted">
            <div>
              <h3>前置条件</h3>
              <MarkdownView content={testCase.preconditions} />
            </div>
            <div>
              <h3>测试步骤</h3>
              <MarkdownView content={testCase.steps} />
            </div>
          </div>
        </PageSection>

        <PageSection title="关联 US">
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
                      className="entity-link"
                      href={`/user-stories/${userStory.id}`}
                    >
                      {userStory.code} · {userStory.title}
                      {userStory.feature
                        ? `（${userStory.feature.name}）`
                        : "（未归属 FE）"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-slate-400">未关联 US</span>
          )}
        </PageSection>

        <PageSection title="Playwright TypeScript 脚本">
          {testCase.script ? (
            <pre className="m-0 max-h-[520px] overflow-auto rounded-lg bg-slate-950 p-5 text-xs leading-6 text-slate-100">
              <code>{testCase.script}</code>
            </pre>
          ) : (
            <span className="text-sm text-slate-400">尚未编写自动化脚本</span>
          )}
        </PageSection>
      </div>
    </div>
  );
}
