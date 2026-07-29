import type { ReactNode } from "react";

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={`page-section${className ? ` ${className}` : ""}`}>
      {title || description || actions ? (
        <div className="page-section__header">
          <div className="min-w-0">
            {title ? <h2 className="page-section__title">{title}</h2> : null}
            {description ? (
              <p className="page-section__description">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="page-section__actions">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div
        className={`page-section__content${
          contentClassName ? ` ${contentClassName}` : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}
