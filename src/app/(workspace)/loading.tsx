export default function WorkspaceLoading() {
  return (
    <div className="page-shell" role="status" aria-live="polite">
      <span className="sr-only">正在加载页面</span>
      <div className="page-heading">
        <div className="w-full max-w-md">
          <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <div className="content-panel overflow-hidden">
        <div className="flex h-16 items-center gap-4 border-b border-slate-200 px-6">
          <div className="h-9 w-72 animate-pulse rounded bg-slate-100" />
          <div className="h-9 w-36 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="space-y-5 px-6 py-7">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
