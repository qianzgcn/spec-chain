"use client";

import { useTransition } from "react";

import { EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { dismissTestCaseUpdateNoticeAction } from "@/app/actions/requirements";
import { ButtonLink } from "@/components/navigation/button-link";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function TestCaseUpdateAlert({
  userStoryId,
  hasDrafts,
  testCasesNeedUpdate,
}: {
  userStoryId: string;
  hasDrafts: boolean;
  testCasesNeedUpdate: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (hasDrafts) {
    return (
      <Alert variant="info">
        <AlertTitle>测试用例变更待评审</AlertTitle>
        <AlertDescription>
          AI 已根据当前 US 提出用例变更，请完成评审后再执行用例。
        </AlertDescription>
        <AlertAction>
          <ButtonLink href="/test-cases/pending-review" variant="outline" size="sm">
            前往评审
          </ButtonLink>
        </AlertAction>
      </Alert>
    );
  }

  if (testCasesNeedUpdate) {
    const handleDismiss = () => {
      startTransition(async () => {
        const result = await dismissTestCaseUpdateNoticeAction(userStoryId);
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }
        toast.add({ type: "success", description: "已忽略用例更新提示" });
        router.refresh();
      });
    };

    return (
      <Alert variant="warning">
        <AlertTitle>测试用例需要更新</AlertTitle>
        <AlertDescription>
          US 内容已修改，请使用 AI 对现有用例进行新增、更新或删除判断。如果无须修改用例，可手动忽略此提示。
        </AlertDescription>
        <AlertAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            disabled={isPending}
            className="text-xs"
          >
            {isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <EyeOffIcon data-icon="inline-start" className="size-3.5" />
            )}
            忽略提示
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  return null;
}
