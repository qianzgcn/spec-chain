import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { ButtonLink } from "@/components/navigation/button-link";
import { RequirementDetailActions } from "@/components/requirements/requirement-detail-actions";
import { UserStoryStatusSelect } from "@/components/requirements/user-story-status-select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDetailedDateTime } from "@/lib/date-time";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "US 详情",
};

export default async function UserStoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    include: {
      feature: {
        select: { id: true, code: true, name: true },
      },
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
      },
      testCases: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          code: true,
          name: true,
          priority: true,
          enabled: true,
          updatedAt: true,
          group: { select: { name: true } },
        },
      },
    },
  });
  if (!story) notFound();

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title={story.title}
        meta={
          <>
            <Badge variant="outline">US</Badge>
            <Badge variant="secondary">v{story.currentVersion}</Badge>
            <span className="font-mono text-xs">{story.code}</span>
            {story.feature ? (
              <ButtonLink
                href={`/features/${story.feature.id}`}
                variant="link"
                size="sm"
                className="h-auto p-0"
              >
                {story.feature.code} · {story.feature.name}
              </ButtonLink>
            ) : null}
          </>
        }
        actions={
          <>
            <ButtonLink
              href={`/test-cases/ai-generate?userStoryId=${story.id}`}
              variant="outline"
            >
              AI生成测试用例
            </ButtonLink>
            <ButtonLink
              href={`/user-stories/${story.id}/versions`}
              variant="outline"
            >
              版本历史
            </ButtonLink>
            <UserStoryStatusSelect id={story.id} status={story.status} />
            <RequirementDetailActions type="USER_STORY" id={story.id} />
          </>
        }
      />

      <div className="flex min-w-0 flex-col gap-4">
        <PageSection title="用户故事">
          <dl className="flex flex-col gap-3">
            <div className="bg-muted/50 min-w-0 rounded-lg p-4">
              <dt className="text-muted-foreground mb-2 text-xs font-medium">
                As
              </dt>
              <dd className="whitespace-pre-wrap">{story.asA}</dd>
            </div>
            <div className="bg-muted/50 min-w-0 rounded-lg p-4">
              <dt className="text-muted-foreground mb-2 text-xs font-medium">
                I want
              </dt>
              <dd className="whitespace-pre-wrap">{story.iWant}</dd>
            </div>
            <div className="bg-muted/50 min-w-0 rounded-lg p-4">
              <dt className="text-muted-foreground mb-2 text-xs font-medium">
                so that
              </dt>
              <dd className="whitespace-pre-wrap">{story.soThat}</dd>
            </div>
          </dl>
        </PageSection>

        <PageSection title="验收标准">
          <div className="flex flex-col gap-2">
            <div
              className="text-muted-foreground grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] gap-4 px-3 text-xs font-medium"
              aria-hidden
            >
              <span>序号</span>
              <span>Given</span>
              <span>When</span>
              <span>Then</span>
            </div>
            {story.acceptanceCriteria.map((criterion, index) => (
              <div
                className="bg-muted/50 grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] gap-4 rounded-lg px-3 py-3 text-sm"
                key={criterion.id}
              >
                <span className="text-muted-foreground font-medium">
                  {index + 1}
                </span>
                <p className="whitespace-pre-wrap">{criterion.given}</p>
                <p className="whitespace-pre-wrap">{criterion.when}</p>
                <p className="whitespace-pre-wrap">{criterion.then}</p>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection title="业务规则">
          <MarkdownView content={story.businessRules} />
        </PageSection>

        <PageSection title="非功能需求">
          <MarkdownView content={story.nonFunctionalRequirements} />
        </PageSection>

        <PageSection title="关联测试用例">
          {story.testCases.length ? (
            <Table containerClassName="rounded-lg border">
              <TableHeader className="bg-muted/50 text-muted-foreground text-xs">
                <TableRow>
                  <TableHead className="px-4">编号</TableHead>
                  <TableHead className="px-4">名称</TableHead>
                  <TableHead className="px-4">分组</TableHead>
                  <TableHead className="px-4">优先级</TableHead>
                  <TableHead className="px-4">状态</TableHead>
                  <TableHead className="px-4">最后更新</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {story.testCases.map((testCase) => (
                  <TableRow key={testCase.id}>
                    <TableCell className="text-muted-foreground px-4 font-mono text-xs">
                      {testCase.code}
                    </TableCell>
                    <TableCell className="px-4">
                      <ButtonLink
                        href={`/test-cases/${testCase.id}`}
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                      >
                        {testCase.name}
                      </ButtonLink>
                    </TableCell>
                    <TableCell className="px-4">
                      {testCase.group.name}
                    </TableCell>
                    <TableCell className="px-4">{testCase.priority}</TableCell>
                    <TableCell className="px-4">
                      {testCase.enabled ? "启用" : "停用"}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-4">
                      {formatDetailedDateTime(testCase.updatedAt.toISOString())}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">暂无关联测试用例。</p>
          )}
        </PageSection>
      </div>
    </PageContainer>
  );
}
