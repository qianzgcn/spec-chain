"use client";

import { useState, useTransition } from "react";

import {
  HistoryIcon,
  PencilIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { createAutomationScriptExecutionAction } from "@/app/actions/execution-tasks";
import { deleteTestCaseAction } from "@/app/actions/test-cases";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ButtonLink } from "@/components/navigation/button-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import type { AutomationScriptStatus } from "@/automation/script-status";

export function TestCaseDetailActions({
  id,
  scriptStatus,
  hasBaseUrl,
  activeGenerationTaskId,
}: {
  id: string;
  scriptStatus: AutomationScriptStatus;
  hasBaseUrl: boolean;
  activeGenerationTaskId: string | null;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerateTransition] = useTransition();

  function generateScript() {
    startGenerateTransition(async () => {
      const result = await createAutomationScriptExecutionAction({
        testCaseId: id,
      });
      if (!result.ok || !result.data) {
        toast.add({ type: "error", description: result.message });
        return;
      }

      toast.add({
        type: "success",
        description: result.message ?? "脚本生成任务已进入队列",
      });
      router.push(`/execution-tasks/${result.data.id}`);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTestCaseAction(id);
      if (!result.ok) {
        toast.add({ type: "error", description: result.message });
        return;
      }
      setConfirmOpen(false);
      toast.add({ type: "success", description: result.message });
      router.push("/test-cases");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {activeGenerationTaskId ? (
          <ButtonLink href={`/execution-tasks/${activeGenerationTaskId}`}>
            <SparklesIcon data-icon="inline-start" />
            查看生成任务
          </ButtonLink>
        ) : (
          <Button
            disabled={!hasBaseUrl || isGenerating}
            title={hasBaseUrl ? undefined : "请先在测试设置中配置 Base URL"}
            onClick={generateScript}
          >
            {isGenerating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            {scriptStatus === "NOT_GENERATED" ? "AI生成脚本" : "AI重新生成脚本"}
          </Button>
        )}
        <ButtonLink href={`/test-cases/${id}/runs`} variant="outline">
          <HistoryIcon data-icon="inline-start" />
          执行记录
        </ButtonLink>
        <ButtonLink href={`/test-cases/${id}/edit`} variant="outline">
          <PencilIcon data-icon="inline-start" />
          编辑
        </ButtonLink>
        <Button
          variant="outline"
          disabled={isPending || isGenerating}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          删除
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="删除测试用例"
        description="删除后不能恢复，运行历史仍会保留。"
        confirmLabel="删除"
        destructive
        pending={isPending}
        onOpenChange={setConfirmOpen}
        onConfirm={remove}
      />
    </>
  );
}
