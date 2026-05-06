"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { API_URL } from "@/utils/constants";

export type ToastVariant = "success" | "error" | "info";

export type ToastInput = {
  variant: ToastVariant;
  title: string;
  message?: string;
};

type Toast = ToastInput & { id: string };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

function toastIcon(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-survive" aria-hidden />;
    case "error":
      return <AlertCircle className="h-5 w-5 shrink-0 text-rug" aria-hidden />;
    default:
      return <Info className="h-5 w-5 shrink-0 text-accent-bright" aria-hidden />;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: ToastInput) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 5200);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    try {
      socket = io(API_URL, {
        transports: ["websocket", "polling"],
        autoConnect: true,
        reconnection: true,
      });
      const onResolved = (raw: unknown) => {
        if (!raw || typeof raw !== "object") return;
        const o = raw as Record<string, unknown>;
        if (o.outcome !== "survive" && o.outcome !== "rug") return;
        push({
          variant: "info",
          title: "Market resolved",
          message: `Outcome: ${String(o.outcome).toUpperCase()}`,
        });
      };
      socket.on("market_resolved", onResolved);
    } catch {
      /* ignore */
    }
    return () => {
      socket?.disconnect();
    };
  }, [push]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed bottom-0 right-0 z-[200] flex max-h-[50vh] w-full max-w-[min(100vw-1rem,380px)] flex-col gap-2 p-3 sm:bottom-4 sm:right-4 sm:p-0"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex gap-3 rounded-lg border border-border-glow/40 bg-[var(--bg-card)]/95 px-4 py-3 shadow-glow backdrop-blur-md"
          >
            {toastIcon(t.variant)}
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-foreground">
                {t.title}
              </p>
              {t.message ? (
                <p className="mt-0.5 font-mono text-xs text-muted">{t.message}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
