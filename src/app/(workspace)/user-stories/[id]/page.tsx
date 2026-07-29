import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { RequirementDetailActions } from "@/components/requirements/requirement-detail-actions";
import { UserStoryStatusSelect } from "@/components/requirements/user-story-status-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
            <span className="font-mono text-xs">{story.code}</span>
            {story.feature ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                nativeButton={false}
                render={<Link href={`/features/${story.feature.id}`} />}
              >
                {story.feature.code} · {story.feature.name}
              </Button>
            ) : null}
          </>
        }
        actions={
          <>
            <UserStoryStatusSelect id={story.id} status={story.status} />
            <RequirementDetailActions type="USER_STORY" id={story.id} />
          </>
        }
      />

      <div className="flex min-w-0 flex-col gap-4">
        <PageSection title="用户故事">
          <dl className="grid grid-cols-[3fr_5fr_4fr] gap-4">
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

        <PageSection title="补充约束">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 min-w-0 rounded-lg p-4">
              <h3 className="mb-3 text-sm font-medium">业务规则</h3>
              <MarkdownView content={story.businessRules} />
            </div>
            <div className="bg-muted/50 min-w-0 rounded-lg p-4">
              <h3 className="mb-3 text-sm font-medium">非功能需求</h3>
              <MarkdownView content={story.nonFunctionalRequirements} />
            </div>
          </div>
        </PageSection>
      </div>
    </PageContainer>
  );
}
