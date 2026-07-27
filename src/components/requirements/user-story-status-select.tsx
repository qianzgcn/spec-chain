"use client";

import { useTransition } from "react";

import { Select, message } from "antd";
import { useRouter } from "next/navigation";

import { updateUserStoryStatusAction } from "@/app/actions/requirements";
import { RequirementStatus } from "@/generated/prisma/enums";
import { REQUIREMENT_STATUS_META } from "@/lib/requirements/status";

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
      <Select
        value={status}
        onChange={change}
        loading={isPending}
        className="w-28"
        options={Object.values(RequirementStatus).map((value) => ({
          value,
          label: REQUIREMENT_STATUS_META[value].label,
        }))}
      />
    </>
  );
}
