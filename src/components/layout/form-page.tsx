import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";

export function FormPage({
  title,
  description,
  meta,
  titleAccessory,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  titleAccessory?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5">
      <PageHeader
        title={title}
        description={description}
        meta={meta}
        titleAccessory={titleAccessory}
        actions={actions}
      />
      {children}
    </div>
  );
}
