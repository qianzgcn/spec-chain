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

export const metadata: Metadata = { title: "测试用例版本历史" };

export default async function TestCaseVersionsPage({
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
  const testCase = await db.testCase.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      currentVersion: true,
      priority: true,
      preconditions: true,
      steps: true,
      group: { select: { name: true } },
      userStory: { select: { code: true, title: true } },
      versions: {
        orderBy: { version: "desc" },
        select: {
          version: true,
          name: true,
          priority: true,
          preconditions: true,
          steps: true,
          groupNameSnapshot: true,
          userStoryCodeSnapshot: true,
          userStoryTitleSnapshot: true,
          source: true,
          changeSummary: true,
          repositorySnapshot: true,
          createdAt: true,
          createdBy: { select: { username: true } },
        },
      },
    },
  });
  if (!testCase) notFound();
  const compareVersion = Number.parseInt(query.compare ?? "", 10);
  const selected = Number.isFinite(compareVersion)
    ? testCase.versions.find((version) => version.version === compareVersion)
    : null;
  const current = {
    name: testCase.name,
    priority: testCase.priority,
    preconditions: testCase.preconditions,
    steps: testCase.steps,
    groupNameSnapshot: testCase.group.name,
    userStoryCodeSnapshot: testCase.userStory?.code ?? null,
    userStoryTitleSnapshot: testCase.userStory?.title ?? null,
  };

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title="测试用例版本历史"
        meta={
          <>
            <span className="font-mono">{testCase.code}</span>
            <span>{testCase.name}</span>
            <Badge variant="secondary">当前 v{testCase.currentVersion}</Badge>
          </>
        }
        actions={
          <ButtonLink href={`/test-cases/${testCase.id}`}>返回详情</ButtonLink>
        }
      />
      {selected && selected.version !== testCase.currentVersion ? (
        <PageSection
          title={`v${selected.version} / 当前 v${testCase.currentVersion}`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { label: `v${selected.version}`, value: selected },
              { label: `当前 v${testCase.currentVersion}`, value: current },
            ].map((column) => (
              <div key={column.label} className="bg-muted/40 rounded-lg p-4">
                <h3 className="mb-3 font-medium">{column.label}</h3>
                <dl className="flex flex-col gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">名称</dt>
                    <dd className="mt-1">{column.value.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      分组 / 优先级
                    </dt>
                    <dd className="mt-1">
                      {column.value.groupNameSnapshot} · {column.value.priority}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">关联 US</dt>
                    <dd className="mt-1">
                      {column.value.userStoryCodeSnapshot
                        ? `${column.value.userStoryCodeSnapshot} · ${column.value.userStoryTitleSnapshot}`
                        : "平台用例"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">前置条件</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {column.value.preconditions ?? "无"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">测试步骤</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {column.value.steps}
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
            {testCase.versions.map((version) => (
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
                  {version.version !== testCase.currentVersion ? (
                    <ButtonLink
                      href={`/test-cases/${testCase.id}/versions?compare=${version.version}`}
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
