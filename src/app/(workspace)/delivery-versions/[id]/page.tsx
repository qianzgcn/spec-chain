import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { DeliveryVerificationAction } from "@/components/delivery-versions/delivery-verification-action";
import { DeliveryVersionHeaderActions } from "@/components/delivery-versions/delivery-version-header-actions";
import { ImplementationReviewAction } from "@/components/delivery-versions/implementation-review-action";
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
import {
  AiCapability,
  AiExecutionStatus,
  ImplementationReviewConclusion,
  RequirementImplementationStatus,
  RunStatus,
  TestCoverageStatus,
} from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { DELIVERY_VERSION_STATUS_META } from "@/lib/delivery-versions/meta";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";
import {
  createDeliverySpecificationFingerprint,
  createRegressionFingerprint,
} from "@/server/delivery-versions/fingerprint";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = { title: "交付版本详情" };

const REVIEW_LABELS = {
  [ImplementationReviewConclusion.PASSED]: "通过",
  [ImplementationReviewConclusion.FAILED]: "未通过",
  [ImplementationReviewConclusion.NEEDS_CONFIRMATION]: "需人工确认",
};

const REVIEW_VARIANTS = {
  [ImplementationReviewConclusion.PASSED]: "success" as const,
  [ImplementationReviewConclusion.FAILED]: "destructive" as const,
  [ImplementationReviewConclusion.NEEDS_CONFIRMATION]: "warning" as const,
};

const ACTIVE_RUN_STATUSES = new Set<RunStatus>([
  RunStatus.QUEUED,
  RunStatus.RUNNING,
]);
const FAILED_RUN_STATUSES = new Set<RunStatus>([
  RunStatus.FAILED,
  RunStatus.TIMED_OUT,
]);

export default async function DeliveryVersionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const [version, platformCases, activeReview] = await Promise.all([
    db.deliveryVersion.findFirst({
      where: { id, projectId: project.id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        status: true,
        lockedAt: true,
        createdAt: true,
        updatedAt: true,
        currentForProject: { select: { id: true } },
        createdBy: { select: { username: true } },
        lockedBy: { select: { username: true } },
        deliveredBy: { select: { username: true } },
        deliveredAt: true,
        userStories: {
          where: { deletedAt: null },
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            title: true,
            asA: true,
            iWant: true,
            soThat: true,
            status: true,
            businessRules: true,
            nonFunctionalRequirements: true,
            acceptanceCriteria: {
              where: { deletedAt: null },
              orderBy: { position: "asc" },
              select: { position: true, given: true, when: true, then: true },
            },
            testCases: {
              where: { deletedAt: null, enabled: true },
              orderBy: { code: "asc" },
              select: {
                id: true,
                code: true,
                name: true,
                preconditions: true,
                steps: true,
                enabled: true,
                script: true,
                scriptSource: true,
                aiScriptFingerprint: true,
                userStoryId: true,
              },
            },
          },
        },
        implementationReviews: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            conclusion: true,
            specificationFingerprint: true,
            repositorySnapshot: true,
            createdAt: true,
            execution: { select: { id: true, deletedAt: true } },
            items: {
              select: {
                implementationStatus: true,
                coverageStatus: true,
                _count: { select: { findings: true } },
              },
            },
          },
        },
        verificationBatches: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            specificationFingerprint: true,
            regressionFingerprint: true,
            repositorySnapshot: true,
            createdAt: true,
            requestedBy: { select: { username: true } },
            items: {
              select: {
                caseType: true,
                testCaseId: true,
                testCaseCodeSnapshot: true,
                testCaseNameSnapshot: true,
                testCase: { select: { script: true } },
                testRun: {
                  select: { id: true, status: true, scriptSnapshot: true },
                },
              },
            },
          },
        },
      },
    }),
    db.testCase.findMany({
      where: {
        projectId: project.id,
        userStoryId: null,
        enabled: true,
        deletedAt: null,
      },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        preconditions: true,
        steps: true,
        enabled: true,
        script: true,
        scriptSource: true,
        aiScriptFingerprint: true,
        userStoryId: true,
      },
    }),
    db.aiExecution.findFirst({
      where: {
        projectId: project.id,
        capability: AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
        status: { in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING] },
        deletedAt: null,
      },
      orderBy: { queuedAt: "asc" },
      select: { id: true },
    }),
  ]);
  if (!version) notFound();

  const requirementCases = version.userStories.flatMap(
    (story) => story.testCases,
  );
  const currentSpecificationFingerprint =
    createDeliverySpecificationFingerprint(version.userStories);
  const currentRegressionFingerprint = createRegressionFingerprint([
    ...requirementCases,
    ...platformCases,
  ]);
  const reviewHistory = version.implementationReviews.map((review) => ({
    ...review,
    stale: review.specificationFingerprint !== currentSpecificationFingerprint,
    findingCount: review.items.reduce(
      (count, item) => count + item._count.findings,
      0,
    ),
  }));
  const verificationHistory = version.verificationBatches.map((batch) => ({
    ...batch,
    active: batch.items.some((item) =>
      ACTIVE_RUN_STATUSES.has(item.testRun.status),
    ),
    passed: Boolean(
      batch.items.length &&
      batch.items.every((item) => item.testRun.status === RunStatus.PASSED),
    ),
    passedCount: batch.items.filter(
      (item) => item.testRun.status === RunStatus.PASSED,
    ).length,
    stale:
      batch.specificationFingerprint !== currentSpecificationFingerprint ||
      batch.regressionFingerprint !== currentRegressionFingerprint ||
      batch.items.some(
        (item) => item.testCase.script !== item.testRun.scriptSnapshot,
      ),
  }));
  const latestReview = reviewHistory[0] ?? null;
  const latestBatch = verificationHistory[0] ?? null;
  const reviewStale = latestReview?.stale ?? false;
  const batchStale = latestBatch?.stale ?? false;
  const commitsAligned = Boolean(
    latestReview &&
    latestBatch &&
    latestReview.repositorySnapshot === latestBatch.repositorySnapshot,
  );
  const batchActive = latestBatch?.active ?? false;
  const batchPassed = latestBatch?.passed ?? false;
  const uncoveredStoryCount = version.userStories.filter(
    (story) => story.testCases.length === 0,
  ).length;
  const verificationComplete = Boolean(
    latestReview &&
    !reviewStale &&
    latestReview.conclusion === ImplementationReviewConclusion.PASSED &&
    latestBatch &&
    !batchStale &&
    batchPassed &&
    commitsAligned &&
    uncoveredStoryCount === 0,
  );
  const deliveryRisks = [
    !latestReview
      ? "尚未完成需求实现审查"
      : reviewStale
        ? "最新需求实现审查已过期"
        : latestReview.conclusion !== ImplementationReviewConclusion.PASSED
          ? `需求实现审查${REVIEW_LABELS[latestReview.conclusion]}`
          : null,
    !latestBatch
      ? "尚未运行交付验证"
      : batchStale
        ? "最新交付验证已过期"
        : batchActive
          ? "交付验证仍在运行"
          : !batchPassed
            ? "交付验证存在失败用例"
            : null,
    latestReview && latestBatch && !commitsAligned
      ? "审查与测试针对的代码提交不一致"
      : null,
    uncoveredStoryCount ? `${uncoveredStoryCount} 条 US 没有需求用例` : null,
  ].filter(Boolean);
  const statusMeta = DELIVERY_VERSION_STATUS_META[version.status];

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title={version.name}
        description={version.description ?? undefined}
        meta={
          <>
            <span className="font-mono text-xs">{version.code}</span>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
            <Badge variant={version.lockedAt ? "secondary" : "outline"}>
              {version.lockedAt ? "需求已锁定" : "需求未锁定"}
            </Badge>
            {version.currentForProject ? (
              <Badge variant="info">当前版本</Badge>
            ) : null}
            <Badge variant={verificationComplete ? "success" : "warning"}>
              {verificationComplete ? "验证完整" : "存在交付风险"}
            </Badge>
          </>
        }
        actions={
          <DeliveryVersionHeaderActions
            id={version.id}
            status={version.status}
            locked={Boolean(version.lockedAt)}
            current={Boolean(version.currentForProject)}
            deliverySummary={
              verificationComplete
                ? "需求实现审查和自动化验证均已通过。"
                : `当前仍有以下风险：${deliveryRisks.join("；") || "验证信息不完整"}。`
            }
          />
        }
      />

      <PageSection title="需求范围">
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-4 min-[1440px]:grid-cols-4">
            {[
              ["US", version.userStories.length],
              ["需求用例", requirementCases.length],
              ["未覆盖 US", uncoveredStoryCount],
              ["平台回归用例", platformCases.length],
            ].map(([label, value]) => (
              <div key={label} className="bg-muted/40 rounded-lg p-3">
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="mt-1 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {version.userStories.length ? (
            <Table containerClassName="rounded-lg border">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>US</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>需求用例</TableHead>
                  <TableHead>覆盖</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {version.userStories.map((story) => (
                  <TableRow key={story.id}>
                    <TableCell>
                      <Link
                        href={`/user-stories/${story.id}`}
                        className="text-link font-medium underline-offset-4 hover:underline"
                      >
                        {story.code} · {story.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {REQUIREMENT_STATUS_META[story.status].label}
                    </TableCell>
                    <TableCell>{story.testCases.length}</TableCell>
                    <TableCell>
                      <Badge
                        variant={story.testCases.length ? "success" : "warning"}
                      >
                        {story.testCases.length ? "已覆盖" : "未覆盖"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">当前版本暂无 US。</p>
          )}
        </div>
      </PageSection>

      <PageSection
        title="需求实现审查"
        description="以锁定的需求为权威来源，静态分析代码实现和测试覆盖。"
        actions={
          <ImplementationReviewAction
            deliveryVersionId={version.id}
            activeTaskId={activeReview?.id ?? null}
          />
        }
      >
        {latestReview ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={REVIEW_VARIANTS[latestReview.conclusion]}>
                {REVIEW_LABELS[latestReview.conclusion]}
              </Badge>
              {reviewStale ? <Badge variant="warning">已过期</Badge> : null}
              <span className="text-muted-foreground text-sm">
                {formatDetailedDateTime(latestReview.createdAt.toISOString())}
              </span>
              {latestReview.execution.deletedAt ? (
                <span className="text-muted-foreground text-sm">
                  任务已删除
                </span>
              ) : (
                <ButtonLink
                  href={`/execution-tasks/${latestReview.execution.id}`}
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                >
                  查看报告
                </ButtonLink>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-4 min-[1440px]:grid-cols-4">
              {[
                ["审查 US", latestReview.items.length],
                [
                  "已实现",
                  latestReview.items.filter(
                    (item) =>
                      item.implementationStatus ===
                      RequirementImplementationStatus.IMPLEMENTED,
                  ).length,
                ],
                [
                  "覆盖不足",
                  latestReview.items.filter(
                    (item) =>
                      item.coverageStatus === TestCoverageStatus.INSUFFICIENT,
                  ).length,
                ],
                [
                  "问题",
                  latestReview.items.reduce(
                    (count, item) => count + item._count.findings,
                    0,
                  ),
                ],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted/40 rounded-lg p-3">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {reviewHistory.length > 1 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">历史审查</h3>
                <Table containerClassName="rounded-lg border">
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>完成时间</TableHead>
                      <TableHead>结论</TableHead>
                      <TableHead>审查 US</TableHead>
                      <TableHead>问题</TableHead>
                      <TableHead>基线</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewHistory.slice(1).map((review) => (
                      <TableRow key={review.id}>
                        <TableCell>
                          {formatDetailedDateTime(
                            review.createdAt.toISOString(),
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={REVIEW_VARIANTS[review.conclusion]}>
                            {REVIEW_LABELS[review.conclusion]}
                          </Badge>
                        </TableCell>
                        <TableCell>{review.items.length}</TableCell>
                        <TableCell>{review.findingCount}</TableCell>
                        <TableCell>
                          {review.stale ? (
                            <Badge variant="warning">已过期</Badge>
                          ) : (
                            <Badge variant="outline">当前</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {review.execution.deletedAt ? (
                            <span className="text-muted-foreground">
                              已删除
                            </span>
                          ) : (
                            <ButtonLink
                              href={`/execution-tasks/${review.execution.id}`}
                              variant="link"
                              size="sm"
                            >
                              查看报告
                            </ButtonLink>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            尚未进行需求实现审查。
          </p>
        )}
      </PageSection>

      <PageSection
        title="自动化验证"
        description="运行当前版本的启用需求用例，以及项目全部启用的平台用例。"
        actions={<DeliveryVerificationAction deliveryVersionId={version.id} />}
      >
        {latestBatch ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  batchActive ? "info" : batchPassed ? "success" : "destructive"
                }
              >
                {batchActive ? "运行中" : batchPassed ? "全部通过" : "存在失败"}
              </Badge>
              {batchStale ? <Badge variant="warning">已过期</Badge> : null}
              {latestReview && !commitsAligned ? (
                <Badge variant="warning">与审查提交不一致</Badge>
              ) : null}
              <span className="text-muted-foreground text-sm">
                {formatDetailedDateTime(latestBatch.createdAt.toISOString())}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-4 min-[1440px]:grid-cols-4">
              {[
                ["运行用例", latestBatch.items.length],
                [
                  "通过",
                  latestBatch.items.filter(
                    (item) => item.testRun.status === RunStatus.PASSED,
                  ).length,
                ],
                [
                  "失败",
                  latestBatch.items.filter((item) =>
                    FAILED_RUN_STATUSES.has(item.testRun.status),
                  ).length,
                ],
                [
                  "执行中",
                  latestBatch.items.filter((item) =>
                    ACTIVE_RUN_STATUSES.has(item.testRun.status),
                  ).length,
                ],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted/40 rounded-lg p-3">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {latestBatch.items.some(
              (item) => item.testRun.status !== RunStatus.PASSED,
            ) ? (
              <div className="flex flex-col gap-2">
                {latestBatch.items
                  .filter((item) => item.testRun.status !== RunStatus.PASSED)
                  .map((item) => (
                    <div
                      key={item.testRun.id}
                      className="bg-muted/40 flex items-center justify-between gap-4 rounded-lg p-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {item.testCaseCodeSnapshot} ·{" "}
                        {item.testCaseNameSnapshot}
                      </span>
                      <ButtonLink
                        href={`/test-cases/${item.testCaseId}/runs`}
                        variant="link"
                        size="sm"
                      >
                        查看执行记录
                      </ButtonLink>
                    </div>
                  ))}
              </div>
            ) : null}
            {verificationHistory.length > 1 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">历史验证</h3>
                <Table containerClassName="rounded-lg border">
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>发起时间</TableHead>
                      <TableHead>发起用户</TableHead>
                      <TableHead>结果</TableHead>
                      <TableHead>通过用例</TableHead>
                      <TableHead>基线</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {verificationHistory.slice(1).map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell>
                          {formatDetailedDateTime(
                            batch.createdAt.toISOString(),
                          )}
                        </TableCell>
                        <TableCell>{batch.requestedBy.username}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              batch.active
                                ? "info"
                                : batch.passed
                                  ? "success"
                                  : "destructive"
                            }
                          >
                            {batch.active
                              ? "运行中"
                              : batch.passed
                                ? "全部通过"
                                : "存在失败"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {batch.passedCount}/{batch.items.length}
                        </TableCell>
                        <TableCell>
                          {batch.stale ? (
                            <Badge variant="warning">已过期</Badge>
                          ) : (
                            <Badge variant="outline">当前</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">尚未运行交付验证。</p>
        )}
      </PageSection>
    </PageContainer>
  );
}
