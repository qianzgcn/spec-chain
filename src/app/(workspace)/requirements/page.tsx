import type { Metadata } from "next";

import Link from "next/link";
import { PackageOpenIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/navigation/button-link";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import {
  RequirementsList,
  type RequirementListItem,
} from "@/components/requirements/requirements-list";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { RequirementStatus } from "@/generated/prisma/enums";
import { deriveFeatureStatus } from "@/lib/requirements/status";
import { parsePage, parsePageSize } from "@/lib/pagination";
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
  pageSize?: string;
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

  if (!project.currentDeliveryVersionId) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="需求列表"
          description="需求列表仅展示当前交付版本中的需求。"
        />
        <div className="bg-card grid min-h-72 place-items-center rounded-lg border">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageOpenIcon />
              </EmptyMedia>
              <EmptyTitle>当前没有交付版本</EmptyTitle>
              <EmptyDescription>
                请先创建交付版本，或将一个未锁定版本设为当前版本。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ButtonLink href="/delivery-versions">前往交付版本</ButtonLink>
            </EmptyContent>
          </Empty>
        </div>
      </PageContainer>
    );
  }

  const currentDeliveryVersionId = project.currentDeliveryVersionId;
  const [currentDeliveryVersion, features, independentStories] =
    await Promise.all([
      db.deliveryVersion.findFirstOrThrow({
        where: {
          id: currentDeliveryVersionId,
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, code: true, name: true },
      }),
      db.feature.findMany({
        where: {
          projectId: project.id,
          deletedAt: null,
          OR: [
            {
              userStories: {
                none: { deletedAt: null },
              },
            },
            {
              userStories: {
                some: {
                  deliveryVersionId: currentDeliveryVersionId,
                  deletedAt: null,
                },
              },
            },
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          createdBy: { select: { username: true } },
          updatedAt: true,
          userStories: {
            where: {
              deliveryVersionId: currentDeliveryVersionId,
              deletedAt: null,
            },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
            select: {
              id: true,
              code: true,
              title: true,
              status: true,
              createdBy: { select: { username: true } },
              updatedAt: true,
            },
          },
        },
      }),
      db.userStory.findMany({
        where: {
          projectId: project.id,
          featureId: null,
          deliveryVersionId: currentDeliveryVersionId,
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          createdBy: { select: { username: true } },
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
        createdBy: story.createdBy?.username ?? null,
        childCount: null,
        updatedAt: story.updatedAt.toISOString(),
      }),
    );
    const eligibleChildren = allChildren.filter(
      (story) => !status || story.status === status,
    );
    const matchingChildren = eligibleChildren.filter((story) =>
      matchesText(story.code, story.title, query),
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
              createdBy: feature.createdBy?.username ?? null,
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
        ? eligibleChildren
        : matchingChildren;

    return [
      {
        id: feature.id,
        type: "FEATURE",
        code: feature.code,
        title: feature.name,
        status: featureStatus,
        createdBy: feature.createdBy?.username ?? null,
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
      createdBy: story.createdBy?.username ?? null,
      childCount: null,
      updatedAt: story.updatedAt.toISOString(),
    }));

  const filteredItems = [...featureItems, ...independentItems].toSorted(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const pageSize = parsePageSize(params.pageSize);
  const requestedPage = parsePage(params.page);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const page = Math.min(pageCount, requestedPage);
  const items = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="需求列表"
        titleAccessory={
          <Link
            href={`/delivery-versions/${currentDeliveryVersion.id}`}
            className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
            title="点击查看交付版本详情"
          >
            <span className="size-1.5 rounded-full bg-emerald-500/80 group-hover:bg-emerald-500" />
            <span>当前交付：</span>
            <span className="font-semibold text-foreground group-hover:text-primary">
              {currentDeliveryVersion.name}
            </span>
          </Link>
        }
      />

      <RequirementsList
        items={items}
        total={filteredItems.length}
        filters={{
          q: params.q ?? "",
          type,
          status,
          page,
          pageSize,
        }}
      />
    </PageContainer>
  );
}
