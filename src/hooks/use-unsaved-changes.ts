"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __specChainFormDirty?: boolean;
  }
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    window.__specChainFormDirty = dirty;

    function warnBeforeLeave(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeave);
      if (window.__specChainFormDirty === dirty) {
        window.__specChainFormDirty = false;
      }
    };
  }, [dirty]);
}

export function confirmLeaveIfDirty() {
  if (
    typeof window !== "undefined" &&
    window.__specChainFormDirty &&
    !window.confirm("当前页面有未保存的修改，确认离开吗？")
  ) {
    return false;
  }

  if (typeof window !== "undefined") {
    window.__specChainFormDirty = false;
  }
  return true;
}
