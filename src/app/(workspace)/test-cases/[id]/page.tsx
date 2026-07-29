import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { TestCaseDetailActions } from "@/components/test-cases/test-case-detail-actions";
import { Badge } from "@/components/ui/badge";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

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

  const priorityMeta = TEST_PRIORITY_META[testCase.priority];

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title={testCase.name}
        meta={
          <>
            <span className="font-mono text-xs">{testCase.code}</span>
            <Badge variant={priorityMeta.badgeVariant}>
              {priorityMeta.label}
            </Badge>
            <Badge variant={testCase.enabled ? "secondary" : "outline"}>
              {testCase.enabled ? "已启用" : "已停用"}
            </Badge>
            <span>{testCase.group.name}</span>
          </>
        }
        actions={<TestCaseDetailActions id={testCase.id} />}
      />

      <PageSection title="用例内容">
        <div className="grid grid-cols-[4fr_8fr] gap-8">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-medium">前置条件</h3>
            <MarkdownView content={testCase.preconditions} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-medium">测试步骤</h3>
            <MarkdownView content={testCase.steps} />
          </div>
        </div>
      </PageSection>

      <PageSection title="关联 US">
        {testCase.userStoryLinks.length ? (
          <ul className="flex flex-col gap-2">
            {testCase.userStoryLinks.map(({ userStory }) => (
              <li key={userStory.id} className="text-sm">
                {userStory.deletedAt ? (
                  <span className="text-muted-foreground">
                    {userStory.code} · {userStory.title}（已删除）
                  </span>
                ) : (
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    href={`/user-stories/${userStory.id}`}
                  >
                    {userStory.code} · {userStory.title}
                    {userStory.feature ? `（${userStory.feature.name}）` : ""}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground text-sm">未关联 US</span>
        )}
      </PageSection>

      <PageSection title="Playwright TypeScript 脚本">
        {testCase.script ? (
          <pre className="bg-foreground text-background max-h-[520px] overflow-auto rounded-lg p-5 font-mono text-xs leading-6 whitespace-pre-wrap">
            <code>{testCase.script}</code>
          </pre>
        ) : (
          <span className="text-muted-foreground text-sm">
            尚未编写自动化脚本
          </span>
        )}
      </PageSection>
    </PageContainer>
  );
}
