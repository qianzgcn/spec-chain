import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PendingRequirementForm } from "@/components/requirements/pending-requirement-form";
import {
  AiDraftStatus,
  AiExecutionStatus,
  RequirementStatus,
} from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "评审需求",
};

export default async function PendingReviewRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const draft = await db.userStoryDraft.findFirst({
    where: {
      id,
      projectId: project.id,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
      sourceExecution: { status: AiExecutionStatus.SUCCEEDED },
    },
    select: {
      id: true,
      operation: true,
      baseVersion: true,
      changeReason: true,
      title: true,
      asA: true,
      iWant: true,
      soThat: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      feature: { select: { id: true, code: true, name: true } },
      targetUserStory: {
        select: {
          title: true,
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
        },
      },
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          given: true,
          when: true,
          then: true,
        },
      },
    },
  });
  if (!draft) notFound();

  return (
    <PendingRequirementForm
      draftId={draft.id}
      operation={draft.operation}
      baseVersion={draft.baseVersion}
      changeReason={draft.changeReason}
      currentValues={draft.targetUserStory}
      feature={draft.feature}
      initialValues={{
        title: draft.title,
        asA: draft.asA,
        iWant: draft.iWant,
        soThat: draft.soThat,
        status: RequirementStatus.DESIGN,
        acceptanceCriteria: draft.acceptanceCriteria,
        businessRules: draft.businessRules ?? "",
        nonFunctionalRequirements: draft.nonFunctionalRequirements ?? "",
      }}
    />
  );
}
