"use client";

import { useEffect } from "react";
import { useErrorStore } from "@/stores/errorStore";

/**
 * 전역 오류를 캡처하여 errorStore에 기록합니다.
 * window.onerror + unhandledrejection 이벤트를 수신합니다.
 * 컨트롤러 창에서 1회 마운트합니다.
 */
export function useGlobalErrorCapture(): void {
  useEffect(() => {
    const { addError } = useErrorStore.getState();

    const onError = (event: ErrorEvent) => {
      addError(event.message || "Unknown error", event.filename ? "runtime" : undefined);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? "Unhandled promise rejection");
      addError(msg, "promise");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
}
