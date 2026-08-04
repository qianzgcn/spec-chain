import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { ButtonLink } from "@/components/navigation/button-link";
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
import {
  formatVersionRepositorySnapshot,
  VERSION_SOURCE_LABELS,
} from "@/lib/versions/meta";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = { title: "US 版本历史" };

export default async function UserStoryVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  const [{ id }, query, project] = await Promise.all([
    params,
    searchParams,
    getCurrentProject(),
  ]);
  if (!project) notFound();
  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      code: true,
      title: true,
      currentVersion: true,
      asA: true,
      iWant: true,
      soThat: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { given: true, when: true, then: true },
      },
      versions: {
        orderBy: { version: "desc" },
        select: {
          version: true,
          asA: true,
          iWant: true,
          soThat: true,
          businessRules: true,
          nonFunctionalRequirements: true,
          source: true,
          changeSummary: true,
          repositorySnapshot: true,
          createdAt: true,
          createdBy: { select: { username: true } },
          acceptanceCriteria: {
            orderBy: { position: "asc" },
            select: { given: true, when: true, then: true },
          },
        },
      },
    },
  });
  if (!story) notFound();
  const compareVersion = Number.parseInt(query.compare ?? "", 10);
  const selected = Number.isFinite(compareVersion)
    ? story.versions.find((version) => version.version === compareVersion)
    : null;

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title="US 版本历史"
        meta={
          <>
            <span className="font-mono">{story.code}</span>
            <span>{story.title}</span>
            <Badge variant="secondary">当前 v{story.currentVersion}</Badge>
          </>
        }
        actions={
          <ButtonLink href={`/user-stories/${story.id}`}>返回详情</ButtonLink>
        }
      />

      {selected && selected.version !== story.currentVersion ? (
        <PageSection
          title={`v${selected.version} / 当前 v${story.currentVersion}`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { label: `v${selected.version}`, value: selected },
              { label: `当前 v${story.currentVersion}`, value: story },
            ].map((column) => (
              <div key={column.label} className="bg-muted/40 rounded-lg p-4">
                <h3 className="mb-3 font-medium">{column.label}</h3>
                <dl className="flex flex-col gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">As</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {column.value.asA}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">I want</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {column.value.iWant}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">so that</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {column.value.soThat}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">业务规则</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {column.value.businessRules ?? "无"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      非功能需求
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {column.value.nonFunctionalRequirements ?? "无"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">验收标准</dt>
                    <dd className="mt-1 flex flex-col gap-2">
                      {column.value.acceptanceCriteria.map(
                        (criterion, index) => (
                          <p key={index} className="whitespace-pre-wrap">
                            {index + 1}. Given {criterion.given}；When{" "}
                            {criterion.when}；Then {criterion.then}
                          </p>
                        ),
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </PageSection>
      ) : null}

      <PageSection title="版本记录">
        <Table containerClassName="rounded-lg border">
          <TableHeader className="bg-muted/50 text-muted-foreground text-xs">
            <TableRow>
              <TableHead className="px-4">版本</TableHead>
              <TableHead className="px-4">来源</TableHead>
              <TableHead className="px-4">操作人</TableHead>
              <TableHead className="px-4">时间</TableHead>
              <TableHead className="px-4">来源提交</TableHead>
              <TableHead className="px-4">变更摘要</TableHead>
              <TableHead className="px-4">
                <span className="sr-only">操作</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {story.versions.map((version) => (
              <TableRow key={version.version}>
                <TableCell className="px-4 font-medium">
                  v{version.version}
                </TableCell>
                <TableCell className="px-4">
                  {VERSION_SOURCE_LABELS[version.source]}
                </TableCell>
                <TableCell className="px-4">
                  {version.createdBy?.username ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground px-4">
                  {formatDetailedDateTime(version.createdAt.toISOString())}
                </TableCell>
                <TableCell className="max-w-48 px-4 font-mono text-xs">
                  <span
                    className="block truncate"
                    title={formatVersionRepositorySnapshot(
                      version.repositorySnapshot,
                    )}
                  >
                    {formatVersionRepositorySnapshot(
                      version.repositorySnapshot,
                    )}
                  </span>
                </TableCell>
                <TableCell className="max-w-sm px-4">
                  <span
                    className="block truncate"
                    title={version.changeSummary ?? ""}
                  >
                    {version.changeSummary ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="px-4 text-right">
                  {version.version !== story.currentVersion ? (
                    <ButtonLink
                      href={`/user-stories/${story.id}/versions?compare=${version.version}`}
                      variant="link"
                      size="sm"
                    >
                      与当前比较
                    </ButtonLink>
                  ) : (
                    <Badge variant="secondary">当前</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>
    </PageContainer>
  );
}
