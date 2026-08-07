import { z } from "zod";

import { DeliveryVersionStatus } from "@/generated/prisma/enums";

export const deliveryVersionInputSchema = z.object({
  name: z.string().trim().min(1, "请输入版本名称").max(100),
  description: z.string().trim().max(1_000),
  setCurrent: z.boolean(),
});

export const deliveryVersionStatusSchema = z.enum(DeliveryVersionStatus);

export type DeliveryVersionInput = z.infer<typeof deliveryVersionInputSchema>;
