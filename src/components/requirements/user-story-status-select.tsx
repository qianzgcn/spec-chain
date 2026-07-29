"use client";

import { useTransition } from "react";

import { message } from "antd";
import { useRouter } from "next/navigation";

import { updateUserStoryStatusAction } from "@/app/actions/requirements";
import { RequirementStatusSelectControl } from "@/components/requirements/requirement-status-select-control";
import { RequirementStatus } from "@/generated/prisma/enums";

export function UserStoryStatusSelect({
  id,
  status,
}: {
  id: string;
  status: RequirementStatus;
}) {
  const router = useRouter();
  const [messageApi, messageContext] = message.useMessage();
  const [isPending, startTransition] = useTransition();

  function change(value: RequirementStatus) {
    startTransition(async () => {
      const result = await updateUserStoryStatusAction(id, value);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(result.message);
      router.refresh();
    });
  }

  return (
    <>
      {messageContext}
      <RequirementStatusSelectControl
        value={status}
        onChange={change}
        loading={isPending}
        disabled={isPending}
        size="middle"
      />
    </>
  );
}
