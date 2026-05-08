"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center border border-border bg-card px-6 py-14 text-center sm:py-16"
    >
      {Icon ? (
        <Icon
          className="mb-4 h-10 w-10 text-fg-muted"
          strokeWidth={1.5}
          aria-hidden
        />
      ) : null}
      <p className="font-display text-base font-semibold text-white sm:text-lg">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-md font-mono text-sm text-fg-muted">
          {description}
        </p>
      ) : null}
      {action ? (
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          {action.href ? (
            <Link
              href={action.href}
              className="mt-6 inline-flex items-center justify-center rounded-md border border-accent bg-accent px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-6 inline-flex items-center justify-center rounded-md border border-accent bg-accent px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-ink transition-colors hover:bg-transparent hover:text-accent"
            >
              {action.label}
            </button>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}
