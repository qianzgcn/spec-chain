"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { createImplementationReviewExecutionAction } from "@/app/actions/execution-tasks";
import { ButtonLink } from "@/components/navigation/button-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function ImplementationReviewAction({
  deliveryVersionId,
  activeTaskId,
}: {
  deliveryVersionId: string;
  activeTaskId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (activeTaskId) {
    return (
      <ButtonLink href={`/execution-tasks/${activeTaskId}`}>
        查看审查任务
      </ButtonLink>
    );
  }

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await createImplementationReviewExecutionAction({
            deliveryVersionId,
          });
          if (!result.ok || !result.data) {
            toast.add({ type: "error", description: result.message });
            return;
          }
          toast.add({ type: "success", description: result.message });
          router.push(`/execution-tasks/${result.data.id}`);
        })
      }
    >
      {isPending ? <Spinner data-icon="inline-start" /> : null}
      需求实现审查
    </Button>
  );
}
