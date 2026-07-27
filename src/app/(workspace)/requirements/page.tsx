import type { Metadata } from "next";

import { Button, Empty } from "antd";

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
  feature?: string;
  page?: string;
};

type FilterableRequirementListItem = RequirementListItem & {
  featureId: string | null;
};

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
      <div className="page-shell">
        <div className="page-heading">
          <div>
            <h1 className="page-title">需求</h1>
            <p className="page-description">请先创建项目，再开始编写需求。</p>
          </div>
        </div>
        <div className="content-panel empty-panel">
          <Empty description="当前没有可用项目">
            <Button type="primary" href="/projects">
              创建项目
            </Button>
          </Empty>
        </div>
      </div>
    );
  }

  const [features, userStories] = await Promise.all([
    db.feature.findMany({
      where: { projectId: project.id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        updatedAt: true,
        userStories: {
          where: { deletedAt: null },
          select: { status: true },
        },
      },
    }),
    db.userStory.findMany({
      where: { projectId: project.id, deletedAt: null },
      select: {
        id: true,
        code: true,
        title: true,
        featureId: true,
        status: true,
        updatedAt: true,
        feature: {
          select: { name: true },
        },
      },
    }),
  ]);

  const allItems: FilterableRequirementListItem[] = [
    ...features.map((feature) => ({
      id: feature.id,
      type: "FEATURE" as const,
      code: feature.code,
      title: feature.name,
      featureId: null,
      featureName: null,
      status: deriveFeatureStatus(
        feature.userStories.map((story) => story.status),
      ),
      childCount: feature.userStories.length,
      updatedAt: feature.updatedAt.toISOString(),
    })),
    ...userStories.map((story) => ({
      id: story.id,
      type: "USER_STORY" as const,
      code: story.code,
      title: story.title,
      featureId: story.featureId,
      featureName: story.feature?.name ?? null,
      status: story.status,
      childCount: null,
      updatedAt: story.updatedAt.toISOString(),
    })),
  ];

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
  const featureFilter = params.feature ?? "";

  const filteredItems = allItems
    .filter((item) => {
      if (
        query &&
        !`${item.code} ${item.title}`.toLocaleLowerCase("zh-CN").includes(query)
      ) {
        return false;
      }
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      if (featureFilter) {
        if (item.type !== "USER_STORY") return false;
        if (featureFilter === "independent") return item.featureId === null;
        return item.featureId === featureFilter;
      }
      return true;
    })
    .toSorted(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 20));
  const page = Math.min(
    pageCount,
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  );
  const items: RequirementListItem[] = filteredItems
    .slice((page - 1) * 20, page * 20)
    .map((item) => ({
      id: item.id,
      type: item.type,
      code: item.code,
      title: item.title,
      featureName: item.featureName,
      status: item.status,
      childCount: item.childCount,
      updatedAt: item.updatedAt,
    }));

  return (
    <div className="page-shell page-shell--table">
      <div className="page-heading">
        <div>
          <h1 className="page-title">需求</h1>
          <p className="page-description">
            FE 与 US 在同一列表中管理；FE 状态由其全部子 US 自动计算。
          </p>
        </div>
      </div>

      <RequirementsList
        items={items}
        total={filteredItems.length}
        filters={{
          q: params.q ?? "",
          type,
          status,
          feature: featureFilter,
          page,
        }}
        featureOptions={features
          .map((feature) => ({
            id: feature.id,
            name: feature.name,
            code: feature.code,
          }))
          .toSorted((left, right) =>
            left.name.localeCompare(right.name, "zh-CN"),
          )}
      />
    </div>
  );
}
