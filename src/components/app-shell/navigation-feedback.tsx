"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Spinner } from "@/components/ui/spinner";
import { confirmLeaveIfDirty } from "@/hooks/use-unsaved-changes";

type NavigateOptions = {
  scroll?: boolean;
};

type NavigationFeedbackContextValue = {
  isNavigating: boolean;
  navigate: (href: string, options?: NavigateOptions) => boolean;
};

const NavigationFeedbackContext =
  createContext<NavigationFeedbackContextValue | null>(null);

export function NavigationFeedbackProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLinkNavigating, setIsLinkNavigating] = useState(false);
  const [isProgrammaticNavigationPending, startNavigationTransition] =
    useTransition();
  const isNavigating = isLinkNavigating || isProgrammaticNavigationPending;

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLinkNavigating(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, searchParams]);

  const navigate = useCallback(
    (href: string, options?: NavigateOptions) => {
      if (!confirmLeaveIfDirty()) return false;

      startNavigationTransition(() => {
        router.push(href, options);
      });
      return true;
    },
    [router],
  );

  useEffect(() => {
    function handleInternalLink(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.dataset.navigationFeedback === "off" ||
        anchor.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;

      let destination: URL;
      try {
        destination = new URL(rawHref, window.location.href);
      } catch {
        return;
      }

      if (
        destination.origin !== window.location.origin ||
        destination.pathname.startsWith("/api/")
      ) {
        return;
      }

      const current = new URL(window.location.href);
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        return;
      }

      if (!confirmLeaveIfDirty()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // 保留 Next.js Link 的预取和原生导航，只负责提供即时点击反馈。
      setIsLinkNavigating(true);
    }

    document.addEventListener("click", handleInternalLink, true);
    return () =>
      document.removeEventListener("click", handleInternalLink, true);
  }, []);

  const contextValue = useMemo(
    () => ({ isNavigating, navigate }),
    [isNavigating, navigate],
  );

  return (
    <NavigationFeedbackContext value={contextValue}>
      {children}
      {isNavigating ? (
        <>
          <div
            className="bg-muted fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
            aria-hidden
          >
            <div className="bg-primary h-full w-1/3 animate-pulse" />
          </div>
          <div
            className="bg-popover text-popover-foreground fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-md"
            role="status"
            aria-live="polite"
          >
            <Spinner />
            正在加载…
          </div>
        </>
      ) : null}
    </NavigationFeedbackContext>
  );
}

export function useNavigationFeedback() {
  const context = useContext(NavigationFeedbackContext);
  if (!context) {
    throw new Error("useNavigationFeedback 必须在导航反馈容器内使用");
  }
  return context;
}
