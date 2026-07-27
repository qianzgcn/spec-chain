import type { Metadata } from "next";

import { Button, Tag } from "antd";
import { notFound } from "next/navigation";

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
      <div className="page-heading">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Tag color="cyan">US</Tag>
            <span className="font-mono text-xs text-slate-500">
              {story.code}
            </span>
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
              <span className="text-xs text-slate-500">未归属 FE</span>
            )}
          </div>
          <h1 className="page-title">{story.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <UserStoryStatusSelect id={story.id} status={story.status} />
          <RequirementDetailActions type="USER_STORY" id={story.id} />
        </div>
      </div>

      <div className="content-panel max-w-[1180px]">
        <section className="border-b border-slate-200 px-7 py-6">
          <h2 className="mb-5 text-base font-semibold text-slate-800">
            用户故事
          </h2>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-5 gap-y-4 text-sm">
            <dt className="font-semibold text-slate-500">As</dt>
            <dd className="m-0 whitespace-pre-wrap text-slate-800">
              {story.asA}
            </dd>
            <dt className="font-semibold text-slate-500">I want</dt>
            <dd className="m-0 whitespace-pre-wrap text-slate-800">
              {story.iWant}
            </dd>
            <dt className="font-semibold text-slate-500">so that</dt>
            <dd className="m-0 whitespace-pre-wrap text-slate-800">
              {story.soThat}
            </dd>
          </dl>
        </section>

        <section className="border-b border-slate-200 px-7 py-6">
          <h2 className="mb-5 text-base font-semibold text-slate-800">
            验收标准
          </h2>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {story.acceptanceCriteria.map((criterion, index) => (
              <div
                key={criterion.id}
                className="grid grid-cols-[48px_repeat(3,minmax(0,1fr))] gap-5 py-5"
              >
                <span className="text-sm font-semibold text-slate-400">
                  {index + 1}
                </span>
                <div>
                  <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Given
                  </div>
                  <p className="m-0 text-sm leading-6 whitespace-pre-wrap text-slate-800">
                    {criterion.given}
                  </p>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    When
                  </div>
                  <p className="m-0 text-sm leading-6 whitespace-pre-wrap text-slate-800">
                    {criterion.when}
                  </p>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Then
                  </div>
                  <p className="m-0 text-sm leading-6 whitespace-pre-wrap text-slate-800">
                    {criterion.then}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 divide-x divide-slate-200">
          <div className="px-7 py-6">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              业务规则
            </h2>
            <MarkdownView content={story.businessRules} />
          </div>
          <div className="px-7 py-6">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              非功能需求
            </h2>
            <MarkdownView content={story.nonFunctionalRequirements} />
          </div>
        </section>
      </div>
    </div>
  );
}
