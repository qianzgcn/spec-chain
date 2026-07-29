"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { updateUserStoryStatusAction } from "@/app/actions/requirements";
import { RequirementStatusSelectControl } from "@/components/requirements/requirement-status-select-control";
import { toast } from "@/components/ui/toast";
import { RequirementStatus } from "@/generated/prisma/enums";

export function UserStoryStatusSelect({
  id,
  status,
}: {
  id: string;
  status: RequirementStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function change(value: RequirementStatus) {
    startTransition(async () => {
      const result = await updateUserStoryStatusAction(id, value);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      toast.add({ type: "success", description: result.message });
      router.refresh();
    });
  }

  return (
    <RequirementStatusSelectControl
      value={status}
      onChange={change}
      loading={isPending}
      disabled={isPending}
      size="middle"
    />
  );
}
