import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import {
  RequirementsList,
  type RequirementListItem,
} from "@/components/requirements/requirements-list";
import { RequirementStatus } from "@/generated/prisma/enums";
import { deriveFeatureStatus } from "@/lib/requirements/status";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "需求",
};

type SearchParams = {
  q?: string;
  type?: string;
  status?: string;
  page?: string;
};

function matchesText(code: string, title: string, query: string) {
  return (
    !query || `${code} ${title}`.toLocaleLowerCase("zh-CN").includes(query)
  );
}

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, project] = await Promise.all([
    searchParams,
    getCurrentProject(),
  ]);

  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="需求列表"
          description="请先创建项目，再开始编写需求。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const [features, independentStories] = await Promise.all([
    db.feature.findMany({
      where: { projectId: project.id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        updatedAt: true,
        userStories: {
          where: { deletedAt: null },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    }),
    db.userStory.findMany({
      where: {
        projectId: project.id,
        featureId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    }),
  ]);

  const query = params.q?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const type =
    params.type === "FEATURE" || params.type === "USER_STORY"
      ? params.type
      : "";
  const status = Object.values(RequirementStatus).includes(
    params.status as RequirementStatus,
  )
    ? (params.status as RequirementStatus)
    : "";

  const featureItems = features.flatMap<RequirementListItem>((feature) => {
    const featureStatus = deriveFeatureStatus(
      feature.userStories.map((story) => story.status),
    );
    const allChildren: RequirementListItem[] = feature.userStories.map(
      (story) => ({
        id: story.id,
        type: "USER_STORY",
        code: story.code,
        title: story.title,
        status: story.status,
        childCount: null,
        updatedAt: story.updatedAt.toISOString(),
      }),
    );
    const matchingChildren = allChildren.filter(
      (story) =>
        matchesText(story.code, story.title, query) &&
        (!status || story.status === status),
    );
    const featureTextMatches = matchesText(feature.code, feature.name, query);
    const featureMatches =
      featureTextMatches && (!status || featureStatus === status);

    if (type === "USER_STORY") {
      return matchingChildren.length
        ? [
            {
              id: feature.id,
              type: "FEATURE",
              code: feature.code,
              title: feature.name,
              status: featureStatus,
              childCount: allChildren.length,
              updatedAt: feature.updatedAt.toISOString(),
              autoExpand: Boolean(query && matchingChildren.length),
              children: matchingChildren,
            },
          ]
        : [];
    }

    if (type === "FEATURE" && !featureMatches) {
      return [];
    }
    if (
      !type &&
      (query || status) &&
      !featureMatches &&
      !matchingChildren.length
    ) {
      return [];
    }

    const children =
      type === "FEATURE" || (!query && !status) || featureTextMatches
        ? allChildren.filter((story) => !status || story.status === status)
        : matchingChildren;

    return [
      {
        id: feature.id,
        type: "FEATURE",
        code: feature.code,
        title: feature.name,
        status: featureStatus,
        childCount: allChildren.length,
        updatedAt: feature.updatedAt.toISOString(),
        autoExpand: Boolean(query && matchingChildren.length),
        ...(children.length ? { children } : {}),
      },
    ];
  });

  const independentItems: RequirementListItem[] = independentStories
    .filter(
      (story) =>
        type !== "FEATURE" &&
        matchesText(story.code, story.title, query) &&
        (!status || story.status === status),
    )
    .map((story) => ({
      id: story.id,
      type: "USER_STORY",
      code: story.code,
      title: story.title,
      status: story.status,
      childCount: null,
      updatedAt: story.updatedAt.toISOString(),
    }));

  const filteredItems = [...featureItems, ...independentItems].toSorted(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 20));
  const page = Math.min(
    pageCount,
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  );
  const items = filteredItems.slice((page - 1) * 20, page * 20);

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="需求列表"
      />

      <RequirementsList
        items={items}
        total={filteredItems.length}
        filters={{
          q: params.q ?? "",
          type,
          status,
          page,
        }}
      />
    </PageContainer>
  );
}
