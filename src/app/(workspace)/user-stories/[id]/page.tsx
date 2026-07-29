import type { Metadata } from "next";

import { Button, Tag } from "antd";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { RequirementDetailActions } from "@/components/requirements/requirement-detail-actions";
import { UserStoryStatusSelect } from "@/components/requirements/user-story-status-select";
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
    <div className="page-shell">
      <PageHeader
        title={story.title}
        meta={
          <>
            <Tag>US</Tag>
            <span className="page-code">{story.code}</span>
            {story.feature ? (
              <Button
                type="link"
                size="small"
                className="!h-auto !p-0"
                href={`/features/${story.feature.id}`}
              >
                {story.feature.code} · {story.feature.name}
              </Button>
            ) : (
              <span>未归属 FE</span>
            )}
          </>
        }
        actions={
          <>
            <UserStoryStatusSelect id={story.id} status={story.status} />
            <RequirementDetailActions type="USER_STORY" id={story.id} />
          </>
        }
      />

      <div className="detail-sections">
        <PageSection title="用户故事">
          <dl className="user-story-triplet user-story-triplet--detail">
            <div>
              <dt>As</dt>
              <dd>{story.asA}</dd>
            </div>
            <div>
              <dt>I want</dt>
              <dd>{story.iWant}</dd>
            </div>
            <div>
              <dt>so that</dt>
              <dd>{story.soThat}</dd>
            </div>
          </dl>
        </PageSection>

        <PageSection title="验收标准">
          <div className="acceptance-detail">
            <div className="acceptance-detail__head" aria-hidden>
              <span>序号</span>
              <span>Given</span>
              <span>When</span>
              <span>Then</span>
            </div>
            {story.acceptanceCriteria.map((criterion, index) => (
              <div className="acceptance-detail__row" key={criterion.id}>
                <span>{index + 1}</span>
                <p>{criterion.given}</p>
                <p>{criterion.when}</p>
                <p>{criterion.then}</p>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection title="补充约束">
          <div className="detail-two-columns">
            <div>
              <h3>业务规则</h3>
              <MarkdownView content={story.businessRules} />
            </div>
            <div>
              <h3>非功能需求</h3>
              <MarkdownView content={story.nonFunctionalRequirements} />
            </div>
          </div>
        </PageSection>
      </div>
    </div>
  );
}
