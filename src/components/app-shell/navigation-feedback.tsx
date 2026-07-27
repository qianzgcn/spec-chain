"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useTransition,
} from "react";

import LoadingOutlined from "@ant-design/icons/LoadingOutlined";
import { useRouter } from "next/navigation";

import { confirmLeaveIfDirty } from "@/hooks/use-unsaved-changes";

import styles from "./app-shell.module.css";

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
  const [isNavigating, startNavigationTransition] = useTransition();

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

      event.preventDefault();
      navigate(
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
    }

    document.addEventListener("click", handleInternalLink, true);
    return () => {
      document.removeEventListener("click", handleInternalLink, true);
    };
  }, [navigate]);

  const contextValue = useMemo(
    () => ({ isNavigating, navigate }),
    [isNavigating, navigate],
  );

  return (
    <NavigationFeedbackContext value={contextValue}>
      {children}
      {isNavigating ? (
        <div
          className={styles.navigationFeedback}
          role="status"
          aria-live="polite"
          aria-label="正在加载页面"
        >
          <span className={styles.navigationProgress} aria-hidden />
          <span className={styles.navigationMessage}>
            <LoadingOutlined spin />
            正在加载…
          </span>
        </div>
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
