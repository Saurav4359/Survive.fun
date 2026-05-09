"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { useWebSocketEvents } from "@/hooks/useWebSocket";

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
      return (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-survive" aria-hidden />
      );
    case "error":
      return <AlertCircle className="h-4 w-4 shrink-0 text-rug" aria-hidden />;
    default:
      return <Info className="h-4 w-4 shrink-0 text-accent" aria-hidden />;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [resolvedFlash, setResolvedFlash] = useState<{
    outcome: "survive" | "rug";
  } | null>(null);

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

  useWebSocketEvents({
    onMarketResolved: (r) => {
      setResolvedFlash({ outcome: r.outcome });
      window.setTimeout(() => setResolvedFlash(null), 700);
      push({
        variant: "info",
        title: "Market resolved",
        message: `Outcome: ${r.outcome.toUpperCase()}`,
      });
    },
  });

  return (
    <ToastContext.Provider value={push}>
      {children}

      {/* Full-screen flash on market resolve (NO gradient — solid color overlay) */}
      <AnimatePresence>
        {resolvedFlash ? (
          <motion.div
            key={resolvedFlash.outcome}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              backgroundColor:
                resolvedFlash.outcome === "survive" ? "#8aff8e" : "#ef4444",
            }}
            className="pointer-events-none fixed inset-0 z-[150]"
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <div
        className="pointer-events-none fixed bottom-0 right-0 z-[200] flex max-h-[50vh] w-full max-w-[min(100vw-1rem,380px)] flex-col gap-2 p-3 sm:bottom-4 sm:right-4"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="pointer-events-auto flex gap-3 rounded-md border border-border bg-card px-4 py-3 shadow-glow-sm"
            >
              {toastIcon(t.variant)}
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-white">
                  {t.title}
                </p>
                {t.message ? (
                  <p className="mt-0.5 font-mono text-xs text-fg-muted">
                    {t.message}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-1 text-fg-muted transition-colors hover:bg-surface hover:text-white"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
