"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import {
  createDeliveryVerificationBatchAction,
  getDeliveryVerificationPreviewAction,
} from "@/app/actions/delivery-verifications";
import type { DeliveryVerificationPreview } from "@/app/actions/delivery-verifications";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function DeliveryVerificationAction({
  deliveryVersionId,
}: {
  deliveryVersionId: string;
}) {
  const router = useRouter();
  const [isLoading, startLoadTransition] = useTransition();
  const [isStarting, startRunTransition] = useTransition();
  const [preview, setPreview] = useState<DeliveryVerificationPreview | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);

  function openPreview() {
    startLoadTransition(async () => {
      try {
        const result = await getDeliveryVerificationPreviewAction({
          deliveryVersionId,
        });
        if (!result.ok || !result.data) {
          toast.add({ type: "error", description: result.message });
          return;
        }
        setConfirmed(false);
        setPreview(result.data);
      } catch {
        toast.add({ type: "error", description: "读取交付验证范围失败" });
      }
    });
  }

  function startVerification() {
    if (!preview || !confirmed) return;
    startRunTransition(async () => {
      try {
        const result = await createDeliveryVerificationBatchAction({
          deliveryVersionId,
          repositorySnapshot: preview.repositorySnapshot,
        });
        if (!result.ok) {
          toast.add({ type: "error", description: result.message });
          return;
        }
        setPreview(null);
        toast.add({ type: "success", description: result.message });
        router.refresh();
      } catch {
        toast.add({ type: "error", description: "创建交付验证失败" });
      }
    });
  }

  return (
    <>
      <Button variant="outline" disabled={isLoading} onClick={openPreview}>
        {isLoading ? <Spinner data-icon="inline-start" /> : null}
        运行版本用例
      </Button>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && !isStarting) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>确认交付验证范围</DialogTitle>
            <DialogDescription>
              将运行版本需求用例和项目全部启用的平台用例。
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-muted/40 rounded-lg p-3">
                  <dt className="text-muted-foreground text-xs">需求用例</dt>
                  <dd className="mt-1 font-semibold">
                    {preview.requirementCaseCount}
                  </dd>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <dt className="text-muted-foreground text-xs">平台用例</dt>
                  <dd className="mt-1 font-semibold">
                    {preview.platformCaseCount}
                  </dd>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <dt className="text-muted-foreground text-xs">未覆盖 US</dt>
                  <dd className="mt-1 font-semibold">
                    {preview.uncoveredStoryCount}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">被测代码提交</h3>
                {preview.repositories.map((repository) => (
                  <div
                    key={`${repository.owner}/${repository.repository}`}
                    className="bg-muted/40 rounded-lg p-3 text-sm"
                  >
                    <div className="font-medium">
                      {repository.owner}/{repository.repository}
                    </div>
                    <div className="text-muted-foreground mt-1 font-mono text-xs break-all">
                      {repository.branch} · {repository.commitSha}
                    </div>
                  </div>
                ))}
              </div>
              {preview.uncoveredStoryCount > 0 ? (
                <Alert variant="warning">
                  <AlertTitle>存在未覆盖需求</AlertTitle>
                  <AlertDescription>
                    {preview.uncoveredStoryCount} 条 US
                    没有启用的需求用例，本次验证不会伪造覆盖结果。
                  </AlertDescription>
                </Alert>
              ) : null}
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                <span>
                  我已确认 Base URL（{preview.baseUrl}）部署的是上述代码提交。
                </span>
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isStarting}
              onClick={() => setPreview(null)}
            >
              取消
            </Button>
            <Button
              disabled={!confirmed || isStarting}
              onClick={startVerification}
            >
              {isStarting ? <Spinner data-icon="inline-start" /> : null}
              开始运行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
