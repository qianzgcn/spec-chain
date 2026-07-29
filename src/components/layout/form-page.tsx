import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";

export function FormPage({
  title,
  description,
  meta,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-shell form-page">
      <PageHeader
        title={title}
        description={description}
        meta={meta}
        actions={actions}
      />
      {children}
    </div>
  );
}
