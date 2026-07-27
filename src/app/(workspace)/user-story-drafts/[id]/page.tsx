import type { Metadata } from "next";

import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import { Button, Tag } from "antd";
import { notFound, redirect } from "next/navigation";

import {
  UserStoryForm,
  type UserStoryFormValues,
} from "@/components/requirements/user-story-form";
import { RequirementStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "评审US草稿",
};

export default async function UserStoryDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const draft = await db.userStoryDraft.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      status: true,
      title: true,
      asA: true,
      iWant: true,
      soThat: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      confirmedUserStoryId: true,
      sourceExecutionId: true,
      feature: { select: { id: true, code: true, name: true } },
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
  if (draft.confirmedUserStoryId) {
    redirect(`/user-stories/${draft.confirmedUserStoryId}`);
  }

  const initialValues: UserStoryFormValues = {
    title: draft.title,
    asA: draft.asA,
    iWant: draft.iWant,
    soThat: draft.soThat,
    status: RequirementStatus.DESIGN,
    acceptanceCriteria: draft.acceptanceCriteria,
    businessRules: draft.businessRules ?? "",
    nonFunctionalRequirements: draft.nonFunctionalRequirements ?? "",
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="mb-2">
            <Tag color="cyan">AI 生成 · 待评审</Tag>
          </div>
          <h1 className="page-title">评审US草稿</h1>
          <p className="page-description">
            可以修改生成结果；确认后才会创建正式 US，初始状态为“设计”。
          </p>
        </div>
        <Button
          icon={<ArrowLeftOutlined />}
          href={`/ai-executions/${draft.sourceExecutionId}`}
        >
          查看执行详情
        </Button>
      </div>

      <UserStoryForm
        draftId={draft.id}
        sourceExecutionId={draft.sourceExecutionId}
        feature={draft.feature}
        initialValues={initialValues}
      />
    </div>
  );
}
