"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { moveUserStoryToDeliveryVersionAction } from "@/app/actions/delivery-versions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

export function UserStoryDeliveryVersionSelect({
  userStoryId,
  value,
  versions,
}: {
  userStoryId: string;
  value: string;
  versions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      items={versions.map((version) => ({
        value: version.id,
        label: version.name,
      }))}
      value={value}
      disabled={isPending || versions.length < 2}
      onValueChange={(nextValue) => {
        if (!nextValue || nextValue === value) return;
        startTransition(async () => {
          const result = await moveUserStoryToDeliveryVersionAction(
            userStoryId,
            nextValue,
          );
          toast.add({
            type: result.ok ? "success" : "error",
            description: result.message,
          });
          if (result.ok) router.refresh();
        });
      }}
    >
      <SelectTrigger className="w-56" aria-label="移动到交付版本">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {versions.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              {version.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
