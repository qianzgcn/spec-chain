"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import {
  lockDeliveryVersionAction,
  setCurrentDeliveryVersionAction,
  unlockDeliveryVersionAction,
  updateDeliveryVersionStatusAction,
} from "@/app/actions/delivery-versions";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ButtonLink } from "@/components/navigation/button-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { DeliveryVersionStatus } from "@/generated/prisma/enums";

export function DeliveryVersionHeaderActions({
  id,
  status,
  locked,
  current,
  deliverySummary,
}: {
  id: string;
  status: DeliveryVersionStatus;
  locked: boolean;
  current: boolean;
  deliverySummary: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deliverOpen, setDeliverOpen] = useState(false);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      toast.add({
        type: result.ok ? "success" : "error",
        description: result.message ?? (result.ok ? "操作成功" : "操作失败"),
      });
      if (result.ok) router.refresh();
    });
  }

  function deliver() {
    run(() =>
      updateDeliveryVersionStatusAction(id, DeliveryVersionStatus.DELIVERED),
    );
    setDeliverOpen(false);
  }

  return (
    <>
      {status !== DeliveryVersionStatus.DELIVERED ? (
        <ButtonLink href={`/delivery-versions/${id}/edit`} variant="outline">
          编辑
        </ButtonLink>
      ) : null}
      {!current && !locked && status !== DeliveryVersionStatus.DELIVERED ? (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => setCurrentDeliveryVersionAction(id))}
        >
          设为当前
        </Button>
      ) : null}
      {status !== DeliveryVersionStatus.DELIVERED ? (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            run(() =>
              locked
                ? unlockDeliveryVersionAction(id)
                : lockDeliveryVersionAction(id),
            )
          }
        >
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          {locked ? "解除锁定" : "锁定需求基线"}
        </Button>
      ) : null}
      {status === DeliveryVersionStatus.PENDING ? (
        <Button
          disabled={isPending}
          onClick={() =>
            run(() =>
              updateDeliveryVersionStatusAction(
                id,
                DeliveryVersionStatus.IN_PROGRESS,
              ),
            )
          }
        >
          开始实施
        </Button>
      ) : null}
      {status === DeliveryVersionStatus.IN_PROGRESS ? (
        <>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(() =>
                updateDeliveryVersionStatusAction(
                  id,
                  DeliveryVersionStatus.PENDING,
                ),
              )
            }
          >
            退回待启动
          </Button>
          <Button disabled={isPending} onClick={() => setDeliverOpen(true)}>
            标记为已交付
          </Button>
        </>
      ) : null}

      <ConfirmDialog
        open={deliverOpen}
        title="标记为已交付"
        description={`${deliverySummary} 标记后该版本将永久锁定且不能撤销，是否继续？`}
        confirmLabel="确认交付"
        pending={isPending}
        onOpenChange={setDeliverOpen}
        onConfirm={deliver}
      />
    </>
  );
}
