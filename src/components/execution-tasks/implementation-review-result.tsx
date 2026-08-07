import {
  AcceptanceCriterionReviewStatus,
  ImplementationFindingSeverity,
  ImplementationFindingType,
  ImplementationReviewConclusion,
  RequirementImplementationStatus,
  TestCoverageStatus,
} from "@/generated/prisma/enums";

import { PageSection } from "@/components/layout/page-section";
import { ButtonLink } from "@/components/navigation/button-link";
import { Badge } from "@/components/ui/badge";
import type {
  AiExecutionImplementationReviewResult,
  ImplementationReviewEvidence,
} from "@/lib/execution-tasks/types";

const CONCLUSION_LABELS = {
  [ImplementationReviewConclusion.PASSED]: "通过",
  [ImplementationReviewConclusion.FAILED]: "未通过",
  [ImplementationReviewConclusion.NEEDS_CONFIRMATION]: "需人工确认",
};

const IMPLEMENTATION_LABELS = {
  [RequirementImplementationStatus.IMPLEMENTED]: "已实现",
  [RequirementImplementationStatus.PARTIALLY_IMPLEMENTED]: "部分实现",
  [RequirementImplementationStatus.NOT_IMPLEMENTED]: "未实现",
  [RequirementImplementationStatus.UNCONFIRMED]: "无法确认",
};

const COVERAGE_LABELS = {
  [TestCoverageStatus.SUFFICIENT]: "覆盖充分",
  [TestCoverageStatus.INSUFFICIENT]: "覆盖不足",
  [TestCoverageStatus.UNCONFIRMED]: "无法确认",
};

const CRITERION_LABELS = {
  [AcceptanceCriterionReviewStatus.SATISFIED]: "满足",
  [AcceptanceCriterionReviewStatus.VIOLATED]: "不满足",
  [AcceptanceCriterionReviewStatus.UNCONFIRMED]: "无法确认",
};

const FINDING_LABELS = {
  [ImplementationFindingType.MISSING_IMPLEMENTATION]: "功能未实现",
  [ImplementationFindingType.INCORRECT_IMPLEMENTATION]: "实现行为错误",
  [ImplementationFindingType.CONFIRMED_BUG]: "明确 Bug",
  [ImplementationFindingType.POTENTIAL_DEFECT]: "潜在缺陷",
  [ImplementationFindingType.TEST_COVERAGE_GAP]: "用例覆盖缺失",
  [ImplementationFindingType.REQUIREMENT_AMBIGUITY]: "需求存在歧义",
};

const SEVERITY_LABELS = {
  [ImplementationFindingSeverity.BLOCKER]: "阻断",
  [ImplementationFindingSeverity.MAJOR]: "主要",
  [ImplementationFindingSeverity.MINOR]: "次要",
};

function EvidenceList({ items }: { items: ImplementationReviewEvidence[] }) {
  if (!items.length) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      {items.map((evidence, index) => (
        <p key={`${evidence.path}-${index}`} className="text-xs break-all">
          {evidence.repository} / {evidence.path}:{evidence.lineStart}-
          {evidence.lineEnd} · {evidence.summary}
        </p>
      ))}
    </div>
  );
}

export function ImplementationReviewResult({
  result,
}: {
  result: AiExecutionImplementationReviewResult;
}) {
  return (
    <PageSection title="需求实现审查结果">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              result.conclusion === ImplementationReviewConclusion.PASSED
                ? "success"
                : result.conclusion === ImplementationReviewConclusion.FAILED
                  ? "destructive"
                  : "warning"
            }
          >
            {CONCLUSION_LABELS[result.conclusion]}
          </Badge>
          <span className="text-muted-foreground text-sm">
            {result.deliveryVersion.code} · {result.deliveryVersion.name}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4 min-[1440px]:grid-cols-4">
          {[
            ["审查 US", result.totalCount],
            ["已实现", result.implementedCount],
            ["部分实现", result.partialCount],
            ["未实现", result.notImplementedCount],
            ["无法确认", result.unconfirmedCount],
            ["覆盖不足", result.coverageGapCount],
            ["问题", result.findingCount],
          ].map(([label, value]) => (
            <div key={label} className="bg-muted/40 rounded-lg p-3">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="mt-1 text-lg font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-4">
          {result.items.map((item) => (
            <section
              key={item.userStoryId}
              className="bg-muted/30 flex flex-col gap-4 rounded-lg p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <ButtonLink
                    href={`/user-stories/${item.userStoryId}`}
                    variant="link"
                    className="h-auto justify-start p-0 font-medium"
                  >
                    {item.code} · {item.title}
                  </ButtonLink>
                  <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                    {item.summary}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge variant="outline">
                    {IMPLEMENTATION_LABELS[item.implementationStatus]}
                  </Badge>
                  <Badge variant="outline">
                    {COVERAGE_LABELS[item.coverageStatus]}
                  </Badge>
                </div>
              </div>

              {item.findings.length ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">问题</h3>
                  {item.findings.map((finding, index) => (
                    <div
                      key={`${finding.type}-${index}`}
                      className="bg-background rounded-md p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            finding.severity ===
                            ImplementationFindingSeverity.BLOCKER
                              ? "destructive"
                              : finding.severity ===
                                  ImplementationFindingSeverity.MAJOR
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {SEVERITY_LABELS[finding.severity]}
                        </Badge>
                        <span className="font-medium">
                          {FINDING_LABELS[finding.type]}：{finding.title}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
                        {finding.detail}
                      </p>
                      <EvidenceList items={finding.evidence} />
                    </div>
                  ))}
                </div>
              ) : null}

              {item.criteria.length ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">验收标准</h3>
                  {item.criteria.map((criterion) => (
                    <div
                      key={criterion.position}
                      className="bg-background rounded-md p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          验收标准 {criterion.position}
                        </span>
                        <Badge variant="outline">
                          {CRITERION_LABELS[criterion.status]}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
                        {criterion.reason}
                      </p>
                      <EvidenceList items={criterion.evidence} />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </PageSection>
  );
}
