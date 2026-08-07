import type { Metadata } from "next";

import { DeliveryVersionForm } from "@/components/delivery-versions/delivery-version-form";

export const metadata: Metadata = { title: "新建交付版本" };

export default function NewDeliveryVersionPage() {
  return <DeliveryVersionForm />;
}
