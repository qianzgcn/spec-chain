"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { createConsistencyCheckExecutionAction } from "@/app/actions/execution-tasks";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function ConsistencyCheckForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const result = await createConsistencyCheckExecutionAction();
      if (!result.ok || !result.data) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      toast.add({ type: "success", description: result.message });
      router.push(`/execution-tasks/${result.data.id}`);
    });
  }

  return (
    <Button disabled={disabled || isPending} onClick={start}>
      {isPending ? <Spinner data-icon="inline-start" /> : null}
      开始检查
    </Button>
  );
}
